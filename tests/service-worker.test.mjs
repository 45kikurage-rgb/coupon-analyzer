import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://coupons.test";

function loadWorker({ installFailure = false, fetchResponse } = {}) {
  const handlers = {};
  const stores = new Map([["coupon-analyzer-old", new Map()], ["another-app", new Map()]]);
  const calls = [];
  const key = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(paths) {
          calls.push("addAll");
          if (installFailure) throw new Error("asset download failed");
          for (const path of paths) store.set(key(path), new Response(`shell:${path}`));
        },
        async match(request) { return store.get(key(request))?.clone(); },
        async put(request, response) { calls.push("put"); store.set(key(request), response); }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { calls.push(`delete:${name}`); return stores.delete(name); }
  };
  vm.runInNewContext(source, {
    self: {
      location: { origin },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      async skipWaiting() { calls.push("skipWaiting"); },
      clients: { async claim() { calls.push("claim"); } }
    },
    URL, Response, caches,
    async fetch(request) {
      calls.push(`fetch:${request.url}`);
      return fetchResponse ? fetchResponse(request) : new Response("network");
    }
  });
  return {
    calls, stores,
    lifecycle(name) {
      let promise;
      handlers[name]({ waitUntil(value) { promise = value; } });
      return promise;
    },
    request(path, options = {}) {
      const request = new Request(new URL(path, origin), options);
      let promise;
      handlers.fetch({ request, respondWith(value) { promise = value; } });
      return promise;
    },
    navigate() {
      let promise;
      handlers.fetch({ request: { url: `${origin}/`, method: "GET", mode: "navigate", headers: new Headers() },
        respondWith(value) { promise = value; } });
      return promise;
    }
  };
}

test("SW leaves APIs, foreign origins, arbitrary GETs and no-store requests to the network", () => {
  const worker = loadWorker();
  for (const path of ["/api/status", "/api/corrections", "/api", "/private", "https://other.test/index.html"]) {
    assert.equal(worker.request(path), undefined, path);
  }
  assert.equal(worker.request("/index.html", { cache: "no-store" }), undefined);
  assert.equal(worker.request("/index.html", { headers: { "cache-control": "max-age=0, no-store" } }), undefined);
  assert.equal(worker.request("/api/analyze", { method: "POST" }), undefined);
  assert.equal(worker.calls.length, 0);
});

test("SW reuses only its current shell cache and does not cache no-store responses", async () => {
  const worker = loadWorker({ fetchResponse: () => new Response("private", { headers: { "cache-control": "no-store" } }) });
  assert.equal(await (await worker.request("/index.html")).text(), "private");
  assert.equal(await (await worker.request("/index.html")).text(), "private");
  assert.equal(worker.calls.filter((call) => call.startsWith("fetch:")).length, 2);
  assert.ok(!worker.calls.includes("put"));
});

test("SW caches an allowed successful shell response and reuses it", async () => {
  const worker = loadWorker();
  await worker.request("/styles.css?v=20261120-filter-copy-v1");
  assert.equal(await (await worker.request("/styles.css?v=20261120-filter-copy-v1")).text(), "network");
  assert.equal(worker.calls.filter((call) => call.startsWith("fetch:")).length, 1);
  assert.equal(worker.request("/styles.css?unlisted=1"), undefined);
});

test("SW rejects failed shell installation without replacing the active worker or deleting old caches", async () => {
  const worker = loadWorker({ installFailure: true });
  await assert.rejects(worker.lifecycle("install"), /asset download failed/);
  assert.ok(worker.stores.has("coupon-analyzer-old"));
  assert.ok(worker.stores.has("another-app"));
  assert.deepEqual(worker.calls, ["addAll"]);
});

test("SW activates only after shell installation and preserves unrelated app caches", async () => {
  const worker = loadWorker();
  await worker.lifecycle("install");
  assert.deepEqual(worker.calls, ["addAll", "skipWaiting"]);
  await worker.lifecycle("activate");
  assert.ok(!worker.stores.has("coupon-analyzer-old"));
  assert.ok(worker.stores.has("another-app"));
  assert.equal(worker.calls.at(-1), "claim");
});

test("SW falls back to the installed current shell when navigation is offline", async () => {
  const worker = loadWorker({ fetchResponse: () => { throw new Error("offline"); } });
  await worker.lifecycle("install");
  const response = await worker.navigate();
  assert.equal(await response.text(), "shell:/index.html");
});

test("SW precaches every first-party HTML and manifest asset at its exact URL", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  const urls = [...html.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map((match) => match[1]);
  urls.push(...manifest.icons.map((icon) => icon.src));
  for (const url of urls) assert.ok(source.includes(JSON.stringify(url)), `not precached: ${url}`);
});
