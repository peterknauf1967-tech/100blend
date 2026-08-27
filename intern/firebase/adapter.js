/**
 * FIRESTORE-ADAPTER für 100blend.html und kasse.html
 *
 * Dies ist die dünne Schicht, die aus dem Frontend heraus mit Firestore
 * redet. Sie wird in beiden Apps eingebunden und ersetzt SCHRITT FÜR
 * SCHRITT den localStorage-basierten Zustand.
 *
 * Der Umbau passiert nicht auf einmal. Prinzip:
 *   1. Adapter wird geladen (setzt window.blendDb bereit)
 *   2. Bei jedem localStorage-Schreibvorgang wird PARALLEL Firestore
 *      geschrieben — beide Wahrheiten laufen mit
 *   3. Nach einer Woche Doppelbetrieb (Vergleichen ob Werte gleich sind)
 *      wird localStorage abgeschaltet, Firestore ist alleinige Wahrheit
 *
 * ⚠ Diese Datei allein bringt noch NICHTS. Peter muss firebase/config.js
 * mit seinen apiKey-Werten anlegen — Anleitung in ANLEITUNG_PETER.md.
 * Ohne die Config-Werte kann der Adapter nicht initialisieren.
 */

// ES-Module direkt vom Google CDN — kein Bundler nötig
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs,
  onSnapshot, runTransaction, serverTimestamp, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

/* Offline-Puffer: das Firestore-SDK cacht Reads lokal und puffert Writes,
   solange das WLAN weg ist. Fällt Netz aus, arbeitet die Kasse weiter,
   synct beim Reconnect. */
try { await enableIndexedDbPersistence(db); }
catch (e) { console.warn("Persistence: " + e.code); }

/* -----------------------------------------------------------------
   ANMELDEN — Google-Login. Peter und Lexi klicken je einmal, danach
   bleibt der Login im Browser. Bei Abmeldung reines "signOut".
 ----------------------------------------------------------------- */
async function anmelden() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}
function beobachteAnmeldung(cb) { return onAuthStateChanged(auth, cb); }
async function abmelden() { await signOut(auth); }

/* -----------------------------------------------------------------
   KATALOG lesen — einmal beim Start, danach im Speicher.
 ----------------------------------------------------------------- */
async function katalogLaden() {
  const snap = await getDocs(collection(db, "katalog"));
  const kat = [];
  snap.forEach(d => kat.push(d.data()));
  return kat;
}

/* -----------------------------------------------------------------
   BESTAND — live gehört. Die App bekommt bei jeder Änderung auf
   irgendeinem Gerät sofort das neue Bild.
 ----------------------------------------------------------------- */
function bestandBeobachten(cb) {
  return onSnapshot(collection(db, "bestand"), snap => {
    const bestand = {}, tk = {};
    snap.forEach(d => {
      const v = d.data();
      (v.ort === "tk" ? tk : bestand)[v.code] = v.menge;
    });
    cb({ bestand, tk, stand: new Date().toISOString().slice(0,10) });
  });
}

/* -----------------------------------------------------------------
   BESTAND aktualisieren — atomar, mit Nutzer-Stempel.
 ----------------------------------------------------------------- */
async function bestandSetzen(code, ort, menge, nutzer) {
  const id = ort === "tk" ? code + "__tk" : code;
  await setDoc(doc(db, "bestand", id), {
    code, ort, menge: Number(menge),
    aktualisiert: serverTimestamp(),
    aktualisiertVon: nutzer || "unbekannt"
  }, { merge: true });
}

/* -----------------------------------------------------------------
   VERKAUF buchen — TRANSAKTION: Bestand runter + Verkauf rein.
   Wenn irgendwas schiefgeht, wird alles zurückgerollt.
 ----------------------------------------------------------------- */
async function verkaufBuchen(bon) {
  return runTransaction(db, async tx => {
    /* Alle betroffenen Bestand-Docs im Voraus lesen */
    const codes = new Set();
    (bon.positionen || []).forEach(p => Object.keys(p.abzug || {}).forEach(c => codes.add(c)));

    const bestand = {};
    for (const code of codes) {
      const ids = [code, code + "__tk"];
      for (const id of ids) {
        const s = await tx.get(doc(db, "bestand", id));
        if (s.exists()) bestand[id] = s.data();
      }
    }

    /* Für jede Position: Abzug einspielen */
    (bon.positionen || []).forEach(pos => {
      Object.entries(pos.abzug || {}).forEach(([code, menge]) => {
        /* Erst TK versuchen, sonst normaler Bestand */
        const tkId = code + "__tk";
        const beId = code;
        const tkHat = bestand[tkId] && bestand[tkId].menge >= menge;
        const target = tkHat ? tkId : beId;
        if (bestand[target]) {
          const neu = Math.max(0, bestand[target].menge - menge);
          tx.update(doc(db, "bestand", target), {
            menge: neu,
            aktualisiert: serverTimestamp(),
            aktualisiertVon: "verkauf-" + (bon.ref || "?")
          });
          bestand[target].menge = neu;
        }
      });
    });

    /* Bon speichern */
    tx.set(doc(db, "verkaeufe", bon.ref), {
      ...bon,
      zeit: serverTimestamp()
    });
  });
}

/* -----------------------------------------------------------------
   Nach außen sichtbar.
 ----------------------------------------------------------------- */
window.blendDb = {
  anmelden, abmelden, beobachteAnmeldung,
  katalogLaden, bestandBeobachten, bestandSetzen,
  verkaufBuchen,
  auth, db
};

console.log("Firestore-Adapter bereit.");
