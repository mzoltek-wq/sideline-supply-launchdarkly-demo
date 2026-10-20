// 1. DEMO DATA: These are fictional profiles, not authenticated accounts.
// Stable keys will let us target a specific shopper in a later LaunchDarkly lesson.
const shoppers = {
  guest: { kind: 'user', key: 'demo-guest', name: 'Guest', anonymous: true, internalTester: false },
  maya: { kind: 'user', key: 'demo-maya', name: 'Maya', anonymous: false, internalTester: true },
  jordan: { kind: 'user', key: 'demo-jordan', name: 'Jordan', anonymous: false, internalTester: false }
};

// These seasons are deliberately fixed for repeatable demos, not a live calendar.
const collections = {
  basketball: { name: 'Basketball', season: 'in-season', color: '#b14c2c', accent: '#f4dfbb', team: 'COURTSIDE' },
  baseball: { name: 'Baseball', season: 'off-season', color: '#254e40', accent: '#ecdfbd', team: 'HOME FIELD' },
  football: { name: 'Football', season: 'in-season', color: '#314b68', accent: '#e6d9b5', team: 'SUNDAY CLUB' }
};
const productTypes = commerce.catalog;

// 2. STATE: One active shopper and collection. Each demo shopper has a separate bag.
// Bags are in memory. Demo order history is saved locally, never real purchases.
let activeShopper = 'guest';
let activeSport = 'basketball';
let bundleEnabled = false;
const bags = { guest: [], maya: [], jordan: [] };
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const bagDialog = document.querySelector('#bag-dialog');
const bundleDialog = document.querySelector('#bundle-dialog');
let bundleDraft = null;
const bagToast = document.querySelector('#bag-toast');
let toastTimer;
let checkoutBusy = false;
let orders = loadOrders();
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

// 3. DISPLAY: Simple vector product illustrations keep this project self-contained.
function productIllustration(type, collection) {
  const { color, accent, team } = collection;
  const shapes = {
    jersey: `<path d="M80 28 108 18Q130 45 152 18L180 28 201 76 174 90 174 210 86 210 86 90 59 76Z" fill="${color}" stroke="${accent}" stroke-width="3"/><path d="M108 18Q130 58 152 18M86 194H174" fill="none" stroke="${accent}" stroke-width="5"/><text x="130" y="105" text-anchor="middle" fill="${accent}" font-size="12" font-family="Arial" font-weight="bold">${team}</text><text x="130" y="163" text-anchor="middle" fill="${accent}" font-size="52" font-family="Arial" font-weight="bold">24</text>`,
    cap: `<path d="M58 143Q57 63 130 62 193 63 198 142Z" fill="${color}"/><path d="M73 139Q139 121 198 142L232 166Q154 199 73 158Z" fill="${color}" stroke="${accent}" stroke-width="3"/><path d="M130 63Q157 88 155 135M128 63Q96 85 98 136" fill="none" stroke="${accent}" stroke-width="1" opacity=".5"/><text x="126" y="120" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="30" font-weight="bold" font-style="italic">S/</text>`,
    hoodie: `<path d="M96 61Q80 12 130 13 180 12 164 61L185 72 218 171 186 184 173 143 173 215 87 215 87 143 74 184 42 171 75 72Z" fill="${color}"/><path d="M96 61Q130 83 164 61M111 67V110M149 67V110M88 200H173" fill="none" stroke="${accent}" stroke-width="3"/><path d="M110 157H150L161 185H99Z" fill="none" stroke="${accent}" stroke-width="2"/><text x="130" y="139" text-anchor="middle" fill="${accent}" font-family="Arial" font-size="13" font-weight="bold">SIDELINE</text>`
  };
  return `<svg viewBox="0 0 260 240" aria-hidden="true">${shapes[type]}</svg>`;
}

