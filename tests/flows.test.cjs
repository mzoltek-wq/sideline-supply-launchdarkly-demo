const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
async function setup() {
  const elements = new Map(), events = [], saved = new Map();
  class Element {
    constructor(dataset = {}) {this.dataset=dataset;this.listeners={};this.textContent='';this.innerHTML='';this.hidden=false;this.open=false;}
    addEventListener(name, fn) {this.listeners[name]=fn;}
    removeAttribute() {}
    setAttribute() {}
    contains() {return false;}
    focus() {document.activeElement=this;}
    showModal() {this.open=true;}
    close() {this.open=false;}
    reset() {}
    scrollIntoView() {}
    click() {this.listeners.click?.({target:this});}
  }
  const profiles = ['guest','maya','jordan'].map(shopper=>new Element({shopper}));
  const sports = ['basketball','baseball','football'].map(sport=>new Element({sport}));
  const document = {
    activeElement:null,
    querySelector(selector) {
      const shopper=selector.match(/^\[data-shopper="(.+)"\]$/)?.[1];
      if(shopper) return profiles.find(p=>p.dataset.shopper===shopper);
      const sport=selector.match(/^\[data-sport="(.+)"\]$/)?.[1];
      if(sport) return sports.find(p=>p.dataset.sport===sport);
      if(!elements.has(selector)) elements.set(selector,new Element());
      return elements.get(selector);
    },
    querySelectorAll(selector) {return selector==='[data-shopper]'?profiles:selector==='[data-sport]'?sports:[];}
  };
  let sdkContext;
  const LDClient={initialize(_id, context) {
    sdkContext=context;
    return {
      on(name,cb) {if(name==='initialized') queueMicrotask(cb);},
      waitForInitialization:()=>Promise.resolve(),
      identify(next) {sdkContext=next;return Promise.resolve();},
      variation:()=>true, allFlags:()=>({'game-day-bundle':true}), getContext:()=>sdkContext,
      track(key,data,value) {events.push({key,data,value,user:sdkContext.user.key});}, flush:()=>Promise.resolve()
    };
  }};
  const context=vm.createContext({document,window:{LDClient},LDClient,crypto:webcrypto,structuredClone,Intl,console,
    setTimeout,clearTimeout,queueMicrotask,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});
  for(const file of ['commerce.js','insights.js','app.js','config.js','launchdarkly.js','support.js']) vm.runInContext(source(file),context);
  await new Promise(setImmediate);
  const run=code=>vm.runInContext(code,context);
  const action=(id,bagAction,type)=>document.querySelector('#bag-items').listeners.click({target:{closest:()=>({dataset:{item:id,bagAction,type}})}});
  return {run,action,events,document,saved};
}
test('convert exactly one single into a same-sport bundle; reject cross-sport and flag-off additions', async()=>{
  const h=await setup();
  h.run('addProductToBag(productTypes[0]); addProductToBag(productTypes[0]); startBundle("jersey", "basketball-jersey")');
  assert.equal(h.run('bags.guest[0].quantity'),2);
  h.run('confirmBundle()');
  assert.equal(h.run('bags.guest.length'),1);
  h.run('bundleDraft.types.push("cap"); confirmBundle()');
  assert.equal(h.run('bags.guest[0].quantity'),1);
  const id=h.run('bags.guest[1].id');
  h.action(id,'add-component','cap');
  assert.equal(h.run('commerce.totals(bags.guest).totalCents'),15140);
  h.run('activeSport="football"');
  h.action(id,'add-component','hoodie');
  assert.equal(h.run('bags.guest[1].types.length'),2);
  h.run('activeSport="basketball";renderBundle(false)');
  h.action(id,'add-component','hoodie');
  assert.equal(h.run('bags.guest[1].types.length'),2);
  h.action(id,'remove-component','cap');
  assert.equal(h.run('commerce.totals(bags.guest).totalCents'),12800);
  h.action(id,'remove-component','jersey');
  assert.equal(h.run('bags.guest.length'),1);
});
test('checkout records one immutable receipt and one revenue event, even on double invocation',async()=>{
  const h=await setup();
  h.run('startBundle("jersey"); bundleDraft.types.push("cap"); confirmBundle()');
  const id=h.run('bags.guest[0].id');
  h.action(id,'add-component','cap');h.action(id,'add-component','hoodie');
  await h.run('Promise.all([placeDemoOrder(),placeDemoOrder()])');
  assert.equal(h.run('orders.length'),1);
  assert.equal(h.run('orders[0].totalCents'),15300);
  assert.equal(h.run('bags.guest.length'),0);
  assert.deepEqual(h.events.map(e=>[e.key,e.value]),[['demo-order-placed',153],['demo-three-item-bundle-purchased',undefined]]);
  h.run('addProductToBag(productTypes[0])');
  assert.equal(h.run('orders[0].items[0].types.length'),3);
  assert.equal(JSON.parse(h.saved.get('sideline-demo-orders-v1'))[0].totalCents,15300);
});
test('unready SDK does not misattribute an order; local checkout still succeeds',async()=>{
  const h=await setup();
  h.run('addProductToBag(productTypes[1]);contextIsValid=false');
  await h.run('placeDemoOrder()');
  assert.equal(h.events.length,0);
  assert.match(h.run('orders[0].tracking'),/Local only/);
  assert.equal(h.run('orders[0].totalCents'),2800);
});
test('new visitor changes identity; reset clears local state without any analytics delete',async()=>{
  const h=await setup();
  h.run('addProductToBag(productTypes[1])');await h.run('placeDemoOrder()');
  h.document.querySelector('#new-visitor').click();await h.run('contextQueue');
  assert.match(h.run('shoppers.guest.key'),/^demo-visitor-/);
  h.run('addProductToBag(productTypes[2])');
  h.document.querySelector('#confirm-reset').click();await h.run('contextQueue');
  assert.equal(h.run('orders.length'),0);assert.equal(h.run('getBagItemCount()'),0);
  assert.equal(h.run('shoppers.guest.key'),'demo-guest');
  assert.equal(h.events.length,1);
});

