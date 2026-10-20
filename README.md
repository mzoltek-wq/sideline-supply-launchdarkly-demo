# Sideline Supply

A fictional sports apparel store built with plain HTML, CSS, and JavaScript. This is a LaunchDarkly interview exercise built as a guided learning project. Release, targeting, remediation, a running experiment, and real AI configuration selection are implemented. Experiment data is synthetic and support responses are scripted. This README covers setup, application use, LaunchDarkly configuration, and verification. An additional integration remains a future extension.

## Run locally

Requirements: Node.js 22 or newer, npm, a modern browser, and an internet connection to LaunchDarkly. Use an LD account with access to Experimentation and AI Configs to reproduce those portions. No frontend build is required. The app runs locally; publishing this repository does not host the website.

Create a private file at `~/.config/sideline-supply/test.env` outside this project, containing your own environment's server SDK key and AI config key:

```dotenv
LAUNCHDARKLY_SDK_KEY=your-server-sdk-key
LAUNCHDARKLY_AI_CONFIG_KEY=sideline-support
```

Keep its directory private and file permissions restricted (700 and 600 respectively). These values can alternatively be provided through environment variables; `SIDELINE_ENV_FILE` overrides the default file location. Never put the server SDK key in `config.js` or commit it. The browser client-side ID in `config.js` should belong to the same environment.

Clone the public repository and open its folder:

```sh
git clone https://github.com/mzoltek-wq/sideline-supply-launchdarkly-demo.git
cd sideline-supply-launchdarkly-demo
```

Alternatively, download the repository and open a terminal in the folder containing `package.json`. Recreate the LD resources described below using your own environment, update `clientSideId` in `config.js`, and supply the matching private server SDK key. The checked-in client-side ID is public but points to the original demo environment; do not mix it with your own environment's server key.

From this folder:

```sh
npm ci
npm start
```

Open http://127.0.0.1:5173. Stop with Ctrl+C. This replaces the earlier Python static server: the support form now needs the Node endpoint. The server binds only to localhost and serves an explicit list of public assets. Server source, environment files and dependencies are not web-accessible. `PORT` can override 5173, but browser storage is separate for different ports.

## Explore