function renderProducts() {
  const collection = collections[activeSport];
  document.querySelector('#collection-title').textContent = `${collection.name} essentials`;
  document.querySelector('#season-label').textContent = `Demo season: ${collection.season === 'off-season' ? 'Off season' : 'In season'}`;
  // All HTML below comes from our fixed local catalog, never visitor input.
  document.querySelector('#products').innerHTML = productTypes.map(product => `
    <article>
      <div class="product-art ${product.type}"><span class="product-category">${collection.team}</span>${productIllustration(product.type, collection)}</div>
      <div class="product-info"><div><h3>${product.name}</h3><p>${product.detail}</p></div><span class="price">${money(product.price)}</span></div>
      <button type="button" class="add-button" data-product="${product.type}" aria-label="Add ${collection.name} ${product.name} to demo bag">Add to demo bag <span aria-hidden="true">+</span></button>
      <button type="button" class="start-bundle" data-start-product="${product.type}" ${bundleEnabled ? '' : 'hidden'}>Start a bundle with this item</button>
    </article>`).join('');
}

function getLaunchDarklyContext() {
  // A multi-context describes both WHO is shopping and WHICH collection is open.
  const { kind, ...user } = shoppers[activeShopper];
  return {
    kind: 'multi',
    user,
    collection: { key: activeSport, sport: activeSport, season: collections[activeSport].season }
  };
}

function renderDemoData() {
  document.querySelector('#context-preview').textContent = JSON.stringify(getLaunchDarklyContext(), null, 2);
  document.querySelector('#shopper-label').textContent = `Shopping as ${shoppers[activeShopper].name}`;
}

function renderBundle(enabled) {
  bundleEnabled = enabled;
  if (!enabled && bundleDraft) {
    closeBundleBuilder();
    announce('The bundle offer is no longer available. Your bag has not changed.');
  }
  const bundle = document.querySelector('#game-day-bundle');
  if (!enabled && bundle.contains(document.activeElement)) {
    document.querySelector(`[data-sport="${activeSport}"]`).focus();
  }
  bundle.hidden = !enabled;
  document.querySelectorAll('[data-start-product]').forEach(button => { button.hidden = !enabled; });
  document.querySelector('#bundle-description').textContent = `Choose your ${collections[activeSport].name} favorites. Choose any two items for 5% off, or all three for 10% off the set.`;
  // A flag change also removes cart offers without a page refresh.
  const focused = document.activeElement;
  const focusAction = focused?.dataset?.bagAction;
  const focusItem = focused?.dataset?.item;
  const focusType = focused?.dataset?.type;
  renderBag();
  if (focusAction) {
    const replacement = [...document.querySelectorAll('[data-bag-action]')].find(button =>
      button.dataset.item === focusItem && button.dataset.bagAction === focusAction && button.dataset.type === focusType);
    (replacement || document.querySelector('#close-bag')).focus();
  }
}

function addProductToBag(product) {
  const id = `${activeSport}-${product.type}`;
  const bag = bags[activeShopper];
  const existing = bag.find(item => item.id === id);
  if (existing) existing.quantity += 1;
  else bag.push({ id, sport: activeSport, type: product.type, name: `${collections[activeSport].name} ${product.name}`, quantity: 1 });
}

// Build a draft first. Canceling or selecting fewer than two items never changes the bag.
function startBundle(type, fromItemId) {
  if (!bundleEnabled || bundleDraft) return;
  const source = fromItemId ? bags[activeShopper].find(item =>
    item.id === fromItemId && !item.isBundle && item.sport === activeSport) : null;
  if (fromItemId && !source) return;
  const initialType = source?.type || type;
  bundleDraft = { sport: activeSport, shopper: activeShopper, fromItemId,
    types: productTypes.some(product => product.type === initialType) ? [initialType] : [] };
  hideToast();
  document.querySelector('#bundle-dialog-title').textContent = `Build your ${collections[activeSport].name} bundle`;
  document.querySelector('#bundle-choices').innerHTML = productTypes.map(product => `
    <label class="bundle-choice">
      <input type="checkbox" data-bundle-choice="${product.type}" ${bundleDraft.types.includes(product.type) ? 'checked' : ''} ${source?.type === product.type ? 'disabled' : ''}>
      <span class="bundle-choice-art">${productIllustration(product.type, collections[activeSport])}</span>
      <span class="bundle-choice-name">${product.name}</span><span>${money(product.price)}</span>
      <small>${source?.type === product.type ? 'Already in your bag · included' : product.detail}</small>
    </label>`).join('');
  renderBundleDraft();
  bundleDialog.showModal();
}

