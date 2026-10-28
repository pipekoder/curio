# Private Norm JPEG validation

This is an operator CLI development adapter, not a public image approval or a production feature flag. It is independent of Adaptive Gallery Discovery. Never deploy this adapter or copy its input/state/evidence into Git, `public`, `dist`, CI artifacts, screenshots, or a public media bank.

## Exact asset and limited permit

Owner-provided archive extracted and verified locally on 2026-10-28:

- JPEG, 289,305 bytes; 1600 × 1201.
- SHA-256: `f226b4632fd63211dd59f050b84e715bf38da703d54fcffc7b5f99654777c774`.
- Original metadata URL: <https://assets.presscloud.com/file/35/354580808187535/Norm_Architects_A_Sense_of_Serenity_Karimoku_Case_Salone_del_Mobile_2025_JBP_47.jpg>.
- Local derivative version key: `local-resized-f226b4632fd63211`.
- Local D1 version: `version-89608c4b53b64311761d1102309d5b7938818dfe61f0a6fc5f0ecea2d348f945`.

The owner's instruction authorizes preparation and mocked development testing of these exact bytes. **It does not authorize paid inference, redistribution, editing, public display, verified brand/product claims, or a rights-holder assertion.** An additional explicit approval is required before each paid stage.

`dev/norm-asset.ts` is the exact-version dev permit. The CLI reads only an owner-private file outside any Git working tree. Every stage rechecks byte count, SHA-256, JPEG dimensions, current local version and rejection/archive status. No Presscloud fetch, redirect, proxy, host-wide allowlist or general-purpose JPEG exception is introduced. Presscloud is supported solely as this asset's original provenance URL.

The original URL is NOT asserted to have the derivative's bytes. Its separate local version records the resize and fingerprint in provenance. Existing production metadata is never read or overwritten. Miniflare creates a separate **local-only** D1 database and the existing SQLite inference-budget Durable Object under the private state path. Only version-controlled migrations 0001/0002 run against that emulated database; no Wrangler remote commands or Cloudflare credentials are used. Extra `local_norm_*` tables exist only in this isolated development database; there is no production migration.

All catalog permissions, including general AI analysis, remain pending. The adapter's exact-byte, private-test permit is separate from these general rights grants; an explicitly rejected/blocked AI permission also blocks the local adapter. Results reuse the existing Asset Intelligence understanding schema and are persisted separately as `mock` or `meta`; they never become public `asset_intelligence`, publication or reader-eligibility records. Changed inputs or missing/version-mismatched observations are rejected. Cached image/region results are schema-validated on reuse; new editorial prompts are not silently served a cached edition.

## What is integrated

1. Muse image understanding: existing real JPEG data-URL classifier, strict schema, exact version/fingerprint and measured token usage. Mock mode uses clearly labeled authored observations and makes no request.
2. Image-informed editorial: reads matching persisted observations, then uses the existing prompt interpreter, real Muse planner, strict narrative/asset validation and deterministic fallback. A separate `privateReferenceContext` supplies visual inspiration; only existing approved illustrations can be selected. This does **not** make the Norm photograph selectable or publicly rendered. No image bytes, private path, original URL or brand metadata are included in this editorial reference.
3. SAM: a dev-only exact-JPEG request adapter uses the fixed Meta Responses endpoint/model and the existing bounded SSE parser/geometry binder. The production adapter still requires approved bundled PNGs. Mock regions are `authored_demo`, `model: null`, no measured confidence. Empty real detections remain zero-match model results, not fabricated objects.

There is no private-photo reader UI or new public endpoint in this PR. The existing prompt-first reader, curiosity, Collect and approved catalog remain unchanged. Testing the photograph as a rendered reader asset requires a separately scoped private preview/display decision; this change does not fabricate that approval.

## Install and zero-paid-call checks

Use Node 22.12+ and the repository root. Put the extracted exact file outside Git:

```bash
chmod 600 /tmp/curio-norm-ai-test.jpg
npm ci
npm run validate:norm -- --stage=verify
npm run validate:norm -- --stage=muse-image --evidence=/tmp/curio-norm-mock-image-01
npm run validate:norm -- --stage=image-editorial --evidence=/tmp/curio-norm-mock-editorial-01
npm run validate:norm -- --stage=sam-segmentation --evidence=/tmp/curio-norm-mock-sam-01
```

Without `--execute`, every stage is mocked and no model/budget request occurs. Input defaults to `/tmp/curio-norm-ai-test.jpg`; override with `--file=/absolute/private/file.jpg`. State defaults to `/tmp/curio-norm-private-state`; override with `--state=/absolute/private/state`. Reuse **the same state** across stages. Directories must be owner-only (0700), files 0600. Each evidence directory must be fresh, empty and outside any Git tree. The process uses umask 0077. Delete private temporary data after testing when no longer needed; do not delete paid-test budget/attempt history to evade limits.

