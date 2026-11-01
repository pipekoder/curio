# Editorial AI activation: controlled test and small public beta

This change does not activate inference. The checked-in flags remain false. The
existing `POST /api/editorial` response shape and Editor → Reviewer → optional
Revision → Confirmation workflow are unchanged. No frontend or schema change is
required for eligibility or authorization. The legacy `POST /api/magazine` path
has its own `LEGACY_MAGAZINE_AI_ENABLED` switch, default false; keep it false.

## Shared prerequisites

- `MAGAZINE_AI_ENABLED=true` and `EDITORIAL_REVIEW_ENABLED=true` are both
  required for any paid editorial call. Neither flag alone permits inference.
- Keep `LEGACY_MAGAZINE_AI_ENABLED=false`, `ASSET_AI_ENABLED=false` and
  `SAM_DECODER_ENABLED=false` unless those workflows receive separate approval.
- Server-side `META_API_KEY`, `META_SPARK_MODEL=muse-spark-1.3`,
  `RATE_LIMIT_SALT` (at least 32 characters), `INFERENCE_BUDGET`, `CATALOG_DB`,
  `CATALOG_PUBLIC_ENABLED=true`, and the exact `PUBLIC_APP_ORIGIN` are required.
  `MEDIA_BUCKET` is required to serve owner-uploaded R2 media.
- Eligible versions must be active, published, display-approved, AI-analysis
  approved, linked to current owner-supplied brand/product facts, and have a
  successful exact-version real Muse observation under the current AI grant.
  Missing evidence returns an authored deterministic result. Source values
  remain owner-supplied mockup information, not independently verified facts.
- Confirm Meta account/model access, current rates, a provider spending cap,
  and the existing global reservation headroom before authorizing a call.
  `MAGAZINE_MAX_CALLS` remains the shared lifetime limit (checked-in default
  20); the shared daily limit remains 20 units. A reviewed request reserves
  four units atomically and does not refund unused units. Pilot mode allows
  eight units per IP per UTC hour; public mode allows one four-unit workflow
  per IP per UTC hour. Both retain the one-minute cooldown. Ordinary one-unit
  workflows retain their three-unit per-IP hourly limit.

## One controlled real test (only after separate approval)

Keep `EDITORIAL_PUBLIC_AI_ENABLED=false`. Set
`EDITORIAL_PILOT_VERSION_IDS` to exactly six unique current
`version-<64 lowercase hex>` IDs, and configure a 32+ character
`EDITORIAL_REVIEW_PILOT_TOKEN` as a Worker secret. Authenticate the read-only
`GET /api/operator/catalog/intelligence/pilot/readiness` request and require
all six rows to report `published`, `editorialMetadata`, `imageAnalysis` and
`editorialReady` true. Confirm the intended prompt retrieves at least two of
those versions. Only then set both editorial flags true in the approved
deployment configuration. Use a server-side operator request to
`POST /api/editorial` with exact `Origin`, JSON `{ "prompt": "...", "consent":
true }`, and `X-Curio-Editorial-Pilot`. Never put the token in Silver Field,
browser storage, a public artifact or a command-line argument. Send one
request; do not retry automatically.

Record `source`, `retrieval`, `cached`, `fallbackReason`, `inference` usage and
latency, selected exact asset IDs, and whether the independently reviewed plan
passed. `inference.attempted=true` only proves that a reservation was made;
`source=meta`, `retrieval=d1`, and `cached=false` identify a newly accepted
reviewed result. A deterministic response after attempted inference is a safe
fallback, not a successful editorial approval.

## Limited public beta (separate approval)

After the controlled test, remove `EDITORIAL_PILOT_VERSION_IDS` entirely and
set `EDITORIAL_PUBLIC_AI_ENABLED=true`. Keep `EDITORIAL_REVIEW_ENABLED=true` and
`MAGAZINE_AI_ENABLED=true`; keep the obsolete route disabled. No pilot token is
needed by visitors. Every request still requires explicit consent and current
published D1 eligibility, source and observation checks. Invalid configured
pilot IDs fail closed rather than switching into public mode. A missing
Reviewer flag or insufficient eligible items returns deterministic content.

The checked-in 20-unit lifetime ceiling can fund at most five fully reserved
reviewed workflows across all users, fewer when other inference uses the same
budget. Do not raise it without a reviewed spending plan and explicit approval.
Monitor aggregate usage and fallback rates during the beta. Silver Field's
current 20-second request timeout can expire before a multi-call workflow
finishes; coordinate a bounded frontend timeout adjustment with its owner
before treating browser acceptance as complete.

Cloudflare deployments apply `wrangler.jsonc` vars. Configure the approved
release manifest and Worker secrets together; do not rely on dashboard-only
flag edits that a later deployment could reset. Roll back by restoring the
checked-in false flags in the release configuration and deploying the accepted
rollback version through the existing Cloudflare procedure. No database
migration is needed.
