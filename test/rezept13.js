// Prueft Rezept 13 (Peters "Leber-Morgen Vital") in BEIDEN Ansichten.
//
// Die Verkostung fuehrt eine eigene Kopie der Rezepte (Array R). Genau darum
// stand dort am 03.09.2026 noch der Stand von vor dem 24.08.: Pfirsich TK,
// Pfeffer 0,3 g, Kurkuma 1 g. Dieser Test haelt beide Seiten zusammen.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/rezept13.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

// Peters Vorgabe vom 03.09.2026
const SOLL = [
  ['Limette',        15],
  ['Joghurt',       200],
  ['Gurke',          50],
  ['Ingwer',          4],
  ['Mango',         100],
  ['Passionsfrucht', 20],
  ['Pfeffer',       0.1],
  ['Kurkuma',       0.4],
  ['Brokkoli',       60]
];
const RAUS = ['Wasser', 'Beeren', 'Pfirsich', 'Erdbeer'];

(async () => {
  const { browser, page, fehler } = await starte();
  const pruefungen = [];
  const pruefe = (name, gut) => pruefungen.push([name, gut]);

  // ---------- Rezeptseite ----------
  await page.goto(BASIS_URL + '/intern/rezepte.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.click('.grid .tile[data-n="13"]');
  await page.waitForTimeout(500);

  // Aus der ANZEIGE lesen, nicht aus window: REZEPTE liegt in einem
  // Modulblock und ist von aussen nicht sichtbar. Was zaehlt, ist ohnehin
  // das, was Peter am Geraet sieht.
  const rez = await page.evaluate(() => {
    const zeilen = Array.from(document.querySelectorAll('.zut > div'));
    const zut = zeilen.map(d => {
      const name = (d.querySelector('.zn i') || d.querySelector('.zn b') || {}).textContent || '';
      const g = parseFloat(((d.querySelector('.zg') || {}).textContent || '').replace(',', '.')) || 0;
      return [name.trim(), g];
    }).filter(z => z[0]);
    return {
      zut: zut,
      summe: zut.reduce((s, z) => s + z[1], 0),
      text: document.body.innerText
    };
  });

  console.log('Rezeptseite — Zutaten:', rez.zut.length, '· Summe:', Math.round(rez.summe * 10) / 10, 'g');
  rez.zut.forEach(z => console.log('   ' + String(z[1]).padStart(5) + ' g  ' + z[0].slice(0, 40)));

  pruefe('Rezept: 9 Zutaten', rez.zut.length === 9);
  pruefe('Rezept: Summe 449,5 g', Math.abs(rez.summe - 449.5) < 0.05);
  for (const [name, g] of SOLL) {
    pruefe('Rezept: ' + name + ' = ' + g + ' g',
      rez.zut.some(z => z[0].toLowerCase().indexOf(name.toLowerCase()) > -1 && Math.abs(z[1] - g) < 0.001));
  }
  for (const weg of RAUS) {
    pruefe('Rezept: kein ' + weg + ' mehr',
      !rez.zut.some(z => z[0].toLowerCase().indexOf(weg.toLowerCase()) > -1));
  }
  pruefe('Rezept: Schritt "kein Wasser" erklaert', rez.text.indexOf('kein Wasser') > -1);

  // ---------- Verkostung ----------
  await page.goto(BASIS_URL + '/intern/verkostung.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // Auswahl ueber den sichtbaren Eintragstext treffen -- R ist ebenfalls
  // nicht auf window.
  const idx = await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('#blend option'));
    const i = opts.findIndex(o => o.textContent.indexOf('13 Leber-Morgen') > -1);
    return i;
  });
  pruefe('Verkostung: Rezept 13 vorhanden', idx > -1);

  if (idx > -1) {
    const wert = await page.evaluate((i) =>
      document.querySelectorAll('#blend option')[i].value, idx);
    await page.selectOption('#blend', wert);
    await page.waitForTimeout(500);
    const vk = await page.evaluate(() => ({
      zutaten: Array.from(document.querySelectorAll('#editor .ingrow')).map(r => ({
        name: r.querySelector('.ingname').value,
        menge: r.querySelector('.ingamt').value
      })),
      schritte: Array.from(document.querySelectorAll('.ed-steps li')).map(li => li.textContent),
      text: document.body.innerText
    }));

    console.log('Verkostung — Zutaten:', vk.zutaten.length, '· Schritte:', vk.schritte.length);
    vk.schritte.forEach((s, i) => console.log('   ' + (i + 1) + '. ' + s.slice(0, 60)));

    pruefe('Verkostung: 9 Zutaten', vk.zutaten.length === 9);
    pruefe('Verkostung: Joghurt 200 g',
      vk.zutaten.some(z => z.name.toLowerCase().indexOf('joghurt') > -1 && z.menge === '200'));
    pruefe('Verkostung: Passionsfrucht dabei',
      vk.zutaten.some(z => z.name.indexOf('Passionsfrucht') > -1));
    pruefe('Verkostung: Kurkuma 0,4 g',
      vk.zutaten.some(z => z.name.indexOf('Kurkuma') > -1 && parseFloat(z.menge) === 0.4));
    for (const weg of RAUS) {
      pruefe('Verkostung: kein ' + weg + ' mehr',
        !vk.zutaten.some(z => z.name.toLowerCase().indexOf(weg.toLowerCase()) > -1));
    }
    pruefe('Verkostung: Arbeitsschritte sichtbar (8)', vk.schritte.length === 8);
    pruefe('Verkostung: Reihenfolge Fluessig→Gefroren',
      vk.schritte.some(s => s.indexOf('① Fl') > -1) &&
      vk.schritte.some(s => s.indexOf('④ Gefrorenes') > -1));
  }

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Rezept 13 stimmt in Rezepten und Verkostung.'
                     : '>>> FEHLER: Rezept 13 stimmt nicht ueberall.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
