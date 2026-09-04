// Prueft, dass die Rezeptliste nach Nummer sortiert ist und jede Kachel das
// richtige Rezept oeffnet.
//
// Hintergrund: Rezept 13 (Peters "Leber-Morgen Vital") stand an Position 19,
// zwischen 20 und 21 -- spaeter angehaengte Rezepte landen hinten im Array,
// und gezeichnet wurde in Array-Reihenfolge. Wer zwischen 12 und 15 nachsah,
// fand eine Luecke und hielt das Rezept fuer geloescht. Dasselbe bei 24.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/rezept-reihenfolge.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

(async () => {
  const { browser, page, fehler } = await starte();
  const pruefungen = [];
  const pruefe = (name, gut) => pruefungen.push([name, gut]);

  await page.goto(BASIS_URL + '/intern/rezepte.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const nummern = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.grid .tile')).map(t => t.dataset.n));

  console.log('Kacheln:', nummern.length);
  console.log('Reihenfolge:', nummern.join(' '));

  const zahlen = nummern.map(n => parseInt(n, 10));
  const sortiert = zahlen.every((v, i) => i === 0 || zahlen[i - 1] <= v);
  const pos13 = nummern.indexOf('13');

  pruefe('alle Kacheln da (58)',        nummern.length === 58);
  pruefe('aufsteigend sortiert',        sortiert);
  pruefe('13 vorhanden',                pos13 > -1);
  pruefe('13 steht zwischen 12 und 15', pos13 > 0 && nummern[pos13 - 1] === '12' && nummern[pos13 + 1] === '15');
  pruefe('24 steht zwischen 23 und 25', (() => {
    const i = nummern.indexOf('24');
    return i > 0 && nummern[i - 1] === '23' && nummern[i + 1] === '25';
  })());

  // Kachel 13 anklicken -- oeffnet sie wirklich das Leber-Rezept?
  if (pos13 > -1) {
    await page.click('.grid .tile[data-n="13"]');
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.body.innerText);
    pruefe('Kachel 13 oeffnet "Leber-Morgen Vital"', text.indexOf('Leber-Morgen') > -1);
    pruefe('Zutaten des Rezepts sichtbar',
      text.indexOf('Brokkoli') > -1 && text.indexOf('Kurkuma') > -1);
  }

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Liste sortiert, Rezept 13 an seinem Platz.'
                     : '>>> FEHLER: Reihenfolge stimmt nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
