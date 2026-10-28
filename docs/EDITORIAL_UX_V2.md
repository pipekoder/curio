# AI-native editorial UX V2

## Scope and coordination

Branch `feat/ai-native-editorial-ux-v2` starts at main `7aba1be` (merged PR #18). At implementation start PR #19 was open/unmerged; Adaptive Gallery Discovery was the independent local WIP branch at `7354e0c`, with no published discovery branch found. Neither workstream is incorporated or altered here.

PR #19 keeps ownership of the private Norm JPEG, dev permit/CLI, local state and SAM JPEG transport. This PR does not copy the photograph, ZIP or private responses, add public Norm records, change migrations, grants, operator credentials or production flags. A read-only `git apply --check` of PR #19's common tracked-file patches (Worker, lint configuration, package/config and SAM client) against this branch passed. The single planner call seam and existing bounded SAM parser/region contracts are reused. No merge was performed.

Discovery owns crawling, persistence, publication authority, library transport and refresh. `shared/reader-media.ts` defines a small `PublishedContentLibrary` adapter contract; it does not guess or call an unavailable API. It accepts only publication-approved records and exact existing external approvals/compiled local media. Errors, pending/rejected/revoked or unregistered media fall back to existing approved content. Display does not grant AI-analysis or editing rights. Wire this adapter to Discovery's authoritative publication API once that API is reviewed and available. Do not import its WIP schema here.

There are narrow shared reader/plan integration seams in `EditorialExperience`, `LivingAdvertisement` and the shared editorial schema; these naturally touch files also used by Discovery's WIP. Keep Discovery's dynamic repository/provider changes when reconciling those seams. The ingestion implementation, catalog image transport, server source permissions and D1 implementation are deliberately untouched. A future combined browser/integration run remains necessary after either workstream lands.

## Object grouping

`shared/object-groups.ts` is pure, bounded by the existing eight-region segmentation contract and does not mutate detections. It returns raw detections, interactive groups, suppressed IDs, possible duplicate pairs and explicit bounding-box uncertainty.

- Overlap, common `seating` labels and adjacency alone do not establish identity: separate detections remain separate.
- Explicit reviewed object keys can group same-detail fragments only when every pair overlaps or is within 0.025 normalized image units. Complete-link prevents a chain of fragments absorbing a distinct object.
- Different object keys and different detail IDs never merge. Ambiguous membership remains separate. Operators can suppress uncertain regions without deleting raw evidence.
- Near-identical boxes are flagged as possible duplicates, not silently merged. Group boxes are unions for navigation/highlighting, not pixel masks or claims of complete object coverage.

The owner reported seven live seating boxes in Norm: `sam-1` a separate armchair, `sam-4` part of a left sofa, and overlapping foreground sofa fragments. Actual private coordinates are not included in this PR. Tests use explicitly synthetic boxes, not invented reconstructions of that live capture. A private operator may review fragment IDs into separate object keys; do not infer that every remaining box belongs to one sofa. Grouping accuracy on the genuine seven-box capture requires that private replay/review. No new SAM call is necessary.

## Reader interaction and continuity

Hotspots use 44-pixel native buttons with quiet plus marks, not numbered product tags. Detection rectangles are absent at rest; focus/hover/selection reveals a subtle approximate highlight. Touch selects directly; an optional SAM detail index keeps overlapping targets individually reachable; keyboard activates with Enter/Space and Escape returns focus. Failed/mismatched imagery removes interactions. Reduced motion disables transitions/animations.

Selection opens the existing editorial reveal and visual-context panel, then the connected story, related discovery and local Collect. A collapsed inspection panel preserves every raw bounding box and reports group membership. No buy links, product inference, live public segmentation request or transaction flow is introduced.

The existing CatalogImage rights/URL gates already support reviewed photographs alongside illustrations. Image-readiness binding now recognizes an exact approved external primary URL; a fallback or mismatched dimensions cannot inherit hotspots. Production SAM's approved PNG restrictions remain unchanged. External photo SAM replay must wait for an independently reviewed exact-version transport/result binding; a display grant alone is insufficient. The Norm photograph remains private and unpublishable.

## Editorial quality V2

The existing one-call Muse planner requests `qualityVersion: 2`, evidence keys and a specific discovery question. It retains the fixed Meta model, limits, schema output, diagnostic envelope, permission checks, cache, budget reservations and deterministic fallback. The visual-language version changes to invalidate pre-policy cache entries.

V2 permits natural bounded prose rather than requiring every sentence to start “Imagine”. A controlled vocabulary still excludes identities, brands, provenance, manufacturing and unsupported physical material claims. Every feature's observation keys must exist in its trusted, version-bound input context; subject/material mentions are checked against those observations. Material appearances require explicit uncertainty. Concrete spatial/compositional language and a relevant visual question are required; atmospheric adjective piles and generic glow/calm prose are rejected. The validator is a conservative heuristic, not proof of factual truth or writing excellence.

Legacy plans keep their original strict validation path, including the successful recorded Focused Home response. V2-only metadata cannot be smuggled into a legacy plan. Existing authored fallback prose remains available with AI disabled. Newly prompted V2 responses are not claimed as live-validated: all tests use mocked/recorded responses. Legacy format remains accepted for compatibility; model compliance and actual improvement still need a separately authorized evaluation, without automatic retries.

`tests/fixtures/editorial-v2-grounded.json` is authored mock copy, not a new live response. Evaluation fixtures cover generic copy, unsupported designers/materials and irrelevant curiosity. No example headline is required or hardcoded into runtime generation.

## Acceptance checklist

- [x] Distinct overlapping detections, reviewed fragments, bridge chains, ambiguity/suppression and empty results tested.
- [x] Desktop keyboard and mobile touch hotspot → context → connected story → Collect tested.
- [x] Default-hidden rectangles, 44px targets, responsive bounds and reduced motion tested.
- [x] Missing/mismatched imagery, empty SAM results, stale identities and pending/revoked permissions retain existing tests.
- [x] V2 grounding, unsupported claims, prose quality and discovery relevance evaluated offline.
- [x] Legacy Focused Home capture retains validation; inference-disabled fallback and existing reader/Collect tests retained.
- [x] No production config, permissions, migrations or inference activation changed.
- [ ] Genuine Norm seven-box grouping replay: pending private coordinates and operator review, not a new paid call.
- [ ] Persistent publication API wiring: pending reviewed Discovery API.
- [ ] Live V2 editorial quality comparison: separate explicit paid-call approval required.

Screenshots in `docs/evidence/ux-v2-desktop.png` and `ux-v2-mobile.png` show only original, approved Curio illustrations and authored mock hotspots. They contain no Norm photograph or inference evidence.

## Verification results

- Installation, TypeScript checks, lint (including new-module CI checks), production build and Worker dry-run passed.
- Full unit/security suite: **222/222 passed across 20 files**. Focused grouping/quality/reader regressions pass.
- Worker integration: all seven reported acceptance, budgets, private catalog/D1, editorial and workerd smoke checks passed with mocked outbound model traffic.
- Chromium: **31/31 passed**, including keyboard/touch, small screens, reduced motion, V2 story questions, rights rejection and Collect.
- An initial browser run exposed a close/focus highlight regression; it was fixed and both affected tests plus the full 31-test suite pass.
- The original Focused Home capture passes unchanged. No new live-model evidence is claimed.
- Runtime/production settings remain unchanged and disabled. **0 paid model calls; $0 usage cost.**

Screenshots: [desktop](evidence/ux-v2-desktop.png) · [mobile](evidence/ux-v2-mobile.png).
