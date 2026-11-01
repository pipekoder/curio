# Production Editorial V2 readiness (no activation)

This change repairs authenticated Catalog Operator GETs and makes V2's
default-off setting explicit. It does not deploy, change Production variables,
import assets, reserve inference, or make a Meta request.

## Observed 403 and authorization

`worker/catalog-api.ts` required `Origin === PUBLIC_APP_ORIGIN` on every
request. Browsers can omit Origin on same-origin GETs, including the readiness
request from `/internal/media`. Catalog Operator now uses the exact Media Studio
policy: an explicit Origin must match; without Origin, only a GET with
`Sec-Fetch-Site: same-origin` and a Referer whose origin matches
`PUBLIC_APP_ORIGIN` is accepted. Both routes still require the 32+ character
Bearer operator token, its constant-time comparison, enabled operator flag,
D1 binding, configured origin and Cloudflare client-address header. Catalog
writes still require explicit matching Origin and JSON Content-Type. An absent,
wrong token remains a 403. A 200 from the readiness endpoint proves
authorization, not that any asset is ready.

## Configuration inventory and activation dependencies

The states below are the owner's Cloudflare dashboard observations, except
where marked source default. This task could not independently read Production
runtime bindings or secrets.

| Name | Owner-observed / source state | Controlled V2 pilot | Management and impact |
| --- | --- | --- | --- |
| `MAGAZINE_AI_ENABLED` | false / false | true only after approval | Wrangler variable; paid Editorial master gate. |
| `EDITORIAL_REVIEW_ENABLED` | false / false | true only after approval | Wrangler variable; mandatory independent review. |
| `EDITORIAL_KNOWLEDGE_V2_ENABLED` | absent / **false added here** | true only after approval | Wrangler variable; enables shared V2 guidance for Editor, Reviewer and Revision only inside the reviewed workflow. |
| `EDITORIAL_PUBLIC_AI_ENABLED` | unverified / false | **false** | Wrangler variable; must stay off for operator pilot. |
| `EDITORIAL_PILOT_VERSION_IDS` | unverified / **empty default added here** | six distinct exact `version-<64 hex>` IDs in a separately reviewed release config | Wrangler variable; non-secret selection boundary. Invalid/non-six values fail closed. |
| `EDITORIAL_REVIEW_PILOT_TOKEN` | secret present, validity unverified | valid 32+ character Worker secret | Never put in frontend or config; required header for pilot. |
| `META_API_KEY` | secret present, validity unverified | account-authorized Muse Spark 1.3 key | Worker secret; provider eligibility and spend cap require Meta dashboard confirmation. |
| `META_SPARK_MODEL` | `muse-spark-1.3` / same | same | Wrangler variable; exact model check. |
| `RATE_LIMIT_SALT` | secret present, validity unverified | valid 32+ character Worker secret | Worker secret; hashes client IP before shared budget reservation. |
| `MAGAZINE_MAX_CALLS` | 20 / 20 | unchanged | Wrangler variable; shared lifetime reservation ceiling. |
| `CATALOG_OPERATOR_ENABLED` | true / true | true for authenticated readiness | Wrangler variable; not public access. |
| `CATALOG_OPERATOR_TOKEN` | secret present, validity unverified | valid existing token | Worker secret; shared by Media Studio and Catalog Operator. |
| `CATALOG_PUBLIC_ENABLED` | true / true | true | Wrangler variable; published D1 retrieval. |
| `ASSET_AI_ENABLED`, `SAM_DECODER_ENABLED`, `LEGACY_MAGAZINE_AI_ENABLED` | false / false | false | Separate paid paths remain off. |
| `PUBLIC_APP_ORIGIN` | owner-reported Cloudflare origin / same in config | exact deployed origin | Wrangler variable; browser/operator origin gate. |
| `CATALOG_DB`, `MEDIA_BUCKET`, `INFERENCE_BUDGET` | owner reports D1/R2 live; DO headroom unknown | existing bindings | Wrangler D1 `curio-catalog` (`b39c4f63-74ee-47f6-bb1d-7388ecc88bc7`), private R2 `curio-media`, SQLite DO. No new resource. |

`EDITORIAL_PUBLIC_ENABLED=false` was observed in the dashboard but is **not
read by this Worker**. The implemented public-beta flag is
`EDITORIAL_PUBLIC_AI_ENABLED`; do not treat the former as an AI gate. No
Production flag is changed by this PR. The current Worker source includes V2
from merged PR #52; absent/false V2 keeps V1 writing guidance. When enabled,
V2's version joins the existing plan-cache key, and cache hits still recheck
current publication/permissions. No API schema or budget is changed.

