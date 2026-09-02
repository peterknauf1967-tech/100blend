// Gemeinsamer Start fuer die Browser-Tests.
//
// Sucht playwright-core dort, wo es liegen kann (Projekt, global, /tmp),
// und den Chromium dort, wo er liegen kann. So laeuft der Test sowohl auf
// Peters Rechner als auch im Container, ohne dass jemand Pfade anfasst.

const fs = require('fs');
const path = require('path');

function ladePlaywright() {
  const orte = [
    'playwright-core',
    'playwright',
    '/tmp/node_modules/playwright-core',
    path.join(process.env.HOME || '', 'node_modules/playwright-core')
  ];
  for (const ort of orte) {
    try { return require(ort); } catch (_) {}
  }
  console.error(
    'playwright-core nicht gefunden.\n' +
    'Einmalig installieren:  npm i -D playwright-core'
  );
  process.exit(1);
}

function findeChromium() {
  if (process.env.CHROMIUM_PFAD) return process.env.CHROMIUM_PFAD;

  const kandidaten = [];
  const basis = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(basis)) {
      if (d.startsWith('chromium')) {
        kandidaten.push(path.join(basis, d, 'chrome-linux', 'chrome'));
        kandidaten.push(path.join(basis, d));
      }
    }
  } catch (_) {}
  kandidaten.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');

  for (const k of kandidaten) {
    try { if (fs.statSync(k).isFile()) return k; } catch (_) {}
  }
  return undefined; // dann nimmt Playwright seinen eigenen Download
}

// Adresse der laufenden Testseite. Vorher starten, z. B.:
//   python3 -m http.server 8099
const BASIS_URL = process.env.TEST_URL || 'http://127.0.0.1:8099';

async function starte() {
  const { chromium } = ladePlaywright();
  const browser = await chromium.launch({
    executablePath: findeChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const fehler = [];
  page.on('pageerror', e => fehler.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') fehler.push('CONSOLE: ' + m.text()); });
  return { browser, page, fehler };
}

function fehlerAusgeben(fehler) {
  if (fehler.length) {
    console.log('--- JS-FEHLER ---');
    fehler.slice(0, 8).forEach(e => console.log(e));
    return 1;
  }
  console.log('Keine JS-Fehler.');
  return 0;
}

module.exports = { starte, fehlerAusgeben, BASIS_URL };
