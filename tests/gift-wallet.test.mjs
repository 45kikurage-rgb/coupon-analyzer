import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = 'https://g4b.giftee.biz/giftee_boxes/11111111-1111-4111-8111-111111111111';
const wallet = `https://wallet.vaton.jp/lp/campaign_tiktok?gift_origin=g4b&gift_url=${source}&referer=giftee_box`;
function setup() {
  const nodes = new Map(), calls = [];
  const get = key => {
    if (!nodes.has(key)) nodes.set(key, {
      value: '', disabled: false, innerHTML: '', textContent: '',
      classList: { add() {}, remove() {} },
      addEventListener(type, fn) { this[type] = fn; },
      querySelectorAll() { return []; }, scrollIntoView() {},
    });
    return nodes.get(key);
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/analyzer.js', import.meta.url), 'utf8'), {
    document: { querySelector: get }, navigator: {}, URL,
    fetch: async (path, options) => {
      const body = JSON.parse(options.body);
      calls.push({ path, body });
      return { ok: true, json: async () => ({ results: body.items.map(item => ({
        ...item, site: 'giftee_box', kind: 'box', boxName: 'giftee Box', balance: 300, status: 'ok',
      })) }) };
    },
  });
  return { get, calls };
}

test('raw and encoded gift Wallet links reach the API intact and offer Wallet open', async () => {
  for (const url of [wallet, wallet.replace(source, encodeURIComponent(source))]) {
    const { get, calls } = setup();
    get('#input').value = '7\n' + url;
    get('#input').input();
    assert.equal(get('#counter').textContent, '1件検出');
    assert.equal(get('#analyzeStart').disabled, false);
    assert.equal(get('#stableStart').disabled, true); // Not a barcode capture target.
    await get('#analyzeStart').click();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.items[0].url, url);
    assert.equal(calls[0].body.items[0].label, '7');
    assert.ok(get('#resultList').innerHTML.includes('href="' + url.replaceAll('&', '&amp;') + '"'));
    assert.match(get('#resultList').innerHTML, /Walletを開く/);
    assert.match(get('#resultList').innerHTML, /gift Wallet（元のgiftee Boxを解析）/);
  }
});

test('untrusted Wallet links do not enable analysis or capture', () => {
  for (const url of [wallet.replace('wallet.vaton.jp', 'wallet.vaton.jp.example.com'),
    wallet.replace(source, 'https://example.com/'), wallet + '&gift_url=' + encodeURIComponent(source)]) {
    const { get, calls } = setup();
    get('#input').value = url;
    get('#input').input();
    assert.equal(get('#counter').textContent, '0件検出');
    assert.equal(get('#analyzeStart').disabled, true);
    assert.equal(calls.length, 0);
  }
});
