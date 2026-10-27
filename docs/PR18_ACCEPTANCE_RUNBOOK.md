# PR #18 — end-to-end QA and controlled live acceptance

Code-freeze target: **October 30, 2026 (Europe/Stockholm)**. Evaluation,
video/documentation and submission remain October 31–November 4. No account,
checkout, public-sharing or scheduled-refresh work is added.

## What is real, implemented, mocked or blocked

| Capability | Evidence/status |
| --- | --- |
| Muse text editorial integration | **Confirmed live previously:** Focused Home, 1,889 input / 1,357 output tokens, 6,124 ms; exact capture still passes offline. No new live call in this PR. |
| Surprise Travel historical result | Real response rejected safely; raw response was not retained. Original cause remains unknown. PR #16 sanitized diagnostics are preserved. |
| Personalized reader and visual discovery | Working desktop/mobile, keyboard, reduced-motion, story/citations, curiosity and browser-local Collect. Authored originals remain available with AI disabled. |
| Image input → Muse schema → D1 → editorial observations | Genuine request/processing code, tested end to end with **mocked transport**, including exact PNG bytes, persistence, cache and revocation. **No live image analysis yet.** |
| Original image candidate | Offline PNG conversion of Curio's own lamp drawing prepared; no model used. Test-only raster copy is in tests/fixtures, excluded from the production build. Exact-version display/analysis grants remain pending for a real test. |
| SAM API adapter | Implemented fixed Meta Responses API + official parser, bounded SSE and catalog-bound boxes. Matches the official cookbook's image-input contract. Account eligibility/availability is **unverified**. |
| SAM reader mapping | Validated current-version, permission-gated result-to-hotspot renderer; automated UI tests use a prominent **MOCK SAM RESULT REPLAY** banner. No real SAM detection is claimed. |
| Current public segmentation | Authored approximate boxes; mock demo, no measured masks or confidence. Public UI never carries operator credentials or automatically requests SAM. |
| Production verification | Read-only attempt blocked by the workspace proxy's HTTPS CONNECT 403, before application access. No successful production smoke/visual review is claimed. |

The public catalog still contains six original illustrations. **Zero of the 33
unverified third-party candidates are published.** No production D1 write,
migration, deployment or Cloudflare setting change occurred. Production config
in Git remains `MAGAZINE_AI_ENABLED=false`, `CATALOG_OPERATOR_ENABLED=false`.
Image/SAM allowlists are still empty; no analysis permission was invented.

## Prompt-first reader (included in this same milestone)

The public interface is one prominent natural-language input, three optional
inspiration prompts, an optional explicit Meta-consent checkbox and Generate.
Suggestions fill the input without submitting or acting as filters. There are no
category percentages, aesthetic selectors or editorial-mode controls. Refine
returns focus to the input; a new submission replaces the magazine, with no chat
history or conversational agent. Editing/suggesting a new prompt resets consent.

A shared, versioned prompt-to-intent layer runs locally and again on the Worker.
It accepts strict `{prompt, consent}`, trims/bounds the prompt to 1,000 characters,
and derives the existing validated category weights, aesthetic enums and mode.
It uses deterministic English theme/mood cues, including category exclusions,
plural/accent variants and majority emphasis. Unknown/broad prompts get a balanced
edition immediately; only an empty/invalid prompt or explicit exclusion of every
supported category needs correction. This is a bounded heuristic, **not a claim
of general multilingual AI understanding**. The original prompt is still supplied
as untrusted context to the single Muse editorial request, where semantic choices
remain constrained by current eligible assets and output safeguards.

No extra model call, inferred consent, executable model-generated UI, new model,
or stored conversation is introduced. Cache keys include intent version and
normalized preferences. Existing strict preference-shaped internal/operator
callers remain compatible, including the confirmed live Home fixture. Prompt
interpretation cannot grant asset rights. Offline editions use the same inferred
intent; changing the input alone does not change the already rendered edition.

## Changes that close integration gaps

- Existing classification can read a fixed, reviewed bundled PNG through ASSETS,
  with the same byte cap, dimensions, SHA-256 and independent permission checks.
  It cannot fetch arbitrary request URLs or substitute a fallback image.
- Original bundled records can join persisted observations to editorial planning
  through an exact server permit. External records retain the separate reviewed
  display-URL registry. D1 versions, fingerprints and grant evidence must agree.
- Classification reports attempted requests, consumed reservations, latency and
  validated provider usage. Cached/mock results consume zero new units. Missing
  usage is unknown, not zero. Rejected/truncated outputs retain valid accounting;
  error responses contain a fixed code, not rejected prose. A reservation remains
  consumed even if cancellation happens just before model invocation.
- Editorial responses identify selected public asset IDs for which eligible
  persisted Meta image context was supplied. This proves context availability and
  selection, **not causation** or a verified material/product claim. Human review
  must assess whether the narrative actually uses that context meaningfully.
