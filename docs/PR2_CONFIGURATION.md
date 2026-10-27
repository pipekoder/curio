# PR #2: Meta magazine generator

## What is implemented

The frontend sends consented, bounded preferences to the Hono Worker and renders
an issue with one catalog item per active category. Weights are exact editorial
emphasis percentages, not numbers of ads. Zero-weight categories are omitted.
The six catalog entries and abstract CSS illustrations are explicitly fictional;
there are no actual ads, products, shopping links, or bookable travel offers.
Catalog descriptions are fixture facts; model commentary is labeled unverified
AI interpretation. No SAM, image-generation, persistence of issues, or third-party
AI provider is included.

The Worker calls only `https://api.meta.ai/v1/chat/completions` using server-side
`META_API_KEY` and exactly `META_SPARK_MODEL=muse-spark-1.3` (Standard). Every other
model, including Contributor, fails closed. It requests structured JSON, minimal
reasoning, and at most 1,800 completion tokens, with a 15-second timeout and no
automatic retries. Redirects are handled manually and rejected, so credentials
cannot follow a redirect to another provider. Client requests are limited to
4 KiB, interests to 1,000 characters, lifestyles to eight bounded strings, and
upstream responses to 32 KiB. Output must have exactly one valid catalog reference
per active category, matching categories, no duplicates, bounded prose and no
URLs/HTML/Markdown links. Prompts, credentials and user preferences are not logged
by application code. Generation logs contain only the outcome code and elapsed milliseconds. Generated prose is not a factual source or a guarantee of
semantic accuracy; the UI renders it as plain text, without links or HTML.

## Cloudflare configuration in one pass

**Deployment and paid inference activation are separate actions. Neither has been
performed by this PR implementation.** Keep the flag off through review.

1. Use the existing `curio` Worker and retain the assets configuration. No R2 or
   D1 binding is needed. Wrangler declares the `INFERENCE_BUDGET` Durable Object
   and the `v1-inference-budget` migration with `new_sqlite_classes`. On a future
   approved deployment, apply that migration. SQLite Durable Objects are
   supported on Workers Free; do not replace this with legacy KV-backed objects.
2. Keep/set these server-side Production variables:
   - `META_SPARK_MODEL=muse-spark-1.3` (Standard, not Contributor).
   - `MAGAZINE_AI_ENABLED=false` (committed default).
   - `MAGAZINE_MAX_CALLS=20` (default finite lifetime reservation limit; allowed
     range 1–100, invalid values block generation).
   - `PUBLIC_APP_ORIGIN=https://your-exact-production-host` (no trailing slash;
     choose the intended custom domain or workers.dev origin).
3. Keep the existing `META_API_KEY` as a Worker secret. Add `RATE_LIMIT_SALT` as a
   separate high-entropy Worker secret (at least 32 random bytes), stable across
   deployments. Never use a `VITE_` variable, frontend shared password, committed
   `.dev.vars`, or public config file for either secret. Wrangler's interactive
   `secret put` or the Cloudflare dashboard can set these after authorization;
   do not print secret values in logs or PRs.
4. Confirm the DO namespace/binding and migration exist and production requests
   receive Cloudflare's trusted `CF-Connecting-IP`. Missing origin, credentials,
   selected model, salt, address, budget binding, or functioning storage blocks
   inference. Do not place an untrusted reverse proxy in front that can supply
   this header. The UI obtains only enabled/catalog-size metadata, never secrets.
5. Verify model entitlement, provider spending controls and the real paid request
   contract in a separately authorized test. Tests in this PR use only mocks.
   Only after operator approval, set `MAGAZINE_AI_ENABLED=true` in the intended
   production configuration; keep all quota protection in place. Set it back to
   `false` to stop new requests (already submitted provider calls may still bill).
   Settings in Wrangler and the dashboard must agree when deploying again.

Local development can copy `.dev.vars.example` to ignored `.dev.vars`, but builds
and CI require no credentials. Do not enable local live calls without explicit
paid-call authorization. The test suite never reads real secrets and the runtime
mock intercepts all external Worker requests. The integration command requires a
clean test checkout without `.dev.vars` and a preceding build and Worker dry run.

## Abuse protection and cost ceiling

One globally named `magazine-v1` SQLite Durable Object atomically reserves a call
before inference. Reservations persist through isolate restarts and deploys:

