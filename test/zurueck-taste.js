// Prueft die Zurueck-Taste im Claude-Widget.
//
// Frueher gab es eigene "zurueck"-Knoepfe im Fenster, und die echte
// Zurueck-Taste des Handys hat die ganze Seite verlassen. Jetzt legt jede
// Ebene einen Eintrag in die Browser-Historie: Zurueck nimmt genau eine
// Ebene weg, und erst wenn keine mehr offen ist, geht es von der Seite weg.
//
//   python3 -m http.server 8099      (im Repo-Wurzelverzeichnis)
//   node test/zurueck-taste.js

const { starte, fehlerAusgeben, BASIS_URL } = require('./browser');

(async () => {
  const { browser, page, fehler } = await starte();

  await page.goto(BASIS_URL + '/intern/standos.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const ok = await page.$('#dlgok'); if (ok) await ok.click();
  await page.waitForTimeout(300);

  // Einen Postkorb-Eintrag setzen, damit auch die Detail-Ebene geprueft wird.
  await page.evaluate(() => {
    localStorage.setItem('claude_inbox_v1', JSON.stringify([{
      id: 'msg_test_1', ts: new Date().toISOString(), page: 'standos.html',
      text: 'Testeintrag fuer die Zurueck-Taste', photo_thumb: null,
      user: 'peter', status: 'answered', sent_at: new Date().toISOString(),
      answer: { ts: new Date().toISOString(), text: 'Antwort im Test.', kind: 'info', by: 'claude' },
      unread: false
    }]));
  });

  const zustand = () => page.evaluate(() => ({
    fenster: !!document.querySelector('.cbtn-modal.open, .cbtn-overlay.open'),
    einstellungen: !!document.querySelector('.cbtn-set.open'),
    postkorb: !!document.querySelector('.cbtn-inbox-view.open')
  }));

  const pruefungen = [];
  const pruefe = (name, gut) => { pruefungen.push([name, gut]); };

  // --- Die alten Knoepfe muessen weg sein ---
  pruefe('kein "x zurueck" im Postkorb-Kopf',
    !(await page.$('[data-act="inbox-close"]')));

  // --- Ebene 1: Fenster ---
  await page.click('.cbtn-fab');
  await page.waitForTimeout(300);
  pruefe('Fenster offen', (await zustand()).fenster);

  // --- Ebene 2: Einstellungen ---
  await page.click('.cbtn-gear');
  await page.waitForTimeout(250);
  pruefe('Einstellungen offen', (await zustand()).einstellungen);

  // Zurueck -> Einstellungen zu, Fenster bleibt
  await page.goBack();
  await page.waitForTimeout(300);
  let z = await zustand();
  pruefe('Zurueck schliesst nur die Einstellungen', !z.einstellungen && z.fenster);

  // --- Ebene 2: Postkorb ---
  await page.click('[data-act="inbox-open"]');
  await page.waitForTimeout(300);
  pruefe('Postkorb offen', (await zustand()).postkorb);

  // --- Ebene 3: Detail eines Eintrags (falls vorhanden) ---
  const eintrag = await page.$('.cbtn-inbox-list [data-inbox-id]');
  if (eintrag) {
    await eintrag.click();
    await page.waitForTimeout(250);
    const imDetail = await page.evaluate(() => !!document.querySelector('.cbtn-inbox-detail'));
    pruefe('Detail offen', imDetail);
    pruefe('kein "Liste"-Knopf im Detail', !(await page.$('[data-act="inbox-detail-back"]')));

    await page.goBack();
    await page.waitForTimeout(300);
    const zurueckInListe = await page.evaluate(() =>
      !document.querySelector('.cbtn-inbox-detail') &&
      !!document.querySelector('.cbtn-inbox-view.open'));
    pruefe('Zurueck fuehrt vom Detail in die Liste', zurueckInListe);
  } else {
    console.log('(kein Postkorb-Eintrag vorhanden -- Detail-Ebene uebersprungen)');
  }

  // Zurueck -> Postkorb zu, Fenster bleibt
  await page.goBack();
  await page.waitForTimeout(300);
  z = await zustand();
  pruefe('Zurueck schliesst nur den Postkorb', !z.postkorb && z.fenster);

  // Zurueck -> Fenster zu
  await page.goBack();
  await page.waitForTimeout(300);
  z = await zustand();
  pruefe('Zurueck schliesst das Fenster', !z.fenster);

  // Seite muss noch da sein (nicht weggeblaettert)
  const nochDa = await page.evaluate(() => !!document.querySelector('.cbtn-fab'));
  pruefe('Seite ist noch offen (nicht weggeblaettert)', nochDa);

  let alleOk = true;
  for (const [name, gut] of pruefungen) {
    console.log((gut ? '  ok   ' : '  FEHL ') + name);
    if (!gut) alleOk = false;
  }
  console.log(alleOk ? '>>> OK: Zurueck-Taste arbeitet Ebene fuer Ebene.'
                     : '>>> FEHLER: Zurueck-Taste stimmt nicht.');

  const code = fehlerAusgeben(fehler);
  await browser.close();
  process.exit(alleOk ? code : 1);
})().catch(e => { console.error('TESTFEHLER:', e.message); process.exit(1); });
