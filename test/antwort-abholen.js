// Prueft, dass eine Antwort aus der Realtime Database im Postkorb landet --
// ohne dass jemand eine Firebase-Config eingetragen hat.
//
// Das war die letzte stille Luecke: firebase-sync.js braucht localStorage
// 'firebase_config'. Wer die nie eingetragen hat (also alle ausser dem, der
// es gebaut hat), sah nie eine Antwort, obwohl sie in der Datenbank stand.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/antwort-abholen.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

const ANTWORT = 'Mango im StandOS auf ausverkauft setzen und Nachschub ordern.';

(async () => {
  const { browser, page, fehler } = await starte();
  const pruefungen = [];
  const pruefe = (name, gut) => pruefungen.push([name, gut]);

  await page.goto(BASIS_URL + '/intern/standos.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Die Datenbank vortaeuschen: der Abruf geht ueber fetch, den fangen wir ab.
  await page.evaluate((antwort) => {
    localStorage.setItem('claude_inbox_v1', JSON.stringify([{
      id: 'msg_abholtest', ts: new Date().toISOString(), page: 'standos.html',
      text: 'Mango ist alle.', photo_thumb: null, user: 'peter',
      status: 'sent', sent_at: new Date().toISOString(), answer: null, unread: false
    }]));
    localStorage.removeItem('claude_answers_v1');
    localStorage.removeItem('firebase_config');   // genau der Normalfall

    window.__abgefragt = null;
    const echt = window.fetch;
    window.fetch = function (url) {
      const s = String(url);
      if (s.indexOf('/claude_answers.json') > -1) {
        window.__abgefragt = s;
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({
            msg_abholtest: { ts: '2026-09-02T18:05:00', text: antwort, kind: 'info', by: 'claude' }
          })
        });
      }
      return echt.apply(this, arguments);
    };
  }, ANTWORT);

  // Neu laden, damit das Widget mit diesem Zustand startet -- der fetch-Ersatz
  // ist danach weg, also setzen wir ihn direkt nach dem Laden erneut.
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate((antwort) => {
    window.__abgefragt = null;
    const echt = window.fetch;
    window.fetch = function (url) {
      const s = String(url);
      if (s.indexOf('/claude_answers.json') > -1) {
        window.__abgefragt = s;
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({
            msg_abholtest: { ts: '2026-09-02T18:05:00', text: antwort, kind: 'info', by: 'claude' }
          })
        });
      }
      return echt.apply(this, arguments);
    };
  }, ANTWORT);

  const ok = await page.$('#dlgok'); if (ok) await ok.click();
  await page.waitForTimeout(300);

  // Postkorb oeffnen -- das holt sofort nach, statt auf den Takt zu warten
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  await page.click('[data-act="inbox-open"]');
  await page.waitForTimeout(1200);

  const g = await page.evaluate(() => {
    const box = JSON.parse(localStorage.getItem('claude_inbox_v1') || '[]');
    const e = box.find(x => x.id === 'msg_abholtest') || {};
    return {
      abgefragt: window.__abgefragt,
      status: e.status,
      antwort: e.answer && e.answer.text,
      ungelesen: e.unread,
      imFenster: document.querySelector('.cbtn-inbox-list').textContent
    };
  });

  console.log('abgefragte URL:', g.abgefragt);
  console.log('Status        :', g.status, '| ungelesen:', g.ungelesen);
  console.log('Antwort       :', g.antwort);

  pruefe('Datenbank wurde abgefragt',   !!g.abgefragt && g.abgefragt.indexOf('claude_answers.json') > -1);
  pruefe('Antwort im Eintrag',          g.antwort === ANTWORT);
  pruefe('Status auf "answered"',       g.status === 'answered');
  pruefe('als ungelesen markiert',      g.ungelesen === true);
  pruefe('Antwort auch sichtbar',       (g.imFenster || '').indexOf('Mango ist alle') > -1);

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Antwort kommt ohne Firebase-Config im Postkorb an.'
                     : '>>> FEHLER: Antwort erreicht den Postkorb nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
