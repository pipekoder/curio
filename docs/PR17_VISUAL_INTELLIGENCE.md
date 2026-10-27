# From Advertising to Discovery — Visual Asset & Image Intelligence

## Implemented

The primary reader now opens each edition with a two-image contact-sheet cover,
then moves through distinct hero, split, layered, horizontal and essay layouts.
Source images remain whole; attribution and identity stay outside image overlays.
Local typography, visual motif notes, responsive spacing and restrained motion
support the image hierarchy. Reduced motion removes cover rotations and all
reader animation; images and hotspots retain the same coordinate system.

The connected journey is **select a numbered visual detail → read its visual
context → open a connected editorial story → follow curiosity → Collect**.
The existing Living Advertisement reveal now contains the image's subjects,
tentative material appearances, environment and compositional relationships.
A permission-checked related image illustrates the shared motif; its button opens
the existing story dialog with the originating detail and connection. Citations,
curiosity navigation and local Collect remain available. Closing the dialog
restores focus to its trigger; Escape returns to the original hotspot.

These demo observations are authored readings of Curio's six original geometric
illustrations, not a claimed image-model run. They apply to the image overall,
not a localized material identity. Material appearances are explicitly tentative;
no product, brand, designer, real location or manufacturing facts are inferred.
The connection scorer compares shared observed compositional relationships;
it is a deterministic visual recommendation, not an AI recommendation.

## Reused Asset Intelligence architecture

`understanding` now supports an optional, bounded `observations` object:
subjects, materialAppearance, environments and relationships. All values are
schema enums, with no arbitrary model prose, URLs, names or executable content.
The existing Muse Spark classifier requests this structure. Its existing
`asset_intelligence.output_json` storage, jobs, leases, permission revisions,
shared budget and cache remain in use. No new table, migration, endpoint or
competing classification system is introduced. Existing v1 records still parse;
the analysis specification is v2 so an explicit future classification request
cannot mistake an older cache entry for newly requested observations. No
classification request is automatically scheduled or executed by the reader.

The existing D1 retriever now carries version/fingerprint and intelligence
internally. The editorial adapter accepts observations only when:

- The compiled image has independent approved display and AI-analysis grants,
  and the display URL/source/evidence match the human-reviewed registry.
- Reader-scoped D1 retrieval returns an eligible current image and a succeeded
  Meta job matching the current independent analysis-permission revision.
- The compiled analysis evidence matches D1, and the structured output matches
  the exact D1 version and image SHA-256.
- The full existing understanding schema and bounded observations validate.

Raw D1 rows/intelligence are never included in the public editorial response.
Invalid, stale, mock, revoked or absent intelligence is omitted. Eligible
observations are supplied to Muse as uncertain context for sequencing, layout,
motion and hypothetical thematic connections. The original factual safeguards,
visual prose vocabulary, asset-pair validation and PR #16 diagnostics are intact.
The editorial cache key includes the observation content, source, version and
fingerprint, so changed/revoked evidence cannot reuse a prior context cache key.
Only metadata is supplied to the editorial call; it does not fetch image pixels.

The local demo uses the same observation schema with explicit authored provenance.
It binds only to the original six v1 illustration records, paths and dimensions;
it cannot attach those annotations to external images or a replaced version.
No image bytes or existing v1 artwork have been altered.

## Rights and actual model status

Public assets: **six original Curio illustrations**. Published unverified
third-party candidates: **zero**. The 33 genuine candidate URLs stay private and
unapproved. Original visual observations do not grant AI-analysis or edit rights.
There are **no live image-understanding results** in this PR and **zero new paid
calls**. The successful real Focused Home text-editorial capture from PR #16
still passes unchanged; tests replay its exact plan offline. New observation-
conditioned planning is transport-mocked and not yet live-validated.

`MAGAZINE_AI_ENABLED=false` and `CATALOG_OPERATOR_ENABLED=false` remain unchanged.
There is no deployment, remote D1 write, production setting change, paid call,
new runtime model or infrastructure dependency. All runtime model paths remain
Meta Muse Spark 1.3 / SAM 3.1 only.

## SAM 3.1 review and first authorized test

The existing adapter uses Meta's parser, bounded SSE, strict source dimensions
and catalog-bound region validation. Its controls are unchanged: private operator
authentication, same-origin JSON, explicit consent, exact server media permit,
independent evidenced analysis rights, bundled PNG only, signature/chunk/hash
checks, 2 MB / 4 million pixels / 4096-per-axis limits, shared inference budget,
timeout and no retries. The allowlist is empty and no raster is authorized.

Current overlays are visibly labeled **authored mock segmentation, not SAM
detections**. They are approximate authored boxes with no model confidence;
they never call the decoder API. No genuine SAM call is available or claimed.

A future test requires explicit approval of paid inference and an exact authorized
bundled PNG asset/version, display and AI-analysis evidence, fingerprint and
geometry, an approved server-only permit, eligible SAM account/model access,
server-only key/operator credential, trusted origin/salt/budget configuration,
and a stated spending cap. Start with local operator testing and commentary off:
one SAM reservation. Optional Muse commentary reserves two units in advance.
Keep all production flags off and preserve private evidence outside Git.

## Verification and screenshots

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run worker:check`, `npm run test:integration`, `npm run test:browser`.
Tests cover the live Home capture, PR #16 diagnostics, structured observations,
stale fingerprints/versions, grant mismatches and revocation, pending-image
exclusion, persistence through existing D1 classification jobs, and mocked prompt
context. Desktop/mobile Chromium exercise the full new journey, focus restoration,
reduced motion, citations, collection persistence, minimum touch targets and
horizontal bounds without model requests.

Screenshots in `docs/evidence/visual-*` are local AI-disabled demonstrations,
not production or live image-model evidence.
