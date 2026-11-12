import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("Petit Gift enables both capture buttons as well as analysis",()=>{
  const nodes = new Map();
  const get = key => {
    if(!nodes.has(key)) nodes.set(key,{
      value:"",disabled:false,textContent:"",innerHTML:"",
      classList:{add(){},remove(){},toggle(){}},style:{},
      addEventListener(type,fn){(this.listeners??={})[type]??=[];this.listeners[type].push(fn);},
      querySelectorAll(){return [];},scrollIntoView(){},
    });
    return nodes.get(key);
  };
  const context=vm.createContext({document:{querySelector:get},navigator:{},URL});
  for(const path of ["capture.js","analyzer.js"])
    vm.runInContext(fs.readFileSync(new URL("../public/"+path,import.meta.url),"utf8"),context);
  assert.equal(get("#fastStart").disabled,true);
  const input=get("#input");
  input.value="https://coupon.petit.gift/coupons/detail?"+new URLSearchParams({
    app_id:"1",coupon_id:"1234",user_id:"00000000-0000-0000-0000-000000000000",enc:"$2y$10$"+"a".repeat(53),
  });
  for(const f of input.listeners.input)f();
  assert.equal(get("#fastStart").disabled,false);
  assert.equal(get("#stableStart").disabled,false);
  assert.equal(get("#analyzeStart").disabled,false);
  input.value="https://sbg.jp/cp/exchange/888/"+"a".repeat(32);
  for(const f of input.listeners.input)f();
  assert.equal(get("#fastStart").disabled,false);
  assert.equal(get("#stableStart").disabled,false);
  input.value="https://www.asahibeer-cp.jp/brand/bitter-ist/cp/261111-261124-fixture/coupon/lw/index.html?code=000000000000000012";
  for(const f of input.listeners.input)f();
  assert.equal(get("#fastStart").disabled,false);
  assert.equal(get("#stableStart").disabled,false);
  assert.equal(get("#analyzeStart").disabled,false);
  input.value += "&code=000000000000000012";
  for(const f of input.listeners.input)f();
  assert.equal(get("#fastStart").disabled,true);
  assert.equal(get("#analyzeStart").disabled,true);
  input.value="https://example.org/not-a-coupon";
  for(const f of input.listeners.input)f();
  assert.equal(get("#fastStart").disabled,true);
});


