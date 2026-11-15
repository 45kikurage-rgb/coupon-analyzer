import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(new URL('../public/url-rules.js', import.meta.url), 'utf8'), context);
const rules = context.CouponUrlRules;
const seven = 'https://coupon.sej.co.jp/order/cpnsp_03.do?hansoku_id=fixture123';
const family = 'https://ncpfa.famima.com/prd/ebcweb?eKey=abcdefghijklmnopqrst&cpNo=123&gyNo=12';
const box = 'https://g4b.giftee.biz/giftee_boxes/11111111-1111-4111-8111-111111111111';
const wallet = 'https://wallet.vaton.jp/lp/campaign_tiktok?gift_origin=g4b&gift_url=' + encodeURIComponent(box) + '&referer=giftee_box';
const petit = 'https://coupon.petit.gift/coupons/detail?app_id=1&coupon_id=1&user_id=11111111-1111-4111-8111-111111111111&enc=' + encodeURIComponent('$2y$10$' + 'A'.repeat(53));
const sbg = 'https://sbg.jp/cp/exchange/1/' + 'a'.repeat(32);
const asahi = 'https://www.asahibeer-cp.jp/brand/bitter-ist/cp/261101-261130-fixture/coupon/lw/index.html?code=012345678901234567';
const lawson = 'https://apli.lawson.jp/ldcp/coupon/?campaignId=fixture&encDataCode=abcdefgh%2Fijk%3D';

test('shared rules distinguish capture targets from analysis-only gift URLs', () => {
  for (const value of [seven, family, petit, sbg, asahi]) {
    assert.equal(rules.isSupportedAnalysisUrl(value), true, value);
    assert.equal(rules.isSupportedCaptureUrl(value), true, value);
  }
  for (const value of [box, wallet, lawson, 'https://misterdonut.e-gift.co/c/fixture123/123', 'https://gift.starbucks.co.jp/e/fixture123']) {
    assert.equal(rules.isSupportedAnalysisUrl(value), true, value);
    assert.equal(rules.isSupportedCaptureUrl(value), false, value);
  }
});

test('missing, duplicate and malformed credentials never enable capture', () => {
  for (const value of [seven.split('?')[0], seven + '&hansoku_id=second123',
    family.replace('cpNo=123', 'cpNo='), family + '&extra=1',
    petit + '&app_id=2', petit.replace('coupon_id=1', 'coupon_id=no'),
    sbg + '?extra=1', asahi + '&code=012345678901234567']) {
    assert.equal(rules.isSupportedAnalysisUrl(value), false, value);
    assert.equal(rules.isSupportedCaptureUrl(value), false, value);
  }
});

test('capture retains the API narrower FamilyMart parameter contract', () => {
  const analysisOnly = family.replace('abcdefghijklmnopqrst', 'abcdefgh').replace('cpNo=123', 'cpNo=1').replace('gyNo=12', 'gyNo=1');
  assert.equal(rules.isSupportedAnalysisUrl(analysisOnly), true);
  assert.equal(rules.isSupportedCaptureUrl(analysisOnly), false);
});

test('official host, HTTPS and credential checks apply to both actions', () => {
  for (const value of [seven.replace('https:', 'http:'), seven.replace('coupon.sej.co.jp', 'coupon.sej.co.jp.example.com'),
    seven.replace('https://', 'https://user:secret@'), seven.replace('coupon.sej.co.jp', 'coupon.sej.co.jp:8443'),
    box.replace('4111-8111', '0111-0111'), 'https://misterdonut.e-gift.co/c/a/1',
    wallet.replace('wallet.vaton.jp', 'wallet.vaton.jp.example.com'), wallet + '&gift_url=' + encodeURIComponent(box)]) {
    assert.equal(rules.isSupportedAnalysisUrl(value), false, value);
    assert.equal(rules.isSupportedCaptureUrl(value), false, value);
  }
});

test('Lawson opening changes only the known path and preserves query bytes', () => {
  assert.equal(rules.lawsonOpenUrl(lawson), lawson.replace('/ldcp/coupon/', '/ldcp/login/'));
  assert.equal(rules.lawsonOpenUrl(seven), null);
  assert.equal(rules.giftWalletSourceUrl(wallet), box);
});