Source-controlled `wrangler.jsonc` is the source of truth for **non-secret**
Worker variables. A Cloudflare deployment may replace dashboard-only variable
edits with its declared vars. For activation, review the exact variable diff in
a separate release change, deploy that accepted config to the existing `curio`
Worker, then read back runtime settings. Do not enable V2 solely by a dashboard
toggle that a later deployment may reset. Keep Worker secrets in Cloudflare's
Secrets store; the repository deploy script does not contain their values.
Confirm their continued presence after each deployment without printing them.
The manual `production-media-setup.yml` workflow also runs migrations and
operator-secret setup, so it is **not** the appropriate routine V2 release path.
The ordinary CI workflow performs checks but does not deploy. Confirm the
actual Cloudflare deployment integration/account and D1/R2/DO bindings in the
dashboard before any approved release; repository configuration alone cannot
prove the live account or secret state.

## Six-version preflight after an approved deployment

1. In `/internal/media` with the existing authenticated browser session, run
   the read-only `GET /api/operator/catalog/intelligence/pilot/readiness`.
   Expect HTTP 200, `configured:true`, six distinct IDs and `ready:true`.
   If 403 persists, check the token, request's `Sec-Fetch-Site`/Referer,
   deployed origin and Worker version; do not bypass authorization.
2. For every row require `published`, `editorialMetadata`, `imageAnalysis`
   and `editorialReady` true. `published` now uses the authoritative current
   public publication read; `imageAnalysis` revalidates exact-version Muse
   observations and AI-analysis evidence. Cross-check all six with
   `GET /api/catalog/published?ids=...`; absent/revoked versions are not ready.
   Missing metadata needs an owner Content Studio brand/product description or
   association. Missing analysis needs separately approved image analysis; do
   not trigger it as part of this preflight.
3. With Editorial AI still off, submit the intended prompt to `/api/editorial`
   with `consent:false`. Require `source:deterministic`, `retrieval:d1`, and at
   least two selected exact version IDs among the six. This confirms retrieval,
   not Meta readiness. The readiness endpoint considers the 50 highest-ranked
   reader candidates; if a valid version is absent from that bound, investigate
   ranking before declaring it ineligible.

The Durable Object currently exposes reservation only, not a read-only count
endpoint. Inspect remaining global/hourly units and cooldown through authorized
Cloudflare operational evidence if available; do not make a speculative
reservation merely to check. Four units are needed for one reviewed workflow.
The shared limits remain a 60-second cooldown, eight pilot units per IP per UTC
hour, 20 per UTC day, and the configured lifetime ceiling (20 in source).
Reservations are not refunded. Verify current Meta pricing and a provider-side
spend cap in the Meta dashboard before authorizing paid testing.

## Controlled V2 test and rollback (requires separate approvals)

Once the six-version preflight, budget and provider checks pass, approve a
release config with `MAGAZINE_AI_ENABLED=true`, `EDITORIAL_REVIEW_ENABLED=true`,
`EDITORIAL_KNOWLEDGE_V2_ENABLED=true`, the reviewed six-ID allowlist and
`EDITORIAL_PUBLIC_AI_ENABLED=false`. Keep legacy magazine, image analysis and
SAM off. The existing pilot token remains a Worker secret. Obtain separate
authorization for **one** server-side `POST /api/editorial` with exact Origin,
JSON `{prompt,consent:true}` and `X-Curio-Editorial-Pilot`; never expose that
header to Silver Field. Do not retry a failed request automatically.

The request reserves four units atomically and makes two model calls for a
first-pass approval, or up to four if revision and confirmation are needed;
each call caps output at 2,200 tokens and times out after 15 seconds. Record
the prompt, selected voice, response `source`/`retrieval`/`fallbackReason`,
bounded usage and latency, accepted narrative and human qualitative assessment
against the authentic *Intervals of Stillness* text fixture. A successful
provider call is not a Reviewer-approved edition: only a newly returned
`source:meta`, `retrieval:d1`, `cached:false` result proves the approved path.
Private Reviewer scores are not part of the public API and must not be claimed
without legitimate private evidence. The response contract can be consumed by
Silver Field's 90-second bounded request and exact catalog/asset-version join.

Rollback V2 alone by releasing the same approved configuration with
`EDITORIAL_KNOWLEDGE_V2_ENABLED=false`; stop paid Editorial inference entirely
by also restoring `MAGAZINE_AI_ENABLED=false`. Keep the pilot token secret and
the public-beta flag false. Confirm the resulting runtime flags and authored
fallback after deployment. No D1 migration or content rewrite is required.
