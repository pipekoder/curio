# Muse-guided object discovery: focused integration delta

## Branch and compatibility

This branch is based on the tested `feat/integration-demo-readiness` snapshot (published head `21f68ea`), combining unchanged PR #19 (`3fcef9e`) and #20 (`125396a`). Those PRs remain open/unmerged and are not modified. This PR targets the integration branch so its review diff contains only the object-localization correction. No Reader redesign, new public endpoint, production permission grant, migration or deployment is included.

Land only after explicit approval of the prerequisite work, and rebase this focused delta onto main containing the approved #19/#20/replay changes. Discovery API integration remains separate; no missing API is invented here.

## Verified SAM contract

Reviewed Meta's official cookbook snapshot `0a99b987858ec4e49c04fc3f114bf33851e81deb`:

- [SAM API basics README](https://github.com/meta-models/meta-model-cookbook/blob/0a99b987858ec4e49c04fc3f114bf33851e81deb/07_sam/01_api_basics/README.md): explicitly says one short noun phrase per request, and multiple concepts require separate requests with summaries combined in application code.
- [Official request construction](https://github.com/meta-models/meta-model-cookbook/blob/0a99b987858ec4e49c04fc3f114bf33851e81deb/07_sam/01_api_basics/python/sam_api.py): `model=sam-3.1`, Responses API, `stream=true`, one user message containing `input_text` plus `input_image`; local images are data URLs.
- [Meta segmentation documentation](https://dev.meta.ai/docs/sam/segmenting), linked by that official example.

The same one-phrase/separate-requests statement was also fetched from the current official GitHub README during this review (blob `b8b4442c84566d20fc8fadd7ec89ee75d4d7980e`). Implementation matches the documented single-phrase contract. It does NOT claim array/batch support or live endpoint verification in this task. Hosted model eligibility, image acceptance, pricing and actual detection success remain separate from documented request compatibility. Existing SAM parser, SSE framing/resource caps and geometry validation are reused.

## Observation-driven selection

The existing Asset Intelligence `understanding` schema gains an optional bounded `objectCandidates` array (maximum four). Each Muse candidate contains a closed concept (`lamp`, `table`, `wall art`, `seating`), an index into its existing `objects` observations, and tentative visual/editorial relevance scores. These are interpretations, not product identities or calibrated confidence measurements. Muse's existing image request asks for these fields; no additional planning/image call is introduced.

Ranking checks actual observed labels, rejects invalid/unsupported references and weak visual evidence, deduplicates concepts, applies reader-intent relevance and returns at most three candidates. A `table lamp` alone does not establish a separate table. Generic `lighting` observations alone do not establish a lamp. SAM text is always one allowed noun phrase, never free model prose or user instructions.

Older cached Muse results remain usable through their structured `objects` labels. Their fixed fallback ranking weight is an application heuristic, explicitly labeled `existing_muse_object_label`, not invented model confidence. Missing candidates/labels stop localization with no call; there is no fallback to `seating`, implicit image re-analysis or automatic retry. Existing analysis caches are not invalidated merely to obtain the optional field.

The private Norm workflow loads matching persisted observations from the same origin (`meta` for live, `mock` for demo), exact version/fingerprint and active permitted local derivative. It selects the top intent-relevant concept or validates an explicitly requested shortlist concept. Display/general AI/edit permissions remain pending; the exact local permit and production boundaries are unchanged. The four additional local query detail IDs do not grant publication rights or represent verified products. Legacy `norm-local-detail` remains for captured seating geometry.

## Request and cost control

- **One selected concept, one request per approved SAM stage.** No automatic batch, loop, extra Muse call or retries.
- Same HMAC/SQLite budget, three-call lifetime ceiling and per-asset SAM-once limit. A durable stage-attempt guard blocks a second paid SAM request even if the concept changes. Failed calls are not refunded.
- Live execution additionally requires `CURIO_NORM_APPROVED_CONCEPT` to exactly equal the selected concept, plus existing explicit one-stage approval, consent, positive approved USD ceiling and verified provider pricing/cap acknowledgement.
- SAM result caches are separated by concept and exact image version/fingerprint; cached source/detail bindings are revalidated before reuse. A lamp cache cannot answer a table query.
- Existing 15-second abort, fixed Meta endpoint/model, exact JPEG verification, 2 MB media bounds, 1 MiB/128-event SSE limits and eight-region result limit remain. No commentary call is added.
- SAM token/cost accounting is not supplied by the current adapter. Unknown cost stays unknown; a positive approved ceiling is a guard, not a hard provider billing guarantee. A provider spending cap remains necessary. No production inference flag is enabled.

The existing genuine Norm seating test already used its authorization/reservation. This change does NOT authorize another call, reset that budget, or instruct operators to change live state directories to circumvent it. Any further live concept test requires new explicit approval and separately reviewed available capacity. This PR runs no paid tests.

## Zero-paid-call demo and tests

Use a separate clearly mocked state directory; do not repurpose a live budget store:

```bash
npm ci
npm run validate:norm -- --stage=verify
npm run validate:norm -- --stage=muse-image \
  --state=/tmp/curio-guided-objects-mock-01 \
  --evidence=/tmp/curio-guided-objects-mock-image-01
npm run validate:norm -- --stage=sam-segmentation \
  --prompt="Explore lamps and layered light" --concept=lamp \
  --state=/tmp/curio-guided-objects-mock-01 \
  --evidence=/tmp/curio-guided-objects-mock-lamp-01
```

No `--execute` means no model requests/reservations. The mock fixture explicitly supplies authored candidate observations for all four concepts; it is not a claim those objects were detected in the real Norm photograph. For an optional shortlist override, pass one of the four phrases with a relevant prompt; a concept absent from the eligible shortlist is rejected. The safe default is the highest-ranked observed concept.

After separately authorized future capacity/permission review, the additional live preflight variable would be `CURIO_NORM_APPROVED_CONCEPT=lamp` (or the specifically approved eligible concept), together with the existing runbook guards. This documentation is not authorization to execute it.

## Identity, geometry and genuine seating regression

`combineLocalizationCaptures` combines at most three existing reviewed captures offline, with no inference. Exact asset ID, image fingerprint, version, catalog identity and dimensions must match. Duplicate concept captures require explicit review instead of overwrite. It preserves each original segmentation, raw region ID, normalized box and uncertainty. Display IDs are concept-scoped within the image; `identityKey` includes full asset/version/fingerprint/concept/raw ID and must be used for identity across views. These keys do not establish physical object tracking across separate model calls.

Overlapping detections across concepts remain separate and are flagged for review; no cross-concept geometric merge or identity assertion is made. Existing conservative grouping still requires reviewed semantic keys for fragments, and union boxes have no measured group confidence. Original source geometry stays available.

The private genuine seven-box seating artifact remains `/tmp/curio-norm-live-sam-01/sam-segmentation.json`. Its offline replay utility and legacy IDs are unchanged. `sam-1` remains a separately protected armchair; `sam-4` remains separate. The file is unavailable here, so the genuine replay remains pending owner execution; no seven boxes have been reconstructed. Synthetic seven-region regression tests and legacy capture compatibility still run. See [offline replay procedure](INTEGRATION_DEMO_READINESS.md).

## Validation and limitations

Tests cover all four concept requests, intent ranking, aliases/ambiguity, absent/weak/invalid observations, old-record compatibility, single-call payloads, caching, attempt guards, mixed-version rejection, duplicate raw IDs across concepts and unchanged raw geometry. Private tests use the verified JPEG with mocked Muse/SAM transports. No new successful real lamp, table, wall-art or seating detections are claimed.

Local acceptance: **246/246 unit/security tests across 23 files**, typecheck, lint, production build, Worker dry-run and all seven reported Worker integration checks passed. One initial five-second pipeline-test timeout occurred while building concurrently; the serial full suite passed without changing its timeout or safeguards. **31/31 Chromium tests passed**, preserving keyboard/touch, media-permission, story and Collect behavior. All four concepts have positive mocked geometry mapping and private single-request/empty-response tests; none are new live detection evidence. Publication rules, source provenance, default-disabled production flags, approved media fallbacks, accessible Reader/Collect, Focused Home and seven-box replay regressions remain acceptance gates.
