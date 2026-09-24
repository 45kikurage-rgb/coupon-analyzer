const CACHE_VERSION = "coupon-analyzer-20260924-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260922-v2",
  "/analyzer.js?v=20260924-v1",
  "/capture.js?v=20260922-v2",
  "/manifest.webmanifest?v=20260922-v2",
  "/header-character.svg?v=20260922-v2",
  "/icon.svg?v=20260922-v2"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("coupon-analyzer-") && key !== CACHE_VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache:"no-store" });
      } catch {
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
