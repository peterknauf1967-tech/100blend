/* Stand-OS · Offline-Speicher
   WICHTIG: Für die Seite selbst gilt NETZ ZUERST — sonst sieht man nach einem
   Update erst beim übernächsten Öffnen die neue Fassung (Vorfall 14.08., iPhone).
   Nur wenn kein Netz da ist, kommt die gespeicherte Fassung. Bilder und Manifest
   bleiben Cache-zuerst, die ändern sich praktisch nie. */
const CACHE = "blend-os-v4";
const FILES = ["./standos.html", "./standos.webmanifest", "./icon-192.png", "./icon-512.png"];

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

  if (istSeite) {
    /* Netz zuerst: immer die aktuelle Fassung, Cache nur als Rückfalloption */
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then(hit => hit || caches.match("./standos.html")))
    );
    return;
  }

  /* Alles andere: Cache zuerst, im Hintergrund auffrischen */
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
