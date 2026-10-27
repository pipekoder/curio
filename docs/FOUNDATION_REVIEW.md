# Foundation review

## Fixes

- Replaced the unpublished `@cloudflare/workers-types@^4.20261020.0` dependency with the published v5 types; committed npm's lockfile and removed the unused validator package.
- Included build/test configuration and tests in TypeScript checks; documented Node 22.12+.
- Reserved both `/api` and `/api/*` for Hono. Previously `/api` returned SPA HTML with status 200.
- Ignored `.dev.vars` variants and `.wrangler` state while keeping the credential example tracked.
- Rejected blank or excessively long lifestyle names at the API boundary.
- Added API and React component tests, local workerd integration checks, and GitHub Actions CI. None require inference credentials.

## Verification on 2026-10-26

Local environment: Node 24.19.0, npm 11.9.0. CI targets Node 22.

- Dependency installation, lockfile generation and clean `npm ci`: passed.
- `npm audit` (including development dependencies): zero vulnerabilities.
- `npm run typecheck`: passed, including frontend, Worker, Vite/Vitest config and tests.
- `npm test`: 13 tests passed across two files.
- `npm run build`: passed; client JS 226.20 kB (71.02 kB gzip), CSS 2.43 kB (1.04 kB gzip).
- `npm run worker:check`: local Wrangler dry run passed; Worker approximately 134.38 KiB gzip.
- `npm run test:integration`: passed on local workerd. Verified health JSON; root HTML and its built JS; SPA deep link; `/api` and unknown API JSON 404s; valid magazine request 501; malformed JSON 400.
- Runtime source/dependency review: no AI SDKs, external inference calls, embeddings, or fallback models. The only application fetch is the frontend's same-origin `/api/magazine` request. A test forbids outbound fetch during the magazine handler. This is a scaffold, so **no models are called at runtime**, including Meta models.
- Component behavior was verified in jsdom; no visual browser or production deployment test was performed.

## Cloudflare Workers Free assessment

The current scaffold uses standard Workers Web APIs, Hono and Zod, plus static
assets. It needs no Node compatibility flag, paid bindings, R2, D1, or AI binding.
The dry-run Worker is well below the Free plan's 3 MiB compressed bundle limit;
there are only four static files, each well below the 25 MiB per-file limit.
Static frontend assets are served by the assets service, and API routes run the
Worker first. The configuration does not request paid CPU limits or services.

This is compatible with the Free plan at the scaffold level. Free Worker limits
still apply (including 100,000 dynamic requests/day, 10 ms CPU per invocation,
128 MiB memory and 50 external subrequests per invocation). No handler currently
makes external subrequests. Local tests do not prove production CPU/memory,
startup behavior, account quotas or entitlement: those require a separately
authorized deployment and production observation. Future generation,
segmentation, storage and image processing need a new budget/limits review;
API inference availability and cost are separate from Workers hosting.

## Remaining blockers

- Magazine generation intentionally returns 501. Meta API access, official model identifiers and schemas must be confirmed before implementing Muse Spark/SAM integration. No credentialed AI smoke test was run, and no paid AI API was called.
- No Cloudflare account resources or deployment were configured or verified. R2/D1 remain planned work.
- GitHub Actions results must be checked on the pushed commit; local checks alone do not establish hosted CI success.
- External Google Fonts are present in CSS; offline or blocked font requests fall back to system fonts.

No merge or deployment was performed, and no changes were made to `main`.
