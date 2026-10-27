# Demo readiness and original AI editorial engine — PR #15

Based on merged #14 (`3697e95`). Phase 1 was implemented and browser-verified before Phase 2. No migration, production D1 write, deployment, production setting change or paid Meta call is part of this work. `MAGAZINE_AI_ENABLED=false`, `CATALOG_OPERATOR_ENABLED=false`, D1 publication rights, inference ceilings and SAM controls are unchanged.

## Acceptance report

| Requirement | Demonstrated result |
| --- | --- |
| One primary reader | One composer and one personal edition; duplicate legacy generator, catalog feed and sample reader removed from the public page |
| Different readers | Focused paper/quiet-room home edition versus Surprise Me woodland/travel edition: different selection, cover, layout sequence and narrative rhythm |
| Desktop / mobile | Complete journey tested at 1280px and 390px, with keyboard, reduced motion and responsive bounds |
| Story and curiosity | Separate publisher record, sourced historical context and interpretation; theme discovery, related-story navigation, focus/scroll reset and original AI-directed story threads |
| Collect | Images/story bookmarks, named collections, moving/removing items, browser reload/revisit and session-only fallback when storage is unavailable |
| AI disabled | Fully local deterministic editions, stories, curiosity and collection remain usable with API unavailable or inference disabled |
| Rights / facts | All 33 real candidates remain private; six authorized fictional illustrations remain the demo. Current D1 eligibility plus exact compiled publication registry still gate any real result |
| Original AI | Original title/headlines/deck/narratives/connections accepted and rendered using mocked provider responses; no fixed paragraph selection in the new planner |
| Live Meta | Prepared, **not executed**; model schema acceptance, live token usage, latency and actual cost remain unverified |
| Production review | **Blocked/unverified**: workspace proxy rejected the supplied host's CONNECT tunnel with HTTP 403; web connector also could not access it. Local screenshots are not labeled production evidence |

Primary typography and composition use local/system fonts, avoiding Google Fonts requests. The landing collage uses the existing authorized illustrations. Images, hotspots and their containing art move together; reduced motion preserves centering/alignment. Author identity and attribution remain outside imagery. Edition styling follows the composed edition, not subsequent preference edits. Story sections, presets, buttons and collection cards have clearer hierarchy and usable touch targets.

Legacy components are retained only for regression testing through `tests/browser/legacy.html`, not imported by the public App. Removed legacy generator UI tests were replaced by primary-composer mix/aesthetic, consent, offline, duplicate-request and unsafe-response tests. Existing backend/SAM/security and image/component browser regressions continue to run.

## What original generation means here

Muse Spark **1.3 Standard** writes new prose and chooses a connected sequence of eligible assets, layouts and motion. It is no longer restricted to selecting complete authored sentences. The same original-output validation runs on the server and in the browser.

Original language is deliberately bounded to a human-audited visual vocabulary, with one or two hypothetical sentences beginning “Imagine”, “Consider”, “Perhaps” or “What if”. It supports novel combinations and visual metaphors, not unrestricted world knowledge. ASCII/plain-text, word/sentence/length bounds and vocabulary checks reject proper names, URLs, numeric claims, material/manufacturing/geographical/historical assertions and executable content. A subjective label alone does not authorize an unsupported claim. Unsupported output is rejected wholesale and the authored edition is used; no second review-model call or automatic retry occurs.

Strict Zod schemas bind exact eligible catalog/asset pairs and aesthetic tags. Runtime checks require unique prose, positive category weights, a dominant category leading when weighted at least 60%, active-category coverage in Balanced mode, at most three Focused features, varied layouts and a thematic link from every feature to the next. Connections may refer only to selected approved assets. AI never supplies citations, factual publisher records, image URLs, coordinates, HTML, CSS or executable animations. Existing reviewed factual/source sections remain separate from the new hypothetical editorial readings.

All runtime inference remains fixed to `https://api.meta.ai/v1/chat/completions`, model `muse-spark-1.3`. The planner uses public reviewed metadata only: no image pixels, private D1 candidates, credentials or operator records. No analysis/edit permission is inferred from display rights. Theme exploration requests explicitly use consent false and cannot trigger extra paid generation.

## Cost, cache and measurement

