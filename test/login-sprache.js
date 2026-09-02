// Spielt den Anmelde-Ablauf von standos.html nach und prueft, ob die
// Oberflaeche nach der Peter-Auswahl wirklich auf Deutsch umschaltet.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/login-sprache.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

(async () => {
  const { browser, page, fehler } = await starte();

  await page.goto(BASIS_URL + '/intern/standos.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const vorher = await page.evaluate(() => ({
    user: localStorage.getItem('blend_user'),
    navStart: (document.getElementById('nv_start') || {}).textContent,
    htmlLang: document.documentElement.lang,
    dialogOffen: getComputedStyle(document.getElementById('userdlg') || document.body).display
  }));
  console.log('VOR Anmeldung :', JSON.stringify(vorher));

  // Peter-Knopf im Dialog
  const peterBtn = await page.$('.wahl[data-u="peter"]');
  console.log('Peter-Knopf gefunden:', !!peterBtn);
  if (peterBtn) await peterBtn.click();
  await page.waitForTimeout(200);

  const nachWahl = await page.evaluate(() => ({
    user: localStorage.getItem('blend_user'),
    navStart: (document.getElementById('nv_start') || {}).textContent
  }));
  console.log('NACH Peter-Klick:', JSON.stringify(nachWahl));

  // OK-Knopf
  const ok = await page.$('#dlgok');
  console.log('OK-Knopf gefunden:', !!ok);
  if (ok) await ok.click();
  await page.waitForTimeout(500);

  const nachOK = await page.evaluate(() => ({
    user: localStorage.getItem('blend_user'),
    navStart: (document.getElementById('nv_start') || {}).textContent,
    htmlLang: document.documentElement.lang,
    ersteUeberschrift: (document.querySelector('#view h2') || {}).textContent,
    kpiText: Array.from(document.querySelectorAll('.kpi span')).slice(0, 3).map(e => e.textContent)
  }));
  console.log('NACH OK       :', JSON.stringify(nachOK));

  // Der eigentliche Pruefpunkt: Peter sieht Deutsch, nicht Thai.
  const deutsch = nachOK.user === 'peter' && nachOK.navStart === 'Start';
  console.log(deutsch ? '>>> OK: Peter sieht Deutsch.' : '>>> FEHLER: Peter sieht NICHT Deutsch.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(deutsch ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
