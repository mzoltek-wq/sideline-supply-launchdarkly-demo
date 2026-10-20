// Local demo observations, not LaunchDarkly experiment results.
// A shopper who sees both variations is excluded from the comparison rather than
// assigned to whichever variation happens to be active at checkout.
const demoAnalytics = (() => {
  const storageKey = 'sideline-observations-v1';
  const empty = () => ({ participants: [], orders: [] });
  let memory = empty();
  function read() {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey));
      if (data && Array.isArray(data.participants) && Array.isArray(data.orders)) {
        return {
          participants: data.participants.filter(p => p && typeof p.key === 'string' && ['on', 'off', 'mixed'].includes(p.variation)),
          orders: data.orders.filter(o => o && typeof o.id === 'string' && typeof o.userKey === 'string' &&
            Number.isSafeInteger(o.totalCents) && o.totalCents >= 0 && ['on', 'off', 'unknown'].includes(o.variation))
        };
      }
    } catch { /* Private browsing/storage restrictions: retain this page's data. */ }
    return memory;
  }
  function save(data) {
    memory = data;
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* In-memory mode. */ }
  }
  function observe(key, name, variation) {
    if (!['on', 'off'].includes(variation)) return;
    const data = read();
    const existing = data.participants.find(p => p.key === key);
    if (existing) {
      if (existing.variation !== variation && existing.variation !== 'mixed') {
        existing.variation = 'mixed';
        save(data);
      }
      return;
    }
    data.participants.push({ key, name, variation, cartStarted: false, firstSeen: new Date().toISOString() });
    save(data);
  }
  function cartStarted(key) {
    const data = read();
    const participant = data.participants.find(p => p.key === key);
    if (participant && !participant.cartStarted) {
      participant.cartStarted = true;
      save(data);
    }
  }
  function recordOrder(order, variation) {
    const data = read();
    if (data.orders.some(existing => existing.id === order.id)) return;
    data.orders.push({ id: order.id, userKey: order.userKey, totalCents: order.totalCents,
      pieces: order.pieces, variation: ['on', 'off'].includes(variation) ? variation : 'unknown', createdAt: order.createdAt });
    save(data);
  }
  function summarize(data) {
    const groups = {};
    let eligibleOrders = 0;
    for (const variation of ['off', 'on']) {
      const people = data.participants.filter(p => p.variation === variation);
      const keys = new Set(people.map(p => p.key));
      const orders = data.orders.filter(o => keys.has(o.userKey) && o.variation === variation);
      const buyers = new Set(orders.map(o => o.userKey));
      const carts = people.filter(p => p.cartStarted);
      const cartBuyers = carts.filter(p => buyers.has(p.key));
      const revenueCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
      groups[variation] = {
        shoppers: people.length, orders: orders.length, buyers: buyers.size, carts: carts.length,
        revenueCents, aovCents: orders.length ? revenueCents / orders.length : null,
        conversion: people.length ? buyers.size / people.length : null,
        cartCompletion: carts.length ? cartBuyers.length / carts.length : null,
        unpurchasedCarts: carts.length - cartBuyers.length
      };
      eligibleOrders += orders.length;
    }
    const baseline = groups.off.aovCents;
    const treatment = groups.on.aovCents;
    return { groups,
      lift: baseline > 0 && treatment !== null ? (treatment - baseline) / baseline : null,
      mixedShoppers: data.participants.filter(p => p.variation === 'mixed').length,
      excludedOrders: data.orders.length - eligibleOrders
    };
  }
  return { storageKey, read, observe, cartStarted, recordOrder, summarize, reset: () => save(empty()) };
})();
if (typeof module !== 'undefined') module.exports = demoAnalytics;
