/**
 * PARALLEL-SYNC — Bootstrap für Firestore-Doppelbetrieb in 100blend.html
 *
 * Wird NUR geladen, wenn 100blend.html mit `?firestore=1` aufgerufen wird.
 * Die alte App unter derselben URL ohne Parameter läuft unverändert weiter.
 *
 * Ablauf:
 *   1. Lade den Adapter (window.blendDb)
 *   2. Zeige Anmelde-Overlay, wenn nicht angemeldet
 *   3. Nach Login: registriere window.blendSync — die save()-Funktion
 *      der App ruft das nach jedem localStorage-Schreib zusätzlich auf
 *   4. Alle 30 s wird debounced der Bestand nach Firestore gespiegelt.
 *      Bewusst kein Echtzeit — beim Tippen soll nicht bei jedem Tastenanschlag
 *      geschrieben werden.
 *
 * Prinzip Parallel-Modus:
 *   localStorage bleibt Wahrheit für die App (Rendering, Berechnung).
 *   Firestore ist Backup + Verifikations-Kanal, damit man vergleichen kann,
 *   ob die Wahrheiten synchron bleiben.
 */
import "./adapter.js";

const $ = id => document.getElementById(id);

/* Anmelde-Overlay einfügen */
const overlay = document.createElement("div");
overlay.id = "firestore-overlay";
overlay.style.cssText =
  "position:fixed;inset:0;background:rgba(20,20,20,.92);z-index:99999;" +
  "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
  "color:#fff;font:14px/1.5 system-ui,sans-serif;text-align:center;padding:20px";
overlay.innerHTML =
  '<div style="max-width:340px">' +
    '<h2 style="margin:0 0 12px;font-size:20px">🔥 Firestore-Modus</h2>' +
    '<p style="margin:0 0 16px;opacity:.85">Parallel-Betrieb: localStorage bleibt Wahrheit, Firestore wird zusätzlich beschrieben.</p>' +
    '<button id="fslogin" style="padding:12px 24px;font:600 15px inherit;border-radius:8px;border:0;background:#1a73e8;color:#fff;cursor:pointer">Mit Google anmelden</button>' +
    '<p style="margin:14px 0 0;font-size:12px;opacity:.6">' +
      '<a href="?" style="color:#8fb4ea">← ohne Firestore</a></p>' +
  '</div>';
document.body.appendChild(overlay);

/* Warten bis der Adapter bereit ist */
async function bereitmachen() {
  let versuche = 20;
  while (!window.blendDb && versuche > 0) {
    await new Promise(r => setTimeout(r, 100));
    versuche--;
  }
  if (!window.blendDb) {
    overlay.innerHTML = '<div style="color:#f88">Adapter konnte nicht geladen werden — offline?</div>';
    return;
  }

  $("fslogin").onclick = async () => {
    try { await window.blendDb.anmelden(); }
    catch (e) {
      overlay.insertAdjacentHTML("beforeend",
        '<div style="margin-top:12px;color:#f88;font-size:12px">Fehler: ' + e.message + '</div>');
    }
  };

  window.blendDb.beobachteAnmeldung(async user => {
    if (!user) { overlay.style.display = "flex"; return; }
    overlay.remove();

    /* Sync-Hook registrieren — die App ruft das nach jedem localStorage-Schreib */
    let syncTimer = null;
    let letzterSchreib = 0;
    window.blendSync = (S) => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(async () => {
        try {
          const jetzt = Date.now();
          const alle = { ...(S.bestand || {}) };
          const tk   = { ...(S.tk || {}) };
          let n = 0;
          for (const [code, menge] of Object.entries(alle)) {
            await window.blendDb.bestandSetzen(code, "bestand", menge, user.email);
            n++;
          }
          for (const [code, menge] of Object.entries(tk)) {
            await window.blendDb.bestandSetzen(code, "tk", menge, user.email);
            n++;
          }
          console.log("Firestore-Sync: " + n + " Positionen (" + (Date.now() - jetzt) + " ms)");
          zeigeSyncStempel(n);
          letzterSchreib = Date.now();
        } catch (e) { console.error("Firestore-Sync fehlgeschlagen: " + e.message); }
      }, 5000);   /* 5 s Ruhe vor dem Sync — verhindert Sturm bei vielen kleinen Änderungen */
    };

    /* Kleiner Stempel im Header, damit man sieht, dass Sync läuft */
    const stempel = $("syncstempel");
    if (stempel) stempel.textContent = "🔥 firestore";
    function zeigeSyncStempel(n) {
      if (!stempel) return;
      const zeit = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      stempel.textContent = "🔥 " + n + " @ " + zeit;
    }

    console.log("Firestore-Parallel-Modus aktiv. Angemeldet: " + user.email + " (role wird beim nächsten Login-Zyklus geladen)");
  });
}

bereitmachen();
