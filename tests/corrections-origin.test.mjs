import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const origin = "https://coupon-analyzer.example";
const key = "a".repeat(64);
const payload = JSON.stringify({ correctionKey: key, product: "商品", size: "none" });

function request(path, method, headers = {}, body) {
  return new Request(origin + path, { method, headers, ...(body === undefined ? {} : { body }) });
}

function service() {
  const calls = [];
  return {
    calls,
    env: { COUPON_ANALYZER: { async fetch(input) {
      calls.push({ url: input.url, method: input.method, body: await input.text() });
      return Response.json({ ok: true });
    } } }
  };
}

test("same-origin UI saves and releases reach the existing service binding", async () => {
  const { calls, env } = service();
  const headers = { origin, "x-coupon-correction": "1", "sec-fetch-site": "same-origin", "content-type": "application/json; charset=utf-8" };
  assert.equal((await worker.fetch(request("/api/corrections", "POST", headers, payload), env)).status, 200);
  assert.equal((await worker.fetch(request(`/api/corrections/${key}`, "DELETE", { origin, "x-coupon-correction": "1" }), env)).status, 200);
  assert.deepEqual(calls.map(({ method }) => method), ["POST", "DELETE"]);
  assert.equal(calls[0].url, "https://coupon-analyzer-api.internal/api/corrections");
  assert.equal(calls[0].body, payload);
});

test("untrusted browser correction writes stop before the service binding", async () => {
  const variants = [
    { origin: "https://untrusted.example", "x-coupon-correction": "1" },
    { origin: "https://coupon-analyzer.example.attacker.example", "x-coupon-correction": "1" },
    { origin: "null", "x-coupon-correction": "1" },
    { "x-coupon-correction": "1" },
    { origin },
    { origin, "x-coupon-correction": "1", "sec-fetch-site": "cross-site" }
  ];
  for (const headers of variants) {
    for (const [path, method] of [["/api/corrections", "POST"], [`/api/corrections/${key}`, "DELETE"]]) {
      const { calls, env } = service();
      const response = await worker.fetch(request(path, method, { "content-type": "application/json", ...headers }, method === "POST" ? payload : undefined), env);
      assert.equal(response.status, 403);
      assert.equal(calls.length, 0);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      const message = (await response.json()).error;
      assert.equal(message, headers.origin === origin && headers["sec-fetch-site"] !== "cross-site"
        ? "画面を再読み込みしてから、修正操作をやり直してください。"
        : "修正操作はこのサイトの画面から実行してください。");
    }
  }
});

test("form and plain-text correction bodies are rejected before the service binding", async () => {
  for (const contentType of [undefined, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
    const { calls, env } = service();
    const headers = { origin, "x-coupon-correction": "1", ...(contentType ? { "content-type": contentType } : {}) };
    assert.equal((await worker.fetch(request("/api/corrections", "POST", headers, payload), env)).status, 415);
    assert.equal(calls.length, 0);
  }
});

test("analysis, capture and status retain their existing proxy contracts", async () => {
  const { calls, env } = service();
  for (const path of ["/api/analyze", "/api/analyze-detail", "/api/capture-one"]) {
    assert.equal((await worker.fetch(request(path, "POST", { "content-type": "application/json" }, "{}"), env)).status, 200);
  }
  assert.equal((await worker.fetch(request("/api/status", "GET"), env)).status, 200);
  assert.equal((await worker.fetch(request("/api/corrections", "OPTIONS", { origin: "https://untrusted.example" }), env)).status, 200);
  assert.equal(calls.length, 5);
});
