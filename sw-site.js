/*!
 * 100blend · Service Worker der oeffentlichen Seite
 *
 * Zweck ist NICHT Offline-Betrieb um jeden Preis, sondern zweierlei:
 *   1. Ohne registrierten Service Worker bietet Chrome auf Android das
 *      "zur Startseite hinzufuegen" mit App-Kachel nicht an. Er ist die
 *      Eintrittskarte fuer die Installation.
 *   2. Wer die Kachel angetippt hat und im Bus ohne Empfang sitzt, soll die
 *      Karte trotzdem sehen.
 *
 * HTML holen wir NETZ ZUERST. Der Grund steht im Service Worker der internen
 * App und gilt hier genauso: Preise und Karte aendern sich, und ein Handy,
 * das wochenalte Seiten zeigt, ohne dass es jemand merkt, ist schlimmer als
 * eine Seite, die kurz laedt.
 */
const CACHE = "blend-site-v1";
const FILES = [
  "/", "/index.html", "/order.html",
  "/100blend.webmanifest",
  "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png",
  "/icon-maskable-192.png", "/icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(FILES.map(f => c.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k.indexOf("blend-site") === 0)
                                .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;      /* Schriften, Karten: nicht anfassen */
  if (url.pathname.indexOf("/intern/") === 0) return; /* die interne App hat ihren eigenen */

  const istSeite = e.request.mode === "navigate" || /\.html($|\?)/.test(url.pathname);

  if (istSeite) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(res => {
          const kopie = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopie));
          return res;
        })
        .catch(() => caches.match(e.request).then(hit => hit || caches.match("/index.html")))
    );
    return;
  }

  /* Bilder, Icons, Manifest: erst aus dem Speicher, im Hintergrund auffrischen */
  e.respondWith(
    caches.match(e.request).then(hit => {
      const netz = fetch(e.request).then(res => {
        if (res && res.ok) {
          const k = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, k));
        }
        return res;
      }).catch(() => hit);
      return hit || netz;
    })
  );
});
