/* 100blend Einkaufs-Protokoll — Offline-Cache.
   Auf dem Markt gibt es oft kein Netz. Die App muss trotzdem starten.
   Strategie: beim Installieren alles cachen; danach Cache zuerst, Netz nur zum Auffrischen. */
const CACHE = "blend-einkauf-v12";   /* hochzählen, wenn einkauf.html geändert wurde — sonst behält das Handy die alte Version */
const FILES = ["./einkauf.html", "./einkauf.webmanifest", "./icon-192.png", "./icon-512.png"];

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