Every uncached consented generation still reserves one unit through the existing globally named SQLite Durable Object: 60-second cooldown, 3/IP/hour, 20/day and unchanged configured lifetime ceiling (20). There are no refunds, hidden retries or provider fallbacks. A blocked budget returns a usable authored edition. Cache is bounded to 30 plans / five minutes per isolate, keyed by preferences, current public pool and both editorial/language specification versions. Current D1 eligibility is rechecked before a cache hit is used; every cached plan is revalidated.

Responses expose safe accounting only: attempted call, reserved units, measured provider round-trip/validation latency, and validated provider input/output/total/cached-input token counts when available. Rejected prose retains valid token accounting and a charged reservation. Missing/invalid usage remains unknown, never a fabricated zero. Application plan-cache hits have zero new reservations; provider prefix-cache tokens are a separate pricing input.

Two fresh comparison editions would require **at most two Muse calls**, capped at **4,400 completion tokens total**, plus actual input tokens. No price or hackathon credit is assumed. Monetary estimates require operator-supplied, account-verified input/cached-input/output rates. Meta billing records remain authoritative. The existing schema/provider contract and lexical acceptance rate require the separately approved live test described below.

## Evidence and checks

Local evidence in `docs/evidence` shows the primary landing page, both authored editions, mobile story and explicitly **mocked** original-response rendering. Full desktop/mobile screenshots are uploaded by ordinary CI. Fixtures demonstrate validation/rendering and are not claimed as genuine live Meta output.

Checks: installation, TypeScript, scoped ESLint, unit/security tests, production build, Wrangler dry-run, combined workerd/D1/DO integration and Chromium. CI covers original-prose rejection, approved selection, narrative graph, consent, measurement on rejection, caching, budget denial and redirect destinations. The offline live-runner tests cover production-target rejection, approval interlock, cost arithmetic, missing usage, two-request limit, failure stop and private evidence permissions. Production review is intentionally separate from CI and cannot silently enable inference.

## Read-only production review

Supplied target: `https://curio.shuang-han807.workers.dev/`. The actual failed attempt is recorded in [production-review-status.json](evidence/production-review-status.json). The restriction is the development network, not a verified application failure. No production screenshot was obtained.

When the host is accessible, run:

```sh
npm ci
npx playwright install chromium
npm run review:production
```

For a system Chromium, prefix `CHROMIUM_PATH=/usr/bin/chromium`. The script permits only that supplied HTTPS homepage, blocks every API/non-GET request and third-party request, preserves normal TLS verification and the configured proxy, and saves frontend-only desktop/mobile screenshots plus a status record under ignored `test-results/production`. It never clicks generation or changes settings. Run after normal browser tests, which clear `test-results`. Review actual production typography/assets separately from local screenshots. Production version differences are expected until an explicitly approved deployment.

## Controlled live validation — prepare now, execute only after approval

The mechanical flag below is an interlock, **not** a substitute for explicit owner approval. No live commands in this section were executed during implementation. No production flags need to change.

1. Obtain approval for exactly these two profiles, the selected Meta model, two maximum calls, 2,200 output tokens/call and account-verified pricing. Confirm the account/model is eligible and funded/credited; do not assume free access. Confirm the publication and analysis boundaries: only fictional catalog metadata, no image analysis/SAM.
2. Use an isolated local checkout/server. Keep the key server-side in ignored `.dev.vars` with mode 0600; do not put it in Vite variables, browser storage, the recorder environment or a GitHub artifact. Include only `META_API_KEY` and a local `RATE_LIMIT_SALT` of at least 32 characters. Do not copy production budget state, production credentials or database contents.
3. Prepare a fresh private evidence/state directory outside Git and build:

```sh
umask 077
export CURIO_LIVE_ROOT="$(mktemp -d /tmp/curio-editorial-validation-XXXXXX)"
export CURIO_LIVE_EVIDENCE_DIR="$CURIO_LIVE_ROOT/evidence"
npm ci
npm run build
npm run validate:editorial
```

The final command above is a **zero-network dry run**. Inspect its profiles before any approval-enabled execution. In another terminal, start an isolated local Worker, reusing the printed `CURIO_LIVE_ROOT` path securely:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 18788 \
  --persist-to "$CURIO_LIVE_ROOT/state" \
  --var MAGAZINE_AI_ENABLED:true --var MAGAZINE_MAX_CALLS:2 \
  --var CATALOG_OPERATOR_ENABLED:false \
  --var PUBLIC_APP_ORIGIN:https://curio.test
