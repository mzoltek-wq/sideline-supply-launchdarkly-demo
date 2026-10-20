// One local Node server serves the storefront and evaluates LD AI configuration.
// Credentials live outside this directory. Only explicitly listed public files are served.
const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { supportContext, resolveSupportConfig } = require('./support-config.cjs');
const { createTrafficGenerator } = require('./traffic.cjs');

const publicFiles = new Set([
  'index.html', 'dashboard.html', 'styles.css', 'commerce.js', 'insights.js',
  'app.js', 'config.js', 'launchdarkly.js', 'support.js', 'dashboard.js', 'traffic.js',
  'vendor/ldclient.min.js', 'vendor/ldclient.min.js.map'
]);
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.map': 'application/json' };
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function readJson(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes <= 8192) chunks.push(chunk);
  }
  if (bytes > 8192) { const error = new Error('Request too large.'); error.status = 413; throw error; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('Invalid JSON.'); error.status = 400; throw error; }
}

function createServer({ evaluate, isReady = () => false, traffic }) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const port = server.address().port;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!hosts.has(req.headers.host)) return sendJson(res, 403, { error: 'Local access only.' });
    let pathname;
    try { pathname = new URL(req.url, `http://${req.headers.host}`).pathname; }
    catch { return sendJson(res, 400, { error: 'Invalid path.' }); }
    try {
      if (pathname === '/api/demo-traffic' && req.method === 'GET') {
        return traffic ? sendJson(res, 200, { runs: traffic.list() }) : sendJson(res, 503, { error: 'Traffic generator unavailable.' });
      }
      if (pathname === '/api/support-config' || pathname === '/api/demo-traffic') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
        if ((req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) ||
            req.headers['sec-fetch-site'] === 'cross-site') return sendJson(res, 403, { error: 'Same-origin requests only.' });
        if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
          return sendJson(res, 415, { error: 'Send application/json.' });
        }
        const body = await readJson(req);
        if (pathname === '/api/demo-traffic') {
          if (!traffic) return sendJson(res, 503, { error: 'Traffic generator unavailable.' });
          return sendJson(res, 202, await traffic.start(body));
        }
        const context = supportContext(body);
        // Wait is bounded at initialization; requests fail clearly until data is ready.
        if (!isReady()) return sendJson(res, 503, { error: 'LaunchDarkly is not initialized.' });
        return sendJson(res, 200, await evaluate(context));
      }
      if (pathname === '/api/health' && req.method === 'GET') {
        return sendJson(res, 200, { launchDarklyReady: isReady(), modelExecution: 'simulated' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return sendJson(res, 405, { error: 'Method not allowed.' });
      const file = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!publicFiles.has(file)) return sendJson(res, 404, { error: 'Not found.' });
      const content = await readFile(path.join(__dirname, file));
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      // Never return SDK exceptions, credential values, or arbitrary request bodies.
      sendJson(res, error.status || 503, { error: error.status ? error.message : 'Support configuration unavailable.' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

async function main() {
  const envFile = process.env.SIDELINE_ENV_FILE || path.join(os.homedir(), '.config', 'sideline-supply', 'test.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
  const configKey = process.env.LAUNCHDARKLY_AI_CONFIG_KEY || 'sideline-support';
  if (!sdkKey) throw new Error('Missing SDK key. Set LAUNCHDARKLY_SDK_KEY in your private environment file.');
  const { init } = require('@launchdarkly/node-server-sdk');
  const { initAi } = require('@launchdarkly/server-sdk-ai');
  // Suppress raw SDK log payloads; surface connection state without credential data.
  const logger = { debug() {}, info() {}, warn() {}, error() { console.error('LaunchDarkly SDK reported an error; check configuration and connectivity.'); } };
  const ldClient = init(sdkKey, { logger, capacity: 10000 });
  const aiClient = initAi(ldClient);
  const traffic = await createTrafficGenerator(ldClient, {
    file: path.join(os.homedir(), '.config', 'sideline-supply', 'traffic-runs.json')
  });
  const server = createServer({
    isReady: () => ldClient.initialized(),
    traffic,
    evaluate: context => resolveSupportConfig(aiClient, configKey, context)
  });
  const port = Number(process.env.PORT || 5173);
  server.on('error', () => { console.error('Cannot start local server. Check whether its port is already in use.'); ldClient.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Sideline Supply: http://127.0.0.1:${port}`));
  ldClient.waitForInitialization({ timeout: 5 }).then(
    () => console.log('LaunchDarkly initialized. Support configuration ready; no models will be invoked.'),
    () => console.error('LaunchDarkly did not initialize. Support requests remain unavailable until it connects.')
  );
  const shutdown = () => { server.close(); ldClient.close(); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
if (require.main === module) main().catch(() => { console.error('Server setup failed. Check the private environment file and installed dependencies.'); process.exitCode = 1; });
module.exports = { createServer };
