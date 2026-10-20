// Evaluate configuration only. No provider SDK, generation, or fake AI usage metrics.
const FALLBACK_MODEL = '__sideline_configuration_unavailable__';
const ISSUES = new Set(['delivery', 'cancel', 'warranty']);

function supportContext(body) {
  if (!body || !ISSUES.has(body.issueType) || !body.user ||
      typeof body.user.key !== 'string' || !/^demo-[a-zA-Z0-9-]{1,100}$/.test(body.user.key)) {
    const error = new Error('Choose a valid issue and demo shopper.');
    error.status = 400;
    throw error;
  }
  // Copy only the fields used by this demo. This selector is not authentication.
  return {
    kind: 'user', key: body.user.key,
    anonymous: body.user.anonymous === true,
    ...(typeof body.user.name === 'string' ? { name: body.user.name.slice(0, 80) } : {}),
    internalTester: body.user.internalTester === true,
    issueType: body.issueType
  };
}

async function resolveSupportConfig(aiClient, configKey, context) {
  // A sentinel distinguishes an SDK fallback from a genuine disabled LD config.
  // It is never exposed as a selected model or sent to a model provider.
  const config = await aiClient.completionConfig(configKey, context, {
    enabled: false, model: { name: FALLBACK_MODEL }
  });
  const fallback = config.model?.name === FALLBACK_MODEL;
  if (fallback) return { source: 'fallback', enabled: false, configKey,
    variationKey: null, model: null, messages: [] };

  const metadata = config.createTracker().getTrackData();
  if (!config.enabled) return { source: 'launchdarkly', enabled: false, configKey,
    variationKey: metadata.variationKey || null, model: null, messages: [] };

  if (!config.model?.name || !metadata.variationKey || !Array.isArray(config.messages) ||
      !config.messages.every(message => typeof message.role === 'string' && typeof message.content === 'string')) {
    throw new Error('Incomplete AI configuration.');
  }
  return {
    source: 'launchdarkly', enabled: true, configKey,
    variationKey: metadata.variationKey, version: metadata.version,
    model: { name: config.model.name },
    messages: config.messages.map(({ role, content }) => ({ role, content }))
  };
}

module.exports = { supportContext, resolveSupportConfig };
