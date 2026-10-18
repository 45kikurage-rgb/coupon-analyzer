import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function app(fetch) {
  const elements=new Map();
  const document={querySelector(selector){
    if(!elements.has(selector))elements.set(selector,{value:'',disabled:false,textContent:'',innerHTML:'',
      classList:{add(){},remove(){}},addEventListener(type,fn){this[type]=fn;},
      click(){},scrollIntoView(){},querySelectorAll(){return [];}});
    return elements.get(selector);
  }};
  vm.runInNewContext(fs.readFileSync(new URL('../public/analyzer.js',import.meta.url),'utf8'),{document,navigator:{},URL,fetch});
  return id=>elements.get('#'+id);
}
const url=i=>`https://br.quocardpay.jp/card/TEST${String(i).padStart(12,'0')}`;

test('2000 QUO URLs use twenty 100-item requests, preserve all results and clickable original URLs',async()=>{
  let batches=0;
  const get=app(async(path,options)=>{
    const {items}=JSON.parse(options.body);batches++;assert.equal(items.length,100);
    return {ok:true,json:async()=>({results:items.map(item=>({...item,site:'quocardpay',product:'QUOカードPay',balance:0,status:'ok',size:'none'}))})};
  });
  get('input').value=Array.from({length:2000},(_,i)=>url(i)).join('\n')+'\n'+url(0);get('input').input();
  assert.equal(get('counter').textContent,'2000件検出');assert.equal(get('analyzeStart').disabled,false);
  await get('analyzeStart').click();
  assert.equal(batches,20);assert.equal(get('totalCount').textContent,2000);
  const result=get('resultList').innerHTML;
  assert.equal((result.match(/class="open-url-action"/g)||[]).length,2000);
  assert.match(result,new RegExp('href="'+url(1999)+'"'));assert.match(result,/残高なし/);
  assert.match(result,/rel="noopener noreferrer"/);assert.match(result,/referrerpolicy="no-referrer"/);
});

test('over 2000 distinct URLs is visible and cannot silently truncate',async()=>{
  const get=app(()=>{throw Error('must not submit');});
  get('input').value=Array.from({length:2001},(_,i)=>url(i)).join('\n');get('input').input();
  assert.match(get('counter').textContent,/2000件超/);assert.equal(get('analyzeStart').disabled,true);
  await get('analyzeStart').click();
});

test('failed middle batch and omitted response item preserve all original rows and URLs',async()=>{
  let calls=0;
  const get=app(async(path,options)=>{
    calls++;if(calls===2)throw Error('network');
    const {items}=JSON.parse(options.body);
    return {ok:true,json:async()=>({results:items.slice(0,calls===1?99:100).map(item=>({...item,site:'quocardpay',product:'QUOカードPay',balance:123,status:'ok',size:'none'}))})};
  });
  get('input').value=Array.from({length:201},(_,i)=>url(i)).join('\n');get('input').input();
  await get('analyzeFastStart').click();
  assert.equal(calls,3);assert.equal(get('totalCount').textContent,201);assert.equal(get('failureCount').textContent,101);
  assert.equal((get('resultList').innerHTML.match(/class="open-url-action"/g)||[]).length,201);
  assert.match(get('analysisStatus').textContent,/一部取得失敗/);
});

test('QUO lookalike and unsafe URLs do not enable analysis',()=>{
  const get=app();
  get('input').value=[url(1).replace('https:','javascript:'),url(1)+ '?save=1',url(1).replace('.jp/','.jp.evil.test/')].join('\n');
  get('input').input();assert.equal(get('analyzeStart').disabled,true);
});
