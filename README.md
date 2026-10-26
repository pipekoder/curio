# Curio

**From Advertising to Discovery.**

Curio is an AI-powered personalized advertising magazine. Readers choose lifestyles, control the editorial mix, and explore stories and details behind advertising.

## Stack
React / TypeScript / Vite; Cloudflare Workers / Hono; planned Cloudflare R2 and D1; runtime inference exclusively through Meta models.

## Getting started
Node.js 22+ and npm recommended.

```bash
npm install
npm run typecheck
npm run build
npm run worker:dev
```

In a separate terminal, run `npm run dev` to start the Vite frontend, which proxies `/api` to port 8787.

## Status
The homepage, form validation, and Worker route are scaffolding. **Muse Spark and SAM 3.1 are not yet integrated.** The magazine endpoint returns an explicit HTTP 501 response, not simulated AI output.

Copy `.dev.vars.example` to `.dev.vars` to configure local Meta credentials once model access is confirmed. Never commit keys. The public demo, Cloudflare account binding, R2/D1 provisioning, and tests are still pending.

See [product specification](docs/PRODUCT_SPEC.md) and [engineering plan](docs/ENGINEERING_PLAN.md).

Every AI model called at runtime must be a Meta model. Codex may be used to write and test the app. Synthetic ads must be labeled as such.
