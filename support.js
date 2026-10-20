// Display the configuration evaluated by our LaunchDarkly AI SDK backend.
// Even with real configuration, responses stay simulated and no LLM is invoked.
const supportPreviews = {
  delivery: 'I can help you look into a delayed delivery. A connected assistant would check your order status and tracking details, then explain the next step. In this preview, no carrier or order system is connected.',
  cancel: 'I can help you check whether an order can be canceled. A connected assistant would verify its fulfillment status and ask you to confirm before requesting cancellation. No order has been canceled in this preview.',
  warranty: 'Please describe the item and what went wrong. A warranty assistant could gather purchase details, request a photo if useful, and prepare a claim summary for the appropriate team. This preview does not assess eligibility, upload images, or contact a manufacturer.'
};
const supportIssueNames = { delivery: 'Order not received', cancel: 'Order cancellation', warranty: 'Warranty or damaged item' };
let supportRequestVersion = 0;
let supportAbort;

// Contract for the local backend. Model names must come from LD, not an issue-to-model
// map in the browser. A server fallback must identify itself as source: 'fallback'.
async function resolveSupportConfiguration(issue, signal) {
  if (!launchDarklyConfig.supportConfigEndpoint) {
    return {source:'preview', enabled:false, variationKey:null, model:null, messages:[]};
  }
  const endpoint = new URL(launchDarklyConfig.supportConfigEndpoint, window.location.origin);
  if (endpoint.origin !== window.location.origin) throw new Error('Support configuration must use our own backend.');
  const response = await fetch(endpoint, {
    method:'POST', headers:{'Content-Type':'application/json'}, signal,
    body:JSON.stringify({issueType:issue, user:getLaunchDarklyContext().user})
  });
  if (!response.ok) throw new Error('Support configuration is unavailable.');
  const result = await response.json();
  if (!result || !['launchdarkly','fallback'].includes(result.source) || typeof result.enabled !== 'boolean' ||
      !Array.isArray(result.messages) || !result.messages.every(message => message && typeof message.role === 'string' && typeof message.content === 'string') ||
      (result.enabled && (!result.model || typeof result.model.name !== 'string' || typeof result.variationKey !== 'string'))) {
    throw new Error('The support configuration response is incomplete.');
  }
  return result;
}

function resetSupportPreview() {
  supportRequestVersion += 1;
  supportAbort?.abort();
  document.querySelector('#support-form').reset();
  document.querySelector('#support-form').removeAttribute('aria-busy');
  document.querySelector('#support-config-issue').textContent = 'Submit a request';
  document.querySelector('#support-config-model').textContent = 'Not selected yet';
  document.querySelector('#support-config-variation').textContent = 'Not evaluated';
  document.querySelector('#support-config-source').textContent = 'Awaiting request';
  document.querySelector('#support-config-prompt').textContent = 'Submit a request to see the prompt selected by LaunchDarkly.';
  document.querySelector('#support-config-status').textContent = 'Ready for a support request.';
  document.querySelector('#support-mode').textContent = 'LaunchDarkly configuration · Awaiting request';
  document.querySelector('#support-response').textContent = 'Choose an issue to preview the support flow.';
}

document.querySelector('#support-form').addEventListener('submit', async event => {
  event.preventDefault();
  const issue = document.querySelector('#support-issue').value;
  if (!Object.prototype.hasOwnProperty.call(supportPreviews, issue)) return;
  const note = document.querySelector('#support-message').value.trim();
  const orderId = document.querySelector('#support-order').value.trim();
  const requestVersion = ++supportRequestVersion;
  supportAbort?.abort();
  const controller = new AbortController();
  supportAbort = controller;
  const timeout = setTimeout(() => controller.abort(), 8000);
  document.querySelector('#support-form').setAttribute('aria-busy','true');
  document.querySelector('#support-config-issue').textContent = supportIssueNames[issue];
  document.querySelector('#support-config-model').textContent = 'Awaiting configuration';
  document.querySelector('#support-config-variation').textContent = 'Awaiting configuration';
  document.querySelector('#support-config-source').textContent = 'Awaiting configuration';
  document.querySelector('#support-config-prompt').textContent = 'Awaiting configuration';
  document.querySelector('#support-response').textContent = 'Preparing a simulated response…';
  document.querySelector('#support-config-status').textContent = 'Resolving configuration for this request…';
  try {
    const config = await resolveSupportConfiguration(issue, controller.signal);
    if (requestVersion !== supportRequestVersion) return;
    const preview = config.source === 'preview';
    document.querySelector('#support-mode').textContent = preview ? 'Local preview · AI configuration not connected'
      : config.source === 'launchdarkly' ? 'LaunchDarkly configuration · Response simulated' : 'Backend fallback · Response simulated';
    document.querySelector('#support-config-source').textContent = preview ? 'Local preview — no LD evaluation'
      : config.source === 'launchdarkly' ? 'LaunchDarkly AI Config' : 'Backend fallback';
    document.querySelector('#support-config-variation').textContent = config.variationKey || (preview ? 'Pending your LaunchDarkly setup' : 'No active variation');
    document.querySelector('#support-config-model').textContent = config.enabled && config.model ? config.model.name : preview ? 'Not configured — choose a model in LaunchDarkly' : config.source === 'fallback' ? 'Unavailable — no model selected' : 'Disabled — no model selected';
    document.querySelector('#support-config-prompt').textContent = config.messages.length
      ? config.messages.map(message => `${message.role.toUpperCase()}\n${message.content}`).join('\n\n')
      : 'No active prompt returned for this request.';
    document.querySelector('#support-config-status').textContent = preview
      ? 'The request display is ready. Model and prompt selection will come from the backend once we connect LaunchDarkly.'
      : config.source === 'fallback' ? 'LaunchDarkly could not resolve this configuration. Check the config key and connection.'
      : 'Configuration captured for this request. Saved LaunchDarkly updates apply to subsequent requests once received by the SDK.';
    // User input is text, never HTML. It is not sent to a model or external service.
    document.querySelector('#support-response').textContent =
      (orderId ? `Demo reference: ${orderId}\n\n` : '') + (note ? `Your note: ${note}\n\n` : '') +
      (!preview && !config.enabled ? (config.source === 'fallback' ? 'Support configuration is unavailable. No model was invoked.' : 'Support AI configuration is disabled. No model was invoked.') : supportPreviews[issue]);
  } catch {
    if (requestVersion !== supportRequestVersion) return;
    document.querySelector('#support-mode').textContent = 'Configuration unavailable · No model invoked';
    document.querySelector('#support-config-source').textContent = 'Unavailable';
    document.querySelector('#support-config-model').textContent = 'No confirmed model selection';
    document.querySelector('#support-config-variation').textContent = 'Unavailable';
    document.querySelector('#support-config-prompt').textContent = 'No resolved prompt received.';
    document.querySelector('#support-config-status').textContent = 'The configuration request failed or timed out. Try again after checking the backend connection.';
    document.querySelector('#support-response').textContent = 'Unable to resolve this request’s configuration. No order was changed and no model was invoked.';
  } finally {
    clearTimeout(timeout);
    if (requestVersion === supportRequestVersion) document.querySelector('#support-form').removeAttribute('aria-busy');
  }
});
