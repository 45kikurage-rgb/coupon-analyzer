import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function setup(results) {
  const elements = new Map();
  const get = key => {
    if (!elements.has(key)) elements.set(key,{
      value:"",disabled:false,innerHTML:"",textContent:"",
      classList:{add(){},remove(){}},click(){},scrollIntoView(){},
      addEventListener(type,fn){this[type]=fn;},
      querySelectorAll(){return [];}
    });
    return elements.get(key);
  };
  const fetch = async (path) => {
    assert.equal(path, "/api/analyze");
    return {ok:true,json:async()=>({results,processingMs:12})};
  };
  vm.runInNewContext(fs.readFileSync(new URL("../public/analyzer.js",import.meta.url),"utf8"),{
    document:{querySelector:get},navigator:{},URL,fetch
  });
  return {
    get,
    async render() {
      get("#input").value=results.map(item=>item.url).join("\n");
      get("#input").input();
      await get("#analyzeStart").click();
    }
  };
}

const sbgUrl="https://sbg.jp/cp/exchange/637/" + "a".repeat(32);
const sevenUrl="https://coupon.sej.co.jp/order/cpnsp_03.do?hansoku_id=TestFixture1";

test("redemption place is shown in group totals, each URL, search and filter",async()=>{
  const {get,render}=setup([
    {label:"11",url:sbgUrl,site:"sbg",kind:"coupon",product:"500円ギフト券",
     merchant:"サーティワンアイスクリーム",expiresOn:"2026-12-31",size:"none",status:"ok"},
    {label:"22",url:sevenUrl,site:"seven",kind:"coupon",product:"500円ギフト券",
     expiresOn:"2026-12-31",size:"none",status:"ok"},
    {label:"33",url:sbgUrl.replace("/637/","/638/"),site:"sbg",kind:"coupon",
     product:"商品名不明",expiresOn:null,size:"unknown",status:"needs_review"}
  ]);
  await render();
  const summary=get("#breakdownTable").innerHTML;
  assert.match(summary, /<span>利用先<\/span>/);
  assert.match(summary, /サーティワンアイスクリーム/);
  assert.match(summary, /セブンイレブン/);
  assert.match(summary, /未判定/);
  assert.equal((summary.match(/class="breakdown-row"/g)||[]).length,3);

  const all=get("#resultList").innerHTML;
  assert.match(all,/利用先：サーティワンアイスクリーム/);
  assert.match(all,/利用先：セブンイレブン/);
  assert.match(all,/利用先：未判定/);
  get("#resultMerchantFilter").value="サーティワンアイスクリーム";
  get("#resultMerchantFilter").change();
  assert.equal(get("#resultFilterCount").textContent,"表示 1件 / 全 3件");
  assert.match(get("#resultList").innerHTML,/>11<\/span>/);
  assert.doesNotMatch(get("#resultList").innerHTML,/>22<\/span>/);
  assert.equal(get("#breakdownTable").innerHTML,summary);
  get("#clearResultFilters").click();
  assert.equal(get("#resultFilterCount").textContent,"表示 3件 / 全 3件");
  get("#resultSearchFilter").value="サーティワン";
  get("#resultSearchFilter").input();
  assert.equal(get("#resultFilterCount").textContent,"表示 1件 / 全 3件");
});

test("use API destination, avoid inventing merchant for SB Gift, and escape markup",async()=>{
  const {get,render}=setup([
    {label:"1",url:sbgUrl,site:"sbg",kind:"coupon",product:"500円ギフト券",
     redeemPlace:"サーティワンアイスクリーム",merchant:"未判定",size:"none",status:"ok"},
    {label:"2",url:sbgUrl.replace("/637/","/639/"),site:"sbg",kind:"coupon",
     product:"500円ギフト券",merchant:"<img src=x onerror=1>",size:"none",status:"ok"}
  ]);
  await render();
  const html=get("#resultList").innerHTML;
  assert.match(html,/利用先：サーティワンアイスクリーム/);
  assert.match(html,/&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(html,/<img src=x onerror=1>/);
});

test("redemption merchant is a new filter, not a change to input, totals or API",async()=>{
  const {get,render}=setup([
    {label:"7",url:sevenUrl,site:"seven",product:"緑茶",size:"350",capacity:"350ml",status:"ok"},
    {label:"8",url:sbgUrl,site:"sbg",product:"500円ギフト券",size:"none",status:"needs_review"}
  ]);
  await render();
  assert.equal(get("#resultTotal").textContent,2);
  get("#resultMerchantFilter").value="未判定";
  get("#resultMerchantFilter").change();
  assert.equal(get("#resultFilterCount").textContent,"表示 1件 / 全 2件");
  get("#analysisClear").click();
  assert.equal(get("#resultMerchantFilter").value,"");
});
