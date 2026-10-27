# Curio — Engineering Plan

## Stack
- Frontend: React, TypeScript, Vite.
- Backend: Cloudflare Workers + Hono.
- Assets: Cloudflare R2; structured records and share links: D1 when persistence is needed.
- Models: Meta Model API for Muse Spark and SAM 3.1. Muse Image for pre-generated synthetic ad assets.
- Development: Codex, GitHub PR workflow.
- Initial hosting: Cloudflare Workers Free; upgrade to Paid only if CPU/runtime constraints require it.

## First implementation slice
1. Create a working Vite + React frontend and Hono Worker with Wrangler configuration and local dev scripts.
2. Build a responsive English-language homepage with lifestyle selection and three category weights totaling 100%.
3. Define versioned TypeScript contracts for Ad, Lifestyle, MagazineRequest, MagazineIssue and DecoderResult.
4. Add a server-only Meta Model API client with timeout, constrained output validation, safe errors and no keys in front-end bundles.
5. Add a **non-billable health endpoint** and a *separate opt-in* Meta API smoke test, never silently invoking paid models during normal builds/tests.
6. Build minimal magazine rendering using fixtures, clearly labeled fixture/synthetic; replace editorial logic with real Muse Spark when credentials are available.
7. Add checks: typecheck, lint, unit tests, production build. Record actual results in the PR.

## Safeguards
- Use environment bindings for secrets and document their names only, not values.
- Prohibit non-Meta inference SDKs and any non-Meta model invocation at runtime (including embeddings and fallback models).
- Never call the Meta Model API from the browser.
- Block arbitrary client-provided asset URLs from being fetched by the backend; only trust allowlisted catalog assets.
- Do not guess undocumented Meta model identifiers or request formats: use official API docs and validate with the actual developer account.
- Persist failures safely; do not label fixtures as real AI output.
- Keep main protected through PR-based work; no force pushes.

## Milestones
- Oct 28: first end-to-end issue generation (or documented credential blocker).
- Oct 30: working Decoder and stable end-to-end demo, about 90% of core V1.
- Nov 1: feature freeze.
- Nov 2–3: user study, evidence, English pitch and video, final QA.
- Nov 4: submit ahead of deadline.

## Evidence to collect
Latency of model calls, proportion of successful requests, decoded regions grounded in segmentation, limitations, verification references, test runs, real user study results. Assess brand recall with unprompted and aided recall rather than treating dwell time as equivalent to awareness.