function renderBundleDraft() {
  if (!bundleDraft) return;
  const count = bundleDraft.types.length;
  const price = count ? commerce.priceBundle(bundleDraft.types) : null;
  document.querySelector('#bundle-selection-status').textContent = count < 2
    ? `Select ${2 - count} more ${count === 1 ? 'item' : 'items'} to make a bundle.`
    : `${count} items selected · ${price.percent}% off · You save ${money(price.savingsCents / 100)}`;
  document.querySelector('#bundle-draft-total').textContent = money((price?.totalCents || 0) / 100);
  document.querySelector('#bundle-draft-regular').textContent = count >= 2 ? money(price.regularCents / 100) : '';
  document.querySelector('#confirm-bundle').disabled = count < 2 || !bundleEnabled;
  document.querySelector('#confirm-bundle').textContent = bundleDraft.fromItemId ? 'Update bag with bundle' : 'Add bundle to bag';
}

function closeBundleBuilder() {
  bundleDraft = null;
  bundleDialog.close();
  // The bag can be underneath the builder when upgrading an existing single.
  if (bagDialog.open) document.querySelector('#close-bag').focus();
  else document.querySelector(`[data-sport="${activeSport}"]`).focus();
}

function confirmBundle() {
  const draft = bundleDraft;
  if (!draft || !bundleEnabled || draft.shopper !== activeShopper || draft.sport !== activeSport ||
      draft.types.length < 2 || draft.types.length > 3) return;
  // Revalidate before committing; this also rejects duplicate or unknown product types.
  commerce.priceBundle(draft.types);
  const bag = bags[activeShopper];
  if (draft.fromItemId) {
    const source = bag.find(item => item.id === draft.fromItemId && !item.isBundle && item.sport === draft.sport);
    if (!source || !draft.types.includes(source.type)) return;
    source.quantity -= 1;
    if (!source.quantity) bag.splice(bag.indexOf(source), 1);
  }
  bag.push({ id: `bundle-${crypto.randomUUID()}`, sport: draft.sport,
    name: `${collections[draft.sport].name} Game-Day Bundle`, types: [...draft.types], quantity: 1, isBundle: true });
  closeBundleBuilder();
  renderBag();
  document.querySelector('#order-confirmation').hidden = true;
  if (!bagDialog.open) bagDialog.showModal();
  document.querySelector('#close-bag').focus();
  announce(`${draft.types.length}-item ${collections[draft.sport].name} bundle added to your bag.`);
}