- Generation focus now moves after the magazine commits to the DOM, fixing a
  mobile keyboard timing race. Small editorial labels meet tested normal-text
  contrast on both light and dark compositions.
- Reader selection and image readiness bind to the current asset version.
  Invalid/stale/revoked SAM results hide overlays and selected reveals immediately.
- Test concurrency is bounded to two workers. An initial broad run hit an
  intermittent D1 batch/import failure; the same suite passed in isolation. The
  bounded run retains every assertion and passed the complete suite.

## Executable local acceptance

```bash
npm ci
npm run accept:demo
```

This executes typecheck, lint, unit/security tests, build, Worker dry run,
Worker/D1/DO integration and Chromium in sequence, stopping on failure and writing
`test-results/acceptance.json`. It never invokes deployment, remote D1 or paid
inference. Install Chromium first with `npx playwright install --with-deps chromium`
on a normal machine, or set CHROMIUM_PATH to an installed Chromium. Set
XDG_CONFIG_HOME to a writable private directory if the managed home is read-only.

The browser suite covers the original successful Home replay, distinct editions,
complete visual-detail/story/Collect journey, reload persistence, touch sizes,
no horizontal overflow, keyboard/focus restoration, reduced motion, small-label contrast on paper/ink, failed images,
publication rights, mock SAM results and immediate rejection of revoked regions.
Performance evidence records local navigation/composition timing, zero external
requests and a <500,000-byte uncompressed JS build budget. These are **synthetic
local checks**, not production Core Web Vitals or a full WCAG audit. Test-only SAM
harnesses and PNG fixtures are absent from `dist`.

Manual demo sign-off (all must be checked on the actual presentation machine):

- [ ] Quiet rooms and Into the wild produce visibly different editions with AI off.
- [ ] Select a detail with touch or Enter; read the authored image-level context.
- [ ] Open the connected story; identify cited facts versus interpretation.
- [ ] Follow a curiosity branch; collect an image/story; reload and revisit Collect.
- [ ] Close the modal and press Escape; focus returns to the triggering control.
- [ ] Repeat at mobile width and with reduced motion, keyboard-only and 200% zoom.
- [ ] Read every visible provenance label accurately in the demo/video narration.
- [ ] Complete separately authorized live checks below, or explicitly mark them
      pending/simulated. Never narrate a mock as a real model result.

## Read-only production smoke and visual review

```bash
npm run smoke:production -- --execute
npm run review:production
```

Smoke issues exactly four credential-free GETs to the fixed production host:
health, magazine config, decoder config and catalog status. It rejects redirects,
uses curl's inherited proxy/CA trust, and never calls inference or reads D1 rows.
Expected values: health OK, magazine/decoder disabled and operator status 503
`catalog_unavailable`. A 503 establishes unavailable operator access, not by
itself the reason; inspect production's flag privately in the dashboard too.
The browser review blocks APIs/non-GETs/third-party origins. No paid requests.

This workspace could not establish the HTTPS tunnel. Evidence:
`docs/evidence/pr18-production-smoke.json`. Run the same checks from an allowed
machine; a network denial does not prove an application regression. Keep any
production screenshots clearly separate from committed local screenshots.

## Original raster review candidate — no permission or inference granted

```bash
umask 077
export CURIO_ORIGINAL_RASTER_DIR="$(mktemp -d /tmp/curio-original-review-XXXXXX)"
npm run prepare:original
```

Offline browser rasterization of the fixed, original home-lamp.svg creates a
1200×900 PNG and private JSON manifest outside Git. It publishes nothing to the
reader and grants no rights. A test-only copy is version-controlled for renderer
QA; no production code imports it. This run's fingerprints:

- Original SVG SHA-256: `8ed54f88ef7312fe8f3868578c66e01b5819fbf441b9317547d97b29cc1f05cf`
- Test PNG SHA-256: `10352b01344beaad3a6780216d9a6650a3d629bf95230380c45dd23b42bbfb0d`

The exact regenerated bytes may vary with renderer version; review the actual
manifest, do not reuse a different file's hash. Owner approval must identify the
exact bytes, creator/rights holder and independent display/AI-analysis purposes.
No editing right is inferred. A diagram or material-like appearance is not a
real product or material specification.

## Preflight for EACH live stage (none executed here)

Obtain explicit owner approval for **one named stage**, exact asset/version,
model, provider account/eligibility, current price and maximum spend. Acknowledging
a CLI variable is not a substitute for that approval. Keep credentials server-side
in ignored `.dev.vars` (mode 0600), not shell arguments or frontend/Vite variables.
Set provider-side spending controls first. There is no verified free credit,
account access or billable SAM rate in this environment.

After explicit exact-asset authorization, prepare a **local-only** reviewed patch:

