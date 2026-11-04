# Inference budget visibility and safe rate configuration

The shared `INFERENCE_BUDGET` Durable Object still uses the same `magazine-v1` identity, SQLite tables and counters. This PR does not reset usage, change `wrangler.jsonc`, enable inference or increase a Production limit. A failed provider call may still consume its reserved units. The response contract remains additive: a denied Article Edition returns the existing HTTP 200 deterministic `fallbackReason:"budget"` plus a `budget` diagnostic; Article preparation returns its existing HTTP 429 plus the diagnostic. The ordinary Editorial fallback can also carry the same field. Old clients may ignore it.

A four-unit Article Edition reservation can be stopped, in order, by the shared lifetime cap, shared UTC-day cap, per-IP UTC-hour cap, rolling cooldown, or, for an authenticated Demo session, tester concurrent/hour/day caps. Missing-image preparation uses one unit per image and has independent preparation concurrency, per-IP UTC-hour/day and rolling-window gates before the shared caps. SAM uses its existing one-call-per-asset gate. The first failed gate returns `limitType`, `limit`, `used`, `remaining`, `requestedUnits`, `measure`, and an applicable `retryAfterSeconds`/`resetAt`. A lifetime or once-per-asset gate has no automatic reset time. The public response omits shared global `limit` and `used` to avoid revealing other visitors' usage; `remaining` then means the number of complete requests of the requested size that fit, which is zero on denial. The authenticated operator status retains exact shared units.

`GET /api/operator/catalog/intelligence/budget/status` uses existing operator authentication. It reports mode, lifetime/day limits and remaining units, UTC reset, safe per-IP usage for the authenticated request when `CF-Connecting-IP` and `RATE_LIMIT_SALT` are present, Demo tester usage only when a valid tester session is also present, recent denial categories, and the effective Worker policy. It never returns IP digests, tester IDs, cookie contents or counter keys. It performs Durable Object status reads, not D1 queries.

Defaults and optional Worker environment overrides (all integers, validated before reservation):

| Variable | Default | Allowed |
| --- | ---: | ---: |
| `INFERENCE_STANDARD_HOURLY_UNITS` | 3 | 1–1000 |
| `INFERENCE_REVIEWED_HOURLY_UNITS` | 4 | 4–1000 |
| `INFERENCE_PILOT_HOURLY_UNITS` | 8 | 4–16 |
| `INFERENCE_TESTER_HOURLY_UNITS` | 40 | 4–1000 |
| `INFERENCE_TESTER_DAILY_UNITS` | 120 | 4–2000, and at least tester hourly |
| `INFERENCE_COOLDOWN_SECONDS` | 60 | 5–600 |
| `INFERENCE_TESTER_CONCURRENT` | 2 | 1–2 |

The Demo deployment pins the judging values in `wrangler.jsonc` (200/200/200/1000 hourly/daily quotas, 5-second cooldown, 1000-unit Demo day, 5000-unit Demo lifetime, 200-unit/15-minute testing window). Hourly, cooldown and tester rates are deployment-wide: they apply identically whether Demo is on or off. The Demo toggle switches the shared ceilings (Demo 5000/1000 vs Standard 100/100) and enables the tester lanes and testing window. A deployment without the overrides keeps the restrictive defaults above.

The existing `MAGAZINE_MAX_CALLS` (standard lifetime), `INFERENCE_DAILY_MAX_UNITS` (standard day), and `EDITORIAL_DEMO_LIFETIME_UNITS`/`EDITORIAL_DEMO_DAILY_UNITS` (Demo shared caps) remain separate, validated and authoritative. The source-controlled `wrangler.jsonc` on this branch sets standard lifetime/day to 100 units each, but that is **not** a verified Production runtime readback. The five existing `ARTICLE_PREP_*` variables still govern image preparation. An invalid override fails closed; it never silently increases the fallback cap. Dashboard changes are runtime configuration, but a subsequent Git/Wrangler deployment can replace Dashboard values with the source-controlled configuration. Record the approved values through the existing configuration release process before deploying, then verify the protected status endpoint. No new migration or Durable Object is needed.

The external Meta account rate/quota and provider spending cap are separate and cannot be changed through these Worker variables. Provider errors, timeouts and content validation failures are not budget denials. The hard four-call reviewed workflow, SAM once-per-asset rule, atomic reservation, non-refunding charges and maximum two concurrent tester generations remain unchanged. To investigate the reported Production fallback, read the authenticated status endpoint after deployment; the prior response alone cannot reveal which counter stopped it.