- One accepted reservation per IP per rolling 60 seconds.
- Three per IP per UTC clock hour.
- Twenty globally per UTC day.
- Twenty globally for the namespace lifetime by default (maximum configurable
  ceiling 100), **including failed, invalid-output and timed-out attempts**.

IP keys are HMAC-SHA256 values; raw addresses/preferences are not stored in this
budget. Expired IP/day counters are cleaned up on the next reservation; the
lifetime counter is never automatically reset. A failed quota check returns 503;
a denied reservation returns 429 with `Retry-After`. No in-memory counter is used
for enforcement. There is no public reset route and no automatic retry/refund.
Do not rename/delete the namespace or global object to reset spending, and do not
rotate the salt to bypass throttles. Raising the ceiling requires budget review.
A lifetime-exhausted 429 requires operator action, even after `Retry-After`.

Origin and consent checks are defense in depth, not authentication: direct
clients can forge Origin. Distributed attackers can exhaust the small global
allowance, but cannot exceed its bounded number of provider attempts. The limit
is a request/token ceiling, not an exact currency guarantee. Set provider-side
budget alerts/limits as well. Workers/DO Free request, storage and CPU limits
still apply; abusive denied traffic can exhaust the hosting free allowance and
block service. No production CPU, memory, latency, account entitlement or quota
measurement has been made. The local bundle is below the 3 MiB Free compressed
Worker limit; production performance must be measured before public activation.

## Verification and official contract references

Run in a clean checkout:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run worker:check
npm run test:integration
```

The integration check uses the dry-run production bundle with real workerd and
SQLite storage, intercepts **all** outbound calls with mock responses, exercises
concurrent reservations, restarts the runtime to prove persistence, and checks
valid issue output and the global ceiling. It also starts `wrangler dev --local`
with production configuration off and verifies the built React assets, SPA deep
links, health/config endpoints, API 404s, disabled 503 and malformed input 400.
Unit tests use real in-memory SQLite for the budget SQL; React tests use jsdom.
Neither is a claim of visual browser verification or real model-generated output.

Reviewed on 2026-10-27:

- [Meta models](https://dev.meta.ai/docs/models): `muse-spark-1.3` selects Standard.
- [Chat completion protocol](https://dev.meta.ai/docs/protocols/chat-completions):
  endpoint, Bearer auth, developer/user messages, `max_completion_tokens`,
  reasoning effort, and `choices[0].message.content` / `finish_reason`.
- [Structured output](https://dev.meta.ai/docs/structured-output):
  `response_format.type=json_schema` and `json_schema.name/schema`.
- [Create chat completion API reference](https://dev.meta.ai/docs/api-reference/chat-completions/create-chat-completion).
- [Official cookbook](https://github.com/meta-models/meta-model-cookbook/tree/0a99b987858ec4e49c04fc3f114bf33851e81deb/01_api_fundamentals),
  especially chat completions and structured output. No cookbook inference cells
  were executed.
- [Cloudflare Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/):
  SQLite-backed DO support on Workers Free.

**No real Meta API call has occurred in this work.** Real access, latency,
provider behavior and billing remain unverified pending explicit authorization.

## Recorded local results (2026-10-27)

Environment: Node 24.19.0 / npm 11.9.0; GitHub Actions targets Node 22.

| Check | Result |
| --- | --- |
| `npm ci` | Passed, 193 packages installed from lockfile |
| `npm audit` | Zero vulnerabilities, including development dependencies |
| `npm run typecheck` | Passed, frontend/Worker/configuration/tests |
| `npm test` | 58 passed, 0 failed, 3 test files |
| `npm run build` | Passed; client JS 318.63 kB / 97.79 kB gzip, CSS 2.89 kB / 1.17 kB gzip |
| `npm run worker:check` | Passed; Worker 838.55 KiB / 138.45 KiB gzip; assets and SQLite DO binding recognized |
| `npm run test:integration` | Both production-bundle mock/SQLite and disabled local Wrangler asset/API scenarios passed |
| Frontend secret scan | No secret names, Bearer header or Meta API URL in built client assets |
| Real Meta inference calls | **0** |

Vite emits two harmless Zod dependency comment-annotation warnings and removes
the comments; bundling completes successfully. Wrangler also notes the managed
environment's proxy settings. Hosted CI results are recorded on PR #2 after push.
The React best-practices checklist was applied to the changed TSX components:
request configuration is fetched once per mount with cleanup, requests require a
user action and consent, statuses are announced, controls are labeled, generated
text is escaped, and no server module or credential enters the client bundle.
