import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('result filters combine without renumbering, changing totals, or correcting a different URL',async()=>{
  const elements=new Map();
  const buttonEvents=new Map();
  const corrections=[];
  const results=[
    {label:'11',url:'https://coupon.sej.co.jp/order/cpnsp_03.do?i=1',product:'ビールA',capacity:'350ml',size:'350',status:'ok',expiresOn:'2026-10-31'},
    {label:'22',url:'https://coupon.sej.co.jp/order/cpnsp_03.do?i=2',product:'商品名不明',capacity:'350ml',size:'350',status:'needs_review'},
    {label:'33',url:'https://coupon.sej.co.jp/order/cpnsp_03.do?i=3',product:'利用済み',size:'used',status:'used'},
    {label:'44',url:'https://coupon.sej.co.jp/order/cpnsp_03.do?i=4',product:'商品名不明',size:'unknown',status:'needs_review',correctionKey:'fourth-url'},
    {label:'55',url:'https://coupon.sej.co.jp/order/cpnsp_03.do?i=5',product:'解析失敗',size:'none',status:'error',message:'取得失敗'}
  ];
  const prompts=['修正済みの商品','500ml'];
  const document={querySelector(selector){
    if(!elements.has(selector)) elements.set(selector,{
      value:'',disabled:false,innerHTML:'',textContent:'',classList:{add(){},remove(){}},
      addEventListener(type,fn){this[type]=fn;},click(){},scrollIntoView(){},
      querySelectorAll(){
        return [...this.innerHTML.matchAll(/data-correction-index="(\d+)"/g)].map(match=>({
          dataset:{correctionIndex:match[1]},addEventListener(type,fn){buttonEvents.set(Number(match[1]),fn);}
        }));
      }
    });
    return elements.get(selector);
  }};
  const fetch=async(path,options)=>{
    if(path==='/api/analyze') return {ok:true,json:async()=>({results,processingMs:10})};
    const body=JSON.parse(options.body);corrections.push(body);
    return {ok:true,json:async()=>({product:body.product,capacity:body.capacity,size:body.size,manualCorrection:true})};
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/analyzer.js',import.meta.url),'utf8'),{
    document,navigator:{},URL,fetch,prompt:()=>prompts.shift(),confirm:()=>false,alert:()=>{}
  });
  const get=id=>elements.get('#'+id);
  get('input').value=results.map(row=>row.url).join('\n');get('input').input();
  await get('analyzeStart').click();
  assert.equal(get('resultFilterCount').textContent,'表示 5件 / 全 5件');
  const fullBreakdown=get('breakdownTable').innerHTML;
  get('resultStatusFilter').value='used';get('resultStatusFilter').change();
  assert.equal(get('resultFilterCount').textContent,'表示 1件 / 全 5件');
  assert.match(get('resultList').innerHTML,/>33</);assert.doesNotMatch(get('resultList').innerHTML,/>11</);
  get('clearResultFilters').click();
  get('resultStatusFilter').value='review';get('resultStatusFilter').change();
  get('resultProductFilter').value='商品名不明';get('resultProductFilter').change();
  get('resultCapacityFilter').value='判定不能';get('resultCapacityFilter').change();
  assert.equal(get('resultFilterCount').textContent,'表示 1件 / 全 5件');
  assert.match(get('resultList').innerHTML,/>44</);
  assert.match(get('resultList').innerHTML,/data-correction-index="3"/);
  assert.equal(get('breakdownTable').innerHTML,fullBreakdown);
  assert.equal(get('resultTotal').textContent,5);
  await buttonEvents.get(3)();
  assert.equal(corrections[0].correctionKey,'fourth-url');
  get('clearResultFilters').click();
  get('resultSearchFilter').value='?i=4';get('resultSearchFilter').input();
  assert.equal(get('resultFilterCount').textContent,'表示 1件 / 全 5件');
  assert.match(get('resultList').innerHTML,/修正済みの商品/);
  get('resultSearchFilter').value='一致しない文字列';get('resultSearchFilter').input();
  assert.match(get('resultList').innerHTML,/条件に一致するURLはありません/);
  get('clearResultFilters').click();
  assert.equal(get('resultFilterCount').textContent,'表示 5件 / 全 5件');
  get('analysisClear').click();
  assert.equal(get('resultSearchFilter').value,'');
});
