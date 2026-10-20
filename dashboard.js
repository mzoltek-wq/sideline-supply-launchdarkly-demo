const dashboardMoney = cents => cents === null ? '—' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
const dashboardPercent = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const dashboardEscape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function renderDashboard() {
  const data = demoAnalytics.read();
  const { groups, lift, mixedShoppers, excludedOrders } = demoAnalytics.summarize(data);
  for (const variation of ['off','on']) {
    const group = groups[variation];
    document.querySelector(`#${variation}-aov`).textContent = dashboardMoney(group.aovCents);
    document.querySelector(`#${variation}-volume`).textContent = `${group.orders} order${group.orders === 1 ? "" : "s"} · ${group.shoppers} observed shopper${group.shoppers === 1 ? "" : "s"}`;
  }
  document.querySelector('#aov-lift').textContent = lift === null ? '—' : `${lift >= 0 ? '+' : ''}${dashboardPercent(lift)}`;
  document.querySelector('#target-state').textContent = lift === null ? 'Needs orders in both groups and a nonzero baseline' : lift >= .1 ? 'Business target observed · Not a statistical result' : 'Below the +10% business target';
  const metrics = [
    ['Observed shoppers','shoppers'],['Shoppers who started a cart','carts'],['Shoppers who purchased','buyers'],
    ['Completed orders','orders'],['Revenue after discounts','revenueCents',dashboardMoney],
    ['Order conversion','conversion',dashboardPercent],['Cart completion','cartCompletion',dashboardPercent],
    ['Cart starters yet to purchase','unpurchasedCarts']
  ];
  document.querySelector('#metric-rows').innerHTML = metrics.map(([label,key,format = value => value]) =>
    `<tr><th scope="row">${label}</th><td>${format(groups.off[key])}</td><td>${format(groups.on[key])}</td></tr>`).join('');
  document.querySelector('#decision-text').textContent = lift === null
    ? 'Place demo orders with the bundle on and off for distinct shopper identities to populate both groups.'
    : `The observed average order value is ${Math.abs(lift * 100).toFixed(1)}% ${lift >= 0 ? 'higher' : 'lower'} with bundles. ${groups.on.conversion < groups.off.conversion ? 'Order conversion is lower in the bundle group; review that tradeoff.' : 'Review order conversion alongside order value.'}`;
  document.querySelector('#exclusion-note').textContent = `${mixedShoppers} shoppers saw both flag values. ${excludedOrders} orders are excluded due to mixed exposure or missing/mismatched attribution.`;
  document.querySelector('#dashboard-orders').innerHTML = data.orders.length ? data.orders.slice(-12).reverse().map(order => {
    const participant = data.participants.find(p => p.key === order.userKey);
    const included = participant && participant.variation !== 'mixed' && participant.variation === order.variation;
    return `<tr><th scope="row">${dashboardEscape(order.id)}</th><td>${dashboardMoney(order.totalCents)}</td><td>${dashboardEscape(order.variation)}</td><td>${included ? 'Included' : 'Excluded'}</td></tr>`;
  }).join('') : '<tr><td colspan="4">No observed orders yet. Start in the store.</td></tr>';
  document.querySelector('#dashboard-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}
document.querySelector('#refresh-dashboard').addEventListener('click', renderDashboard);
window.addEventListener('storage', event => { if (event.key === demoAnalytics.storageKey || event.key === null) renderDashboard(); });
window.addEventListener('pageshow', renderDashboard);
renderDashboard();
