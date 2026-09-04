// Prueft, was der Claude-Knopf wirklich an Make schickt.
//
// Wichtig ist content_json: Make setzt diesen Text unveraendert in den Rumpf
// des Anthropic-Aufrufs ein. Wenn er kein gueltiges JSON ist oder das Bild
// noch den "data:image/..."-Praefix traegt, antwortet die API mit 400 und
// Peter sieht wieder nur "in Warteschlange".
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/payload-content.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

// 1x1-Pixel-JPEG als Data-URL, damit wir den Bildpfad mitpruefen koennen.
const MINI_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL' +
  'DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
  'AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

(async () => {
  const { browser, page, fehler } = await starte();

  await page.goto(BASIS_URL + '/intern/standos.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const ok = await page.$('#dlgok'); if (ok) await ok.click();
  await page.waitForTimeout(300);

  // Webhook setzen und fetch abfangen, damit nichts wirklich rausgeht.
  await page.evaluate(() => {
    localStorage.setItem('claude_webhook_url', 'https://hook.eu1.make.com/TESTURL123');
    window.__gesendet = null;
    const echt = window.fetch;
    window.fetch = function (url, opt) {
      if (String(url).indexOf('hook.eu1.make.com') > -1) {
        window.__gesendet = (opt && opt.body) || null;
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') });
      }
      return echt.apply(this, arguments);
    };
  });

  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  await page.fill('.cbtn-modal textarea', 'Mango ist alle, bitte auf rot setzen.');

  // Foto direkt in den Widget-Zustand schieben (Dateidialog geht im Test nicht)
  await page.evaluate((d) => {
    const inp = document.querySelector('.cbtn-modal input[type="file"]');
    if (!inp) return;
    const ev = { target: { files: [], value: '' } };
    // Der Widget-Code liest currentPhoto ueber den Datei-Handler; wir simulieren
    // den fertigen Zustand ueber ein change-Event mit einer echten Datei.
    const bin = atob(d.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'test.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    void ev;
  }, MINI_JPEG);
  await page.waitForTimeout(600);

  await page.click('.cbtn-modal [data-act="send"]');
  await page.waitForTimeout(800);

  const roh = await page.evaluate(() => window.__gesendet);
  if (!roh) {
    console.log('>>> FEHLER: es wurde nichts gesendet.');
    await browser.close();
    process.exit(1);
  }

  // Ab 02.09.2026 gehen die Felder als Formulardaten raus (Make zerlegt nur
  // die in echte Felder; bei text/plain war der ganze Rumpf ein Textbrocken
  // und {{2.msg_id}} blieb leer).
  const p = {};
  for (const [k, v] of new URLSearchParams(roh)) p[k] = v;
  console.log('Felder:', Object.keys(p).join(', '));
  console.log('Rumpf-Anfang:', roh.slice(0, 60));
  console.log('msg_id :', p.msg_id);
  console.log('lang   :', p.lang, '| user:', p.user, '| page:', p.page);

  let inhalt;
  try { inhalt = JSON.parse(p.content_json); }
  catch (e) { console.log('>>> FEHLER: content_json ist kein gueltiges JSON:', e.message); await browser.close(); process.exit(1); }

  console.log('content-Bloecke:', inhalt.map(b => b.type).join(' + '));

  const text = inhalt.find(b => b.type === 'text');
  const bild = inhalt.find(b => b.type === 'image');

  const pruefungen = [
    ['als Formulardaten gesendet',        roh.indexOf('msg_id=') === 0],
    ['msg_id nicht leer',                 !!p.msg_id && p.msg_id.length > 5],
    ['content_json ist ein Array',        Array.isArray(inhalt)],
    ['Textblock vorhanden',               !!text && text.text.indexOf('Mango ist alle') > -1],
    ['Bildblock vorhanden',               !!bild],
    ['media_type stimmt',                 !!bild && bild.source.media_type === 'image/jpeg'],
    ['base64 OHNE data:-Praefix',         !!bild && bild.source.data.indexOf('data:') !== 0],
    ['base64 nicht leer',                 !!bild && bild.source.data.length > 20]
  ];
  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Nutzlast passt zur Anthropic-API.' : '>>> FEHLER: Nutzlast passt nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
