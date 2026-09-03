// Prueft die Selbstheilung gegen veraltete Geraete.
//
// Peter, 03.09.2026: "in mixo ist das immer noch das alte rezept 13 im
// smartphone" -- obwohl die Domain nachweislich den neuen Stand auslieferte
// (gemessen: Build 13:10, "Passionsfrucht gruen" im Text).
//
// Der Service Worker holt HTML und JS zwar netz-zuerst, faellt bei jedem
// fehlgeschlagenen Abruf aber still auf den Cache zurueck. Am Marktstand mit
// wackligem Netz ist das genau richtig -- nur merkt es dann niemand: das
// Geraet zeigt wochenalte Grammzahlen und sieht dabei voellig normal aus.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/frischepruefung.js

const fs = require('fs');
const path = require('path');
const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

const VERSION_DATEI = path.join(__dirname, '..', 'intern', 'version.json');

// Wird VOR dem Laden eingesetzt, damit der Pruefer beim Seitenstart schon
// unsere Antwort bekommt. Danach ist es zu spaet -- er laeuft in boot().
const stubQuelle = (b, kaputt) => `
  window.__versionAbgefragt = 0;
  // Ladezaehler in sessionStorage: window-Variablen sind nach einem
  // location.reload() weg, genau das wollen wir aber messen.
  try {
    sessionStorage.setItem('test_geladen',
      String((parseInt(sessionStorage.getItem('test_geladen'), 10) || 0) + 1));
  } catch (_) {}
  // Marker-Cache VOR dem Start anlegen -- der Pruefer laeuft in boot(),
  // alles Spaetere kaeme zu spaet. Nur beim ERSTEN Laden, sonst legt der
  // Test ihn nach dem Selbstheilen sofort wieder an und prueft sich selbst aus.
  try {
    if (sessionStorage.getItem('test_geladen') === '1') {
      caches.open('test-alt-v1').then(function(c){ return c.put('/marker', new Response('alt')); });
    }
  } catch (_) {}
  (function(){
    var echt = window.fetch;
    window.fetch = function (url) {
      if (String(url).indexOf('version.json') > -1) {
        window.__versionAbgefragt++;
        ${kaputt ? 'return Promise.reject(new Error("offline"));' :
          `return Promise.resolve({ ok: true, status: 200,
             json: function(){ return Promise.resolve({ build: ${JSON.stringify(b)} }); } });`}
      }
      return echt.apply(this, arguments);
    };
  })();
`;

(async () => {
  const { browser, page, fehler } = await starte();
  const pruefungen = [];
  const pruefe = (name, gut) => pruefungen.push([name, gut]);

  const aktuell = JSON.parse(fs.readFileSync(VERSION_DATEI, 'utf8')).build;
  console.log('version.json auf der Platte:', aktuell);

  // ---------- 1. Gleicher Stand: nichts tun (ohne Stub, echtes version.json) ----------
  await page.goto(BASIS_URL + '/intern/rezepte.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const build = await page.evaluate(() => window.__BUILD);
  const gleich = await page.evaluate(() => ({
    warnung: !!document.getElementById('build-warnung'),
    merker: (() => { try { return sessionStorage.getItem('build_reload'); } catch (_) { return null; } })(),
    kacheln: document.querySelectorAll('.grid .tile').length
  }));
  console.log('Seiten-Build:', build, '| Kacheln:', gleich.kacheln);
  pruefe('Seite hat einen Build-Stempel',   !!build);
  pruefe('Stempel = version.json',          build === aktuell);
  pruefe('bei gleichem Stand keine Warnung', !gleich.warnung);
  pruefe('bei gleichem Stand kein Merker',   !gleich.merker);

  // ---------- 2. Neuerer Stand: Caches leeren, einmal neu laden ----------
  const s2 = await browser.newPage();
  await s2.addInitScript(stubQuelle('2099-01-01 00:00', false));
  await s2.goto(BASIS_URL + '/intern/rezepte.html', { waitUntil: 'networkidle' });
  await s2.waitForTimeout(3000);

  const nach = await s2.evaluate(() => ({
    geladen: parseInt(sessionStorage.getItem('test_geladen'), 10) || 0,
    merker: (() => { try { return sessionStorage.getItem('build_reload'); } catch (_) { return null; } })(),
    warnung: !!document.getElementById('build-warnung'),
    warntext: (document.getElementById('build-warnung') || {}).textContent || ''
  }));
  const cachesNachher = await s2.evaluate(() => caches.keys());
  console.log('Caches nachher:', JSON.stringify(cachesNachher));
  console.log('Dokument geladen:', nach.geladen, '| Merker:', nach.merker);
  if (nach.warntext) console.log('Warnstreifen:', nach.warntext.slice(0, 80));

  pruefe('hat einmal neu geladen',       nach.geladen >= 2);
  pruefe('alter Cache weggeraeumt',      cachesNachher.indexOf('test-alt-v1') === -1);
  pruefe('Merker auf den neuen Stand',   nach.merker === '2099-01-01 00:00');

  // Zweiter Anlauf mit demselben neuen Stand: NICHT wieder neu laden,
  // sondern sichtbar warnen -- sonst dreht sich das im Kreis.
  await s2.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await s2.waitForTimeout(1500);
  const zweiter = await s2.evaluate(() => ({
    geladen: parseInt(sessionStorage.getItem('test_geladen'), 10) || 0,
    warnung: !!document.getElementById('build-warnung')
  }));
  console.log('Nach zweitem Anlauf geladen:', zweiter.geladen, '| Warnung:', zweiter.warnung);
  pruefe('kein zweites Neuladen (keine Schleife)', zweiter.geladen === nach.geladen);
  pruefe('stattdessen sichtbarer Warnstreifen',    zweiter.warnung === true);

  // ---------- 3. Kein Netz: kein Neuladen, keine Warnung ----------
  const s3 = await browser.newPage();
  await s3.addInitScript(stubQuelle('egal', true));
  await s3.goto(BASIS_URL + '/intern/rezepte.html', { waitUntil: 'networkidle' });
  await s3.waitForTimeout(1500);
  const offline = await s3.evaluate(() => ({
    warnung: !!document.getElementById('build-warnung'),
    geladen: parseInt(sessionStorage.getItem('test_geladen'), 10) || 0,
    kacheln: document.querySelectorAll('.grid .tile').length
  }));
  console.log('Ohne Netz — geladen:', offline.geladen, '| Kacheln:', offline.kacheln);
  pruefe('ohne Netz keine Warnung',        !offline.warnung);
  pruefe('ohne Netz kein Neuladen',        offline.geladen === 1);
  pruefe('ohne Netz laeuft die Seite',     offline.kacheln === 58);

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Veraltete Geraete heilen sich selbst.'
                     : '>>> FEHLER: Frischepruefung greift nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
