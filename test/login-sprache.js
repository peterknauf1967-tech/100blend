// Spielt den Anmelde-Ablauf von standos.html nach und prueft, ob die
// Oberflaeche nach der Peter-Auswahl wirklich auf Deutsch umschaltet.
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await page.goto('http://127.0.0.1:8099/intern/standos.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const before = await page.evaluate(() => ({
    user: localStorage.getItem('blend_user'),
    navStart: (document.getElementById('nv_start') || {}).textContent,
    htmlLang: document.documentElement.lang,
    dialogOffen: getComputedStyle(document.getElementById('userdlg') || document.body).display
  }));
  console.log('VOR Anmeldung :', JSON.stringify(before));

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
    kpiText: Array.from(document.querySelectorAll('.kpi span')).slice(0,3).map(e => e.textContent)
  }));
  console.log('NACH OK       :', JSON.stringify(nachOK));

  if (errs.length) { console.log('--- JS-FEHLER ---'); errs.slice(0,8).forEach(e => console.log(e)); }
  else console.log('Keine JS-Fehler.');

  await browser.close();
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