function renderBag() {
  const bag = bags[activeShopper];
  if (bag.length) demoAnalytics.cartStarted(shoppers[activeShopper].key);
  document.querySelector('#bag-count').textContent = getBagItemCount();
  document.querySelector('#bag-items').innerHTML = bag.length ? bag.map(item => {
    const price = commerce.linePrice(item);
    const canOffer = bundleEnabled && item.sport === activeSport;
    const contents = item.isBundle ? item.types.map(type => {
      const product = productTypes.find(product => product.type === type);
      return `<div class="bundle-component"><span>${product.name}</span><button type="button" data-bag-action="remove-component" data-type="${type}" data-item="${item.id}" aria-label="Remove ${product.name} from ${item.name}">Remove</button></div>`;
    }).join('') : '';
    const additions = item.isBundle && canOffer ? productTypes.filter(product => !item.types.includes(product.type)).map(product =>
      `<button type="button" class="bundle-addition" data-bag-action="add-component" data-type="${product.type}" data-item="${item.id}">+ ${product.name} · ${money(product.price)}</button>`).join('') : '';
    return `<li class="bag-item"><div class="bag-item-heading"><span>${item.name}</span><strong>${money(price.totalCents * item.quantity / 100)}</strong></div>
      ${item.isBundle ? `<div class="bundle-contents">${contents}</div><p class="bag-bundle-detail">${price.percent ? `${price.percent}% off this set · You save ${money(price.savingsCents * item.quantity / 100)}` : 'One item · Regular price'}${item.quantity > 1 ? `<br>Selections apply to all ${item.quantity} sets.` : ''}</p>
      ${canOffer && item.types.length < 3 ? `<div class="cart-offer"><strong>${item.types.length === 1 ? 'Add one for 5% off. Add two for 10% off.' : 'Add the third item for 10% off the set.'}</strong><p>One of each item, all ${collections[item.sport].name}. Discount applies to the whole set.</p>${additions}</div>` : ''}` :
      canOffer ? `<button type="button" class="cart-start" data-bag-action="start" data-item="${item.id}">Build a bundle from this item →</button>` : ''}
      <div class="bag-item-actions"><div class="quantity-control" role="group" aria-label="Quantity for ${item.name}">
        <button type="button" data-bag-action="decrease" data-item="${item.id}" aria-label="Decrease quantity of ${item.name}" ${item.quantity === 1 ? 'disabled' : ''}>−</button>
        <span aria-label="Quantity ${item.quantity}">${item.quantity}</span>
        <button type="button" data-bag-action="increase" data-item="${item.id}" aria-label="Increase quantity of ${item.name}">+</button>
      </div><button type="button" class="remove-item" data-bag-action="remove" data-item="${item.id}" aria-label="Remove ${item.name}">Remove ${item.isBundle ? 'set' : ''}</button></div>
    </li>`;
  }).join('') : '<li>Your bag is empty. Pick a game-day favorite.</li>';
  const totals = commerce.totals(bag);
  document.querySelector('#bag-total').textContent = money(totals.totalCents / 100);
  document.querySelector('#bag-savings').textContent = totals.savingsCents ? `Bundle savings: ${money(totals.savingsCents / 100)}` : '';
  document.querySelector('#clear-bag').disabled = bag.length === 0 || checkoutBusy;
  document.querySelector('#place-order').disabled = bag.length === 0 || checkoutBusy;
  document.querySelector('#place-order').textContent = checkoutBusy ? 'Recording demo order…' : 'Place demo order';
}

function getBagItemCount() {
  return commerce.totals(bags[activeShopper]).pieces;
}

// Demo orders are a local receipt ledger. No payment, tax, shipping or fulfillment.
function loadOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem('sideline-demo-orders-v1') || '[]');
    return Array.isArray(saved) ? saved.filter(order => order && typeof order.id === 'string' &&
      Number.isSafeInteger(order.totalCents) && order.totalCents >= 0 && Number.isSafeInteger(order.savingsCents) &&
      Number.isSafeInteger(order.pieces) && Array.isArray(order.items) && order.items.every(item =>
        item && typeof item.name === 'string' && Number.isSafeInteger(item.quantity) && item.quantity > 0 &&
        (!item.isBundle || (Array.isArray(item.types) && item.types.every(type => typeof type === 'string'))))).slice(0, 100) : [];
  } catch { return []; }
}

function saveOrders() {
  try { localStorage.setItem('sideline-demo-orders-v1', JSON.stringify(orders)); }
  catch { announce('Order recorded for this visit, but browser storage is unavailable.'); }
}

function renderOrders() {
  document.querySelector('#order-summary').textContent = `${orders.length} demo ${orders.length === 1 ? 'order' : 'orders'} · ${money(orders.reduce((sum, order) => sum + order.totalCents, 0) / 100)} demo sales`;
  document.querySelector('#order-history').innerHTML = orders.length ? orders.map(order =>
    `<li><div><strong>${escapeHTML(order.id)}</strong> · ${escapeHTML(order.shopperName)}<br>${order.pieces} ${order.pieces === 1 ? 'item' : 'items'} · ${money(order.totalCents / 100)} · Saved ${money(order.savingsCents / 100)}</div><p>${escapeHTML(order.items.map(item => `${item.quantity} × ${item.name}${item.isBundle ? ` (${item.types.length} items)` : ''}`).join(', '))}</p><small>${escapeHTML(order.tracking || 'Local only')}</small></li>`
  ).join('') : '<li>No demo orders yet. Place one from your bag.</li>';
}

