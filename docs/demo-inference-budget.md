# Default-off Demo Editorial budget

This backend-only policy is separate from PR #65's dynamic Content Studio selection. It does not change the Silver Field interface or `/api/editorial` response. It must not be enabled until the owner approves deployment and checks Meta's account quota and price for `muse-spark-1.3`.

## Unit accounting

One reviewed Editorial request atomically reserves **4 units** before any provider call. A first-pass Chief Editor + Reviewer result uses 2 model calls; Revision + Confirmation brings the maximum to 4. Unused units are not refunded, and failed, cancelled, or timed-out requests keep their reservation. An approved 5-minute cached plan, rejected consent, or failed preflight reserves zero units. Existing counters stay in the same `magazine-v1` Durable Object and are not reset by rollout.

When explicitly enabled, the demo policy allows an authenticated tester 40 units per UTC hour (10 reviewed requests) and 120 units per UTC day (30). Two leases can be active for the same tester; the 60-second IP cooldown permits at most two authenticated reservations in that window. Anonymous Editorial requests remain at 4 units per IP per UTC hour (one reviewed request) and one per rolling 60 seconds. All workflows share a 160-unit UTC-day cap and a 500-unit cumulative cap. This is at most 40 new reviewed editions/day and 125 over the lifetime of this Durable Object, minus units already spent on any workflow. At four calls per edition the absolute model-call exposure is at most 160/day and 500 cumulative, subject to provider failures and other workflow usage. Each call requests at most 2,200 completion tokens; input-token and provider billing limits must be checked in Meta.

The old `MAGAZINE_MAX_CALLS` variable retains its 1–100 validation and is not set to 500. The demo policy uses **new, explicit** caps. When disabled, the old 20-unit daily cap and `MAGAZINE_MAX_CALLS` lifetime ceiling apply. If demo use raises the existing lifetime counter above the old ceiling, switching back to the old policy safely blocks further inference rather than resetting usage.

## Secure identification and operator status

The Owner can obtain a one-hour, Secure/HttpOnly/SameSite=Strict browser cookie through `POST /api/editorial/demo-session` with the existing operator Bearer token. Distinct testers use separate random tokens whose SHA-256 hashes are configured as a Cloudflare secret in `EDITORIAL_TESTER_TOKEN_HASHES` (`tester_id:64_hex_hash`, comma-separated, up to 10). The Worker verifies the token, same-origin `Origin`, and Cloudflare IP, then signs and IP-binds the cookie with `RATE_LIMIT_SALT`. A token or salt rotation invalidates sessions; `DELETE /api/editorial/demo-session` clears the cookie. The frontend sends the cookie automatically during ordinary same-origin Editorial requests. No token is stored in frontend code or sent to Meta. Without a valid cookie, the anonymous limit applies. When a six-version pilot remains pinned, unauthenticated visitors still receive its existing authorization fallback; the one/hour anonymous policy applies when public Editorial mode is otherwise eligible.

`GET /api/operator/catalog/intelligence/budget/status` is protected by the existing catalog operator middleware. It reads the shared DO without reserving units, including after the master AI switch is turned off. It reports total, used, remaining, UTC reset time, active-policy indicators, and the latest 20 aggregate reservation outcomes. It excludes IPs, tester IDs, prompts and credentials. A denied request never increments counters. An accepted request keeps its units even if its lease is released; an abandoned lease expires after 180 seconds. The Worker makes a best-effort release on completion and errors.

## Production settings and rollback

No setting changes are made by this PR. After separately approved deployment, retain all existing D1/R2/DO bindings, secrets, review flags and four-unit workflow. To activate the demo policy deliberately, configure:

```text
EDITORIAL_DEMO_BUDGET_ENABLED=true
EDITORIAL_DEMO_DAILY_UNITS=160
EDITORIAL_DEMO_LIFETIME_UNITS=500
EDITORIAL_TESTER_TOKEN_HASHES=<secret; only if non-owner testers are needed>
```

The flag only activates when `MAGAZINE_AI_ENABLED`, `EDITORIAL_REVIEW_ENABLED`, and `EDITORIAL_PUBLIC_AI_ENABLED` are already true, and the existing `INFERENCE_BUDGET` and `RATE_LIMIT_SALT` are valid. An invalid partial demo configuration fails closed. Keep `LEGACY_MAGAZINE_AI_ENABLED=false`, `ASSET_AI_ENABLED=false`, and `SAM_DECODER_ENABLED=false` unless separately approved. The values are not placed in `wrangler.jsonc`; read back the effective Cloudflare variables after each Git deployment because source-controlled defaults can overwrite dashboard-only values.

For emergency shutoff, set `MAGAZINE_AI_ENABLED=false` first. For budget rollback, set `EDITORIAL_DEMO_BUDGET_ENABLED=false` and verify the operator status endpoint reports `mode: standard`; existing usage is preserved. Restore any prior public/pilot flags only according to the separately approved release plan. No D1 migration is needed; the existing Durable Object creates its two additional SQLite tables on first use, retaining the original `counters` table.

## Browser acceptance after approval

1. Confirm effective Worker version, flags, bindings, Meta quota and a budget-status readback before enabling the demo flag.
2. Obtain an Owner session from the unlocked Media Studio browser without printing its token: `fetch('/api/editorial/demo-session',{method:'POST',headers:{Authorization:'Bearer '+sessionStorage.getItem('curio.media.operator')}})`. Check HTTP 200 and a one-hour expiry; do not copy the token into the console output.
3. Use the normal Silver Field prompt with consent. Confirm `source: meta` only on Reviewer-approved results and `inference.reservedUnits: 4` for new requests. Distinguish a cached result from a new reservation.
4. Test multiple prompts with at least 60 seconds between batches. The first two simultaneous Owner requests may be admitted; a third must be denied by the concurrency/cooldown guard. Avoid deliberately spending quota solely to test the 10/hour boundary in Production; local regression tests cover it.
5. Verify status totals advance in four-unit increments and denial outcomes appear without prompts or identities. Confirm anonymous requests still use the lower budget and no consent still gives deterministic fallback.
6. Clear the session with `fetch('/api/editorial/demo-session',{method:'DELETE'})`, then verify the higher allowance is gone. Set the demo flag false for rollback, or set `MAGAZINE_AI_ENABLED=false` for immediate inference shutoff.
