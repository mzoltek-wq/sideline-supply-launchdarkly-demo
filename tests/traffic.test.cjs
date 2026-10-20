const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { validateRun, simulateOrder, createTrafficGenerator } = require('../traffic.cjs');
const settings = () => ({runId:randomUUID(),visitors:10,controlConversion:30,bundleConversion:45,bundleAdoption:70});
const draws = (...values) => () => values.shift();
async function finish(generator) {
  for(let i=0;i<1000;i++) {
    const run=generator.list()[0];
    if(run?.status !== 'running' && !run?.busy) return run;
    await new Promise(resolve=>setTimeout(resolve,1));
  }
  throw Error('Run did not finish');
}
test('traffic inputs are bounded and simulated behavior uses catalog prices without inventing zero-dollar purchases', () => {
  assert.throws(()=>validateRun({...settings(),visitors:1001}));
  assert.throws(()=>validateRun({...settings(),bundleAdoption:NaN}));
  assert.throws(()=>validateRun({...settings(),runId:'same'}));
  const options=settings();
  assert.equal(simulateOrder(false,options,draws(.3)),null);
  assert.equal(simulateOrder(true,options,draws(.45)),null);
  assert.equal(simulateOrder(false,options,draws(.1,0)).totalCents,6400);
  assert.equal(simulateOrder(true,options,draws(.1,.1,0)).totalCents,8740);
  assert.equal(simulateOrder(true,options,draws(.1,.1,.99)).totalCents,15300);
  assert.equal(simulateOrder(true,options,draws(.1,.9,.4)).totalCents,2800);
});
test('real assignment boundary: one exposure per distinct user, matching order context, persisted run prevents replay', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'sideline-traffic-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const evaluated=[], events=[];
  const client={initialized:()=>true,variationDetail:async(key,context,fallback)=>{
    assert.equal(key,'game-day-bundle');assert.equal(fallback,false);
    assert.equal(context.collection.season,'in-season');
    assert.equal(context.user.internalTester,false);
    evaluated.push(context);
    return {value:evaluated.length%2===0,reason:{kind:'FALLTHROUGH',inExperiment:true}};
  },track:(key,context,data,value)=>events.push({key,context,data,value}),flush:async()=>{}};
  const file=path.join(dir,'runs.json');
  const generator=await createTrafficGenerator(client,{file,random:()=>0});
  const input=settings();
  await generator.start(input);
  await assert.rejects(generator.start(settings()),{status:409});
  const result=await finish(generator);
  assert.equal(result.status,'complete');assert.equal(result.delivery,'confirmed');
  assert.equal(new Set(evaluated.map(c=>c.user.key)).size,10);
  assert.equal(result.groups.off.orders,5);assert.equal(result.groups.on.orders,5);
  const purchases=events.filter(e=>e.key==='demo-order-placed');
  assert.equal(purchases.length,10);
  assert.equal(purchases[0].value,64);assert.equal(purchases[1].value,87.4);
  purchases.forEach((event,i)=>{assert.equal(event.context,evaluated[i]);assert.equal(event.data.synthetic,true);});
  const reloaded=await createTrafficGenerator(client,{file});
  await reloaded.start(input);
  assert.equal(evaluated.length,10);
});
test('ineligible flag values stop traffic before any purchase event; nonbuyers still get evaluated', async () => {
  let tracks=0,evaluations=0;
  const client={initialized:()=>true,variationDetail:async()=>{evaluations++;return {value:true,reason:{kind:'TARGET_MATCH'}};},
    track:()=>tracks++,flush:async()=>{}};
  const generator=await createTrafficGenerator(client);
  await generator.start(settings());
  assert.equal((await finish(generator)).status,'stopped');
  assert.equal(tracks,0);assert.equal(evaluations,1);
  client.variationDetail=async()=>{evaluations++;return {value:false,reason:{kind:'FALLTHROUGH',inExperiment:true}};};
  await generator.start({...settings(),controlConversion:0});
  const run=await finish(generator);
  assert.equal(run.groups.off.visitors,10);assert.equal(run.groups.off.orders,0);assert.equal(tracks,0);
});
test('unconfirmed event delivery is explicit and does not replay purchase events', async () => {
  let tracks=0;
  const generator=await createTrafficGenerator({initialized:()=>true,
    variationDetail:async()=>({value:false,reason:{kind:'FALLTHROUGH',inExperiment:true}}),
    track:()=>tracks++,flush:()=>new Promise(()=>{})},{random:()=>0,flushTimeoutMs:1});
  const input=settings();await generator.start(input);
  assert.equal((await finish(generator)).delivery,'unconfirmed');
  await generator.start(input);assert.equal(tracks,10);
});