async function placeDemoOrder() {
  if (checkoutBusy || !bags[activeShopper].length) return;
  checkoutBusy = true;
  const shopperKey = activeShopper;
  const items = structuredClone(bags[shopperKey]);
  const totals = commerce.totals(items);
  const order = { id: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, shopperName: shoppers[shopperKey].name,
    userKey: shoppers[shopperKey].key, variation: getCurrentBundleVariation(), createdAt: new Date().toISOString(), items, ...totals, tracking: 'Local only' };
  // Clear synchronously, so a double click cannot place the same order twice.
  bags[shopperKey] = [];
  demoAnalytics.recordOrder(order, order.variation);
  orders.unshift(order);
  orders = orders.slice(0, 100);
  saveOrders();
  renderBag();
  renderOrders();
  const receipt = document.querySelector('#order-confirmation');
  receipt.hidden = false;
  receipt.textContent = `${order.id} confirmed · ${money(totals.totalCents / 100)}. Demo only; no payment was taken.`;
  try {
    order.tracking = await trackDemoOrder(order);
  } catch {
    order.tracking = 'Recorded locally; analytics could not be sent.';
  } finally {
    checkoutBusy = false;
    saveOrders();
    renderBag();
    renderOrders();
  }
}

function announce(message) {
  document.querySelector('#announcement').textContent = message;
}

// A small confirmation popup, without interrupting shopping or moving keyboard focus.
function hideToast() {
  clearTimeout(toastTimer);
  bagToast.hidden = true;
}

function showAddedToast(productName) {
  clearTimeout(toastTimer);
  bagToast.hidden = false;
  const count = getBagItemCount();
  document.querySelector('#toast-message').textContent = `${productName} added to bag. ${count} ${count === 1 ? 'item' : 'items'} in your bag.`;
  toastTimer = setTimeout(hideToast, 4500);
}

// 4. INTERACTIONS: Click -> change state -> refresh the relevant part of the page.
document.querySelectorAll('[data-shopper]').forEach(button => {
  button.addEventListener('click', () => {
    activeShopper = button.dataset.shopper;
    hideToast();
    document.querySelectorAll('[data-shopper]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderDemoData();
    renderBag();
    announce(`Now shopping as ${shoppers[activeShopper].name}.`);
    updateFlagContext();
  });
});

document.querySelectorAll('[data-sport]').forEach(button => {
  button.addEventListener('click', () => {
    activeSport = button.dataset.sport;
    document.querySelectorAll('[data-sport]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderProducts();
    renderDemoData();
    updateFlagContext();
    announce(`${collections[activeSport].name} collection selected.`);
  });
});

document.querySelector('#products').addEventListener('click', event => {
  const start = event.target.closest('[data-start-product]');
  if (start) { startBundle(start.dataset.startProduct); return; }
  const button = event.target.closest('[data-product]');
  if (!button) return;
  const product = productTypes.find(item => item.type === button.dataset.product);
  addProductToBag(product);
  renderBag();
  showAddedToast(`${collections[activeSport].name} ${product.name}`);
});

document.querySelector('#start-bundle').addEventListener('click', () => startBundle());
document.querySelector('#bundle-choices').addEventListener('change', event => {
  const type = event.target.dataset.bundleChoice;
  if (!bundleDraft || !productTypes.some(product => product.type === type)) return;
  const source = bags[activeShopper].find(item => item.id === bundleDraft.fromItemId);
  if (source?.type === type) return;
  bundleDraft.types = event.target.checked
    ? [...new Set([...bundleDraft.types, type])]
    : bundleDraft.types.filter(selected => selected !== type);
  renderBundleDraft();
});
document.querySelector('#confirm-bundle').addEventListener('click', confirmBundle);
document.querySelector('#close-bundle').addEventListener('click', closeBundleBuilder);
bundleDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeBundleBuilder();
});