1. Copy that approved PNG to one exact bundled `/catalog/*.png` path. Replace only
   the compiled home-lamp image version with a new stable raster asset ID and
   documented rights. Preserve the old v1 SVG and successful Home regression.
2. Add an exact `analysisMediaPermits[D1-version-id]` entry (stable catalog HTTPS
   URL, bundledPath, hash, dimensions, image/png and analysis evidence). Add a
   separate exact SAM permit only if the SAM stage is approved. No wildcard host.
3. Use existing local operator imports/reviews to record the original creator
   source (not an invented commercial brand), publisher metadata, current version,
   fingerprint, display grant, independent AI-analysis grant, access check and
   reader review. Existing endpoints are `/api/operator/catalog/intelligence/imports`,
   `/versions/:id/permissions`, `/intelligence/reviews/identity`,
   `/intelligence/reviews/reader` and `/intelligence/access`. Source/asset data
   must describe the actual original and approved evidence. The new bundled access
   check uses ASSETS locally; it does not assert that an undeployed remote URL is
   reachable. No production ingestion or `--remote` is permitted.
4. Build; use one private persistent local state directory across stages. Set
   `PUBLIC_APP_ORIGIN=https://curio.test`, server-only Meta key, separate random
   catalog/SAM operator tokens and RATE_LIMIT_SALT (each ≥32 characters).
5. Local Wrangler flags only: catalog operator on for private preparation,
   `MAGAZINE_MAX_CALLS=3` **from the start**, and only the currently authorized
   stage's inference flag on. Start with ASSET_AI_ENABLED=true and magazine/SAM
   off; then ASSET_AI off + magazine on for stage 2; then magazine off + SAM on
   for stage 3. Always keep DECODER_COMMENTARY_ENABLED=false. Restarting retains
   the SAME persisted DO/D1 state. Do not reset budgets, change asset versions to
   retry, use a new IP or increase the cap after failure.

Example local server (add only the approved stage-specific flags above):

```bash
export CURIO_LOCAL_ACCEPTANCE_ROOT="$(mktemp -d /tmp/curio-live-state-XXXXXX)"
npx wrangler d1 migrations apply curio-catalog --local \
  --persist-to "$CURIO_LOCAL_ACCEPTANCE_ROOT/state"
npx wrangler dev --local --ip 127.0.0.1 --port 18788 \
  --persist-to "$CURIO_LOCAL_ACCEPTANCE_ROOT/state" \
  --var PUBLIC_APP_ORIGIN:https://curio.test \
  --var MAGAZINE_MAX_CALLS:3 --var CATALOG_OPERATOR_ENABLED:true \
  --var DECODER_COMMENTARY_ENABLED:false \
  --var ASSET_AI_ENABLED:true --var MAGAZINE_AI_ENABLED:false \
  --var SAM_DECODER_ENABLED:false
```

The command shown is stage 1 only. For stage 2, stop the local server and
restart with the same persisted state, changing only ASSET_AI_ENABLED=false and
MAGAZINE_AI_ENABLED=true. For stage 3, keep both Muse flags false and add
SAM_DECODER_ENABLED=true, META_SAM_MODEL=sam-3.1 and
SAM_LIVE_ASSET_ID=<the exact approved raster ID>. Keep commentary false.

Do not enable paid flags or launch this setup before approval. The checked-in
production config stays unchanged. The three shared lifetime reservations cover
one vision request, one editorial request and one SAM request; no commentary.
The persistent SAM once-per-asset gate remains active.