```

This is a local-only override after approval; it does not edit `wrangler.jsonc` or production. No local/remote migration or seed is needed: an empty local D1 falls back to authorized illustrations. SAM remains disabled. A fresh local lifetime ceiling of two bounds the entire test. Do not run another generator concurrently.

4. In the recorder terminal, enter the verified rates (USD per million tokens; record their source/date privately):

```sh
read -r -p 'Verified input rate: ' CURIO_META_INPUT_USD_PER_MTOK
read -r -p 'Verified cached-input rate: ' CURIO_META_CACHED_INPUT_USD_PER_MTOK
read -r -p 'Verified output rate: ' CURIO_META_OUTPUT_USD_PER_MTOK
export CURIO_META_INPUT_USD_PER_MTOK CURIO_META_CACHED_INPUT_USD_PER_MTOK CURIO_META_OUTPUT_USD_PER_MTOK
CURIO_LIVE_APPROVAL=two-original-editorial-editions \
  npm run --silent validate:editorial -- --execute \
  > "$CURIO_LIVE_ROOT/report.json" 2> "$CURIO_LIVE_ROOT/error.log"
```

The recorder targets only `http://127.0.0.1:18788`, sends no provider key, caps requests at two, waits 61 seconds between them, and never retries. It creates owner-only response files in a new empty private directory outside Git: `focused-home.json` and `surprise-travel.json`. A cache hit, rejected/disabled result, unavailable budget or missing/unpriceable usage stops the test before another request. If transport fails or evidence cannot be written, stop and inspect local errors plus Meta billing before considering a new approval. Never erase counters and retry automatically.

5. Review `report.json`: server-validated response status, actual input/output/total/cache-token accounting, provider latency, client round trip, reservations, failure reason, selection/layout/motion sequence, connection count and a differentiated-pair result. Estimated USD = `(uncached_input × input_rate + cached_input × cached_rate + output × output_rate) / 1,000,000`. If cached counts are missing and cached/normal rates differ, cost is unknown and the test stops. Compare the estimate with the account's authoritative usage/billing. Failed responses can still incur charges.
6. Replay the captured responses for visual evaluation **without more model calls**. Stop the live Worker first, keep the evidence private, and run:

```sh
npm run build
CURIO_REPLAY_DIR="$CURIO_LIVE_EVIDENCE_DIR" npm run test:browser -- \
  tests/editorial.spec.ts -g 'original AI'
```

The browser tests intercept the editorial API and replay only the two captured local responses. They revalidate current asset/copy policies in the actual UI and exercise the connected story thread. Screenshot filenames use `mock-original-*` because the transport is replayed; annotate the provenance as a private replay of the two approved live captures when evaluating it. Do not publish raw responses, prompts or billing evidence automatically. No scheduled refresh, production deployment or operator enablement is implied. Stop the local server and protect/delete the private evidence according to the owner's needs.

## Remaining limits

Production desktop/mobile review is blocked by network access. Real API schema acceptance, latency, token counts, pricing and prose rejection rate are unverified until the approved two-call test. The generative lexicon is English and intentionally excludes factual world knowledge; unusual interests may fall back safely rather than yielding unrestricted prose. The catalog is still six fictional images; real-brand histories, imagery and SAM exploration require independent approval/permissions. Collections bookmark the current reviewed story rather than persisting generated transcripts. No account, checkout, sharing, Vectorize resource or new infrastructure is introduced.

### Checked local snapshots

- [Desktop landing](evidence/demo-landing-desktop.png) / [mobile landing](evidence/demo-landing-mobile.png)
- [Focused home, desktop](evidence/editorial-home.png) / [mobile](evidence/editorial-home-mobile.png)
- [Surprise travel, desktop](evidence/editorial-travel.png) / [mobile](evidence/editorial-travel-mobile.png)
- [Mobile story and sources](evidence/editorial-story-mobile.png)
- [Mock original home response](evidence/mock-original-home.png) / [mock original travel response](evidence/mock-original-travel.png)

These are local browser captures, not production or paid-live evidence. Installation, scoped lint/typecheck, production build, Worker compatibility and combined integration passed. The final hosted CI records the complete unit/security and browser results, including output-truncation accounting and missing-Origin rejection. All 18 Chromium cases passed locally, with the five primary-reader cases rerun after final visual adjustments. Production dependency audit: zero vulnerabilities. Private-capture/replay was additionally exercised using fixture data and zero calls to a model provider. All model responses used for development remain mocked.