test('draft needs two items, cancel leaves bag unchanged, and flag-off cancels an open draft',async()=>{
  const h=await setup();
  h.run('startBundle(); confirmBundle()');
  assert.equal(h.run('bags.guest.length'),0);
  h.run('bundleDraft.types.push("cap"); renderBundleDraft(); confirmBundle()');
  assert.equal(h.document.querySelector('#confirm-bundle').disabled,true);
  assert.equal(h.run('bags.guest.length'),0);
  h.run('closeBundleBuilder(); addProductToBag(productTypes[0]); startBundle("jersey", "basketball-jersey"); bundleDraft.types.push("cap"); closeBundleBuilder()');
  assert.equal(h.run('bags.guest.length'),1);
  assert.equal(h.run('bags.guest[0].isBundle'),undefined);
  h.run('startBundle("jersey");bundleDraft.types.push("cap");renderBundle(false);confirmBundle()');
  assert.equal(h.run('bundleDraft'),null);
  assert.equal(h.document.querySelector('#bundle-dialog').open,false);
  assert.equal(h.run('bags.guest.length'),1);
});
test('draft cannot commit after a shopper or sport change and cannot be submitted twice',async()=>{
  const h=await setup();
  h.run('startBundle("jersey");bundleDraft.types.push("cap");activeSport="football";confirmBundle()');
  assert.equal(h.run('bags.guest.length'),0);
  h.run('activeSport="basketball";activeShopper="maya";confirmBundle()');
  assert.equal(h.run('bags.maya.length'),0);
  h.run('activeShopper="guest";confirmBundle();confirmBundle()');
  assert.equal(h.run('bags.guest.length'),1);
  assert.equal(h.run('commerce.totals(bags.guest).totalCents'),8740);
});
