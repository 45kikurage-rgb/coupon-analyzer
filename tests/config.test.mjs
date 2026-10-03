import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("PWA paths are independent from coupon-capture checker", () => {
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const sw = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\/checker\//);
  assert.doesNotMatch(sw, /\/checker\//);
  assert.match(html, /id="analyzeFastStart"/);
});

test("worker uses an internal service binding", () => {
  const worker = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const config = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(worker, /env\.COUPON_ANALYZER\.fetch/);
  assert.match(config, /"service": "coupon-analyzer-api"/);
});

test("Giftee Box accepts home and exchanged-gifts URLs", () => {
  const analyzer = fs.readFileSync(new URL("../public/analyzer.js", import.meta.url), "utf8");
  assert.match(analyzer, /\(\?:home\|gifts\)/);
});

test("analysis UI accepts SB Gift and caps input at 500 URLs", () => {
  const analyzer = fs.readFileSync(new URL("../public/analyzer.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(analyzer, /hostname === "sbg\.jp"/);
  assert.match(analyzer, /MAX_ANALYZE_URLS = 500/);
  assert.match(analyzer, /ANALYZE_BATCH_SIZE = 100/);
  assert.match(html, /解析は最大500件/);
});
