const API_PATHS = new Set([
  "/api/status",
  "/api/capture-one",
  "/api/analyze",
  "/api/analyze-detail",
  "/api/corrections"
]);

function isApiPath(pathname) {
  return API_PATHS.has(pathname) || /^\/api\/corrections\/[a-f0-9]{64}$/.test(pathname);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      if (!env.COUPON_ANALYZER) return new Response(JSON.stringify({ error: "解析APIが未接続です。" }), {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
      const internalUrl = new URL(request.url);
      internalUrl.protocol = "https:";
      internalUrl.hostname = "coupon-analyzer-api.internal";
      return env.COUPON_ANALYZER.fetch(new Request(internalUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};