```bash
CURIO_NORM_TEST_FILE=/tmp/curio-norm-ai-test.jpg npm test -- tests/norm-local.test.ts
npm run typecheck
npm run lint
npm test
npm run build
npm run worker:check
npm run test:integration
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

CI runs the asset-independent security and regression tests. Four additional tests require `CURIO_NORM_TEST_FILE` and deliberately skip when the private photograph is unavailable. They run locally with real verified bytes, intercepted fake provider responses, fake credentials and no paid inference. Never upload the JPEG to CI merely to avoid those skips.

## Controlled live readiness — do not execute without new approval

Obtain separate explicit owner approval for exactly one call per stage and its USD ceiling. Environment-variable confirmations are execution guards, not a substitute for approval. Confirm Meta hackathon eligibility/access for Muse Spark 1.3 and SAM 3.1, actual JPEG data-URL input support, current pricing, provider-side spending caps and image-analysis permissions for this exact derivative. SAM JPEG support and live success remain unverified until an approved real call succeeds. This environment currently has no configured Meta credentials and its network policy does not allow `api.meta.ai`; do not bypass that policy.

Use a credential supplied securely to the operator's process (`META_API_KEY`); never commit, echo or pass it on the command line. Keep production `MAGAZINE_AI_ENABLED=false` and `CATALOG_OPERATOR_ENABLED=false`. No production route is called or enabled.

For Muse, set verified USD-per-million token rates and the separately approved positive `CURIO_APPROVED_MAX_USD`. No default price is assumed:

```bash
export CURIO_META_INPUT_USD_PER_MILLION='<verified rate>'
export CURIO_META_CACHED_INPUT_USD_PER_MILLION='<verified rate>'
export CURIO_META_OUTPUT_USD_PER_MILLION='<verified rate>'
export CURIO_APPROVED_MAX_USD='<explicitly approved positive ceiling>'
export CURIO_NORM_CONSENT=true
```

Then, **only after explicit approval for that stage**, run exactly one command:

```bash
CURIO_NORM_APPROVAL=norm-one-muse-image npm run validate:norm -- --stage=muse-image --execute --evidence=/tmp/curio-norm-live-image-01

# Wait at least 61 seconds after the previous reservation; no automatic wait/retry.
CURIO_NORM_APPROVAL=norm-one-image-editorial npm run validate:norm -- --stage=image-editorial --execute --evidence=/tmp/curio-norm-live-editorial-01

# Wait at least 61 seconds; requires separately verified SAM eligibility,
# JPEG support, price and provider spending cap, plus a new explicit approval.
CURIO_NORM_SAM_PREFLIGHT=eligibility-jpeg-pricing-provider-cap-verified CURIO_NORM_APPROVAL=norm-one-sam-segmentation npm run validate:norm -- --stage=sam-segmentation --execute --evidence=/tmp/curio-norm-live-sam-01
```

Model/request limits:

- Muse image: exactly one chat-completions call, `muse-spark-1.3`, max 1,200 completion tokens, minimal reasoning, 15-second abort.
- Editorial: exactly one chat-completions call, same model, max 2,200 completion tokens, strict existing prose/asset validation, 15-second provider abort. Requires a succeeded **Meta** image result from the same private D1 store; mocked observations cannot satisfy a live editorial prerequisite. No implicit extra image-analysis call.
- SAM: exactly one streaming Responses request, `sam-3.1`, fixed `seating` concept, no additional commentary/model call; bounded existing SSE parsing (1 MiB, 128 events, max eight boxes).
- Existing HMAC/SQLite budget: lifetime ceiling three calls, hourly/cooldown checks, SAM once-per-asset. Each stage also has an atomic persisted one-attempt guard. Failures are not refunded or automatically retried; do not switch state directories to circumvent the guard. Successful cached image/SAM results make zero new calls.

The USD ceiling is an approval/accounting check, **not a hard provider billing limit**. Request caps and no retries bound call counts; a provider-side cap is needed for hard currency enforcement. Abort cannot guarantee cancellation or prevent billing. Token usage may be absent on transport failure; SAM usage/cost are unknown unless separately obtained from Meta. Never report unknown cost as zero.

Evidence is stage response plus sanitized report JSON, written 0600 into the private 0700 directory. Reports include request/response validity, origin, cache/fallback state, latency, reservations, available token usage and estimated USD. Raw output remains private; provider errors are reduced to fixed diagnostics. Verify provider billing separately. A failed response remains failed even when the deterministic editorial fallback works. Do not rerun a failed stage under this approval. A SAM response can be structurally valid while `acceptancePassed=false` until its unknown cost is reconciled externally; the CLI deliberately exits nonzero for incomplete acceptance, missing Muse usage or an exceeded measured ceiling.

## Security review

Confirm `dev/` is absent from both deployed bundles; the JPEG bytes are absent from Git/public/dist; source permissions and all production flags remain unchanged; private paths cannot resolve inside another Git worktree; altered bytes and stale/rejected versions fail; no client-supplied URL reaches a model; mocked results cannot satisfy live context; production SAM still rejects JPEG; and the historical successful Focused Home fixture still validates.

## Local verification evidence (2026-10-28)

- Exact private JPEG: verified SHA-256, dimensions, MIME and byte length above.
- Typecheck, lint, production build and Wrangler dry-run: passed.
- Full regression suite: 218 tests passed across 19 files; after adding an additional private-path security case, the focused Norm suite passed all 10 tests. GitHub CI also runs that added case.
- Worker integration: all seven reported acceptance/runtime/D1/editorial/workerd checks passed with outbound model transports mocked.
- Chromium: 28/28 passed, desktop/mobile, reduced motion, keyboard, privacy, rights revocation and Collect.
- Mock CLI stages: image analysis, image-informed editorial and SAM each returned a valid mocked response, zero inference reservations and zero paid requests.
- Private captures: `/tmp/curio-norm-mock-image-evidence`, `/tmp/curio-norm-mock-editorial-evidence`, `/tmp/curio-norm-mock-sam-evidence`. Not uploaded or committed.
- Production artifact scan: no Norm fingerprint, source URL, local result-table name or permit-approval marker in `dist`, `public` or the Worker bundle. No photograph/ZIP is tracked. Both production flags remain false.
- Production dependency audit: zero vulnerabilities.

Actual paid calls: **0**. Actual paid usage/cost: **0 / $0**. Mock latency is local execution timing, not provider performance. No genuine Norm Muse/SAM response, token count, live latency or provider cost has been claimed.
