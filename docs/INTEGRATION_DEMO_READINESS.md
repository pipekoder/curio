# Integration and demo readiness

Snapshot: 28 October 2026 (Europe/Stockholm). No merge, deployment, production write or paid inference was performed.

## Compatibility and order

PR #19 (`3fcef9e`) and PR #20 (`125396a`) are open, mergeable, and their independent GitHub CI runs passed. The integration branch combines their code locally without conflicts, preserving both independent PR branches. No PR or main branch was merged/modified. Common changes in `worker/editorial.ts` and lint configuration apply cleanly.

Recommended approval order: **#19 → #20 → the offline replay delta from this integration branch**. The published integration snapshot also contains the #19 changes on top of #20. After both PRs are approved and landed, review/extract only the replay delta: `dev/norm-replay.ts`, `scripts/replay-norm-sam.mjs`, `tests/norm-replay.test.ts`, this runbook, and the replay lint additions in `.github/workflows/ci.yml` and `eslint.config.js`. Do not cherry-pick the entire snapshot commit, overwrite newer CI/configuration changes, or treat this branch as approval to merge either PR. Rebase that focused delta on the then-current main. Rerun the combined acceptance checks if either PR changes.

Discovery remains separate WIP at `7354e0c`. GitHub's open-PR inventory contains #19/#20 but no Discovery PR. The local WIP includes `/api/catalog` work, but that is not a reviewed published API. No guessed endpoint, schema migration, ingestion or publication adapter is added here. Once published, inspect its actual API, publication authority, stable version/fingerprint fields and permission revocation behavior; then wire `PublishedContentLibrary` and rerun the full journey. Do not treat local WIP schemas or candidate metadata as publication grants.

## Genuine SAM replay — owner action required

`/tmp/curio-norm-live-sam-01/sam-segmentation.json` is **unavailable in this execution environment**. Therefore the genuine seven-box grouping has NOT been reproduced or visually accepted here. No coordinates have been reconstructed from the owner's description. The private resized JPEG is available and its exact SHA-256 and dimensions were reverified through the existing adapter/tests.

The following offline command runs in Codespaces with the integration branch checked out, installed dependencies and the existing private files. It does not require Meta credentials and accepts no execution/inference flag:

```bash
git fetch origin feat/integration-demo-readiness
git switch --detach origin/feat/integration-demo-readiness
npm ci
chmod 600 /tmp/curio-norm-ai-test.jpg
chmod 600 /tmp/curio-norm-live-sam-01/sam-segmentation.json
# For screenshots only, install Chromium if it is not already available:
npx playwright install chromium
node scripts/replay-norm-sam.mjs \
  --capture=/tmp/curio-norm-live-sam-01/sam-segmentation.json \
  --image=/tmp/curio-norm-ai-test.jpg \
  --out=/tmp/curio-norm-private-replay-01 \
  --screenshots
```

Omit `--screenshots` to generate HTML/JSON only. Use a new empty private output directory for each review. `CHROMIUM_PATH` may select an already installed browser. Do not run a public HTTP server, forward a Codespaces port, upload output to Actions or commit any resulting file. Download/open `inspection.html` privately on your own computer, or inspect the generated private PNGs in Codespaces. The HTML embeds the private JPEG, has no scripts/external resources, and uses a restrictive CSP. Screenshots render the validated standalone HTML in memory (no file navigation/server) and block HTTP(S).

Outputs (all outside Git, directory 0700/files 0600):

- `source-capture.json`: byte-identical copy of the original capture.
- `grouping-report.json`: original seven boxes, grouped boxes/member IDs, suppressed IDs, duplicate candidates, capture hash, image hash/version, zero model calls and bounding-box uncertainty.
- `inspection.html`: toggle all original rectangles; inspect each logical object independently, including overlapping targets.
- Optional `inspection-desktop.png` and `inspection-mobile.png`: private inspection evidence, never public demo screenshots.

The adapter accepts existing Curio envelopes (`output`, `segmentation`) or a direct structured segmentation record. It requires exactly seven regions, fixed SAM provenance/model, current exact Norm asset ID/dimensions and expected IDs. Wrong version, missing regions, authored/mock provenance or unsuccessful captures fail closed. **Do not relabel a mismatched capture or invent missing geometry to make it pass.** Provider authenticity cannot be cryptographically established from this JSON alone; reports label it operator-supplied, not independently authenticated.

