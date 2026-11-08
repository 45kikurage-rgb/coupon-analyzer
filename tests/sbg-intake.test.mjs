import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("detects SB Gift URLs and refuses 134-item captures without silently discarding 34",async()=>{
  const nodes=new Map();
  const get=key=>{
    if(!nodes.has(key))nodes.set(key,{value:"",textContent:"",style:{},disabled:false,
      classList:{add(){},remove(){},toggle(){}},
      addEventListener(type,fn){(this.listeners??={})[type]??=[];this.listeners[type].push(fn);},
    });
    return nodes.get(key);
  };
  let requests=0;
  vm.runInNewContext(fs.readFileSync(new URL("../public/capture.js",import.meta.url),"utf8"),{
    document:{querySelector:get},navigator:{},URL,fetch(){requests++;throw new Error("unexpected request");},
  });
  const input=get("#input");
  input.value=Array.from({length:134},(_,i)=>"https://sbg.jp/cp/exchange/888/"+(i+1).toString(16).padStart(32,"0")).join("\n");
  for(const f of input.listeners.input)f();
  assert.match(get("#counter").textContent,/134/);
  for(const f of get("#stableStart").listeners.click)await f();
  assert.equal(requests,0);
  assert.match(get("#status").textContent,/100件まで/);
  assert.match(get("#status").textContent,/134件/);
});

