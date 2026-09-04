// Prueft: oeffnet das Zahnrad im Claude-Widget die Einstellungen,
// und werden Sprache und Webhook-URL wirklich gespeichert?
//
// Hintergrund: Das Zahnrad wurde beim Tippen nur gruen (CSS :active), oeffnete
// aber nichts, weil der Klick-Handler vorher mit `if (!b) return;` aussties.
// Dieser Test faengt genau das ab.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/widget-zahnrad.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

(async () => {
  const { browser, page, fehler } = await starte();

  await page.goto(BASIS_URL + '/intern/standos.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Anmelde-Dialog wegklicken, damit er das Widget nicht ueberdeckt
  const ok = await page.$('#dlgok'); if (ok) await ok.click();
  await page.waitForTimeout(300);

  console.log('FAB da:', !!(await page.$('.cbtn-fab')));
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  console.log('Modal offen:', await page.isVisible('.cbtn-modal'));

  const vorher = await page.evaluate(() =>
    (document.querySelector('.cbtn-h') || {}).textContent);
  console.log('Titel vorher :', vorher);

  console.log('Gear da:', !!(await page.$('.cbtn-gear')));
  await page.click('.cbtn-gear');
  await page.waitForTimeout(300);
  const setOffen = await page.evaluate(() =>
    document.querySelector('.cbtn-set').classList.contains('open'));
  console.log('>>> Einstellungen offen:', setOffen);

  let gespeichert = false;
  if (setOffen) {
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cbtn-set label')).map(l => l.textContent));
    console.log('Labels:', JSON.stringify(labels));

    await page.selectOption('select[data-fld="lang"]', 'de');
    await page.fill('input[data-fld="wh"]', 'https://hook.eu1.make.com/TESTURL123');
    await page.click('[data-act="setsave"]');
    await page.waitForTimeout(400);

    const nachher = await page.evaluate(() => ({
      titel: (document.querySelector('.cbtn-h') || {}).textContent,
      lang: localStorage.getItem('claude_lang'),
      wh: localStorage.getItem('claude_webhook_url')
    }));
    console.log('Titel nachher:', nachher.titel);
    console.log('claude_lang  :', nachher.lang);
    console.log('webhook      :', nachher.wh);
    gespeichert = nachher.lang === 'de' && (nachher.wh || '').indexOf('TESTURL123') > -1;
  }

  console.log(setOffen && gespeichert
    ? '>>> OK: Zahnrad oeffnet und speichert.'
    : '>>> FEHLER: Zahnrad oeffnet nicht oder speichert nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(setOffen && gespeichert ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