After completing setup, open [the storefront](http://127.0.0.1:5173/). No storefront account or password is needed. The expected flag/model behavior below assumes the documented LD configuration has been recreated and the app is connected to that environment.

| What to open | Where to find it |
| --- | --- |
| Demo shoppers | **Guest**, **Maya · Internal tester**, and **Jordan · Customer** buttons in the bar at the very top of the store |
| Collections | **Basketball**, **Baseball**, and **Football** buttons above the products |
| Shopping bag | **Bag** button in the store header |
| Bundle builder | **Start a bundle** below the products, or **Start a bundle with this item** on a product, when the flag returns true |
| Dashboard and traffic generator | **Demo dashboard** link in the store header; opens `dashboard.html` in a new tab |
| Support demonstration | **Sideline support** section below the products and bundle area on the main page |
| SDK status and context | **Your demo, under the hood** near the bottom; expand **View current demo data** |
| Receipts, fresh visitors, and local reset | Expand **Demo orders & reset controls** near the bottom |
| LaunchDarkly experiment | **Open LD experiment** in the dashboard traffic panel; requires access to the relevant LD account |

The dashboard is also linked inside **Demo orders & reset controls**. Its **Back to store** link returns to the main page. On a different port, use the same paths on that port. The LD experiment link points to the original demo's project/environment/resource keys; reviewers using different keys should open their own experiment instead.

1. **Choose a demo shopper.** Click **Maya · Internal tester** at the top. The header should say **Shopping as Maya**. With flag targeting on and her individual target configured, Maya sees bundle offers for all collections. **Jordan · Customer** and **Guest** demonstrate other audiences. These buttons select demo identities, not real authenticated accounts.

2. **Inspect targeting.** Switch to **Jordan**, then **Baseball**. The fixed `off-season` attribute matches the seasonal rule and enables bundles. On Basketball or Football, Jordan and Guest reach the experiment's default rule, so either may receive true or false. They are not guaranteed control users. Expand **View current demo data** to inspect the shopper key and collection attributes. The nearby SDK status reports whether the bundle is visible, hidden, loading, or unavailable. If targeting is off in LD, the off variation hides new offers even for Maya.

3. **Try a bundle and edit the bag.** Use Maya with targeting on, choose a sport, and click **Start a bundle with this item**. Select one additional item for a two-item set with 5% off, or select all three for 10% off. A new bundle cannot be added with fewer than two items. Confirm to add it to the bag. Canceling leaves the bag unchanged. In the bag, change quantities, remove components or items, or empty it. A jersey plus cap costs $87.40 after the discount; all three products cost $153.00. You can also add a single item first and use **Build a bundle from this item** in the bag.

4. **Place a simulated order.** Click **Place demo order** in the bag. It creates a receipt, clears that shopper's purchased bag, and attempts to send demo order events to LD. No payment is taken. Expand **Demo orders & reset controls** to review receipts and the event delivery status. A shopper who adds items but does not click **Place demo order** has not purchased; do not submit a zero-dollar order to represent a nonbuyer.

5. **Open the dashboard.** Click **Demo dashboard** in the store header. At the top is the synthetic traffic generator and its latest run. Below it are manual shopping observations from this browser, including AOV, conversion, cart completion and recent order attribution. Keep the original store tab open to preserve its in-memory bags. Use the same browser and origin for manual shopping and its dashboard; Chrome and the Codex sidebar do not share local storage. Synthetic run summaries come from the backend and can be viewed in either browser connected to that same server.

6. **Review or generate synthetic traffic.** Existing run results can be reviewed without sending anything else. To create another batch, make sure the LD experiment is running, choose the visitor count and shopping probabilities, then click **Generate traffic in LaunchDarkly** once. Each run creates additional anonymous visitors and sends events to the configured LD environment. **Refresh traffic status** only reads status. The generator stops if LD does not include a visitor in the default-rule experiment. Run totals are synthetic observations; use **Open LD experiment** to review exposure ingestion and statistical results after processing. Local reset cannot undo sent events.

7. **Try AI configuration selection.** Return to the main store and scroll to **Sideline support**. Select **My order hasn't arrived** and click **Preview support request**. The documented setup returns `order-help` and `gpt-4.1-mini`. Select **Warranty or damaged item** and submit again to see `warranty-help` and `gpt-5-mini`. Expand **View resolved prompt** to inspect the prompt returned by LD. The order reference and note are optional and stay in the page. Model selection is real; the answer is scripted. There are no model calls, uploads, real cancellations, or claims submitted. With LD editing access, save a model or prompt change and submit a new request after the SDK receives the update to demonstrate runtime control.

8. **Create a fresh visitor or reset local activity.** Expand **Demo orders & reset controls**. **New demo visitor** switches to Guest with a fresh anonymous key and clears the Guest bag. It does not guarantee a different flag variation and does not erase earlier observations. **Reset local demo** opens a confirmation dialog, then clears local bags, receipts, manual dashboard observations and the support preview. It returns the page to Guest and Basketball. It does not clear generator run history, delete LD events, or change flags, experiment settings, or AI Configs.

Bags are stored only in the current page session and disappear on reload. The latest 100 receipts and manual dashboard observations persist locally until reset. Generator summaries are stored separately by the Node server. The fixed `demo-guest` key is a demonstration shortcut, not a production anonymous identity strategy.

Basketball and Football are marked in season, and Baseball off season, solely for repeatable scenarios. These values do not reflect a live sports calendar. Products and teams are fictional, product sizes are fixed demo values, checkout is simulated, and there is no payment, remote order database, or real fulfillment.

## Learn the files

- `index.html`: page structure, profile buttons, sport buttons, and bag dialog.
- `styles.css`: visual design and mobile layout.
- `commerce.js`: catalog and integer-cent pricing functions.
- `app.js`: profiles, state, rendering, bundle editing, demo orders, and reset controls.
- `support.js`: per-request configuration display and scripted responses.
- `server.cjs` / `support-config.cjs`: local HTTP server, private SDK initialization and AI configuration evaluation.
- `insights.js`: local exposure, cart-start and order observations with comparison calculations.
- `dashboard.html` / `dashboard.js`: separate local demo dashboard; no flag mutation or LD experiment-result API.
- `traffic.js` / `traffic.cjs`: dashboard controls and backend synthetic traffic generation, using actual LD assignments.
- `config.js`: public client-side environment ID and the flag key.
- `launchdarkly.js`: initializes the SDK, evaluates the flag, listens for changes, and updates the context.
- `vendor/`: pinned SDK version 3.9.6, license, and provenance.

## First LaunchDarkly connection

1. In your own LaunchDarkly project, create a Boolean flag with the exact key `game-day-bundle` and make it available to SDKs using client-side IDs.
2. For the environment you will connect to, set the off variation to `false` and the default rule (when targeting is on) to `true`. Initially leave targeting off with no individual targets or custom rules.
3. Replace `clientSideId` in `config.js` with that environment's **public client-side ID**. The current value is the owner's demo ID, not a server-side SDK key. You do not need access to the owner's account to run this with your own environment.
4. Run the application and check **Your demo, under the hood**. A successful evaluation reports `game-day-bundle = false`. A missing flag or unavailable SDK has a separate diagnostic message.
5. Turn targeting on and save in that same environment. The **Build Your Game-Day Bundle** component should appear without a page reload. Turning targeting off and saving should hide it.

A bundle is assembled in a popup before anything is added to the bag. Product-specific buttons preselect that item; the main Start a bundle button opens an empty selection. Choose **two or three distinct product types from the same sport**. A zero- or one-item selection cannot be committed. When starting from an existing cart item, that product is included and locked; one unit is moved into the set only on confirmation. Cancel or Escape leaves the bag unchanged. A live flag-off closes and discards the unfinished selection. Any two items get 5% off their combined regular price; all three get 10% off. The percentage applies to the whole set, not just the added item. Examples:

| Selection | Regular | Discount | Total |
| --- | ---: | ---: | ---: |
| Jersey only | $64.00 | $0.00 | $64.00 |
| Jersey + cap | $92.00 | $4.60 (5%) | $87.40 |
| Cap + hoodie | $106.00 | $5.30 (5%) | $100.70 |
| Jersey + hoodie | $142.00 | $7.10 (5%) | $134.90 |
| Jersey + cap + hoodie | $170.00 | $17.00 (10%) | $153.00 |

Calculations round the per-set discount to whole cents. Bundles are separate bag lines from singles; singles remain full price. Starting from a cart item moves one unit into a new set (it does not charge twice). Quantity controls change the number of complete sets. Editing components updates every copy of that set. Removing components recomputes the discount; removing the last component removes the set. The badge counts physical pieces. Existing sets may still be reduced to one full-price item using the bag removal controls; the two-item minimum applies when creating a new bundle in the popup.

The flag controls new bundle offers on the storefront and in the bag. Cart offers apply to the currently selected sport; return to a set's sport to add more components. Turning the flag off removes new offers, while existing sets retain their tier prices and remain editable and purchasable in this demo. This is a promotional rollout flag, not a backend payment kill switch. A production checkout needs server-side validation and a deliberate policy for in-progress carts.

The application supplies a multi-context with `user` and `collection` kinds. Shopper or collection changes call `identify()` to obtain new values. The bundle is hidden while context updates are pending, and changes are queued to avoid stale audience decisions during rapid clicks. If startup fails or the flag is missing, the fallback is `false`. A streaming connection failure after initialization can retain previously received flag data; a fallback is not an automatic network-outage kill switch.

## Targeting and remediation demonstrated

In Test, targeting was configured with this order:

1. Individual `user` target `demo-maya` serves `true`.
2. A custom rule matches context kind `collection`, attribute `season`, value `off-season`, and serves `true`.
3. Initially the default rule served `false`; it now runs the 50/50 experiment described below. The off variation remains `false`.

With targeting on, Maya sees the feature for every collection. Baseball matches the off-season rule for all shoppers. Other eligible shoppers on in-season collections reach the randomized default rule. A Generic flag trigger with action **turn targeting off** was created for Test and manually invoked successfully. The URL is private and is intentionally absent from this project. A reviewer can create their own trigger and invoke it with a POST request; the existing change listener hides offers without a reload. These settings live in LaunchDarkly, not this repository.

## Demo sales and experimentation

Checkout creates an immutable local receipt, clears the purchased bag, and prevents duplicate submission of that bag. All prices and receipts are demo-only; no tax, shipping, payment, inventory, or fulfillment is modeled. Browser storage is not a trusted order database.

When the SDK's current context is ready and matches the shopper, checkout sends these custom events:

| Event key | When | Numeric metric value |
| --- | --- | --- |
| `demo-order-placed` | Once per completed demo order | Order amount after discounts, in USD |
| `demo-two-item-bundle-purchased` | Once per order containing a two-item set | None; conversion event |
| `demo-three-item-bundle-purchased` | Once per order containing a three-item set | None; conversion event |

Event data includes `demo: true`, an order ID, physical item count, savings, and quantities of two- and three-item sets. `track()` captures the shopper context synchronously. `flush()` requests delivery; a bounded wait keeps checkout responsive if analytics is unavailable. Receipts distinguish local-only orders from delivery results. If identification is pending or failed, the order stays local rather than being attributed to a previous shopper. There is no replay/retry button that could duplicate an event.

To reproduce the experiment in your environment:

1. Create a LaunchDarkly-hosted custom numeric metric named **Average order value per purchasing shopper**, key `average-order-value-per-purchasing-shopper`, using event key `demo-order-placed`. Set context kind to `user`, average event values within each user and then average across users, unit USD, higher is better, and exclude users without events. Use no metric measurement window for this demo.
2. Create **Order conversion**, key `order-conversion`, as a custom conversion metric using the same `demo-order-placed` event. Measure the percentage of `user` contexts with an occurrence; higher is better. Nonbuyers must remain in the eligible denominator.
3. Create **Game-Day Bundle Impact**, key `game-day-bundle-impact`, on `game-day-bundle`. Use the default targeting rule and randomize by `user`. Include 100% of eligible default-rule traffic, split equally between false and true, with false as control. This is an A/B experiment, not A/A. Leave individual Maya and off-season targeting ahead of that default rule.
4. Select the order-value metric as primary and conversion as secondary. Use the hypothesis below. To match this demo, select frequentist sequential testing, significance level 0.05, two-sided analysis, Bonferroni correction across metrics, CUPED off, and no layer or stratification. Keep reshuffling disabled.
5. Save the design, turn flag targeting on, and start the experiment. Only then use fresh in-season visitors or the traffic generator. The generator checks that evaluations actually belong to the default-rule experiment and stops otherwise.
6. Review exposure ingestion, metric events, health checks and results in LD. The dashboard's LD link assumes project key `default` and environment key `test`; change it in `dashboard.html` or navigate manually if you use other keys. Do not toggle or retarget the flag while gathering a clean experiment batch.

**Game-Day Bundle Impact** (`game-day-bundle-impact`) is running in Test. Its default-rule audience is randomized by `user`, with 100% of eligible traffic split equally between false (control) and true. Individual Maya targeting and the off-season rule precede that rule, so they do not enter this experiment through the default rule.

The primary metric is **Average order value per purchasing shopper** (`average-order-value-per-purchasing-shopper`), using `demo-order-placed`: average event values within each user, then average across users, excluding users without orders. The secondary metric **Order conversion** (`order-conversion`) measures the percentage of users with that event. Both are higher-is-better metrics. The hypothesis is at least 10% relative AOV improvement without reducing conversion. A 10% business goal is not statistical significance; small synthetic samples cannot establish customer preference.

The local dashboard divides total revenue by orders. LD's configured per-shopper average differs when shoppers place different numbers of orders. For a simple demo, use one order per fresh visitor and explain the distinction. Revenue is not profit. The experiment uses frequentist sequential testing, a two-sided 5% significance level and Bonferroni correction across metrics. Check LD's results and health separately; event delivery does not mean results are ready or conclusive.

### Local dashboard

Open **Demo dashboard** in the store header. It opens a separate tab so the store's in-memory bag remains intact. Keep both tabs in the same browser and origin (including port); Chrome and the Codex sidebar do not share storage. The dashboard updates when store observations change and has a manual refresh button.

It shows bundle-on/off AOV, relative lift against the 10% business goal, observed shoppers, orders, revenue, order conversion, cart completion, and recent order attribution. Cart counts are shopper-level: someone who started a cart and has never purchased remains counted as yet to purchase. Separate cart sessions and time-based abandonment are not modeled.

Only an available Boolean SDK flag value counts as an observation; a loading or missing flag is not a control exposure. A shopper who sees both values is excluded from both groups, including their orders. Orders with unknown or mismatched attribution are excluded too. This deliberately conservative local rule helps illustrate contamination, but is not a reproduction of LaunchDarkly's analysis engine. Existing receipts are not backfilled. Observations persist separately from the latest-100 receipt list and reset with **Reset local demo**.

Individual and seasonal targeting remain deterministic; the experiment randomizes eligible default-rule traffic. These local numbers are descriptive, cannot establish causality, and never toggle the flag. Crossing +10% merely meets the illustrative business goal; the LaunchDarkly experiment analysis must also assess uncertainty and conversion.

**New demo visitor** gives Guest a fresh anonymous key and clears its bag. That makes repeatable manual synthetic visits possible; Maya and Jordan retain their stable keys. The new Guest key lasts until reload or reset. The dashboard also includes a synthetic traffic generator, described below. It never overrides LD assignment. An app reset only clears local data. Start a new LaunchDarkly experiment iteration for a fresh measurement window; historical analytics remains in LaunchDarkly.

## Synthetic traffic generator

The dashboard's **Give the experiment shoppers** panel sends actual experiment evaluations and synthetic purchase events to the LD environment configured by the private server SDK key. It uses the same `game-day-bundle` flag and metric event keys as the storefront. The generator runs in Node; it does not open hundreds of browsers or change the current shopper's bag.

The default scenario creates 600 fresh anonymous visitors, assumes a 30% purchase probability when the bundle is off and 45% when it is on, and assumes 70% of buyers with access choose a bundle. Controls expose these assumptions and permit 10–1,000 visitors per run. Singles are chosen evenly from the catalog; bundles evenly from the three pairs and the three-item set. All totals use `commerce.js`. There is at most one purchase per visitor, so per-purchasing-shopper and per-order averages agree within these runs. Nonbuyers still receive an evaluation but send no order event.

`traffic.cjs` calls `variationDetail()` with a fresh synthetic user and the in-season Basketball collection. It requires `reason.kind === 'FALLTHROUGH'` and `reason.inExperiment === true` before simulating a purchase. It stops if the flag is off, missing, or that audience is no longer allocated to the default-rule experiment. The SDK records the exposure; the generator uses the returned Boolean to choose a behavior probability. It never selects or overrides a variation. [LD evaluation reasons](https://launchdarkly.com/docs/eu-docs/sdk/concepts/evaluation-reasons).

Purchase data is labeled `demo: true`, `synthetic: true`, with a generator version and run ID. The backend persists run IDs and summaries at `~/.config/sideline-supply/traffic-runs.json`, outside the public project. A running job continues if the page closes. Duplicate run IDs do not replay events. Interrupted jobs remain recorded after a server restart; their delivery is uncertain and they are not replayed. One job runs at a time. An SDK flush confirmation indicates event delivery, not a completed experiment analysis. A delivery timeout does not automatically retry a run.

The panel shows the latest run and the ten most recent summaries, separate from manual browser observations. Local reset does not delete generator history or remote LD events. Refreshing the panel only reads status. The generator is a localhost demo tool, not a production admin console. Changing simulation assumptions affects new runs only; existing experiment data remains, so explain mixed assumptions or use a deliberately chosen new experiment iteration when appropriate.

**Verified first run:** October 19, 2026 at 5:02 PM ET, 600 eligible visitors, 307 off and 293 on. Off: 89 purchases, $56.04 AOV, 29.0% conversion. On: 122 purchases, $100.62 AOV, 41.6% conversion. SDK event delivery was confirmed. LD Exposures showed 604 total participants, confirming the 600 new visitors alongside the earlier four. Its Results view was still showing the older four-context analysis and insufficient data when last inspected. These figures demonstrate the intended scenario under explicitly favorable synthetic assumptions. They do not establish real customer demand or independently prove that the feature improves outcomes.

## Support with real LaunchDarkly AI configuration

The support form resolves `sideline-support` through `POST /api/support-config`. The browser sends the issue type and demo shopper context. The Node server validates these fields, evaluates the completion configuration with the LD AI SDK, and returns the model, variation key and resolved messages. **The note and order reference stay in the browser. No model provider is called.** Responses are clearly labeled scripts; there are no uploads, real cancellations or manufacturer messages.

Create a completion AI Config with key `sideline-support`, two variations and your own system prompts. The current demo configuration is:

| Request | Targeting | Variation | Selected model |
| --- | --- | --- | --- |
| Warranty / damaged item | `user.issueType` is `warranty` | `warranty-help` | `gpt-5-mini` |
| Delivery / cancellation | Default rule | `order-help` | `gpt-4.1-mini` |

For a matching configuration, create **Sideline Support** in completion mode. Add the two variations in the table, choose their models, and add a system message to each. The exact variation keys in the table are useful for matching the walkthrough; the application displays the actual keys returned by LD. In targeting, add a rule on context kind `user`, attribute `issueType`, value `warranty`, serving Warranty help. Set the default rule to Order help. Save the variations and targeting changes.

Suggested system message for **Order help**:

```text
You are Sideline Supply's order support assistant. Help with delayed deliveries and cancellation requests.
Ask for the order reference and missing details; do not ask again for information already supplied.
Never invent tracking information or a delivery date. Check order and fulfillment status before confirming an answer.
Obtain confirmation before requesting cancellation, and never claim an order was canceled unless a connected tool confirms success.
If tools are unavailable, explain the limitation and next step. Keep responses brief and friendly.
```

Suggested system message for **Warranty help**:

```text
You are Sideline Supply's warranty support assistant. Help customers report damaged or defective products.
Ask for missing order, product, purchase date and problem details.
Request a clear photo when supported. If upload is unavailable, continue with a written description.
Do not claim to have reviewed an image unless it was supplied and processed.
Do not promise coverage, a refund or replacement without a confirmed policy decision.
Do not claim a claim was submitted or routed unless a connected tool confirms success.
Be empathetic and concise, and ask only a few relevant questions at a time.
```

These example prompts reproduce the intended behaviors; model execution remains simulated. You can use your own prompts to demonstrate runtime updates. If your model catalog differs, select available models and update your expected results; there is no provider-specific mapping in the application code.

Turn the configuration on in the same environment as the server SDK key. Model names and prompts come from LD and are not hardcoded in the routing code. Submit a new support request to observe saved configuration changes after the server SDK receives them. The panel shows a snapshot for that request. A missing config, disabled config, or failed request shows an explicit state; failures clear earlier selections.

The backend uses `@launchdarkly/node-server-sdk` and the configuration-only `completionConfig()` API in `@launchdarkly/server-sdk-ai`. This is LD's [maintenance-mode Node AI SDK](https://launchdarkly.com/docs/sdk/ai/node-js-legacy), deliberately pinned for this small configuration-display exercise. A production inference implementation should review the current SDK before extending it. The tracker is read only for variation metadata; no synthetic token, latency or inference-success measurements are emitted.

The server SDK keeps configuration locally and receives updates from LaunchDarkly; each support submission evaluates against the server's available configuration. If connectivity drops after initialization, cached configuration may still be used. The demo exposes resolved prompts for learning; a production support interface would normally keep system prompts server-side and implement real authentication and order authorization.

## Checks

Run the checks:

```sh
npm test
```

Tests cover tier pricing, rounding, removal, mixed bags, same-sport enforcement, single-to-bundle conversion, duplicate checkout protection, immutable receipts, analytics context guards, new visitor identities, local reset, popup cancellation/minimum selection, and flag/context changes during selection. The original enabled-flow checks used an isolated mocked SDK fixture outside this deliverable. The later bundle-popup checks ran against the real SDK with Maya receiving true: zero/one-item submission was disabled, two/three-item totals matched, confirmation updated the bag, and canceling a cart upgrade preserved the original single. No LaunchDarkly settings were changed by the verification.

Twenty-three automated checks cover order-weighted AOV, unique-buyer conversion, mixed/unknown attribution exclusions, observation deduplication/reset, no-network support previews, clearing stale model selections after backend failure, backend input validation, disabled/fallback handling, private-file protection, synthetic pricing/probability boundaries, experiment eligibility, nonbuyer exposure, duplicate-run protection and unconfirmed delivery. Browser checks in Chrome verified a real flag-off $28 order and flag-on $87.40 bundle order, plus live dashboard updates for an unpurchased Jordan cart. These are intentionally synthetic examples, not experiment evidence.

## Still to work through together

- Review experiment ingestion and results; distinguish synthetic data from real evidence.
- Practice changing AI configuration in LD and inspecting the next support request.
- Choose and configure an integration.
- Rehearse the reviewer walkthrough using the steps in **Explore**.

Browser client-side IDs are public identifiers; never publish server-side SDK keys, API access tokens, model-provider credentials, or remediation trigger URLs.
