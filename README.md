# Curio

**From Advertising to Discovery.**

Curio is an AI-powered personalized advertising magazine. Readers choose lifestyles, control the editorial mix, and explore stories and details behind advertising.

## Stack
React / TypeScript / Vite; Cloudflare Workers / Hono; planned Cloudflare R2 and D1; runtime inference exclusively through Meta models.

## Getting started
Node.js 22.12+ and npm recommended. CI uses Node.js 22.

```bash
npm ci
npm run typecheck
npm run build
npm run worker:dev
```

In a separate terminal, run `npm run dev` to start the Vite frontend, which proxies `/api` to port 8787.

## Status
The consented magazine flow, fictional catalog, Meta Standard client and durable
abuse protection are implemented. **Live inference remains off by default.** No
real model call has been made during implementation; successful test editions
use mock model responses. No R2/D1 resources or deployment are required to test.

Read [PR #2 configuration and safeguards](docs/PR2_CONFIGURATION.md) before any
future deployment or paid inference activation. Keep credentials server-side.

See [product specification](docs/PRODUCT_SPEC.md) and [engineering plan](docs/ENGINEERING_PLAN.md).

Every AI model called at runtime must be a Meta model. Codex may be used to write and test the app. Synthetic ads must be labeled as such.

## Checks (no credentials or paid API calls)

```bash
npm run typecheck
npm test
npm run build
npm run worker:check
npm run test:integration
```

`worker:check` only bundles with Wrangler's `--dry-run`; it does not upload or deploy.
The integration check starts a local workerd on port 18787 and verifies the built
React assets, SPA deep links, health, API 404 routing, validation, and the explicit
disabled magazine 503 response. Run `build` and `worker:check` first. Keep `.dev.vars` absent for this check;
health is expected to report `metaConfigured: false`. Unit/component tests cover
form submission, disabled states, offline recovery, and API validation. GitHub
Actions runs these checks on pull requests and pushes to `feat/foundation` and `feat/meta-magazine-generator`.

See [foundation verification](docs/FOUNDATION_REVIEW.md) for results and limits.

PR #1 results in `docs/FOUNDATION_REVIEW.md` are historical; PR #2 changes and
current configuration are described in `docs/PR2_CONFIGURATION.md`.

## Advertising library and reader

The library now includes six local, explicitly fictional illustration slots,
category/lifestyle filters, and a non-billable sample reader with two editorial
layouts. See [PR #3 review](docs/PR3_REVIEW.md) and the
[asset/permission checklist](docs/ASSET_REGISTER.md) before replacing placeholders
with real campaign assets. The sample reader never calls an inference API.
