import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('paste detection enables Lawson coupon and login URLs without changing input', () => {
  const elements = new Map();
  const document = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {value:'',disabled:false,addEventListener(type,fn) {this[type]=fn;}});
    return elements.get(selector);
  } };
  const script = fs.readFileSync(new URL('../public/analyzer.js',import.meta.url),'utf8');
  vm.runInNewContext(script,{document,navigator:{},URL});
  const coupon='https://apli.lawson.jp/ldcp/coupon/?campaignId=testfixture&encDataCode=VEVTVEZJWFRVUkU%3D';
  const input=elements.get('#input');
  input.value=coupon+'\n'+coupon.replace('/coupon/','/login/'); input.input();
  assert.equal(elements.get('#counter').textContent,'2件検出');
  assert.equal(elements.get('#analyzeStart').disabled,false);
  assert.equal(elements.get('#fastStart').disabled,true); // capture remains Seven/FamilyMart only.
  assert.equal(input.value,coupon+'\n'+coupon.replace('/coupon/','/login/'));
  input.value=coupon.replace('apli.lawson.jp','apli.lawson.jp.evil.test'); input.input();
  assert.equal(elements.get('#counter').textContent,'0件検出');
  assert.equal(elements.get('#analyzeStart').disabled,true);
});
