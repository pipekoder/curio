# Curio demo AI readiness (source audit, not a Production readback)

The existing `POST /api/editorial` contract and Silver Field frontend are unchanged. The owner has confirmed that ordinary browser AI generation works in Production. This document describes the code at `c72c017c82a2b350e86d4bda55063cef115db438`; dashboard overrides, current Durable Object counts, and Meta account quotas require separate Production inspection.

## Current reservation limits

`worker/budget.ts` uses one SQLite Durable Object named `magazine-v1` for all inference workflows. It atomically reserves up to four units for the mandatory Chief Editor → Reviewer → optional Revision → Confirmation workflow. The first-pass path makes two Meta calls; the revision path makes four. Reservations are never refunded after failure, cancellation, timeout, or an unused revision allowance. Cached approved editions make no new reservation, and consentless requests make no Meta call.

| Limit | Source default / enforcement |
| --- | --- |
| Public editorial per IP, UTC hour | Four units: one four-unit generation (`worker/budget.ts`) |
| Authorized pilot per IP, UTC hour | Eight units: two four-unit generations (`worker/budget.ts`) |
| Global UTC day | 20 units across Editorial, Asset AI, legacy Magazine, and SAM: at most five four-unit reservations (`worker/budget.ts`) |
| Global lifetime | `MAGAZINE_MAX_CALLS`, default 20, valid range 1–100 (`worker/inference-budget.ts`). The latest owner screenshot showed 20, but the current Production counter is not observable through a read-only API. |
| Cooldown | One accepted reservation per IP per rolling 60 seconds (`worker/budget.ts`) |
| Concurrent Editorial requests | No active-request semaphore; simultaneous requests can reserve independently until a counter is exhausted. |
| Per-user or per-session | None. The limit key is HMAC of Cloudflare's trusted client IP. Owner/Admin has no distinct Editorial allowance. |
| Provider calls and output | Up to four sequential `muse-spark-1.3` calls, each requesting at most 2,200 completion tokens, with a 15-second per-call timeout. Input body is capped at 4 KiB; natural-language prompt at 1,000 characters; owner source payload at 48 KiB. Provider input-token quota is not set in Curio. |
| Browser wait | Silver Field Editorial timeout is 90 seconds. |

These are unit reservations, not guaranteed completed generations. UTC-hour and UTC-day counters expire at the next boundary; cooldown is rolling. The lifetime counter does not reset automatically. Meta account rate limits, spending caps, pricing, and current remaining units are not visible from this repository. `wrangler.jsonc` keeps AI flags false, so a future Git deployment may replace dashboard-only toggles; read back active settings after each deployment.

## Review-only dynamic catalog path

`EDITORIAL_DYNAMIC_CATALOG_ENABLED` is an optional, default-off Worker variable. It has an effect only when `EDITORIAL_PUBLIC_AI_ENABLED=true`. With it off, the existing six-version pilot selection and token authorization remain intact. With it on, the current ranked D1 retrieval selects from published, reader-eligible exact versions. Candidates must have current approved display and AI-analysis rights, complete owner metadata, a succeeded exact-version Muse visual observation, a matching active private R2 object and SHA-256 metadata. Missing or revoked evidence is excluded before model input. The returned Editorial API shape and four-unit reservation are unchanged. The current code evaluates up to 12 ranked candidates and supplies at most six eligible items to Muse. If fewer than two qualify, it returns the existing deterministic fallback.

The flag does not raise limits. Do not enable it until Production eligibility and frontend behavior have been reviewed. The six pinned IDs can remain configured for rollback: set `EDITORIAL_DYNAMIC_CATALOG_ENABLED=false` to restore that selection. For an immediate AI shutoff, first set `MAGAZINE_AI_ENABLED=false`; keep `LEGACY_MAGAZINE_AI_ENABLED=false` and other AI flags unchanged. Confirm active deployment variables after dashboard edits and after Git builds.

## Proposed Demo/Test policy — not implemented in this PR

Thirty four-unit generations per tester per hour require **120 units/hour**; 100/day require **400 units/day per tester**. Both exceed today's 20-unit global daily cap and 100-unit maximum lifetime configuration. A safe implementation needs an authenticated tester identity, separate atomic hourly/daily counters, an active-request lease for the two-concurrent limit, and explicit global daily/lifetime hard caps sized to the approved spending exposure. The current operator Media Studio session and public Editorial endpoint do not provide a secure Owner/Admin identity suitable for differentiated browser limits. No per-user quota should be inferred from an IP alone. Provider quotas and prices must be verified in Meta before choosing a global cap. Anonymous traffic should retain a lower limit. This requires a separately reviewed budget change, not a dashboard-only variable increase.

## Browser-only acceptance after a separately approved deployment

1. Confirm the active Worker version and variables in Cloudflare; verify the existing six-ID pilot remains configured and the dynamic flag is initially off.
2. With the dynamic flag off, use normal Silver Field prompts and verify the published pilot selection still works and fallback remains disclosed.
3. After explicit approval to enable the dynamic flag and public AI, use two distinct prompts associated with eligible published assets outside the six pins. Verify returned `plan.features[].assetId` values match approved exact versions and `source` is `meta` only for independently reviewed editions.
4. Revoke a test asset using the approved publication process, revisit with a different prompt, and verify it is absent from new Editorial responses and `/api/catalog/published`. Do not modify Production records merely to perform this checklist.
5. In the ordinary browser, verify a missing-consent request gives deterministic fallback. Inspect Network response metadata for `inference.reservedUnits`, `fallbackReason`, and `cached` without exposing operator tokens.
6. Return the dynamic flag to false to restore the pinned pilot; set `MAGAZINE_AI_ENABLED=false` for emergency AI shutoff. Verify the effective settings after each change.
