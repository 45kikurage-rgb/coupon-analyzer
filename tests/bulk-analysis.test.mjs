import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync(new URL('../public/analyzer.js', import.meta.url), 'utf8');
const url = n => `https://coupon.sej.co.jp/order/cpnsp_03.do?hansoku_id=Fixture${String(n).padStart(5, '0')}`;
function setup(respond) {
  const nodes = new Map();
  const get = key => {
    if (!nodes.has(key)) nodes.set(key, {
      value:'', textContent:'', innerHTML:'', disabled:false,
      classList:{add(){},remove(){}},
      addEventListener(type, fn){ this[type] = fn; },
      querySelectorAll(){ return []; }, scrollIntoView(){},
    });
    return nodes.get(key);
  };
  const calls = [];
  vm.runInNewContext(script, {document:{querySelector:get},navigator:{},URL,
    fetch:async(path, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return respond(body, calls.length, get);
    }
  });
  return {get,calls,paste(text){get('#input').value=text;get('#input').input();}};
}
const success = body => ({ok:true,json:async()=>({results:body.items.map(item=>({...item,product:'緑茶',size:'350',capacity:'350ml',status:'ok'})),processingMs:1})});

for (const mode of ['stable','fast']) test(`${mode}: 2000 unique numbered URLs finish in 20 bounded requests, with filtering`,async()=>{
  const app=setup((body,call,get)=>{
    assert.equal(get('#input').disabled,true);
    assert.equal(get('#analysisClear').disabled,true);
    assert.ok(body.items.length<=100);
    assert.equal(body.mode,mode);
    return success(body);
  });
  const input=Array.from({length:2000},(_,i)=>i%2 ? `${i+1}\t\t${url(i+1)}` : `${i+1}\n\n${url(i+1)}`).join('\n');
  app.paste(input+'\n'+url(1));
  assert.equal(app.get('#counter').textContent,'2000件検出');
  await app.get(mode==='fast'?'#analyzeFastStart':'#analyzeStart').click();
  assert.equal(app.calls.length,20);
  const sent=app.calls.flatMap(call=>call.items);
  assert.equal(new Set(sent.map(item=>item.url)).size,2000);
  assert.deepEqual(sent.map(item=>item.label),Array.from({length:2000},(_,i)=>String(i+1)));
  assert.equal(app.get('#totalCount').textContent,2000);
  assert.equal(app.get('#analysisPercent').textContent,'100%');
  assert.equal(app.get('#analysisStatus').textContent,'解析完了 2000/2000件');
  assert.match(app.get('#resultList').innerHTML,/>2000<\/span>/);
  app.get('#resultSearchFilter').value='Fixture02000';
  app.get('#resultSearchFilter').input();
  assert.equal(app.get('#resultFilterCount').textContent,'表示 1件 / 全 2000件');
  assert.equal(app.get('#input').value,input+'\n'+url(1));
  assert.equal(app.get('#input').disabled,false);
});

test('2001 unique URLs are blocked without submitting a silently truncated set',async()=>{
  const app=setup(success);
  app.paste(Array.from({length:2001},(_,i)=>url(i)).join('\n'));
  assert.match(app.get('#counter').textContent,/2,000件超/);
  assert.equal(app.get('#analyzeStart').disabled,true);
  await app.get('#analyzeStart').click();
  assert.equal(app.calls.length,0);
});

test('network failure and missing/reordered results retain all 2000 URL identities and later batches',async()=>{
  const app=setup((body,call)=>{
    if(call===2)return {ok:false,status:503,json:async()=>({error:'一時的な通信エラー'})};
    if(call===3)return {ok:true,json:async()=>({results:body.items.slice(1).reverse().map(item=>({...item,label:'wrong',product:'緑茶',size:'350',status:'ok'}))})};
    return success(body);
  });
  app.paste(Array.from({length:2000},(_,i)=>`${i+1}\n${url(i+1)}`).join('\n'));
  await app.get('#analyzeStart').click();
  assert.equal(app.calls.length,20);
  assert.equal(app.get('#totalCount').textContent,2000);
  assert.equal(app.get('#failureCount').textContent,101);
  assert.equal(app.get('#successCount').textContent,1899);
  assert.equal(app.get('#analysisStatus').textContent,'解析完了 2000/2000件（判定不能 101件）');
  assert.match(app.get('#resultList').innerHTML,/>2000<\/span>/);
  assert.doesNotMatch(app.get('#resultList').innerHTML,/>wrong<\/span>/);
  app.get('#resultStatusFilter').value='error';app.get('#resultStatusFilter').change();
  assert.equal(app.get('#resultFilterCount').textContent,'表示 101件 / 全 2000件');
});
