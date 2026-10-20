const test = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../insights.js');

test('AOV weights orders, conversion counts unique buyers, and unfinished carts remain visible', () => {
  const result = analytics.summarize({participants:[
    {key:'a',variation:'off',cartStarted:true}, {key:'b',variation:'off',cartStarted:true},
    {key:'c',variation:'off',cartStarted:true}, {key:'d',variation:'on',cartStarted:true}
  ], orders:[
    {userKey:'a',variation:'off',totalCents:1000}, {userKey:'a',variation:'off',totalCents:2000},
    {userKey:'b',variation:'off',totalCents:6000}, {userKey:'d',variation:'on',totalCents:3300}
  ]});
  assert.equal(result.groups.off.aovCents,3000);
  assert.equal(result.groups.off.conversion,2/3);
  assert.equal(result.groups.off.cartCompletion,2/3);
  assert.equal(result.groups.off.unpurchasedCarts,1);
  assert.equal(result.lift,.1);
});
test('mixed exposures, unknown checkout values and mismatches do not pollute either group', () => {
  const result = analytics.summarize({participants:[{key:'mixed',variation:'mixed'}, {key:'a',variation:'off'}],orders:[
    {userKey:'mixed',variation:'on',totalCents:10000}, {userKey:'a',variation:'unknown',totalCents:5000},
    {userKey:'a',variation:'on',totalCents:4000}
  ]});
  assert.equal(result.mixedShoppers,1);
  assert.equal(result.excludedOrders,3);
  assert.equal(result.lift,null);
  assert.equal(result.groups.off.aovCents,null);
});
test('repeat observation and orders deduplicate, mixed attribution persists, reset clears local data', () => {
  analytics.reset();
  analytics.observe('a','Demo','off'); analytics.observe('a','Demo','off');
  analytics.cartStarted('a');
  const order = {id:'one',userKey:'a',totalCents:2800};
  analytics.recordOrder(order,'off'); analytics.recordOrder(order,'off');
  assert.equal(analytics.read().orders.length,1);
  assert.equal(analytics.read().participants.length,1);
  assert.equal(analytics.summarize(analytics.read()).groups.off.cartCompletion,1);
  analytics.observe('a','Demo','on'); analytics.observe('a','Demo','off');
  assert.equal(analytics.read().participants[0].variation,'mixed');
  analytics.reset();
  assert.deepEqual(analytics.read(),{participants:[],orders:[]});
});
