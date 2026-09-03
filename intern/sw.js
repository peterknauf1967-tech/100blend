/* 100blend Einkaufs-Protokoll — Offline-Cache.
   Auf dem Markt gibt es oft kein Netz. Die App muss trotzdem starten.
   Strategie: HTML + JS Netz-first (sonst kleben Bugs im Cache), Rest Cache-first. */
const CACHE = "blend-einkauf-v33";   /* v27: Webhook-prompt; Zahnrad-Bug + Sprachumschalter; Gear-Click Mobile-Fix; Fehlerdiagnose; Postkorb-Race + flushQueue; CORS-Fix; FAB ueber Nav + Screenshot-Upload; Claude-Button Postkorb (msg_id, Antworten sichtbar) + firebase-sync claude_answers/*, 02.09.2026 */
const FILES = [
  "./einkauf.html", "./einkauf.webmanifest",
  "./icon-192.png", "./icon-512.png",
  "./claude-button.js", "./firebase-sync.js"
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
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(hit => hit || (istSeite ? caches.match("./einkauf.html") : undefined)))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
