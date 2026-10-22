import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function startAnalyzer(results) {
  const nodes = new Map();
  const get = (key) => {
    if (!nodes.has(key)) {
      nodes.set(key, {
        value: '', disabled: false, innerHTML: '', textContent: '',
        classList: { add() {}, remove() {} },
        addEventListener(type, listener) { this[type] = listener; },
        querySelectorAll() { return []; },
        scrollIntoView() {},
      });
    }
    return nodes.get(key);
  };
  const document = { querySelector: get };
  const input = get('#input');
  const calls = [];
  const fetch = async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ results, processingMs: 2 }) };
  };
  const script = fs.readFileSync(new URL('../public/analyzer.js', import.meta.url), 'utf8');
  vm.runInNewContext(script, { document, navigator: {}, URL, fetch });
  return { input, nodes, calls, run() { get('#analyzeStart').click(); } };
}

test('Lawson results offer original-query login link even on analysis errors', async () => {
  // Synthetic credentials, never live coupons.
  const coupon = 'https://apli.lawson.jp/ldcp/coupon/?campaignId=testfixture&encDataCode=VEVTVEZJWFRVUkU%3D';
  const login = coupon.replace('/coupon/', '/login/');
  const fake = startAnalyzer([{ label:'1', url:coupon, site:'lawson_ldcp', status:'error',
    product:'商品名不明', capacity:'', expiresOn:null, message:'access blocked' }]);
  fake.input.value = coupon;
  fake.input.input();
  assert.equal(fake.nodes.get('#counter').textContent, '1件検出');
  fake.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].body.items[0].url, coupon); // API normalizes before network GET.
  const html = fake.nodes.get('#resultList').innerHTML;
  assert.match(html, /クーポンを開く/);
  assert.ok(html.includes('href="' + login.replaceAll('&','&amp;') + '"'));
  assert.doesNotMatch(html, /href="[^"]*\/ldcp\/coupon\//);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('non-Lawson results do not get Lawson login links', async () => {
  const original = 'https://sbg.jp/cp/exchange/1234/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const fake = startAnalyzer([{ label:'1', url:original, site:'sbg', status:'error',
    product:'商品名不明', capacity:'', expiresOn:null }]);
  fake.input.value = original;
  fake.input.input();
  fake.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(fake.nodes.get('#resultList').innerHTML, /result-open-link/);
});
