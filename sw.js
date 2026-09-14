const CACHE="spa-water-test-v061";
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
  "./","./index.html?v=061","./styles.css?v=061","./app.js?v=061","./manifest.webmanifest?v=061","./icon-192.png?v=061","./icon-512.png?v=061"
])))});
self.addEventListener("activate",e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  e.respondWith((async()=>{
    try{
      const fresh=await fetch(e.request,{cache:"no-store"});
      const cache=await caches.open(CACHE);
      cache.put(e.request,fresh.clone());
      return fresh;
    }catch(err){
      const cached=await caches.match(e.request,{ignoreSearch:true});
      return cached || caches.match("./index.html?v=061",{ignoreSearch:true});
    }
  })());
});
