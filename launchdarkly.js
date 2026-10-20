// The connection lesson: initialize -> evaluate -> listen -> identify.
// This file uses LaunchDarkly's JavaScript SDK v3.9.6 (included in vendor/).
let flagClient;
let pendingContextChanges = 0;
let contextQueue = Promise.resolve();
let contextIsValid = false;
let currentBundleVariation = null;

function getCurrentBundleVariation() {
  return flagClient && contextIsValid && !pendingContextChanges &&
    flagClient.getContext()?.user?.key === shoppers[activeShopper].key
    ? currentBundleVariation : null;
}

// Teaching step for experimentation: an order event carries a numeric USD value.
// Create a metric with event key "demo-order-placed" in LD to use it in an experiment.
// This does not create an experiment, choose a winner, or treat simulated data as real sales.
async function trackDemoOrder(order) {
  if (!flagClient || pendingContextChanges || !contextIsValid ||
      flagClient.getContext()?.user?.key !== order.userKey) {
    return 'Local only: LaunchDarkly context was not ready at checkout.';
  }
  const data = {
    demo: true, orderId: order.id, itemCount: order.pieces,
    savings: order.savingsCents / 100,
    twoItemBundles: order.items.filter(item => item.isBundle && item.types.length === 2).reduce((sum, item) => sum + item.quantity, 0),
    threeItemBundles: order.items.filter(item => item.isBundle && item.types.length === 3).reduce((sum, item) => sum + item.quantity, 0)
  };
  // Track is synchronous: it captures the current SDK context before a shopper switch.
  flagClient.track('demo-order-placed', data, order.totalCents / 100);
  if (data.twoItemBundles) flagClient.track('demo-two-item-bundle-purchased', data);
  if (data.threeItemBundles) flagClient.track('demo-three-item-bundle-purchased', data);
  // Bound the UI wait; a slow analytics connection must not lock the bag indefinitely.
  let timer;
  try {
    await Promise.race([
      flagClient.flush(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Flush timed out')), 4000); })
    ]);
    return 'Demo events sent to LaunchDarkly. Experiment results are configured separately.';
  } catch {
    return 'Demo events queued; delivery was not confirmed. Do not place a duplicate order to retry.';
  } finally { clearTimeout(timer); }
}

function setFlagStatus(message) {
  document.querySelector('#flag-status').textContent = message;
}

// 1. EVALUATE: false is our fallback if this flag has no available value.
function refreshBundleFlag() {
  if (!flagClient || pendingContextChanges || !contextIsValid) return;
  const flagKey = launchDarklyConfig.bundleFlagKey;
  const available = Object.prototype.hasOwnProperty.call(flagClient.allFlags(), flagKey);
  const value = flagClient.variation(flagKey, false);
  currentBundleVariation = available && typeof value === 'boolean' ? (value ? 'on' : 'off') : null;
  if (currentBundleVariation) {
    demoAnalytics.observe(shoppers[activeShopper].key, shoppers[activeShopper].name, currentBundleVariation);
  }
  renderBundle(available && value === true);
  setFlagStatus(available && typeof value === 'boolean'
    ? `SDK initialized · ${flagKey} = ${value} · Bundle ${value ? 'visible' : 'hidden'}.`
    : `Bundle hidden: check the flag key, Boolean type, environment, and client-side SDK availability.`);
}

// 2. IDENTIFY: Changing shopper or collection requires a new evaluation context.
// Queue changes so quick clicks cannot leave us displaying an older shopper's flag.
function updateFlagContext() {
  currentBundleVariation = null;
  renderBundle(false);
  if (!flagClient) return;
  const context = getLaunchDarklyContext();
  pendingContextChanges += 1;
  setFlagStatus('Updating context… Bundle hidden while the new flag value loads.');
  contextQueue = contextQueue.then(async () => {
    contextIsValid = false;
    try {
      await flagClient.waitForInitialization(5);
      await flagClient.identify(context);
      contextIsValid = true;
    } catch (error) {
      setFlagStatus('Context update failed. Bundle hidden; select a shopper or collection to retry.');
      console.warn('LaunchDarkly context update failed:', error);
    } finally {
      pendingContextChanges -= 1;
      refreshBundleFlag();
    }
  });
}

// 3. INITIALIZE once with the public environment ID and the initial context.
if (window.LDClient) {
  flagClient = LDClient.initialize(launchDarklyConfig.clientSideId, getLaunchDarklyContext());

  flagClient.on('initialized', () => {
    if (!pendingContextChanges) contextIsValid = true;
    refreshBundleFlag();
  });

  // 4. LISTEN: SDK streaming delivers flag changes; re-render without reloading.
  flagClient.on(`change:${launchDarklyConfig.bundleFlagKey}`, refreshBundleFlag);
  flagClient.on('error', () => {
    setFlagStatus('SDK reported a connection error. Current display may use a previously received flag value.');
  });

  flagClient.waitForInitialization(5).then(refreshBundleFlag).catch(error => {
    renderBundle(false);
    setFlagStatus('No initial flag data received. Bundle hidden; check the client-side ID and connection, then reload.');
    console.warn('LaunchDarkly initialization failed:', error);
  });
} else {
  renderBundle(false);
  setFlagStatus('LaunchDarkly SDK did not load. Check vendor/ldclient.min.js. Bundle hidden.');
}
