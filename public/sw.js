const CACHE_VERSION = "coupon-analyzer-20261117-ichibanya-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20261106-redeem-place-v1",
  "/url-rules.js?v=20261117-ichibanya-v1",
  "/analyzer.js?v=20261117-ichibanya-v1",
  "/capture.js?v=20261117-ichibanya-v1",
  "/app.js?v=20261117-ichibanya-v1",
  "/manifest.webmanifest?v=20260922-v3",
  "/header-character.svg?v=20260922-v3",
  "/icon.svg?v=20260922-v3",
  "/icon.svg?v=20260921-v1"
];
const SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.location.origin).href));

function noStore(headers) {
  return /(?:^|,)\s*no-store(?:\s*(?:,|$))/i.test(headers.get("cache-control") || "");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
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
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname === "/api" || url.pathname.startsWith("/api/") ||
      request.cache === "no-store" || noStore(request.headers) ||
      !SHELL_URLS.has(url.href)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(request, { cache:"no-store" });
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match("/index.html")) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok && !noStore(response.headers)) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});




