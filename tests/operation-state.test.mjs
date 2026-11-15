import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const seven = 'https://coupon.sej.co.jp/order/cpnsp_03.do?hansoku_id=syntheticFixture';
const box = n => `https://g4b.giftee.biz/giftee_boxes/11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise,resolve}; };
const tick = () => new Promise(r => setImmediate(r));
const captureSuccess = () => ({ok:true,json:async()=>({base64:'UE5H',mimeType:'image/png',site:'seven',barcode:'12345678'})});
function app(fetch, clipboard = {readText:async()=>''}, prompts = []) {
  const nodes = new Map(), corrections = new Map();
  function node() {
    return {value:'',disabled:false,innerHTML:'',textContent:'',style:{},listeners:{},children:[],
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},
      // Invoke listeners directly, including on disabled buttons, to exercise guards.
      trigger(type){return Promise.all((this.listeners[type]||[]).map(fn=>fn()));},
      click(){return this.trigger('click');}, dispatchEvent(event){return this.trigger(event.type);},
      append(child){this.children.push(child);},querySelectorAll(){return [...this.innerHTML.matchAll(/data-correction-index="(\d+)"/g)].map(match=>{const button=node();button.dataset={correctionIndex:match[1]};corrections.set(Number(match[1]),button);return button;});},querySelector(){return node();},scrollIntoView(){},remove(){}};
  }
  const get = id => { if(!nodes.has(id))nodes.set(id,node()); return nodes.get(id); };
  const document = {querySelector:get,createElement:node,body:node()};
  const context = vm.createContext({document,navigator:{clipboard},URL,Blob,Uint8Array,TextEncoder,atob,fetch,Event,prompt:()=>prompts.shift(),confirm:()=>false,alert:message=>{throw new Error(message);},
    setTimeout:fn=>{fn();return 1;},clearTimeout(){}});
  for(const name of ['url-rules.js','capture.js','analyzer.js']) {
    vm.runInContext(fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8'),context);
  }
  return {get,document,corrections,async paste(value){get('#input').value=value;await get('#input').trigger('input');}};
}

for(const owner of ['capture','analysis']) test(`${owner} locks both workflows and clear, including direct listener calls`,async()=>{
  const wait=deferred(), calls=[];
  const instance=app(async(path,options)=>{calls.push(path);return wait.promise;});
  await instance.paste(seven);
  const active=instance.get(owner==='capture'?'#fastStart':'#analyzeStart').click();
  await tick();
  for(const id of ['#input','#pasteButton','#analysisClear','#clear','#analyzeStart','#analyzeFastStart','#fastStart','#stableStart','#retryFailed']) {
    assert.equal(instance.get(id).disabled,true,id);
  }
  await instance.get(owner==='capture'?'#analyzeStart':'#fastStart').click();
  await instance.get('#analysisClear').click();
  await instance.get('#clear').click();
  assert.equal(instance.get('#input').value,seven);
  assert.deepEqual(calls,[owner==='capture'?'/api/capture-one':'/api/analyze']);
  if(owner==='capture')wait.resolve(captureSuccess());
  else wait.resolve({ok:true,json:async()=>({results:[{url:seven,product:'合成商品',size:'none',status:'ok'}],processingMs:1})});
  await active;
  assert.equal(instance.document.couponOperations.owner,null);
  assert.equal(instance.get('#input').disabled,false);
  assert.equal(instance.get('#analyzeStart').disabled,false);
  assert.equal(instance.get('#fastStart').disabled,false);
});

test('a clipboard read started before capture cannot overwrite its active input',async()=>{
  const read=deferred(),capture=deferred();
  const instance=app(()=>capture.promise,{readText:()=>read.promise});
  await instance.paste(seven);
  const pasting=instance.get('#pasteButton').click();
  const active=instance.get('#fastStart').click();await tick();
  read.resolve('changed');await pasting;
  assert.equal(instance.get('#input').value,seven);
  capture.resolve(captureSuccess());await active;
});

test('duplicate image rows share HTTP retries and the summary counts actual retries once',async()=>{
  let calls=0;
  const instance=app(async()=> ++calls===1
    ? {ok:false,status:503,json:async()=>({error:'temporary',retryable:true})}
    : captureSuccess());
  await instance.paste(seven+'\n'+seven);
  await instance.get('#fastStart').click();
  assert.equal(calls,2);
  assert.match(instance.get('#summary').innerHTML,/成功 2件/);
  assert.match(instance.get('#summary').innerHTML,/自動再試行 1回/);
});

test('unknown Box balance remains unknown while a confirmed zero remains zero',async()=>{
  const instance=app(async(path,options)=>({ok:true,json:async()=>({results:JSON.parse(options.body).items.map((item,index)=>({
    ...item,kind:'box',site:'giftee_box',product:'giftee Box',groupName:'giftee Box',groupKey:'box:'+index,
    balance:index===0?null:0,initialBalance:index===0?null:0,groupSpecification:'',size:'none',status:index===0?'needs_review':'ok',
  })),processingMs:1})}));
  await instance.paste(box(1)+'\n'+box(2));await instance.get('#analyzeStart').click();
  const html=instance.get('#resultList').innerHTML;
  assert.match(html,/残高 不明/);assert.match(html,/残高 0ポイント/);
  assert.match(instance.get('#breakdownTable').innerHTML,/>不明</);
  assert.equal(instance.get('#reviewCount').textContent,1);
});

test('correction lookup warning preserves the original review or error detail and escapes markup',async()=>{
  const message='期限を確認できませんでした';
  const warning='保存済みの商品修正を読み込めませんでした。<img src=x>自動解析結果を表示しています。';
  const instance=app(async(path,options)=>({ok:true,json:async()=>({results:JSON.parse(options.body).items.map(item=>({
    ...item,product:'合成商品',size:'none',status:'needs_review',message,correctionLookupFailed:true,correctionWarning:warning,
  })),processingMs:1})}));
  await instance.paste(seven);await instance.get('#analyzeStart').click();
  const html=instance.get('#resultList').innerHTML;
  assert.match(html,/期限を確認できませんでした／保存済みの商品修正を読み込めませんでした/);
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
  assert.equal(instance.get('#reviewCount').textContent,1);
});

test('a delayed error-row correction preserves error state and blocks replacement analysis and clear',async()=>{
  const saving=deferred(),calls=[];
  const instance=app(async(path,options)=>{
    calls.push(path);
    if(path==='/api/corrections') {
      assert.equal(options.headers['X-Coupon-Correction'],'1');
      return saving.promise;
    }
    return {ok:true,json:async()=>({results:[{url:seven,product:'商品名不明',size:'unknown',status:'error',message:'取得失敗',correctionKey:'a'.repeat(64)}],processingMs:1})};
  },undefined,['修正した商品','350ml']);
  await instance.paste(seven);await instance.get('#analyzeStart').click();
  const correction=instance.corrections.get(0).click();await tick();
  assert.equal(instance.document.couponOperations.owner,'correction');
  assert.equal(instance.get('#analysisClear').disabled,true);
  await instance.get('#analyzeStart').click();await instance.get('#analysisClear').click();
  assert.equal(instance.get('#input').value,seven);
  assert.deepEqual(calls,['/api/analyze','/api/corrections']);
  saving.resolve({ok:true,json:async()=>({product:'修正した商品',capacity:'350ml',size:'350',manualCorrection:true,status:'ok'})});
  await correction;
  assert.equal(instance.get('#failureCount').textContent,1);
  assert.equal(instance.get('#successCount').textContent,0);
  instance.get('#resultStatusFilter').value='error';await instance.get('#resultStatusFilter').trigger('change');
  assert.equal(instance.get('#resultFilterCount').textContent,'表示 1件 / 全 1件');
  assert.match(instance.get('#resultList').innerHTML,/修正した商品/);
  assert.match(instance.get('#resultList').innerHTML,/取得失敗/);
  assert.equal(instance.document.couponOperations.owner,null);
});

test('an explicitly unknown initial Box amount never borrows its known current balance for grouping',async()=>{
  const instance=app(async(path,options)=>({ok:true,json:async()=>({results:JSON.parse(options.body).items.map(item=>({
    ...item,kind:'box',site:'giftee_box',boxCategory:'giftee_box',product:'giftee Box',groupName:'giftee Box',groupKey:'giftee_box:unknown',
    balance:500,initialBalance:null,groupSpecification:'',size:'none',status:'needs_review',
  })),processingMs:1})}));
  await instance.paste(box(3));await instance.get('#analyzeStart').click();
  assert.match(instance.get('#resultList').innerHTML,/残高 500ポイント/);
  assert.match(instance.get('#breakdownTable').innerHTML,/>不明</);
  assert.doesNotMatch(instance.get('#breakdownTable').innerHTML,/>500ポイント</);
  assert.equal(instance.get('#reviewCount').textContent,1);
});
