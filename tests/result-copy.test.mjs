import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function setup(clipboard, fallback = true) {
  const nodes = new Map(), attempts = [], removed = [];
  const get = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {value:'',innerHTML:'',textContent:'',disabled:false,
      classList:{add(){},remove(){}},addEventListener(type,fn){this[type]=fn;},querySelectorAll(){return [];},focus(){},click(){}});
    return nodes.get(selector);
  };
  let temporary;
  const document = {querySelector:get,activeElement:get('#copyVisibleResults'),
    body:{appendChild(node){temporary=node;}},
    createElement(){return {style:{},focus(){},select(){},remove(){removed.push(true);}};},
    execCommand(command){assert.equal(command,'copy');attempts.push(temporary.value);return fallback;}};
  const urls = ['https://apli.lawson.jp/ldcp/coupon/?campaignId=fixture&encDataCode=abcdefgh%2Bij%3D',
    'https://coupon.sej.co.jp/order/cpnsp_03.do?hansoku_id=fixture01'];
  vm.runInNewContext(fs.readFileSync(new URL('../public/url-rules.js',import.meta.url),'utf8')+'\n'+
    fs.readFileSync(new URL('../public/analyzer.js',import.meta.url),'utf8'),{
    document,navigator:{clipboard},URL,fetch:async()=>({ok:true,json:async()=>({results:urls.map(url=>({url,product:'テスト',size:'none',status:'ok'}))})})
  });
  get('#input').value=urls.join('\n');get('#input').input();await get('#analyzeStart').click();
  return {get,attempts,removed,urls};
}

for (const clipboard of [undefined,{writeText:async()=>{throw new Error('denied');}}]) {
  test(`copy falls back when clipboard ${clipboard ? 'rejects' : 'is unavailable'} and preserves original Lawson URL`,async()=>{
    const app=await setup(clipboard);
    await app.get('#copyVisibleResults').click();
    assert.deepEqual(app.attempts,[app.urls.join('\n')]);
    assert.equal(app.get('#resultCopyStatus').textContent,'2件のURLをコピーしました。');
    assert.equal(app.removed.length,1);
    assert.equal(app.get('#copyVisibleResults').disabled,false);
  });
}

test('failed copy reports failure and unlocks the button without reporting success',async()=>{
  const app=await setup(undefined,false);
  await app.get('#copyVisibleResults').click();
  assert.match(app.get('#resultCopyStatus').textContent,/コピーできませんでした/);
  assert.equal(app.removed.length,1);
  assert.equal(app.get('#copyVisibleResults').disabled,false);
});

test('copy takes a click-time snapshot, prevents concurrent writes and clears stale feedback after filter changes',async()=>{
  let finish;const writes=[];
  const app=await setup({writeText:text=>{writes.push(text);return new Promise(resolve=>{finish=resolve;});}});
  const pending=app.get('#copyVisibleResults').click();
  assert.equal(app.get('#copyVisibleResults').disabled,true);
  await app.get('#copyVisibleResults').click();
  app.get('#resultSearchFilter').value='hansoku_id';app.get('#resultSearchFilter').input();
  finish();await pending;
  assert.deepEqual(writes,[app.urls.join('\n')]);
  assert.equal(app.get('#resultCopyStatus').textContent,'');
  const second=app.get('#copyVisibleResults').click();finish();await second;
  assert.deepEqual(writes,[app.urls.join('\n'),app.urls[1]]);
  assert.equal(app.get('#resultCopyStatus').textContent,'1件のURLをコピーしました。');
});
