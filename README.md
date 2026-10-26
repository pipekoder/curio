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
The homepage, form validation, and Worker route are scaffolding. **Muse Spark and SAM 3.1 are not yet integrated.** The magazine endpoint returns an explicit HTTP 501 response, not simulated AI output.

Copy `.dev.vars.example` to `.dev.vars` to configure local Meta credentials once model access is confirmed. Never commit keys. The public demo, Cloudflare account binding, and R2/D1 provisioning are still pending.

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
magazine 501 response. Run `build` first. Keep `.dev.vars` absent for this check;
health is expected to report `metaConfigured: false`. Unit/component tests cover
form submission, disabled states, offline recovery, and API validation. GitHub
Actions runs these checks on pull requests and pushes to `feat/foundation`.

See [foundation verification](docs/FOUNDATION_REVIEW.md) for results and limits.
