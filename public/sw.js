const STATIC_CACHE = "lexora-static-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll([
    "/manifest.webmanifest",
    "/icons/lexora.svg",
    "/icons/lexora-192.svg",
    "/icons/lexora-512.svg",
  ])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;
  if (!requestUrl.pathname.startsWith("/_next/static/") && !requestUrl.pathname.startsWith("/icons/") && requestUrl.pathname !== "/manifest.webmanifest") return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    void caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