// Edit quantities in the active shopper's bag. Removing is a separate explicit action.
document.querySelector('#bag-items').addEventListener('click', event => {
  const button = event.target.closest('[data-bag-action]');
  if (!button) return;
  const bag = bags[activeShopper];
  const index = bag.findIndex(item => item.id === button.dataset.item);
  if (index < 0) return;
  const item = bag[index];
  const action = button.dataset.bagAction;
  if (action === 'start') { startBundle(item.type, item.id); return; }
  if (action === 'add-component') {
    if (!item.isBundle || !bundleEnabled || item.sport !== activeSport || item.types.includes(button.dataset.type)) return;
    if (!productTypes.some(product => product.type === button.dataset.type)) return;
    item.types.push(button.dataset.type);
  } else if (action === 'remove-component') {
    item.types = item.types.filter(type => type !== button.dataset.type);
    if (!item.types.length) bag.splice(index, 1);
  } else if (action === 'remove') bag.splice(index, 1);
  else if (action === 'increase') item.quantity += 1;
  else if (action === 'decrease') item.quantity = Math.max(1, item.quantity - 1);
  renderBag();
  announce(action === 'remove' ? `${item.name} removed. Subtotal ${document.querySelector('#bag-total').textContent}.` : `${item.name}: quantity ${item.quantity}. Subtotal ${document.querySelector('#bag-total').textContent}.`);

  // Rendering replaces the controls, so restore focus for keyboard users.
  const nextId = action === 'remove' ? bag[Math.min(index, bag.length - 1)]?.id : item.id;
  const nextAction = action === 'decrease' && item.quantity === 1 ? 'increase' : action;
  const nextButton = [...document.querySelectorAll('[data-bag-action]')].find(control =>
    control.dataset.item === nextId && control.dataset.bagAction === nextAction);
  const remainingControl = [...document.querySelectorAll('[data-bag-action]')].find(control => control.dataset.item === nextId);
  (nextButton || remainingControl || document.querySelector('#close-bag')).focus();
});

document.querySelector('#dismiss-toast').addEventListener('click', hideToast);
document.querySelector('#open-bag').addEventListener('click', () => {
  hideToast();
  document.querySelector('#order-confirmation').hidden = true;
  renderBag();
  bagDialog.showModal();
});
document.querySelector('#close-bag').addEventListener('click', () => bagDialog.close());
document.querySelector('#clear-bag').addEventListener('click', () => {
  bags[activeShopper] = [];
  renderBag();
  document.querySelector('#close-bag').focus();
  announce('Demo bag emptied.');
});

document.querySelector('#place-order').addEventListener('click', placeDemoOrder);
document.querySelector('#new-visitor').addEventListener('click', () => {
  if (checkoutBusy) return;
  shoppers.guest.key = `demo-visitor-${crypto.randomUUID()}`;
  bags.guest = [];
  document.querySelector('[data-shopper="guest"]').click();
  document.querySelector('#order-confirmation').hidden = true;
  announce('New anonymous demo visitor. LaunchDarkly will evaluate this new identity.');
});
document.querySelector('#reset-demo').addEventListener('click', () => {
  if (!checkoutBusy) document.querySelector('#reset-dialog').showModal();
});
document.querySelector('#cancel-reset').addEventListener('click', () => document.querySelector('#reset-dialog').close());
document.querySelector('#confirm-reset').addEventListener('click', () => {
  if (checkoutBusy) return;
  Object.keys(bags).forEach(key => { bags[key] = []; });
  orders = [];
  saveOrders();
  demoAnalytics.reset();
  shoppers.guest.key = 'demo-guest';
  activeSport = 'basketball';
  document.querySelectorAll('[data-sport]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sport === activeSport)));
  renderProducts();
  document.querySelector('[data-shopper="guest"]').click();
  renderOrders();
  document.querySelector('#order-confirmation').hidden = true;
  resetSupportPreview();
  document.querySelector('#reset-dialog').close();
  announce('Local bags, orders, dashboard observations and support preview reset. LaunchDarkly data and settings were not changed.');
});

renderProducts();
renderDemoData();
renderBag();
renderOrders();
renderBundle(false);
