# Final integration and merge-readiness review

Scope: preparation and verification only, 28 October 2026 (Europe/Stockholm). **No PR merge, main update, deployment, remote D1 write, production setting change or paid AI call.** All existing PR branches remain unchanged. The candidate is a separate review branch; it adds no feature or redesign.

## Exact sources and prepared order

Latest main was verified through GitHub's branch API as `7aba1be6969d90d79eb7a3c4c1b7cb9575fdece9`. All three PRs are open; independent CI runs pass. The prepared sequence is linear and starts at that exact main.

| Order | Workstream/source | Prepared commit | Files in delta |
|---|---|---|---|
| 1 | #19 `3fcef9e1d970733319b47bfa5ce84169c957905c` | `3fcef9e1d970733319b47bfa5ce84169c957905c` (original reused) | 11 |
| 2 | #20 `125396a01f6309d665aa62a6f93fc531cfe3bfe0` | `ef629757a944b5bd6807b4e0de05aed899faaf82` (rebased after #19) | 21 |
| 3 | Six-file replay delta, snapshot `21f68ea2978e30bcf54806a14e0a3013f4ee553d` | `93754e7f39bd7b184da5ed69b6e21d325906d918` | 6 |
| 4 | #21 `6e8e6427b7ca44d148efd9f20f920132a043c876`, including focus fix | `28afdc1b9656736234d9b4d19716ae1aceb5dbde` | 14 |

The local preparation equivalents are `3868b85c0dbbc6e9c268d286f0bad6bd8fad8a9a`, `6b4062ae363fbe94f45035dcce6e75e8b4aab2b9`, `e76935f82cc9141e266970cc985e235826bc3cf9`, and `ce22b880f9e86b08c75697302824ee2afa11993b`. Different commit metadata/parents explain different SHAs; tree equality, not matching author timestamps, is the verification.

**Recommended approval/landing order: #19 → #20 → focused replay → focused #21.** Do not merge the old integration snapshot or the unretargeted #21 branch directly into main: their ancestry includes prerequisite snapshots. After #19/#20 land, retarget/rebase the six-file replay delta onto actual main, then rebase/retarget #21 onto that replay result. Do not blindly cherry-pick prepared commits if squash merges changed ancestry; use the explicit deltas and rerun checks. If main or any source SHA advances, this review must be refreshed.

The review PR/branch is a verification candidate, not authorization to bypass source approvals or merge automatically. The final reporting commit adds only this document and the audit JSON.

## Compatibility, overlaps and duplication proof

No textual conflicts occurred in the recommended order. `eslint.config.js` and `worker/editorial.ts` auto-applied for #19/#20; review their combined semantics despite clean application.

| Pair | Overlapping files |
|---|---|
| PR19 + PR20 | `eslint.config.js`, `worker/editorial.ts` |
| PR19 + replay | `eslint.config.js` |
| PR19 + PR21 | `dev/norm-asset.ts`, `dev/norm-workflow.ts`, `docs/NORM_LOCAL_VALIDATION.md`, `eslint.config.js`, `scripts/norm-local-validation.mjs`, `tests/norm-local.test.ts` |
| PR20 + replay | `.github/workflows/ci.yml`, `eslint.config.js` |
| PR20 + PR21 | `.github/workflows/ci.yml`, `eslint.config.js` |
| replay + PR21 | `.github/workflows/ci.yml`, `eslint.config.js` |

