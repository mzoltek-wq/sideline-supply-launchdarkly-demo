const test = require('node:test');
const assert = require('node:assert/strict');
const { supportContext, resolveSupportConfig } = require('../support-config.cjs');
const { createServer } = require('../server.cjs');

test('support context validates issue and identity and excludes note, order and arbitrary attributes', () => {
  const context = supportContext({issueType:'warranty', note:'private note', orderId:'123',
    user:{key:'demo-maya', name:'Maya', internalTester:true, secret:'not forwarded'}});
  assert.deepEqual(context, {kind:'user',key:'demo-maya',name:'Maya',anonymous:false,internalTester:true,issueType:'warranty'});
  assert.throws(() => supportContext({issueType:'invented',user:{key:'demo-maya'}}), {status:400});
  assert.throws(() => supportContext({issueType:'delivery',user:{key:'untrusted'}}), {status:400});
});

test('configuration returns SDK-selected values without executing a model or tracking fake usage', async () => {
  const client = {async completionConfig(key, context) {
    assert.equal(key,'sideline-support');
    assert.equal(context.issueType,'warranty');
    return {enabled:true,model:{name:'model-from-ld',parameters:{secret:'omit'}},
      messages:[{role:'system',content:'Prompt from LD'}],
      createTracker:()=>({getTrackData:()=>({variationKey:'chosen-by-ld',version:3})})};
  }};
  assert.deepEqual(await resolveSupportConfig(client,'sideline-support',{issueType:'warranty'}), {
    source:'launchdarkly',enabled:true,configKey:'sideline-support',variationKey:'chosen-by-ld',version:3,
    model:{name:'model-from-ld'},messages:[{role:'system',content:'Prompt from LD'}]
  });
});

test('missing config fallback is distinguishable from an intentionally disabled config', async () => {
  const missing = await resolveSupportConfig({completionConfig:async(k,c,fallback)=>fallback},'missing',{});
  assert.equal(missing.source,'fallback');
  assert.equal(missing.model,null);
  const disabled = await resolveSupportConfig({completionConfig:async()=>({enabled:false,
    createTracker:()=>({getTrackData:()=>({variationKey:'disabled'})})})},'sideline-support',{});
  assert.equal(disabled.source,'launchdarkly');
  assert.equal(disabled.enabled,false);
  assert.deepEqual(disabled.messages,[]);
});

test('HTTP boundary serves public assets, validates requests and hides files and internal errors', async t => {
  let evaluations=0, ready=true, fail=false;
  const server=createServer({isReady:()=>ready,evaluate:async context=>{
    evaluations++;
    if(fail) throw new Error('private SDK diagnostic');
    return {source:'launchdarkly',issue:context.issueType};
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post = (body,headers={})=>fetch(base+'/api/support-config',{method:'POST',
    headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  const request={issueType:'delivery',user:{key:'demo-test'}};
  assert.equal((await fetch(base+'/')).status,200);
  for(const file of ['.env','test.env','server.cjs','traffic.cjs','traffic-runs.json','package.json','node_modules/@launchdarkly/node-server-sdk/package.json']) {
    assert.equal((await fetch(base+'/'+file)).status,404);
  }
  assert.equal((await post(request,{Origin:'https://other.example'})).status,403);
  assert.equal((await post(request,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('{')).status,400);
  assert.equal((await post({issueType:'other'})).status,400);
  assert.equal((await post('x'.repeat(9000))).status,413);
  assert.equal(evaluations,0);
  assert.deepEqual(await (await post(request)).json(),{source:'launchdarkly',issue:'delivery'});
  ready=false;
  assert.equal((await post(request)).status,503);
  ready=true;fail=true;
  const failed=await post(request);
  assert.equal(failed.status,503);
  assert.deepEqual(await failed.json(),{error:'Support configuration unavailable.'});
});
