# PR #2 Implementation Brief — Live Muse Spark Magazine Generator

## Purpose

Implement the first **real** Meta-powered Curio magazine-generation workflow, without exposing API credits to abuse. The existing homepage and Cloudflare production site must remain stable.

**Branch:** `feat/meta-magazine-generator` (created from `main`).
**Runtime models:** Meta only. Use `muse-spark-1.3` from `META_SPARK_MODEL`.
**Environment:** `META_API_KEY` (secret) and `META_SPARK_MODEL` (text), set by the user in Cloudflare Production.

## Implementation requirements

1. **Preflight and API discovery:** Confirm the actual request/response shape using Meta's official cookbook and current API reference. Prefer documented SDK-compatible Meta Model API conventions. Never substitute OpenAI's endpoint or inference model. Do not guess undocumented response fields.
2. **Security gate (mandatory before any public inference):** Default feature flag OFF. Require an explicit gate for live calls (e.g. `MAGAZINE_AI_ENABLED` false by default), enforce small bounded input and output, explicit per-IP/request throttling via durable storage or Cloudflare native rate limiting, and a global request/cost ceiling or temporary private-only access. Note: in-memory Worker counters are insufficient. If robust throttling is unavailable, **block the public endpoint** and expose a credentialed development-only smoke test instead. Do not embed a shared password in the frontend.
3. **Data contract:** Create TypeScript + Zod schemas for a validated magazine request, curated magazine response (issue ID/title, category sections, per-ad referenced catalog IDs, commentary), and factual source indicators. The response must refer only to provided catalog items; no invented real brands or shopping links.
4. **Ad catalog:** Add a small, explicitly fictional and labeled fixture catalog (3–6 safe placeholder items). No synthetic imagery is to be represented as a real brand advertisement. A full 24-image Muse Image catalog belongs in the next phase.
5. **Live Muse Spark call:** Server-side only. Use the actual `META_API_KEY` and `META_SPARK_MODEL` when feature-gated. Add short timeouts with actionable errors; avoid logging prompts, API tokens, or potentially identifying user preferences. Validate/normalize model output and recover cleanly from invalid results.
6. **Frontend magazine view:** Make the Generate action render a magazine issue when the API succeeds. Show clear consent/transparency labels for synthetic ad assets, loading, empty-catalog, disabled-feature, timeout, and error states.
7. **Observability and tests:** Add mocked-model contract tests covering failures, unknown IDs, validation, category allocation, throttle behavior and absence of model calls when disabled. Include `npm ci`, typecheck, tests, production build, Wrangler dry-run and preview integration smoke tests.
8. **Document configuration:** Explain necessary Cloudflare settings in one pass; don't request unnecessary R2/D1 bindings yet. Clearly separate a deployment of the code from activation of the live endpoint. Do not enable a publicly accessible paid inference endpoint without effective abuse prevention.
9. **Github:** Push changes to `feat/meta-magazine-generator`, update PR #2, do **not merge** or deploy. Do not modify `main`. No real paid API calls without explicit user authorization.
10. **Proof:** Report exact test results and whether a real Meta API call has occurred. Never claim a real AI magazine was generated if only mock data was used.

## Official references

- https://dev.meta.ai/docs/quickstart
- https://dev.meta.ai/docs/models
- https://github.com/meta-models/meta-model-cookbook/tree/main/01_api_fundamentals
- https://github.com/meta-models/meta-model-cookbook/tree/main/01_api_fundamentals/04_structured_output.ipynb

## Non-goals in PR #2

No SAM 3.1, image generation, brand ad ingestion, purchases, billing, sharing, account system, or new third-party AI services.
