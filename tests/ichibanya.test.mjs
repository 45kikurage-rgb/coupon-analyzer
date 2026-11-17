import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('Ichibanya input enables analysis, keeps capture disabled and rejects action URLs',()=>{
 const sandbox={URL};vm.createContext(sandbox);
 vm.runInContext(fs.readFileSync('public/url-rules.js','utf8'),sandbox);
 const rules=sandbox.CouponUrlRules;
 const url='https://ichibanya.e-gift.co/c/TESTONLYabc12345/1';
 assert.equal(rules.isSupportedAnalysisUrl(url),true);
 assert.equal(rules.isSupportedCaptureUrl(url),false);
 for(const value of [url+'/passcode_v2_exchanges/edit',url.replace('https:','http:'),url+'?a=1',url+'#x',url.replace('e-gift.co','e-gift.co.invalid')]) {
  assert.equal(rules.isSupportedAnalysisUrl(value),false);
 }
});
