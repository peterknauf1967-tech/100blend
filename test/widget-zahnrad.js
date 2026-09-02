// Prueft: oeffnet das Zahnrad im Claude-Widget die Einstellungen,
// und greift der Sprachumschalter?
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
  await page.waitForTimeout(800);

  // Dialog wegklicken, damit er das Widget nicht ueberdeckt
  const ok = await page.$('#dlgok'); if (ok) await ok.click();
  await page.waitForTimeout(300);

  console.log('FAB da:', !!(await page.$('.cbtn-fab')));
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  console.log('Modal offen:', await page.isVisible('.cbtn-modal'));

  // Sprache VOR dem Umschalten
  const vorher = await page.evaluate(() =>
    (document.querySelector('.cbtn-h') || {}).textContent);
  console.log('Titel vorher :', vorher);

  // Zahnrad
  console.log('Gear da:', !!(await page.$('.cbtn-gear')));
  await page.click('.cbtn-gear');
  await page.waitForTimeout(300);
  const setOffen = await page.evaluate(() =>
    document.querySelector('.cbtn-set').classList.contains('open'));
  console.log('>>> Einstellungen offen:', setOffen);

  if (setOffen) {
    // Labels pruefen (Reihenfolge muss stimmen)
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.cbtn-set label')).map(l => l.textContent));
    console.log('Labels:', JSON.stringify(labels));

    // Sprache auf Deutsch stellen + speichern
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
  }

  if (errs.length) { console.log('--- JS-FEHLER ---'); errs.slice(0,8).forEach(e => console.log(e)); }
  else console.log('Keine JS-Fehler.');

  await browser.close();
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
