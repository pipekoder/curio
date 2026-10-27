# PR #3 — Advertising library and visual magazine

Scope: [Issue #5](https://github.com/pipekoder/curio/issues/5). Future experience
requirements from [#3](https://github.com/pipekoder/curio/issues/3) and
[#4](https://github.com/pipekoder/curio/issues/4) informed the metadata and bounded
layout intents. Collect, SAM hotspots, contextual questions, curiosity branches,
commerce and profiling are not activated in this PR. The discoverable-object
records preserve stable details and grounding/source labels for those stages;
no fake SAM output or product identification is shown.

## Implemented

- A validated catalog with stable ad and versioned asset IDs, category, all eight
  lifestyle tags, advertiser verification, campaign, alt text/dimensions/local
  path, provenance and modification history, rights status/evidence, optional
  independently approved brand homepage and grounded discoverable details.
- Distinct `licensed_brand`, `synthetic_concept`, and `editorial_support` types.
  Rights-pending and missing-path records are excluded from curation/public
  library. Real brand identity and cleared rights require evidence; brand links
  also require a separate human-reviewed approval registry, currently empty.
- Six bundled original SVG illustration slots, two per category. These remain
  explicitly fictional placeholders, with no invented real brands, product facts
  or license claims. No third-party image was downloaded or used.
- Responsive filtered advertising library and a non-billable authored sample
  edition, available while live inference is disabled. The sample has its own
  `catalog_preview` / `authored_fixture_commentary` provenance, not Meta output.
- Airy alternating split pages and immersive full-frame pages. A bounded model
  `layoutIntent` chooses a deterministic template; readers can override it with
  keyboard-accessible buttons. Reduced motion disables entry animation and image
  transitions. Images reserve space, load eagerly/lazily, and have readable
  fallbacks. Brand identity, campaign, credits and source details sit outside
  image overlays and remain available if an image fails.
- Muse Spark output references exact approved `catalogId` + `assetId`; output
  normalization rejects stale assets, mismatched categories, unknown IDs,
  unpublishable sources and unbounded layout values. Catalog facts are attached
  server-side, never accepted from model-generated advertiser or license data.
- `CatalogRepository` separates consumers from static storage; schema/tests
  support 24 unique records without generating 18 fake advertisements.

## Safeguards retained

The existing Meta Standard model allowlist, server-side secrets, consent/origin
checks, disabled-by-default flag, persistent SQLite per-IP/global reservations,
lifetime call ceiling, input/output bounds, timeout and no-retry behavior remain.
`worker/budget.ts`, `wrangler.jsonc`, secret values and Cloudflare settings were
not changed. No public inference was enabled. No paid Meta or other AI API was
called. Worker integration intercepts every model request with mocks.

## Verification commands

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run worker:check
npm run test:integration
npx playwright install --with-deps chromium
npm run test:browser
```

For a system Chromium, set `CHROMIUM_PATH=/usr/bin/chromium` on the browser
command. Browser tests use built Vite preview assets with inference/configuration
mocked and external fonts blocked. No deployment or real inference is required.
Tests cover schemas, evidence/link restrictions, 24-item expansion, stale asset
IDs, missing paths/broken images, filters, source labels, both layouts, keyboard
controls, 1280 px desktop and 390 px mobile bounds, and actual reduced-motion CSS.
The prior generation/security and SQLite restart/concurrency tests still run.

Local results and final hosted CI results are recorded on the PR. Screenshots
are produced under ignored `test-results/` and uploaded by CI for review. Vite's
existing harmless Zod comment-annotation warnings remain.

## Assets and remaining limits

See [asset register and owner checklist](ASSET_REGISTER.md) for the exact six
files and required permissions/credits. Real licensed advertising and richer
photographic imagery remain dependent on owner-supplied files and rights proof.
Schema checks validate evidence references, not the legal sufficiency of a
license. No production CPU/account/hosting quota checks or real Meta contract
execution occurred; those remain separately authorized work. No R2/D1, new
Cloudflare configuration, migration, dashboard change, deployment or merge is
needed or performed for this implementation.

## Recorded local verification (2026-10-27)

Node 24.19.0 / npm 11.9.0; system Chromium for browser checks.

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed, 196 packages |
| `npm audit` | Zero vulnerabilities, including development dependencies |
| TypeScript | Passed: frontend, Worker, shared contracts, configuration and tests |
| Vitest | 79 passed, 0 failed, 5 files |
| Production build | Passed; client JS 329.14 kB / 101.08 kB gzip; CSS 7.13 kB / 2.32 kB gzip |
| Wrangler dry run | Passed; Worker 845.09 KiB / 140.41 KiB gzip |
| Worker integration | Passed: durable quota concurrency/restart with mock inference, exact asset/layout/source output, built frontend and all six SVG assets, SPA/API behavior |
| Chromium browser tests | 4 passed, 0 failed: desktop, mobile, reduced motion/keyboard and broken-image provenance |
| Manual screenshot inspection | Desktop and mobile reader images inspected; attribution stays outside images |
| Paid or real Meta API calls | 0 |

CI runs these checks on Node 22 and uploads the reader screenshots. Hosted results
are recorded in the PR conversation after the branch is pushed. This is a local
runtime/visual verification, not production deployment or real model validation.