`sam-1` is kept as a singleton armchair and `sam-4` as a separate left-sofa fragment based on the owner's reported visual review. Other detections remain separate by default. To group specific reviewed fragments, provide an owner-private JSON hint file mapping only genuinely reviewed IDs to the same `objectKey`; uncertain IDs may have `suppress: true`. Pass `--hints=/absolute/private/reviewed-hints.json`. No default sofa membership is fabricated. Protected IDs/keys cannot be overridden. Grouping still requires same detail identity and complete-link overlap/adjacency. Suppressed regions remain in raw evidence. Never interpret union bounding boxes as pixel-perfect segmentation or a measured group confidence.

## What the demonstrable journey proves

The combined browser tests cover **intent → magazine → image → hotspot → contextual story → related discovery → Collect**, desktop and mobile, with approved original Curio illustrations. Muse-shaped V2 plans reference trusted observations and specific curiosity questions; Curio validates, sequences and connects them to its stories. SAM-shaped geometry is separately exercised through the same grouping/reader contracts and private replay. This demonstrates the interpretation/reader layer without pretending a disabled public model call occurred.

Distinctions:

- Focused Home: preserved sanitized genuine Muse editorial response, validated offline; no new call.
- Owner-reported Norm Muse/SAM runs: existing live evidence belongs to the owner. The seven-region SAM file is absent here, so this report does not independently authenticate/replay it.
- Norm adapter tests: exact private JPEG bytes with mocked provider transport and structured output; not live success.
- V2 editorial browser screenshots and original hotspots: authored/mock responses and approved illustrations, not new live Muse/SAM output.
- Private replay utility: zero new model calls, even when the owner supplies genuine previously captured output.

The Norm photograph is still private and not a public reader asset. Public real-photo display and analysis grants remain independent and pending until reviewed. No temporary test permit becomes a permanent catalog approval. A fully genuine Norm-photo-to-public-Collect demo is NOT claimed.

## Acceptance and deployment checklist

- [x] Combined installation, typecheck, lint, unit/security, production build, Worker compatibility, integration and browser checks run; exact results below.
- [x] Focused Home, validated output, cache/budget accounting and deterministic fallback preserved.
- [x] SAM raw geometry, conservative grouping, keyboard/touch, reduced motion, missing/blocked media, story and Collect regressions covered.
- [x] Repository configuration retains `MAGAZINE_AI_ENABLED=false` and `CATALOG_OPERATOR_ENABLED=false`; no remote production settings were changed or independently re-read in this task.
- [x] No photograph, private inference capture or replay output committed or uploaded publicly.
- [ ] Owner executes genuine seven-region replay and reviews ambiguous groups.
- [ ] Explicit approval to merge #19 and #20; then land only the replay delta after review.
- [ ] Actual Discovery API/contracts reviewed and connected if needed for the final demo. An approved-illustration demo does not depend on unpublished candidates.
- [ ] Separate explicit deployment approval, followed by read-only production smoke checks.
- [ ] Separate explicit paid-inference approval if the demo will make new calls. Existing replay and offline/demo modes need none.

Do not enable production AI/operator access merely to demonstrate replay. Public content must retain publication rights, provenance and exact asset/version checks. No production migration, seeding, permissions edit, scheduled refresh or account/sharing feature is required by this milestone.

## Results

- **236/236 unit/security tests passed across 22 files**, including private-JPEG tests with mocked transport. CI without the private JPEG deliberately skips six private-file tests.
- **31/31 Chromium tests passed**, including the complete desktop/mobile discovery-to-Collect journey.
- **4/4 offline replay tests passed**, including optional desktop/mobile private screenshots using explicitly synthetic regions and the verified private JPEG; no genuine seven-box capture was available. Browser rendering is in-memory and uses no server or HTTP(S).
- Typecheck, lint/new-module lint, production build and Worker dry-run passed.
- All seven reported Worker acceptance/integration/workerd checks passed; external/model traffic mocked.
- Genuine replay preflight: **blocked as expected** (missing capture), exits nonzero without reconstructing regions or calling a model.
- PR #19 and #20 independent remote CI: success. Combined branch remote CI status must be checked separately if a review PR is opened.
- **0 additional paid model calls / $0.** Public screenshot evidence uses approved illustrations only: [desktop](evidence/ux-v2-desktop.png), [mobile](evidence/ux-v2-mobile.png). Genuine private replay remains blocked by its missing input file, not silently replaced with a fabricated result.
