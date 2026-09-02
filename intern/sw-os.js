/* Stand-OS · Offline-Speicher
   WICHTIG: Für die Seite selbst UND für JS gilt NETZ ZUERST — sonst sieht man
   nach einem Update erst beim übernächsten Öffnen die neue Fassung (Vorfall
   14.08. iPhone; 02.09. Android nach Claude-Button-Rollout — dreifach diktiert,
   weil alter JS-Handler noch aus Cache kam). Nur wenn kein Netz da ist, kommt
   die gespeicherte Fassung. Bilder und Manifest bleiben Cache-zuerst — die
   ändern sich praktisch nie. */
const CACHE = "blend-os-v17";   /* v16: Webhook-Abfrage per prompt beim Senden; Zahnrad-Bug behoben (data-act) + Sprachumschalter; Gear-Click auf Mobile fixen (closest statt ===); Fehlerdiagnose (Postkorb zeigt Grund, Toast 7s); Postkorb-Race + flushQueue-Statusupdate; CORS-Fix (no-cors+text-plain fuer Make-Webhook); FAB ueber Nav + Screenshot-Upload + Frisch/Gefroren-Chip; Claude-Button Postkorb (msg_id, Antworten-Anzeige, 2-Segment-Badge) + firebase-sync claude_answers/*, 02.09.2026 */
const FILES = [
  "./standos.html", "./kasse.html", "./rezepte.html",
  "./standos.webmanifest",
  "./icon-192.png", "./icon-512.png",
  "./claude-button.js", "./wareneingang-button.js", "./firebase-sync.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const istSeite = e.request.mode === "navigate" || /\.html($|\?)/.test(e.request.url);
  const istJS    = /\.js($|\?)/.test(e.request.url);

  if (istSeite || istJS) {
    /* Netz zuerst — sowohl HTML als auch JS. Sonst kleben Bugs im
       Cache und sind erst nach 2-3 Ladevorgängen weg. */
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(hit => hit || (istSeite ? caches.match("./standos.html") : undefined)))
    );
    return;
  }

  /* Bilder, Manifest, andere Statik: Cache zuerst, im Hintergrund auffrischen */
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) { const c2 = res.clone(); caches.open(CACHE).then(c => c.put(e.request, c2)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

/* Von der Seite aus erzwungenes Update */
self.addEventListener("message", e => {
  if (e.data === "update") self.skipWaiting();
});
