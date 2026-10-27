# Living Advertisements and the SAM 3.1 Decoder

Implements Phase A of [Issue #7](https://github.com/pipekoder/curio/issues/7), with
the advertising/provenance rules and staged experience roadmap in #3, #4 and #5.
The branch starts at `main` commit `48b65ad`; no merge/deployment is performed.

## Available without inference

The six original fictional illustrations now have numbered, keyboard/touch
accessible hotspots. The lamp includes two selectable details. Selection dims
the surrounding scene, outlines the selected box and reveals an editorial panel
anchored below the image. Catalog detail text, source ad/asset IDs, advertiser
status and campaign remain available. A bounded contextual question reveals an
authored interpretation, and a related-discovery action shows another approved
catalog item and explains the connection. Return/Escape restores the unchanged
image and focus to the selected hotspot. There is no checkout, share route,
profiling, saved collection or generated exploration branch.

**The regions and commentary are authored fixtures, not SAM detections, masks,
model confidence estimates or live Muse Spark output.** No model call occurs on
selection, reveal, question or related-discovery actions. All six current images
remain fictional. No external candidate was promoted or analyzed.

Coordinates are normalized from the exact 1200 × 900 source SVG version. The
renderer measures the actual `object-fit: contain` image content, including
letterboxing in full-frame layouts, and updates with ResizeObserver. It withholds
hotspots until the exact original image is loaded with matching dimensions, and
removes them if the image fails or falls back. Hotspots are 44 × 44 CSS pixels;
mobile panels remain in normal document flow. Reduced motion disables reveal and
highlight animation. Editorial overlays do not change or export image bytes and
can always be dismissed to view the original. Brand/provenance layers remain
outside source images; no real marks or text are stripped.

## Server integration architecture

- `shared/decoder.ts`: bounded region/source/provenance/uncertainty contracts,
  authored fixtures, image contain mapping, exact asset/detail binding and
  bounded commentary contracts. A SAM score is never treated as product identity.
- `worker/sam-client.ts`: server-only fixed Meta Responses endpoint and exact
  `sam-3.1` model, bounded SSE framing and the official `@meta-sam/parser@0.1.0`.
  It normalizes parser box geometry into source-bound coordinates, preserves
  absent confidence as null and rejects incomplete/malformed/excessive output.
  Masks are validated by the parser; this slice renders box highlights, not
  pixel-accurate masks. A documented zero-match response becomes an empty result,
  not an invented detection. The official parser requires an explicit empty lane,
  so the adapter normalizes the documented no-text completion case.
- `worker/decoder-commentary.ts`: optional server-side `muse-spark-1.3` Standard
  commentary using only catalog-approved detail text and exact IDs. No source URL
  or image bytes enter that commentary payload. Generated text is bounded,
  plain-text interpretation, not independently verified material/product facts.
- `worker/decoder.ts` and `sam-assets.ts`: default-off, rights-first orchestration
  and an **empty** exact raster permit registry. A live selection requires a
  matching catalog/asset/detail, evidenced display and AI-analysis grants, a
  separately authorized bundled PNG, matching dimensions and SHA-256, and a
  specifically selected asset ID. External assets are unsupported for live
  analysis in this slice, even if display approved: no remote fetch/proxy or URL
  submission to SAM is implemented. The ten Issue #5 URL candidates remain
  pending technical/rights review; a URL or press bank is not analysis permission.
- `POST /api/decoder`: strict 1 KiB selection input, explicit consent, default-off
  feature gate, private operator Bearer credential, origin/content-type/trusted-IP
  checks, shared durable budget, no-store response and safe errors. Its UI does
  not expose a live-inference control or receive the operator/Meta credentials.
  `GET /api/decoder/config` reports readiness without performing inference.

The media reader accepts only the server permit's bundled path through the
existing ASSETS binding, never a request-supplied URL. It limits PNG bytes to
2 MB and 4 million pixels (each dimension ≤4096), checks signature/chunk structure,
source dimensions and reviewed SHA-256 before reserving inference. It does not
convert SVGs, download external imagery, rehost content or infer permission.
The existing six SVGs have no analysis grant and are not valid live PNG inputs.

The pipeline has a 10-second abort deadline, no redirects and no retries.
A default test uses SAM only; optional commentary has a separate flag and the
exact existing Meta model allowlist. Raw provider messages, prompts, media bytes,
secrets and identifying preferences are not logged. Demo commentary and live
commentary provenance are deliberately distinct.

## Existing limits preserved and strengthened

Magazine calls still use the same `magazine-v1` Durable Object and the same
per-IP cooldown, hourly, daily and lifetime ceilings; no namespace or migration
is added. SAM-only tests reserve one model-call unit. If SAM plus commentary is
explicitly enabled, two potential model calls are reserved **atomically** against
the existing hourly/global/lifetime counts before either provider runs. The
one-request-per-60-second cooldown stays one request, not two; no numeric ceiling
is increased. Failed, timed-out or no-match operations are never refunded.

SAM also reserves a persistent `sam-once:<asset-version>` key in that same budget.
A selected version can be tested only once across IPs, restarts and UTC days,
even if its attempt fails. A retry requires fresh owner authorization and a
reviewed version/permit decision; do not delete/reset the namespace or fabricate
versions to bypass it. This prepares a controlled first test, not a public SAM
service. Future repeated-use/caching behavior needs a separate review.

## Requirements for the first authorized live SAM test

**No real SAM or Muse Spark call was made in this work. Do not enable it from this
PR without a separate coordinated approval.**

1. Obtain explicit authorization for **one SAM 3.1 paid call**, the exact image,
   one catalog-grounded noun phrase and the budget. Keep commentary off so this
   does not silently authorize a second Muse Spark call. Confirm Meta entitlement,
   API key scope, current pricing and provider-side spending controls.
2. Choose one permitted visual. Record display/embedding permission and **separate
   permission to access/copy the image bytes for submission to Meta analysis**,
   with rights holder, source, attribution and evidence. Display permission,
   private reading, official-looking URLs or Pinterest/press-bank support do not
   establish that grant. Preserve independently verified brand/product metadata.
3. Supply a valid, unmodified, small bundled PNG with known orientation and
   dimensions. If creating a raster from an SVG or other source requires an
   adaptation, obtain that permission first; Curio does not perform a conversion.
   Add its exact versioned asset to reviewed catalog data, grant evidenced
   `permissions.aiAnalysis=approved`, compute its SHA-256 and add one matching
   `samAssetPermits` entry. No permitted raster or grant is supplied in this PR.
4. In a controlled local/private operator environment, review then set the
   server-only `SAM_DECODER_ENABLED=true`, `META_SAM_MODEL=sam-3.1`,
   `SAM_LIVE_ASSET_ID=<that exact version>`, and a random high-entropy
   `SAM_OPERATOR_TOKEN` secret (≥32 characters). Reuse the existing Meta secret,
   ASSETS binding, origin, salt and durable-budget setup. **No setting or secret
   was added to Cloudflare by this task.** Keep `DECODER_COMMENTARY_ENABLED`
   absent/false and never embed either secret in browser code.
5. Submit one consented selection with the operator Authorization header, exact
   Origin and a trusted edge client address. Use the existing global counter;
   don't raise the ceiling. Confirm one reservation and at most one outbound
   request, to `https://api.meta.ai/v1/responses` with `model=sam-3.1`.
6. Validate real SSE and parser behavior, PNG interpretation/orientation,
   coordinates against the visible object, zero/multiple matches, uncertainty,
   masks/box agreement, latency, output size and runtime CPU/memory. The first
   test is not proof of broad production quality or real product identification.
   Record evidence without publishing sensitive media or raw provider secrets.
7. Turn the flag off after the test, keep the consumed one-shot marker, and
   review the result before enabling any UI integration or any subsequent call.
   Optional Muse Spark commentary requires separate approval and flag/model
   configuration; the two-unit budget path is already tested with mocks.

## Verification

Run clean installation, typecheck, unit tests, production build, Wrangler dry run,
Worker integration and Chromium browser tests as in the README. Existing tests
remain; new tests cover rights/disabled paths, source/version binding, geometry,
keyboard/touch/reduced motion, malformed media, SHA-bound permit checks, provider
failure, abort timing, official-parser zero matches and shared budget accounting.
The Worker integration asserts that default-off Decoder requests make no model
call. Tests use mocks; they never use actual keys, external candidate bytes or
paid APIs. CI uploads active-reveal and reader screenshots for review.

Official contract sources reviewed on 2026-10-27:

- [Meta media segmentation](https://dev.meta.ai/docs/media-segmentation)
- [SAM prompt contract](https://dev.meta.ai/docs/sam/segmenting)
- [SAM output coordinates and confidence](https://dev.meta.ai/docs/sam/reading-segmentation)
- [Official client parser](https://dev.meta.ai/docs/sam/client-libraries)
- [Official image-segmentation cookbook](https://github.com/meta-models/meta-model-cookbook/tree/0a99b987858ec4e49c04fc3f114bf33851e81deb/07_sam/01_api_basics)

The current request/stream contract has been inspected and mocked, **not executed
against an entitled live account**. Production Worker resource use, actual image
rights, live mask fidelity and real Meta billing remain unverified. The first
image will need explicit permission and human verification. No R2/D1, merge,
deployment, main modification or Cloudflare setting change is part of this work.

### Recorded local results (2026-10-27)

Node 24.19.0 / npm 11.9.0; system Chromium. Hosted CI targets Node 22.

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed, 197 packages |
| `npm audit` | Zero vulnerabilities including dev dependencies |
| TypeScript | Passed: frontend, shared contracts, Worker, configuration and tests |
| Unit/component/security tests | 142 passed, 0 failed, 8 files; original 108 retained |
| Production build | Passed; client JS 341.88 kB / 105.00 kB gzip; CSS 8.80 kB / 2.72 kB gzip |
| Wrangler dry run | Passed; Worker 920.75 KiB / 157.93 KiB gzip |
| Worker integration | Passed; preserved magazine/shared-budget behavior and disabled SAM path with zero provider calls |
| Chromium | 12 passed, 0 failed; original 8 retained, plus desktop/mobile selection/geometry, keyboard/reduced-motion/letterbox and image-failure scenarios |
| Visual inspection | Active mobile reveal screenshot inspected; original/related attribution remains outside the image |
| Client bundle check | No Meta endpoint, parser transport, Meta key or operator credential included |
| Real SAM/Muse Spark/paid calls | 0 |

The existing harmless Zod build-comment warnings remain. Live asset permissions,
real Meta responses, mask fidelity and production CPU/memory are not established
by mocked tests. Hosted results and screenshot artifacts are linked on the PR.
