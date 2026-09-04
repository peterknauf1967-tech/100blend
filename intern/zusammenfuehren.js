/*!
 * 100blend · ZUSAMMENFUEHREN — zwei Arbeitsstaende zu einem, ohne Verlust
 * =========================================================================
 *
 * Warum es das gibt (05.09.2026): Der Geraete-Sync hat zuerst je SCHLUESSEL
 * zusammengefuehrt — wer zuletzt speicherte, gewann den ganzen Datenblock.
 * Peter hat sofort den Fall gefunden, der daran weh tut: er bucht am Handy
 * 10 kg Erdbeeren, der PC hat davon nichts gewusst und schreibt eine Minute
 * spaeter seinen eigenen Stand — und die 10 kg waeren weg gewesen. Nicht mit
 * einer Fehlermeldung, sondern still.
 *
 * Deshalb wird der grosse Zustand jetzt FELDWEISE zusammengefuehrt:
 *
 *   bestand, tk, reift, bestellt   je ZUTATENCODE einzeln, entschieden ueber
 *                                  S.ts[code] — den Zeitstempel, den die App
 *                                  bei jeder Buchung ohnehin schon setzt
 *   ampel                          je Code, entschieden ueber ampel[code].ts
 *   chargen, verarb, eigen         Vereinigung, Doubletten fliegen raus
 *   cfg und alles Uebrige          der juengere Stand gewinnt
 *
 * Ergebnis: Peters Erdbeeren vom Handy und die Mango vom PC stehen
 * hinterher BEIDE da. Verloren geht nur, was auf beiden Geraeten am selben
 * Code geaendert wurde — und dort gewinnt die spaetere Buchung, was richtig
 * ist.
 */
(function () {
  "use strict";

  /* Ein Eintrag ist genau dann "der neuere", wenn sein Zeitstempel groesser
     ist. Fehlt der Stempel auf einer Seite, entscheidet der Stempel des
     ganzen Blocks — besser eine grobe Antwort als gar keine. */
  function neuer(tsA, tsB, blockA, blockB) {
    var a = tsA || 0, b = tsB || 0;
    if (a !== b) return a > b;
    return (blockA || 0) >= (blockB || 0);
  }

  function mengenkarte(hier, dort, tsHier, tsDort, blockHier, blockDort) {
    var raus = {}, code;
    for (code in hier) if (Object.prototype.hasOwnProperty.call(hier, code)) raus[code] = hier[code];
    for (code in dort) {
      if (!Object.prototype.hasOwnProperty.call(dort, code)) continue;
      if (!(code in raus)) { raus[code] = dort[code]; continue; }        /* nur dort → uebernehmen */
      if (raus[code] === dort[code]) continue;
      if (!neuer((tsHier || {})[code], (tsDort || {})[code], blockHier, blockDort)) {
        raus[code] = dort[code];
      }
    }
    return raus;
  }

  function ampelKarte(hier, dort) {
    var raus = {}, code;
    for (code in hier) if (Object.prototype.hasOwnProperty.call(hier, code)) raus[code] = hier[code];
    for (code in dort) {
      if (!Object.prototype.hasOwnProperty.call(dort, code)) continue;
      var a = raus[code], b = dort[code];
      if (!a) { raus[code] = b; continue; }
      if ((b && b.ts || 0) > (a && a.ts || 0)) raus[code] = b;
    }
    return raus;
  }

  /* Listen vereinigen. Gleich ist, was denselben Text ergibt — die
     Eintraege sind kleine Objekte ohne Zufallsanteil, das traegt. */
  function listeVereinen(hier, dort) {
    var raus = [], gesehen = {}, i, s;
    var alle = (hier || []).concat(dort || []);
    for (i = 0; i < alle.length; i++) {
      try { s = JSON.stringify(alle[i]); } catch (e) { s = String(alle[i]); }
      if (gesehen[s]) continue;
      gesehen[s] = 1;
      raus.push(alle[i]);
    }
    return raus;
  }

  /* hierText / dortText sind die beiden JSON-Staende als Text,
     blockHier / blockDort ihre Zeitstempel. Zurueck kommt Text. */
  function zustaendeMischen(hierText, dortText, blockHier, blockDort) {
    var H, D;
    try { H = JSON.parse(hierText || "{}"); } catch (e) { return dortText; }
    try { D = JSON.parse(dortText || "{}"); } catch (e) { return hierText; }
    if (!H || typeof H !== "object") return dortText;
    if (!D || typeof D !== "object") return hierText;

    var juenger = (blockDort || 0) > (blockHier || 0) ? D : H;
    var raus = {}, k;
    for (k in juenger) if (Object.prototype.hasOwnProperty.call(juenger, k)) raus[k] = juenger[k];
    /* Felder, die nur der aeltere Stand kennt, gehen nicht verloren. */
    var aelter = juenger === D ? H : D;
    for (k in aelter) if (!(k in raus)) raus[k] = aelter[k];

    ["bestand", "tk", "reift", "bestellt"].forEach(function (feld) {
      raus[feld] = mengenkarte(H[feld] || {}, D[feld] || {}, H.ts || {}, D.ts || {}, blockHier, blockDort);
    });
    raus.ts = mengenkarte(H.ts || {}, D.ts || {}, H.ts || {}, D.ts || {}, blockHier, blockDort);
    /* ts selbst: je Code der groessere Wert */
    Object.keys(raus.ts).forEach(function (c) {
      raus.ts[c] = Math.max((H.ts || {})[c] || 0, (D.ts || {})[c] || 0);
    });

    raus.ampel = ampelKarte(H.ampel || {}, D.ampel || {});
    ["chargen", "verarb", "eigen"].forEach(function (feld) {
      raus[feld] = listeVereinen(H[feld], D[feld]);
    });

    try { return JSON.stringify(raus); } catch (e) { return dortText; }
  }

  window.blendZusammenfuehren = {
    zustand: zustaendeMischen,
    /* Fuer alles ausser dem grossen Zustand bleibt es beim einfachen
       "der juengere gewinnt" — dort gibt es nichts feldweise zu retten. */
    gilt: function (schluessel) { return schluessel === "blend_os_v1"; }
  };
})();
