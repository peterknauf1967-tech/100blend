/*!
 * 100blend · GERAETE-SYNC — ein Datenstand fuer PC und Handy
 * =========================================================================
 *
 * DAS PROBLEM, das dieses Modul loest (Peter, 05.09.2026):
 * "bringe Ordnung in das System, so dass es vom PC aus und vom Handy aus in
 *  ein und dieselben Seiten und Datenbanken schreibt."
 *
 * Bis heute lag der GESAMTE Arbeitsstand — Bestand, TK, Reifung, Bestellt,
 * Verarbeitungen, Chargen, Ampel — in localStorage. localStorage ist an EIN
 * Geraet und EINEN Browser gebunden. Am PC etwas einbuchen und am Handy
 * nachsehen: zwei getrennte Welten, keine Fehlermeldung, nur stille
 * Abweichung. Genau daher kam der Eindruck "es aendert sich nichts".
 *
 * firebase-sync.js konnte drei Teilbaeume spiegeln, sprang aber nur an, wenn
 * jemand VON HAND localStorage.firebase_config gesetzt hatte. Das hatte auf
 * keinem Geraet jemand getan — die Datenbank enthielt am 05.09. ausser
 * claude_answers nichts. Der Mechanismus war da, der Schalter stand auf aus.
 *
 * DIESES MODUL macht den Schalter ueberfluessig:
 *   - Die Zugangsdaten stehen fest im Code (Firebase sagt ausdruecklich, dass
 *     das kein Geheimnis ist — geschuetzt wird ueber die Regeln, nicht ueber
 *     das Verstecken des Schluessels).
 *   - Es haengt sich an localStorage selbst, nicht an den App-Code. Damit
 *     wirkt es in standos.html UND kasse.html, ohne dass eine der beiden
 *     Seiten umgebaut werden muss.
 *   - Jede Aenderung bekommt Zeitstempel und Geraetekennung. Beim Start wird
 *     zusammengefuehrt: wer zuletzt geschrieben hat, gewinnt je Schluessel.
 *
 * BEWUSSTE GRENZE: Es wird je SCHLUESSEL zusammengefuehrt, nicht je Zutat.
 * Bucht Peter am PC Mango ein waehrend Lexi am Handy Ananas einbucht, und
 * beide speichern in derselben Minute, gewinnt die spaetere Speicherung
 * komplett. Fuer den Alltag (einer arbeitet, der andere schaut) reicht das;
 * fuer echten Parallelbetrieb braeuchte es eine Zusammenfuehrung je Feld —
 * siehe UMBAU-BERICHT, Punkt "was ich nicht allein kann".
 */