Private read-only readiness:
`GET /api/operator/catalog/intelligence/versions/<version-id>/readiness`.
It reports the exact hash, permit/grant blockers, jobs, cap, stage flags and eligible
persisted editorial context (if present among the reader's first 50 ranked hits).
No context means stop; never loosen permissions to make a test pass.

## Three separate live commands, one model-capable request each

Export only the reviewed identifiers to CURIO_LIVE_VERSION_ID,
CURIO_LIVE_ASSET_ID and CURIO_LIVE_SHA256; use the approved new home-lamp raster.
The fixed request uses adId=home-lamp/detailId=home-lamp-detail. Set the private
local operator tokens in CURIO_CATALOG_OPERATOR_TOKEN/CURIO_SAM_OPERATOR_TOKEN.
Provide verified input/cached-input/output USD rates per million tokens through
CURIO_META_INPUT_USD_PER_MILLION, CURIO_META_CACHED_INPUT_USD_PER_MILLION and
CURIO_META_OUTPUT_USD_PER_MILLION. Set CURIO_APPROVED_MAX_USD to the approved
per-stage cap. No pricing is assumed.

Dry runs are zero-network and do not need credentials:

```bash
npm run validate:live -- --stage=muse-image
npm run validate:live -- --stage=image-editorial
npm run validate:live -- --stage=sam-segmentation
```

Only AFTER the corresponding explicit approval, create a NEW private empty
outside-Git directory and execute exactly that stage:

```bash
export CURIO_LIVE_EVIDENCE_DIR="$(mktemp -d /tmp/curio-muse-image-XXXXXX)"
CURIO_LIVE_APPROVAL=one-muse-image npm run --silent validate:live -- \
  --stage=muse-image --execute

# Separate approval and a new empty directory for stage 2:
export CURIO_LIVE_EVIDENCE_DIR="$(mktemp -d /tmp/curio-image-editorial-XXXXXX)"
CURIO_LIVE_APPROVAL=one-image-editorial npm run --silent validate:live -- \
  --stage=image-editorial --execute

# Separate approval/eligible SAM account/permit and new directory for stage 3:
export CURIO_LIVE_EVIDENCE_DIR="$(mktemp -d /tmp/curio-sam-segmentation-XXXXXX)"
CURIO_LIVE_APPROVAL=one-sam-segmentation npm run --silent validate:live -- \
  --stage=sam-segmentation --execute
```

These are independent commands, not a script to run as an unapproved batch.
The runner permits loopback only, verifies readiness before the one POST, rejects
cached/failed prior vision jobs and missing persisted image context, checks SAM
config/target and requires commentary off. No retry, redirect following or
production URL. Provider errors, invalid output, missing usage or over-cap measured
cost stop acceptance; never rerun to obtain a nicer result.

Token/request ceilings: vision **one** call, at most **1,200** completion tokens;
editorial **one** call, at most **2,200** completion tokens; SAM **one** image call,
no commentary. Vision/SAM source limits remain 2 MB, 4 million pixels, max4096 per
axis; response/time limits remain enforced. Total Muse completion ceiling 3,400,
plus provider-billed text/image input. Image input tokens cannot be predicted
precisely here. The USD check is **post-call accounting**, not a pre-call billing
guarantee; use a provider hard cap/budget before execution. SAM pricing/usage are
unknown in this adapter: report `estimatedUsd=null`, not zero, and reconcile the
one call in the provider dashboard. Zero SAM matches is a valid completed result,
not evidence that object discovery succeeded.

Each stage stores its server response and sanitized report as mode0600 in a
mode0700 directory outside any Git tree. Reports contain fixed diagnostics and
bounded accounting, never raw rejected prose, API keys or operator tokens. Do not
upload full captures to CI. Keep stderr private too. Reconcile provider request
history/timestamps, token totals, latency and bill against the authorized account.
A local response is not automatically proof of a live provider call.

Stage 1: verify exact image bytes were used (server hash/permit), valid structured
observations, Meta origin, one reservation and an existing succeeded D1 job; a
later read/cached classification must not request another model call. Stage 2:
verify `imageContextAssetIds` contains the approved asset, inspect the original
narrative/layout/sequence against those uncertain observations, and review facts
and citations independently. Do not infer causal quality solely from a marker.
Stage 3: compare boxes with the exact original, verify source/model/dimensions,
record zero-match uncertainty and inspect the validated renderer without another
provider request. Public reader does not auto-request or activate operator SAM;
its authored fallback stays separate.

## SAM contract sources and remaining blockers

The checked Meta cookbook at `meta-models/meta-model-cookbook`,
`07_sam/01_api_basics/README.md` and Python/TypeScript examples documents
`sam-3.1`, local image data URLs, the Responses API, SSE and the official parser.
Current adapter sends a short approved detail concept plus input_image data URL to
`https://api.meta.ai/v1/responses`. It uses Meta only; an OpenAI-compatible wire
format does not imply an OpenAI model. Relevant docs:
https://dev.meta.ai/docs/sam/segmenting and
https://dev.meta.ai/docs/sam/reading-segmentation.

Not verified: this account's SAM entitlement/availability, current prices,
provider spending controls, image-analysis output quality, image-conditioned
editorial coherence, SAM model results or production smoke/visual access. The managed environment
reports no configured model credential bindings and no paid-call approval.
These are the remaining risks to **October 30** live-evidence readiness. Approve
and execute the three individual tests from an authorized machine, or keep their
status explicitly mocked/pending in the submission. No merge/deploy is implied.

## Recorded local result

Final local acceptance: **209 unit/security tests across 18 files, 28 Chromium
tests**, typecheck, lint, build, Worker dry run and Worker/D1/DO integration all
passed. `docs/evidence/pr18-acceptance.json` records the seven checks. The two
`pr18-performance-*.json` files contain measured local synthetic timings and JS
bytes. Screenshots `pr18-prompt-composer-*` show the new prompt-first interface;
`pr18-acceptance-cover-*` show authored AI-disabled editions; `pr18-sam-mock-qa-*`
show explicitly mocked renderer evidence. None is production or a new live-model
capture. Production smoke remains unverified as described above.
