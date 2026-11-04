# Demo Testing window

`DEMO_TESTING_MODE=true` activates a separate short-window allowance only for a valid, IP-bound, HttpOnly Demo Tester session. It also requires the existing Demo policy: `EDITORIAL_DEMO_BUDGET_ENABLED=true`, `EDITORIAL_DEMO_DAILY_UNITS` (up to 2000), `EDITORIAL_DEMO_LIFETIME_UNITS` (up to 10000), the existing public/editorial/review AI flags, `INFERENCE_BUDGET`, and the existing operator or tester credentials. The master toggle defaults to off; `false` and unset keep the prior Demo and standard rate policies. Invalid toggle or window values reject reservations rather than granting an allowance.

| Variable | Default | Valid range |
| --- | ---: | ---: |
| `DEMO_TESTING_MODE` | `false` | `true` or `false` |
| `DEMO_TESTING_WINDOW_SECONDS` | `900` | integer 300–3600 |
| `DEMO_TESTING_WINDOW_UNITS` | `200` | multiple of four, 4–1000 |

The window is a fixed UTC interval: `floor(now / windowSeconds)`. Fifty accepted four-unit reviewed generations fit in a fresh judging window (200 units). At the boundary, only that window's counter expires. Accepted reservations, including failed or timed-out provider calls, remain charged to the shared daily and lifetime counters. A renewed window does not clear tester daily use, reservations, SAM once-per-asset use, or provider billing. Changing the window duration can start a different short-window key, but cannot reset the shared daily/lifetime limits.

The reservation order is SAM once-per-asset (when applicable), shared lifetime, shared UTC day, then the caller's rate policy. A valid tester using the toggle is subject to the existing two-lease concurrency cap, existing tester UTC-day limit, and the dedicated window. Their ordinary per-IP hour, tester hour, and cooldown do not also block the enhanced window. With the toggle off, the existing tester hour/day, per-IP hour/cooldown, pilot, and anonymous limits remain. SAM and Article Preparation keep their existing one-unit, once-per-asset and preparation-specific limits; neither gets the testing window. The tester daily default is 120 units and can be changed within its validated 4–2000 range with `INFERENCE_TESTER_DAILY_UNITS` (1000 on the Demo deployment). The shared Demo daily and lifetime caps remain separately configured and authoritative.

The existing authenticated `GET /api/operator/catalog/intelligence/budget/status` reports `demoTesting.enabled`, `authenticated`, `active`, the configured window and, for an authenticated session, `demoTestingWindow` use, remaining units, UTC reset, whether another four-unit reservation is allowed, and the first blocking limit. It also retains shared quota totals and recent denial categories. To inspect a tester's window, the operator must have both valid operator authorization and that tester session in the same request; status never exposes a tester key or another visitor's window.

For a controlled activation, deploy this code through the existing release process with no toggle enabled, confirm the existing shared Durable Object and Demo caps through the protected status endpoint, then enable the window through the source-controlled configuration below. Establish an existing Demo Tester session and read status again before testing. No Durable Object replacement, counter reset, or D1 migration is needed.

To turn off the enhanced window, set `DEMO_TESTING_MODE=false` in `wrangler.jsonc` and verify `demoTesting.active=false` in the protected status endpoint. For emergency AI shutoff, use the existing `MAGAZINE_AI_ENABLED=false` control. All usage history remains in `magazine-v1`. The existing global caps or an external Meta quota can still deny an otherwise available window.

## Configuration persistence across deployments

`wrangler.jsonc` is the source of truth for every non-secret Worker variable. Each Wrangler deployment uploads the file's `vars` and overwrites same-name Dashboard entries, which is why Dashboard-only Demo values disappeared after deploys. The fix is to keep the intended values in the file; `tests/wrangler-config.test.ts` pins them so a deploy can never silently reset them.

Source-controlled (`vars` in `wrangler.jsonc`): all feature flags and boolean switches, the five `ARTICLE_PREP_*` limits, the Demo Testing window (`DEMO_TESTING_MODE`, `DEMO_TESTING_WINDOW_SECONDS`, `DEMO_TESTING_WINDOW_UNITS`), the Demo budget caps (`EDITORIAL_DEMO_BUDGET_ENABLED`, `EDITORIAL_DEMO_DAILY_UNITS`, `EDITORIAL_DEMO_LIFETIME_UNITS`), `ARTICLE_CHIEF_TIMEOUT_MS`, inference budgets, rate-limit overrides, models, `PUBLIC_APP_ORIGIN`, and the catalog operator/public toggles.

Cloudflare Secrets (never in source control): `META_API_KEY`, `CATALOG_OPERATOR_TOKEN`, `RATE_LIMIT_SALT`, `SAM_OPERATOR_TOKEN`, `EDITORIAL_TESTER_TOKEN_HASHES`, and `EDITORIAL_REVIEW_PILOT_TOKEN`. Manage them only with `wrangler secret` or Dashboard Secrets; a file deployment neither uploads nor removes secrets.

Prevention checklist: never depend on a Dashboard-only variable; change non-secret values through a reviewed `wrangler.jsonc` edit; keep secrets out of the file (the config test rejects `TOKEN|SECRET|API_KEY|SALT` keys); read the values back after every deployment.

Post-deployment check (no inference cost): with operator authorization, read `GET /api/operator/catalog/intelligence/budget/status` and confirm `demoTesting.enabled=true`, the configured window (`900` seconds, `200` units), Demo daily/lifetime caps (`1000`/`5000`), and the effective Worker policy. With a Demo Tester session in the same request, confirm `demoTesting.authenticated=true` and `active=true` before testing.
