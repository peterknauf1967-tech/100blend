// Prueft den Einrichtungs-Link: ein Antippen soll Webhook, Sprache und
// Benutzer setzen -- damit Lexi am iPhone nichts einstellen muss und Peter
// ihr das nicht auf Thai erklaeren muss.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/setup-link.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

const WEBHOOK = 'https://hook.eu1.make.com/v26u2e3zndv7u1jh7fgucyn14tuvbyo6';

(async () => {
  const { browser, page, fehler } = await starte();
  const pruefungen = [];
  const pruefe = (name, gut) => pruefungen.push([name, gut]);

  // --- Lexis Link: Thai, Benutzer lexi ---
  await page.goto(
    BASIS_URL + '/intern/standos.html?wh=' + encodeURIComponent(WEBHOOK) + '&lang=th&user=lexi',
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  let g = await page.evaluate(() => ({
    wh: localStorage.getItem('claude_webhook_url'),
    lang: localStorage.getItem('claude_lang'),
    who: localStorage.getItem('who'),
    blendUser: localStorage.getItem('blend_user'),
    adresse: location.search
  }));
  console.log('Lexi  :', JSON.stringify(g));
  pruefe('Lexi: Webhook gesetzt',      g.wh === WEBHOOK);
  pruefe('Lexi: Sprache th',           g.lang === 'th');
  pruefe('Lexi: Benutzer lexi',        g.who === 'lexi' && g.blendUser === 'lexi');
  pruefe('Adresse aufgeraeumt',        g.adresse === '');

  // Widget muss jetzt auf Thai stehen
  const ok = await page.$('#dlgok'); if (ok) await ok.click();
  await page.waitForTimeout(300);
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  const titelTh = await page.evaluate(() => (document.querySelector('.cbtn-h') || {}).textContent || '');
  console.log('Titel Lexi:', titelTh);
  pruefe('Lexi sieht Thai', /[฀-๿]/.test(titelTh));

  // --- Peters Link: Deutsch, Benutzer peter (frischer Speicher) ---
  const seite2 = await browser.newPage();
  await seite2.goto(
    BASIS_URL + '/intern/standos.html?wh=' + encodeURIComponent(WEBHOOK) + '&lang=de&user=peter',
    { waitUntil: 'networkidle' });
  await seite2.waitForTimeout(800);
  const ok2 = await seite2.$('#dlgok'); if (ok2) await ok2.click();
  await seite2.waitForTimeout(300);
  await seite2.click('.cbtn-fab');
  await seite2.waitForTimeout(300);
  const titelDe = await seite2.evaluate(() => (document.querySelector('.cbtn-h') || {}).textContent || '');
  console.log('Titel Peter:', titelDe);
  pruefe('Peter sieht Deutsch', /moechtest|möchtest/i.test(titelDe));

  // --- Ohne Parameter darf nichts ueberschrieben werden ---
  await seite2.goto(BASIS_URL + '/intern/standos.html', { waitUntil: 'networkidle' });
  await seite2.waitForTimeout(600);
  const g2 = await seite2.evaluate(() => ({
    wh: localStorage.getItem('claude_webhook_url'),
    lang: localStorage.getItem('claude_lang')
  }));
  pruefe('Ohne Parameter bleibt alles stehen', g2.wh === WEBHOOK && g2.lang === 'de');

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Ein Antippen richtet das Geraet ein.'
                     : '>>> FEHLER: Einrichtungs-Link stimmt nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
