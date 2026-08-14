/* Stand-OS offline: alles beim Installieren cachen, danach Cache zuerst. */
const CACHE="blend-os-v1";
const FILES=["./standos.html","./standos.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys()
  .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{ if(e.request.method!=="GET")return;
  e.respondWith(caches.match(e.request).then(hit=>{
    const net=fetch(e.request).then(r=>{ if(r&&r.ok){const c2=r.clone();caches.open(CACHE).then(c=>c.put(e.request,c2))} return r })
      .catch(()=>hit);
    return hit||net; })) });
