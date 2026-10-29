# Curio five-stage release preparation

This is a **procedure for after explicit merge and deployment approval**. Nothing in this runbook executes automatically. The existing hosting target is the Cloudflare Worker named `curio` in `wrangler.jsonc`, with static Vite assets in `dist`, production URL `https://curio.shuang-han807.workers.dev/`, D1 binding `CATALOG_DB` to `curio-catalog` (`b39c4f63-74ee-47f6-bb1d-7388ecc88bc7`) and SQLite Durable Object `INFERENCE_BUDGET`. No new Cloudflare resource or migration is needed for this frontend PR. `MAGAZINE_AI_ENABLED=false` and `CATALOG_OPERATOR_ENABLED=false` remain the reviewed configuration.

Before any authorized deployment, record the current main commit, current Worker version and a read-only production baseline. Verify the active Cloudflare account is the owner-approved account. A preview or local dry run is not a production deployment.

```sh
npm ci
npm run typecheck
npm run lint
npm test
VITE_DISCOVER_REVIEW=true npm run build
npm run worker:check
npm run test:integration
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
npx wrangler whoami
npx wrangler deployments list --name curio --json
```

The UI is currently opt-in at **build time**: a release build requires `VITE_DISCOVER_REVIEW=true`. Do not set `MAGAZINE_AI_ENABLED=true` or `CATALOG_OPERATOR_ENABLED=true` as part of this UI release. After merge and a separate explicit deployment approval, from the approved main commit and correct Cloudflare account:

```sh
VITE_DISCOVER_REVIEW=true npm run deploy
npx wrangler deployments list --name curio --json
```

Save the prior Worker version ID privately before deployment. For a code/asset rollback, use that exact reviewed version ID:

```sh
npx wrangler rollback PREVIOUS_VERSION_ID --name curio --message 'Revert five-stage UI after smoke check'
```

Verify the rollback target in `wrangler deployments list` first; rollback does not reverse D1 writes. This PR has no D1 migration. Do not use a remote migration or enable an operator route to release the UI.

Read-only live smoke after an approved deployment: verify the production URL serves the five-stage UI; on desktop and real mobile devices, try a prompt **without Meta consent**, confirm an authored edition and `AI not used` disclosure, open an annotated catalog hotspot, read a related story, save/revisit/remove an item, reload to confirm persistence, and test keyboard and reduced-motion behavior. Confirm all 26 assigned image files load and have correct dimensions. Check Worker logs for errors and recheck both production flags remain false. Do not exercise live paid inference without separate authorization.

If visual, rights, security or performance checks fail, stop testing, use the recorded Worker version for rollback after owner authorization and preserve private evidence. Merge, deploy and rollback are separate production actions requiring explicit approval.
