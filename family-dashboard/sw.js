/* Always request fresh dashboard files and API data; do not cache private content. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  // A network-only handler preserves Cloudflare Access and live API freshness.
  // Offline requests use the browser's standard offline error page.
  if(event.request.mode==='navigate')event.respondWith(fetch(event.request));
});
