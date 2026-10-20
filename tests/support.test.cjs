const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(endpoint, fetch) {
  const elements = new Map();
  const document = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector,{textContent:'',value:'',listeners:{},
      addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},removeAttribute(){},reset(){}});
    return elements.get(selector);
  }};
  const context = vm.createContext({document,fetch,URL,AbortController,setTimeout,clearTimeout,
    window:{location:{origin:'http://localhost:5173'}}, launchDarklyConfig:{supportConfigEndpoint:endpoint},
    getLaunchDarklyContext:()=>({user:{key:'demo-test'}})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../support.js'),'utf8'),context);
  const submit = async issue => {
    document.querySelector('#support-issue').value=issue;
    await document.querySelector('#support-form').listeners.submit({preventDefault(){}});
  };
  return {submit,text:id=>document.querySelector(id).textContent};
}
test('unconnected support stays explicitly simulated and performs no network request', async () => {
  const h = setup(null,()=>{throw new Error('Unexpected network call');});
  await h.submit('warranty');
  assert.match(h.text('#support-config-source'),/no LD evaluation/);
  assert.match(h.text('#support-config-model'),/Not configured/);
  assert.match(h.text('#support-response'),/does not assess eligibility/);
});
test('backend model and prompt are displayed; later failure clears the previous selection', async () => {
  let calls=0;
  const h=setup('/api/support-config',async (url, options)=>{
    assert.equal(url.pathname,'/api/support-config');
    assert.equal(JSON.parse(options.body).issueType,'delivery');
    if (++calls>1) return {ok:false};
    return {ok:true,json:async()=>({source:'launchdarkly',enabled:true,variationKey:'delivery-help',
      model:{name:'configured-model'},messages:[{role:'system',content:'Configured prompt'}]})};
  });
  await h.submit('delivery');
  assert.equal(h.text('#support-config-model'),'configured-model');
  assert.match(h.text('#support-config-prompt'),/Configured prompt/);
  assert.match(h.text('#support-mode'),/Response simulated/);
  await h.submit('delivery');
  assert.equal(h.text('#support-config-model'),'No confirmed model selection');
  assert.equal(calls,2);
});
