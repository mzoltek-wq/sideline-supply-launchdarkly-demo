const test = require('node:test');
const assert = require('node:assert/strict');
const { priceBundle, totals } = require('../commerce.js');
test('one item stays regular; each possible pair saves 5%; all three save 10%', () => {
  assert.equal(priceBundle(['cap']).totalCents, 2800);
  assert.equal(priceBundle(['jersey','cap']).totalCents, 8740);
  assert.equal(priceBundle(['jersey','hoodie']).totalCents, 13490);
  assert.equal(priceBundle(['cap','hoodie']).totalCents, 10070);
  assert.deepEqual(priceBundle(['jersey','cap','hoodie']), {regularCents:17000,savingsCents:1700,totalCents:15300,percent:10});
});
test('removing products recomputes the tier; singles never inherit a bundle discount', () => {
  const bundle = {isBundle:true,types:['jersey','cap','hoodie'],quantity:2};
  assert.equal(totals([bundle]).totalCents,30600);
  bundle.types = ['jersey','cap'];
  assert.equal(totals([bundle]).totalCents,17480);
  bundle.types = ['jersey'];
  assert.deepEqual(totals([bundle,{type:'cap',quantity:1}]),{totalCents:15600,savingsCents:0,pieces:3});
});
test('mixed sports remain separate lines and mixed discounted / full-price totals reconcile', () => {
  const bag = [
    {sport:'baseball',isBundle:true,types:['cap','hoodie'],quantity:2},
    {sport:'football',isBundle:true,types:['jersey','cap','hoodie'],quantity:1},
    {sport:'basketball',type:'jersey',quantity:1}
  ];
  assert.deepEqual(totals(bag),{totalCents:41840,savingsCents:2760,pieces:8});
});
test('duplicate, empty and unknown selections are rejected', () => {
  for (const types of [[],['cap','cap'],['shoes']]) assert.throws(()=>priceBundle(types));
});
