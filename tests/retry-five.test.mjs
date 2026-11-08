import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function setup(respond) {
  const nodes=new Map(),delays=[];let calls=0;
  const get=key=>{
    if(!nodes.has(key))nodes.set(key,{value:"",textContent:"",style:{},disabled:false,
      classList:{add(){},remove(){},toggle(){}},addEventListener(){},
    });
    return nodes.get(key);
  };
  const script=fs.readFileSync(new URL("../public/capture.js",import.meta.url),"utf8")
    .replace(/\}\)\(\);\s*$/, "globalThis.retryForTest=requestWithRetry;})();");
  const context=vm.createContext({
    document:{querySelector:get},navigator:{},URL,TypeError,
    fetch:async()=>respond(++calls),
    setTimeout(fn,ms){delays.push(ms);fn();},
  });
  vm.runInContext(script,context);
  return {run:()=>context.retryForTest("https://coupon.sej.co.jp/order/cpnsp_03.do?hansoku_id=syntheticFixture","stable",{},()=>{},"synthetic-grant"),delays,get calls(){return calls;}};
}
const failed=()=>({ok:false,status:503,json:async()=>({retryable:true,error:"temporary"})});
test("retries image fetch five times and can recover on the sixth attempt",async()=>{
  const app=setup(n=>n===6?{ok:true,status:200,json:async()=>({ok:true})}:failed());
  const result=await app.run();
  assert.equal(app.calls,6);assert.equal(result.retries,5);
  assert.deepEqual(app.delays,[1500,4000,4000,4000,4000]);
});
test("stops after six image fetch attempts when all fail",async()=>{
  const app=setup(failed);
  await assert.rejects(app.run(),error=>error.retries===5);
  assert.equal(app.calls,6);
});
test("does not retry a permanent invalid URL response",async()=>{
  const app=setup(()=>({ok:false,status:400,json:async()=>({retryable:false,error:"invalid URL"})}));
  await assert.rejects(app.run());
  assert.equal(app.calls,1);assert.equal(app.delays.length,0);
});