(function () {
  "use strict";
  if (window.__geraeteSync) return;
  window.__geraeteSync = true;

  /* Welche Schluessel gehoeren allen Geraeten gemeinsam?
     blend_os_v1 ist der grosse Zustands-Blob (Bestand, TK, Reifung,
     Bestellt, Verarbeitungen, Chargen, Ampel, Konfiguration). */
  var GETEILT = [
    "blend_os_v1",            /* Hauptzustand der App */
    "blend_ampel_v1",         /* Zutaten-Ampel, auch von der Kasse gelesen */
    "blend_chargen_frisch_v1",/* Frisch-Chargen mit Ablaufdatum */
    "blend_zertifikate_v1",   /* Zertifikate je Ware */
    "blend_wareneingang_quittiert",
    "blend_best_quittiert",
    "blend_sperrgrund",       /* warum eine Zutat gesperrt ist */
    "kasse_preise"            /* von Hand geaenderte Verkaufspreise */
  ];

  /* PRIVAT je Geraet — bewusst NICHT geteilt: Sprache, angemeldeter Nutzer,
     Bechergroesse und was sonst zur Bedienung dieses einen Geraets gehoert. */

  var URL_DB = "https://blend-live-default-rtdb.asia-southeast1.firebasedatabase.app";
  var PFAD   = "/geteilt";          /* alles unter einem Ast, sauber getrennt
                                       von claude_answers */

  /* ---------------------------------------------------------------
     Geraetekennung: einmal gewuerfelt, bleibt im Browser stehen.
     Damit erkennt ein Geraet die eigenen Aenderungen wieder und
     laedt sich nicht wegen seiner selbst neu.
   --------------------------------------------------------------- */
  var GER;
  try {
    GER = localStorage.getItem("blend_geraet_id");
    if (!GER) {
      GER = (navigator.userAgent.indexOf("Android") > -1 ? "handy-" :
             navigator.userAgent.indexOf("iPhone")  > -1 ? "iphone-" : "pc-") +
            Math.random().toString(36).slice(2, 8);
      localStorage.setItem("blend_geraet_id", GER);
    }
  } catch (e) { GER = "unbekannt"; }

  var eigeneSchreibungen = {};   /* schluessel -> Zeitstempel unserer letzten Schreibung */
  var letzteFernwerte    = {};   /* schluessel -> zuletzt aus der Cloud gesehener Wert */
  var bereit = false;
  var wartend = {};              /* gesammelte Schreibungen, solange offline */

  function log() {
    try { if (localStorage.getItem("blend_sync_debug") === "1")
      console.log.apply(console, ["[geraete-sync]"].concat([].slice.call(arguments))); } catch (e) {}
  }

  function jetzt() { return Date.now(); }

  /* ---------------------------------------------------------------
     Schreiben — ueber die REST-Schnittstelle der Realtime Database.
     Kein SDK noetig, kein zusaetzlicher Ladeballast, funktioniert auch
     dort, wo ES-Module blockiert sind.
   --------------------------------------------------------------- */
  function hochladen(schluessel, wert) {
    var t = jetzt();
    eigeneSchreibungen[schluessel] = t;
    var koerper = JSON.stringify({ v: wert, t: t, g: GER });
    return fetch(URL_DB + PFAD + "/" + encodeURIComponent(schluessel) + ".json",
                 { method: "PUT", body: koerper, keepalive: true })
      .then(function (r) { log("hoch", schluessel, r.status); stempel(true); return r; })
      .catch(function (e) {
        log("hoch fehlgeschlagen", schluessel, e);
        wartend[schluessel] = wert;        /* beim naechsten Erfolg nachreichen */
        stempel(false);
      });
  }

  function alleLaden() {
    return fetch(URL_DB + PFAD + ".json?t=" + jetzt())
      .then(function (r) { return r.json(); })
      .catch(function (e) { log("laden fehlgeschlagen", e); return null; });
  }

  /* ---------------------------------------------------------------
     Zusammenfuehren beim Start.
     Regel: der juengere Zeitstempel gewinnt. Ein Schluessel, den es hier
     noch gar nicht gibt, wird uebernommen. Ein Schluessel, den nur wir
     haben, wird hochgeladen. So heilt sich ein frisch installiertes
     Geraet von selbst und ein Geraet, das offline gearbeitet hat, gibt
     seinen Stand ab.
   --------------------------------------------------------------- */
  function lokalStempel(schluessel) {
    try {
      var s = JSON.parse(localStorage.getItem("blend_sync_stempel") || "{}");
      return s[schluessel] || 0;
    } catch (e) { return 0; }
  }
  function lokalStempelSetzen(schluessel, t) {
    try {
      var s = JSON.parse(localStorage.getItem("blend_sync_stempel") || "{}");
      s[schluessel] = t;
      echtesSetItem.call(localStorage, "blend_sync_stempel", JSON.stringify(s));
    } catch (e) {}
  }

  function zusammenfuehren(fern) {
    var geaendert = [];
    GETEILT.forEach(function (k) {
      var hier = null;
      try { hier = localStorage.getItem(k); } catch (e) {}
      var dort = fern && fern[k] ? fern[k] : null;

      if (!dort && hier != null) { hochladen(k, hier); return; }
      if (!dort) return;
      letzteFernwerte[k] = dort.v;

      var tHier = lokalStempel(k);
      if (hier == null || (dort.t || 0) > tHier) {
        if (hier !== dort.v) {
          try { echtesSetItem.call(localStorage, k, dort.v); } catch (e) {}
          lokalStempelSetzen(k, dort.t || jetzt());
          geaendert.push(k);
        }
      } else if (hier !== dort.v && tHier > (dort.t || 0)) {
        hochladen(k, hier);
      }
    });
    return geaendert;
  }

  /* ---------------------------------------------------------------
     localStorage anzapfen. Wir ersetzen setItem durch eine Fassung, die
     zusaetzlich hochlaedt — die App merkt davon nichts.
   --------------------------------------------------------------- */
  var echtesSetItem = localStorage.setItem;
  try {
    localStorage.setItem = function (k, v) {
      var r = echtesSetItem.call(localStorage, k, v);
      if (GETEILT.indexOf(k) > -1) {
        var t = jetzt();
        lokalStempelSetzen(k, t);
        if (bereit) hochladen(k, v); else wartend[k] = v;
      }
      return r;
    };
  } catch (e) { log("setItem nicht ersetzbar", e); }

  /* ---------------------------------------------------------------
     Regelmaessig nachsehen, ob ein anderes Geraet geschrieben hat.
     Kein Dauerlauscher, sondern alle 20 Sekunden ein Blick — das ist
     sparsam mit Daten und reicht fuer zwei Menschen an einem Stand.
   --------------------------------------------------------------- */
  function nachsehen() {
    alleLaden().then(function (fern) {
      if (!fern) { stempel(false); return; }
      stempel(true);
      var neu = [];
      GETEILT.forEach(function (k) {
        var dort = fern[k];
        if (!dort) return;
        if (dort.g === GER) return;                       /* unsere eigene Schreibung */
        if ((dort.t || 0) <= lokalStempel(k)) return;     /* nicht neuer als unserer */
        var hier = null;
        try { hier = localStorage.getItem(k); } catch (e) {}
        if (hier === dort.v) { lokalStempelSetzen(k, dort.t); return; }
        try { echtesSetItem.call(localStorage, k, dort.v); } catch (e) {}
        lokalStempelSetzen(k, dort.t);
        neu.push(k);
      });
      if (neu.length) melden(neu);
    });
  }

  /* ---------------------------------------------------------------
     Wenn Daten vom anderen Geraet kommen: NICHT einfach neu laden.
     Wer gerade tippt, verliert sonst seine Eingabe. Stattdessen ein
     Balken am unteren Rand, der den Neuladen-Knopf anbietet — und ein
     stilles Neuladen nur dann, wenn eine Minute lang niemand etwas
     angefasst hat.
   --------------------------------------------------------------- */
  var letzteBeruehrung = jetzt();
  ["click", "keydown", "input", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, function () { letzteBeruehrung = jetzt(); }, true);
  });

  function melden(schluessel) {
    log("neu vom anderen Geraet:", schluessel.join(", "));
    try { document.dispatchEvent(new CustomEvent("geraete-sync", { detail: schluessel })); } catch (e) {}
    if (jetzt() - letzteBeruehrung > 60000) { location.reload(); return; }
    var b = document.getElementById("sync_balken");
    if (!b) {
      b = document.createElement("div");
      b.id = "sync_balken";
      b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;" +
        "background:#111;color:#fff;padding:10px 14px;font:600 14px/1.35 system-ui,sans-serif;" +
        "display:flex;gap:10px;align-items:center;justify-content:space-between";
      b.innerHTML = '<span>Neue Daten vom anderen Gerät.</span>' +
        '<button style="background:#fff;color:#111;border:0;border-radius:6px;' +
        'padding:7px 12px;font:700 14px system-ui;cursor:pointer">Jetzt übernehmen</button>';
      b.querySelector("button").onclick = function () { location.reload(); };
      document.body.appendChild(b);
    }
  }

  /* Kleiner Punkt oben rechts: gruen = verbunden, grau = offline.
     Damit sieht man auf einen Blick, ob der gemeinsame Stand wirklich
     gemeinsam ist — das war bisher unsichtbar. */
  function stempel(ok) {
    var p = document.getElementById("sync_punkt");
    if (!p) {
      p = document.createElement("div");
      p.id = "sync_punkt";
      p.title = "Geräte-Sync";
      p.style.cssText = "position:fixed;top:6px;right:8px;width:9px;height:9px;" +
        "border-radius:50%;z-index:99998;pointer-events:none;opacity:.75";
      if (document.body) document.body.appendChild(p);
    }
    if (p) {
      p.style.background = ok ? "#22c55e" : "#9ca3af";
      p.title = "Geräte-Sync: " + (ok ? "verbunden (" + GER + ")" : "offline");
    }
  }

  /* ---------------------------------------------------------------
     Start
   --------------------------------------------------------------- */
  function start() {
    alleLaden().then(function (fern) {
      var geaendert = zusammenfuehren(fern || {});
      bereit = true;
      Object.keys(wartend).forEach(function (k) { hochladen(k, wartend[k]); });
      wartend = {};
      stempel(!!fern);
      if (geaendert.length) {
        log("beim Start uebernommen:", geaendert.join(", "));
        /* Beim Start darf neu geladen werden — es tippt noch niemand. */
        if (!sessionStorage.getItem("sync_erststart")) {
          sessionStorage.setItem("sync_erststart", "1");
          location.reload();
          return;
        }
      }
      setInterval(nachsehen, 20000);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  /* Nach aussen sichtbar, damit die Seiten den Stand anzeigen koennen. */
  window.blendGeraeteSync = {
    geraet: GER,
    schluessel: GETEILT,
    jetztPruefen: nachsehen,
    datenbank: URL_DB + PFAD
  };
})();
