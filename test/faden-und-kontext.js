// Prueft die zwei Dinge, die am 03.09.2026 gefehlt haben:
//
// 1. KONTEXT — Claude fand Rezept 13 auf dem Handy nicht, weil ihm niemand
//    sagte, welche Rezepte es gibt. window.__CLAUDE_CTX war vorgesehen, aber
//    keine Seite hat es je gesetzt. Jetzt liefert rezepte.html die Liste.
// 2. FADEN — auf eine Rueckfrage von Claude konnte man nicht antworten, also
//    liess sich kein Thema abschliessen. Jetzt gehoert jede Meldung zu einem
//    Faden, und der Verlauf geht als messages-Array mit.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/faden-und-kontext.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

const WEBHOOK = 'https://hook.eu1.make.com/TESTURL123';

// Faengt fetch ab: Sendungen merken, Firebase-Antworten vortaeuschen.
function abfangen(antworten) {
  window.__gesendet = [];
  const echt = window.fetch;
  window.fetch = function (url, opt) {
    const s = String(url);
    if (s.indexOf('hook.eu1.make.com') > -1) {
      const felder = {};
      for (const [k, v] of new URLSearchParams((opt && opt.body) || '')) felder[k] = v;
      window.__gesendet.push(felder);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
    }
    if (s.indexOf('/claude_answers.json') > -1) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(window.__antworten || {}) });
    }
    return echt.apply(this, arguments);
  };
  window.__antworten = antworten || {};
}

(async () => {
  const { browser, page, fehler } = await starte();
  const pruefungen = [];
  const pruefe = (name, gut) => pruefungen.push([name, gut]);

  await page.goto(BASIS_URL + '/intern/rezepte.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate((wh) => localStorage.setItem('claude_webhook_url', wh), WEBHOOK);
  await page.evaluate(abfangen, {});

  // ---------- 1. Kontext ----------
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  await page.fill('.cbtn-modal textarea', 'Wo ist Rezept 13?');
  await page.click('.cbtn-modal [data-act="send"]');
  await page.waitForTimeout(700);

  const erste = await page.evaluate(() => (window.__gesendet || [])[0] || null);
  if (!erste) { console.log('>>> FEHLER: nichts gesendet.'); await browser.close(); process.exit(1); }

  const ctx = erste.context || '';
  console.log('Kontext-Anfang:', ctx.slice(0, 90).replace(/\n/g, ' | '));
  pruefe('Kontext ist nicht leer',        ctx.length > 50);
  pruefe('Rezeptliste im Kontext',        ctx.indexOf('Rezeptliste') > -1);
  pruefe('Rezept 13 im Kontext',          /(^|\s)13 = /.test(ctx));
  pruefe('Leber-Morgen im Kontext',       ctx.indexOf('Leber-Morgen') > -1);
  pruefe('Rezeptzahl im Kontext',         ctx.indexOf('Rezepte gesamt: 58') > -1);
  pruefe('thread_id gesetzt',             !!erste.thread_id && erste.thread_id === erste.msg_id);

  const m1 = JSON.parse(erste.messages_json || '[]');
  pruefe('messages_json ist ein Array',   Array.isArray(m1));
  pruefe('erste Runde = 1 user-Turn',     m1.length === 1 && m1[0].role === 'user');

  // ---------- 2. Antwort im Faden ----------
  const fadenId = erste.msg_id;
  await page.evaluate((id) => {
    window.__antworten = {
      [id]: { ts: '2026-09-03T12:00:00', text: 'Welche Zutat soll raus?', kind: 'info', by: 'claude' }
    };
  }, fadenId);

  // Nach dem Senden ist das Fenster zu (so soll es sein) -- also wieder auf.
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  await page.click('[data-act="inbox-open"]');
  await page.waitForTimeout(1200);

  const detailDa = await page.evaluate(() => {
    const it = document.querySelector('.cbtn-inbox-list [data-inbox-id]');
    if (it) it.click();
    return true;
  });
  await page.waitForTimeout(500);
  void detailDa;

  const hatFeld = await page.$('.cbtn-reply-ta');
  pruefe('Antwortfeld vorhanden', !!hatFeld);
  const frageDa = await page.evaluate(() => document.body.innerText.indexOf('Welche Zutat soll raus?') > -1);
  pruefe('Claudes Rueckfrage steht im Verlauf', frageDa);

  if (hatFeld) {
    await page.fill('.cbtn-reply-ta', 'Der Brokkoli soll raus.');
    await page.waitForTimeout(200);
    await page.click('[data-act="reply-send"]');
    await page.waitForTimeout(900);
  }

  const zweite = await page.evaluate(() => (window.__gesendet || [])[1] || null);
  pruefe('Antwort wurde gesendet', !!zweite);

  if (zweite) {
    console.log('Antwort msg_id :', zweite.msg_id);
    console.log('Antwort thread :', zweite.thread_id);
    const m2 = JSON.parse(zweite.messages_json || '[]');
    console.log('Turns:', m2.map(m => m.role).join(' → '));
    pruefe('gleicher Faden',            zweite.thread_id === fadenId);
    pruefe('neue msg_id',               zweite.msg_id !== fadenId);
    pruefe('Verlauf hat 3 Turns',       m2.length === 3);
    pruefe('Reihenfolge user/assistant/user',
      m2[0].role === 'user' && m2[1].role === 'assistant' && m2[2].role === 'user');
    pruefe('Claudes Frage im Verlauf',
      JSON.stringify(m2[1]).indexOf('Welche Zutat soll raus?') > -1);
    pruefe('meine Antwort im Verlauf',
      JSON.stringify(m2[2]).indexOf('Der Brokkoli soll raus') > -1);
  }

  const nochOffen = await page.evaluate(() => !!document.querySelector('.cbtn-inbox-detail'));
  pruefe('Fenster bleibt nach dem Antworten offen', nochOffen);

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Kontext geht mit, Antworten im Faden laufen.'
                     : '>>> FEHLER: Kontext oder Faden stimmen nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
