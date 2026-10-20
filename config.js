// This public client-side ID connects the browser SDK to your chosen environment.
// A reviewer should replace it with their own environment's client-side ID.
// Never put a secret server-side SDK key or API token in browser code.
const launchDarklyConfig = {
  clientSideId: '6ad0ebc0683ac1078b57b681',
  bundleFlagKey: 'game-day-bundle',
  // The local Node backend evaluates AI configuration for each support request.
  // That backend holds the server SDK key. Never put it in this public file.
  supportConfigEndpoint: '/api/support-config'
};
