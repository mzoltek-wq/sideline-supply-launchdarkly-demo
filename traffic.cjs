// Synthetic experiment traffic. LD assigns variations; our stated assumptions
// simulate behavior afterward. Never retry a run by replaying its order events.
const { randomUUID, randomInt } = require('node:crypto');
const { readFile, writeFile, rename, mkdir } = require('node:fs/promises');
const path = require('node:path');
const commerce = require('./commerce.js');
const pairs = [['jersey', 'cap'], ['cap', 'hoodie'], ['jersey', 'hoodie'], ['jersey', 'cap', 'hoodie']];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function validateRun(input) {
  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.runId || '')) {
    throw fail('A new run identifier is required.');
  }
  const { visitors, controlConversion, bundleConversion, bundleAdoption } = input;
  if (!Number.isInteger(visitors) || visitors < 10 || visitors > 1000 ||
      ![controlConversion, bundleConversion, bundleAdoption].every(n => Number.isInteger(n) && n >= 0 && n <= 100)) {
    throw fail('Choose 10 to 1,000 visitors and whole-number percentages from 0 to 100.');
  }
  return { runId: input.runId, visitors, controlConversion, bundleConversion, bundleAdoption };
}

function simulateOrder(enabled, settings, random = Math.random) {
  const chance = enabled ? settings.bundleConversion : settings.controlConversion;
  if (random() >= chance / 100) return null;
  if (enabled && random() < settings.bundleAdoption / 100) {
    const types = pairs[Math.floor(random() * pairs.length)];
    return { ...commerce.priceBundle(types), pieces: types.length, bundleSize: types.length };
  }
  const item = commerce.catalog[Math.floor(random() * commerce.catalog.length)];
  return { ...commerce.linePrice(item), pieces: 1, bundleSize: 0 };
}

async function createTrafficGenerator(client, { file, random = () => randomInt(1000000) / 1000000,
  flushTimeoutMs = 5000 } = {}) {
  let runs = [];
  if (file) {
    try { runs = JSON.parse(await readFile(file, 'utf8')); if (!Array.isArray(runs)) throw Error('Invalid ledger'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // A restart cannot establish delivery for a previously running job. Preserve its
  // ID and partial totals, but do not replay events that may already be in LD.
  for (const run of runs) if (run.status === 'running') {
    run.status = 'interrupted'; run.delivery = 'unconfirmed';
    run.message = 'Server restarted during this run. Some events may have arrived. This run will not be replayed.';
  }
  let active = false;
  async function save() {
    if (!file) return;
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file + '.tmp', JSON.stringify(runs, null, 2), { mode: 0o600 });
    await rename(file + '.tmp', file);
  }
  await save();
  function snapshot() { return structuredClone(runs.slice(-10).reverse().map(run => ({
    ...run, busy: active && run.id === runs.at(-1)?.id
  }))); }
  async function execute(run) {
    try {
      for (let i = 0; i < run.settings.visitors; i++) {
        const context = { kind: 'multi',
          user: { key: `demo-sim-${run.id}-${i}`, anonymous: true, internalTester: false, synthetic: true },
          collection: { key: 'basketball', sport: 'basketball', season: 'in-season' } };
        const detail = await client.variationDetail('game-day-bundle', context, false);
        // An off flag or deterministic targeting is not experimental assignment.
        // The detail call itself records the evaluation; emit no order if ineligible.
        if (typeof detail.value !== 'boolean' || detail.reason?.kind !== 'FALLTHROUGH' || detail.reason?.inExperiment !== true) {
          run.status = 'stopped';
          run.message = 'Stopped: LD did not include this visitor in the default-rule experiment. Check the flag, running experiment and audience. Earlier events remain in LD.';
          break;
        }
        const group = run.groups[detail.value ? 'on' : 'off'];
        group.visitors++;
        run.processed++;
        const order = simulateOrder(detail.value, run.settings, random);
        if (order) {
          const data = { demo: true, synthetic: true, generator: 'sideline-traffic-v1', runId: run.id,
            orderId: `SIM-${randomUUID()}`, itemCount: order.pieces, savings: order.savingsCents / 100,
            twoItemBundles: order.bundleSize === 2 ? 1 : 0, threeItemBundles: order.bundleSize === 3 ? 1 : 0 };
          client.track('demo-order-placed', context, data, order.totalCents / 100);
          if (order.bundleSize) client.track(`demo-${order.bundleSize === 2 ? 'two' : 'three'}-item-bundle-purchased`, context, data);
          group.orders++; group.revenueCents += order.totalCents;
          if (order.bundleSize) group.bundles++;
        }
        if (run.processed % 50 === 0) await save();
      }
      let timeout;
      try {
        await Promise.race([client.flush(), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Error('Delivery unconfirmed')), flushTimeoutMs);
        })]);
        run.delivery = 'confirmed';
      } catch { run.delivery = 'unconfirmed'; }
      finally { clearTimeout(timeout); }
      if (run.status === 'running') {
        run.status = 'complete';
        run.message = run.delivery === 'confirmed'
          ? 'SDK event delivery confirmed. LD analysis updates separately. This is synthetic traffic, not evidence of customer demand.'
          : 'Generated events, but delivery was not confirmed. Check LD before starting more traffic. This run will not be replayed.';
      }
    } catch {
      run.status = 'failed'; run.delivery = 'unconfirmed';
      run.message = 'Run interrupted. Some events may have arrived. Check the connection and LD results; this run will not be replayed.';
    } finally {
      run.finishedAt = new Date().toISOString();
      try { await save(); } catch { run.message += ' Saving the final local summary failed.'; }
      active = false;
    }
  }
  return {
    list: snapshot,
    async start(input) {
      const settings = validateRun(input);
      if (active) throw fail('A traffic run is already in progress. Refresh its status.', 409);
      const existing = runs.find(run => run.id === settings.runId);
      if (existing) return structuredClone(existing);
      if (!client.initialized()) throw fail('LaunchDarkly is not initialized.', 503);
      const emptyGroup = () => ({ visitors: 0, orders: 0, revenueCents: 0, bundles: 0 });
      const run = { id: settings.runId, settings, startedAt: new Date().toISOString(),
        status: 'running', delivery: 'pending', processed: 0, groups: { off: emptyGroup(), on: emptyGroup() },
        message: 'Generating synthetic shoppers using actual LD assignments.' };
      active = true; runs.push(run);
      try { await save(); } catch (error) { runs.pop(); active = false; throw fail('Could not save run identity; no traffic generated.', 503); }
      // The server owns the job; navigating away does not cancel or duplicate it.
      void execute(run);
      return structuredClone(run);
    }
  };
}
module.exports = { validateRun, simulateOrder, createTrafficGenerator };
