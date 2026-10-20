// The simulator controls behavior, never flag assignment or LD result statistics.
const trafficForm = document.querySelector('#traffic-form');
const trafficStatus = document.querySelector('#traffic-status');
let trafficSubmitting = false;
let trafficPoll;
const trafficMoney = cents => cents === null ? '—' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(cents / 100);
const trafficPercent = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
function trafficSettings() {
  return { visitors: Number(document.querySelector('#traffic-visitors').value),
    controlConversion: Number(document.querySelector('#traffic-control').value),
    bundleConversion: Number(document.querySelector('#traffic-treatment').value),
    bundleAdoption: Number(document.querySelector('#traffic-adoption').value) };
}
function showTrafficAssumptions() {
  for (const name of ['control', 'treatment', 'adoption']) {
    document.querySelector(`#traffic-${name}-value`).textContent = `${document.querySelector(`#traffic-${name}`).value}%`;
  }
  document.querySelector('#traffic-assumptions').textContent = 'Starting scenario: single-item buyers choose evenly from the jersey, cap and hoodie. Bundle buyers choose evenly from the three two-item sets and the three-item set. Actual counts and averages vary by run.';
}
function renderTraffic(runs) {
  const run = runs[0];
  const running = runs.some(item => item.busy || item.status === 'running');
  document.querySelector('#generate-traffic').disabled = trafficSubmitting || running;
  document.querySelector('#traffic-result').hidden = !run;
  trafficStatus.textContent = run ? `${run.status.toUpperCase()} · ${run.processed} of ${run.settings.visitors} eligible visitors processed. ${run.message}` : 'Ready. No synthetic runs yet.';
  if (run) {
    document.querySelector('#traffic-run-label').textContent = `${new Date(run.startedAt).toLocaleString()} · Run ${run.id}. Assumptions: ${run.settings.controlConversion}% off / ${run.settings.bundleConversion}% on purchase probability; ${run.settings.bundleAdoption}% bundle adoption among on buyers.`;
    const groups = Object.fromEntries(['off','on'].map(key => {
      const group = run.groups[key];
      return [key, {...group, aov: group.orders ? group.revenueCents / group.orders : null,
        conversion: group.visitors ? group.orders / group.visitors : null}];
    }));
    const body = document.querySelector('#traffic-metrics');
    body.replaceChildren();
    for (const [label, key, format = value => String(value)] of [
      ['Eligible visitors','visitors'], ['Purchases','orders'], ['Bundle purchases','bundles'],
      ['Revenue','revenueCents',trafficMoney], ['Average order value','aov',trafficMoney], ['Order conversion','conversion',trafficPercent]
    ]) {
      const row = document.createElement('tr');
      const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = label; row.append(heading);
      for (const group of ['off','on']) { const cell = document.createElement('td'); cell.textContent = format(groups[group][key]); row.append(cell); }
      body.append(row);
    }
    const lift = groups.off.aov > 0 && groups.on.aov !== null ? (groups.on.aov - groups.off.aov) / groups.off.aov : null;
    const conversionDifference = groups.off.conversion !== null && groups.on.conversion !== null
      ? ((groups.on.conversion - groups.off.conversion) * 100).toFixed(1) : null;
    document.querySelector('#traffic-lift').textContent = `Observed AOV change: ${trafficPercent(lift)}. Conversion change: ${conversionDifference === null ? '—' : conversionDifference + ' percentage points'}. Simulated outcomes; no winner is declared here.`;
    document.querySelector('#traffic-delivery').textContent = `Event delivery: ${run.delivery}. The LD results page processes and analyzes events separately.`;
  }
  const history = document.querySelector('#traffic-history'); history.replaceChildren();
  for (const item of runs) {
    const entry = document.createElement('li');
    entry.textContent = `${new Date(item.startedAt).toLocaleString()} · ${item.processed} visitors · ${item.status} · delivery ${item.delivery} · ${item.id}`;
    history.append(entry);
  }
  clearTimeout(trafficPoll);
  if (running) trafficPoll = setTimeout(refreshTraffic, 1500);
}
async function refreshTraffic() {
  clearTimeout(trafficPoll);
  try {
    const response = await fetch('/api/demo-traffic');
    if (!response.ok) throw Error('Unavailable');
    renderTraffic((await response.json()).runs);
  } catch {
    document.querySelector('#generate-traffic').disabled = true;
    trafficStatus.textContent = 'Traffic status unavailable. Start the Node server and refresh traffic status. Do not repeat a run whose delivery is uncertain.';
  }
}
trafficForm.addEventListener('input', showTrafficAssumptions);
trafficForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (trafficSubmitting) return;
  trafficSubmitting = true;
  document.querySelector('#generate-traffic').disabled = true;
  trafficStatus.textContent = 'Starting a synthetic run…';
  try {
    const response = await fetch('/api/demo-traffic', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({runId:crypto.randomUUID(), ...trafficSettings()})});
    const body = await response.json();
    if (!response.ok) throw Error(body.error || 'Unable to start run.');
    trafficSubmitting = false;
    await refreshTraffic();
  } catch (error) {
    trafficSubmitting = false;
    trafficStatus.textContent = `${error.message} Refresh traffic status before starting another run; the server may still be processing it.`;
    // A failed response is not permission to replay events with a new identity.
  }
});
document.querySelector('#refresh-traffic').addEventListener('click', refreshTraffic);
showTrafficAssumptions();
refreshTraffic();
