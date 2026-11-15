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

function correctionWriteError(request, url) {
  const correctionPath = url.pathname === "/api/corrections" || /^\/api\/corrections\/[a-f0-9]{64}$/.test(url.pathname);
  if (!correctionPath || !["POST", "DELETE"].includes(request.method)) return null;
  // Browser CSRF protection only. These headers do not authenticate an operator.
  const invalidOrigin = request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site";
  if (invalidOrigin || request.headers.get("x-coupon-correction") !== "1") {
    const error = invalidOrigin
      ? "修正操作はこのサイトの画面から実行してください。"
      : "画面を再読み込みしてから、修正操作をやり直してください。";
    return new Response(JSON.stringify({ error }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
    });
  }
  if (request.method === "POST" && request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return new Response(JSON.stringify({ error: "修正内容はJSON形式で送信してください。" }), {
      status: 415,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
    });
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) {
      const correctionError = correctionWriteError(request, url);
      if (correctionError) return correctionError;
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