The replay was extracted from local trees `57189c7..4176e05`, not cherry-picked as the full published snapshot (which bundles #19/#20). It changes only `.github/workflows/ci.yml`, `eslint.config.js`, `dev/norm-replay.ts`, `scripts/replay-norm-sam.mjs`, `tests/norm-replay.test.ts`, and `docs/INTEGRATION_DEMO_READINESS.md`.

Proofs (all passed):

- The #19 prepared tree is identical to its original source.
- #19 + rebased #20 is identical to the snapshot foundation tree `e35d3edde1d122f1b75a3c465cbd4adc4ee5c3f8`.
- Adding only replay reproduces snapshot tree `5dc25a31c2983928cb305d958e8a4e1bf569fbfb`.
- Adding only #21 feature + focus-fix delta produces tree `eb3a194841b2b9a5afcae5816690539ae385012a`, byte-for-byte identical to CI-passed source #21 (`6e8e642`).
- The final feature delta contains exactly the union of the four source changesets: **41 unique files**. No extra snapshot foundation changes or unpublished Discovery files appear.

[Machine-readable audit, per-file blob hashes and source ownership](evidence/final-integration-audit.json). Reporting files are additional non-runtime evidence and are not included in the source-tree equality comparison.

## Safeguards and user journey

- `wrangler.jsonc`, all production migrations, budget implementation/reservation helper, catalog operator middleware/store, core catalog/URL policy and reviewed approval registry are byte-identical to main. `MAGAZINE_AI_ENABLED=false` and `CATALOG_OPERATOR_ENABLED=false` remain repository defaults. Live production variables were not changed or independently re-read.
- Display, analysis and editing grants remain independent; the Norm test derivative is an exact-fingerprint local-only permit with pending general rights, never a public publication grant. The 33 unverified candidates stay excluded. No photograph/ZIP or private inference evidence is tracked.
- Muse and SAM remain Meta-only; fixed endpoints/models, explicit consent, request budgets, caching/claims, validation, no-retry behavior and unknown SAM cost handling are preserved. One selected SAM concept means one approved request, not a multi-concept billing loop.
- Structured editorial grounding and deterministic fallbacks remain. Legacy Focused Home is retained as genuine captured-response regression; new V2 quality/localization tests are mocked and do not establish new live detection success.
- SAM raw geometry is preserved. Cross-concept identities carry asset/version/fingerprint/concept scope; overlaps remain separate pending review. Seven-box seating replay preserves protected `sam-1`/`sam-4` identities and does not invent missing coordinates.
- Keyboard startup readiness fix is included. Native Tab/Enter, touch, responsive layouts, reduced motion, story navigation, related discovery and local Collect are exercised by the full Chromium suite.

## Discovery status

A full GitHub PR inventory (all states, not only this user's open PRs) found no Adaptive Gallery Discovery PR. Existing open PRs are #12, #19, #20 and #21. Local Discovery WIP is `7354e0c`; it is NOT integrated.

Do not assume a WIP `/api/catalog` route is published. Wait for an actual PR/API contract, then inspect publication authority, response validation, stable IDs/versions/fingerprints, revocation and permission separation before wiring `PublishedContentLibrary`. This is not a blocker for the approved-illustration fallback demo, but is a blocker for claiming a completed persistent real-image library integration.

## Test and CI evidence

Fresh candidate results (ordered main-based stack):

| Check | Result |
|---|---|
| Clean dependency installation | Passed, locked `npm ci --ignore-scripts` |
| TypeScript/typecheck | Passed |
| Lint, including private/replay/localization modules | Passed |
| Unit/security | **246 passed, 0 failed, 23 files**; private JPEG supplied locally |
| Production build | Passed |
| Wrangler Worker dry-run | Passed; production defaults false, no deploy |
| Worker acceptance/integration/workerd | **All seven reported checks passed**, mocked outbound model traffic |
| Full Chromium, CI-mode local run | **33 passed, 0 failed** |
| Duplication/protected-file audit | **7/7 checks passed** |

The new draft verification PR will provide a separate CI run on the prepared stack. Its final status is recorded in the PR/report message, not assumed from source tree equality. Source CI is already green:

- #19: [run 40670613705](https://github.com/pipekoder/curio/actions/runs/40670613705).
- #20: [run 40677898052](https://github.com/pipekoder/curio/actions/runs/40677898052).
- #21 with focus correction: [run 40700393966](https://github.com/pipekoder/curio/actions/runs/40700393966); 33 Chromium checks on Chromium 156, 236 unit/security passed + 10 private-file skips.

Local private-file tests use the owner-provided JPEG and mocked transports. The genuine seven-box capture `/tmp/curio-norm-live-sam-01/sam-segmentation.json` is unavailable here; its real visual grouping review remains an owner action. No paid call, new genuine observation, unsupported rights approval or fabricated geometry is substituted for it.

## Explicit file review inventory

Review every row; overlaps are intentional changes to the same file, not duplicated commits. Prioritize `worker/editorial.ts`, `dev/norm-workflow.ts`, the two asset-analysis modules, `shared/reader-media.ts`, `shared/object-groups.ts`, `shared/object-localization.ts`, private replay/path/evidence handling, and the keyboard regression.

| File | Source stages |
|---|---|
| `.github/workflows/ci.yml` | PR20, replay, PR21 |
| `dev/norm-asset.ts` | PR19, PR21 |
| `dev/norm-replay.ts` | replay |
| `dev/norm-workflow.ts` | PR19, PR21 |
| `docs/EDITORIAL_UX_V2.md` | PR20 |
| `docs/INTEGRATION_DEMO_READINESS.md` | replay |
| `docs/MUSE_GUIDED_LOCALIZATION.md` | PR21 |
| `docs/NORM_LOCAL_VALIDATION.md` | PR19, PR21 |
| `docs/PR21_KEYBOARD_FOCUS_REGRESSION.md` | PR21 |
| `docs/evidence/ux-v2-desktop.png` | PR20 |
| `docs/evidence/ux-v2-mobile.png` | PR20 |
| `eslint.config.js` | PR19, PR20, replay, PR21 |
| `package-lock.json` | PR19 |
| `package.json` | PR19 |
| `scripts/norm-local-validation.mjs` | PR19, PR21 |
| `scripts/replay-norm-sam.mjs` | replay |
| `shared/editorial-language.ts` | PR20 |
| `shared/editorial-v2.ts` | PR20 |
| `shared/editorial.ts` | PR20 |
| `shared/object-groups.ts` | PR20 |
| `shared/object-localization.ts` | PR21 |
| `shared/reader-media.ts` | PR20 |
| `src/EditorialExperience.tsx` | PR20 |
| `src/LivingAdvertisement.tsx` | PR20 |
| `src/styles.css` | PR20 |
| `tests/editorial-v2.test.ts` | PR20 |
| `tests/fixtures/editorial-v2-evaluation.json` | PR20 |
| `tests/fixtures/editorial-v2-grounded.json` | PR20 |
| `tests/living-ad.test.tsx` | PR20 |
| `tests/norm-local.test.ts` | PR19, PR21 |
| `tests/norm-replay.test.ts` | replay |
| `tests/object-groups.test.ts` | PR20 |
| `tests/object-localization.test.ts` | PR21 |
| `tests/ux-v2.spec.ts` | PR20 |
| `tests/visual-acceptance.spec.ts` | PR21 |
| `tsconfig.tools.json` | PR19 |
| `worker/asset-classifier.ts` | PR21 |
| `worker/asset-contracts.ts` | PR21 |
| `worker/editorial-quality.ts` | PR20 |
| `worker/editorial.ts` | PR19, PR20 |
| `worker/sam-client.ts` | PR19 |

Also review the two evidence-only additions: `docs/FINAL_INTEGRATION_MERGE_READINESS.md` and `docs/evidence/final-integration-audit.json`.

## Remaining blockers and release decision

Code compatibility is green at the pinned trees, subject to final acceptance/CI below. **This is not deployment or paid-inference approval.** Before any landing, obtain explicit approval and refresh if heads change. Before deployment, approve the deployment separately, preserve disabled defaults/permissions, verify secret configuration server-side without exposing it, and run read-only production smoke checks afterward.

The genuine seven-region private replay and new V2 live writing/localization quality are not independently validated here. Real Norm media remains private; public real-photo use needs separately established display/publication rights. Discovery publication API integration remains pending. Do not enable operator/AI production flags to make a replay look live. These are evidence/rights/API limitations, not reasons to add features or weaken guards.

The approved-illustration journey is the acceptance baseline: intent → magazine → image → hotspot → story → related discovery → Collect. It remains available with AI disabled. No checkout, account, public sharing, scheduled refresh or new infrastructure is included.
