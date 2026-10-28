# Visual V1 — one connected discovery journey

## Scope and pre-implementation mapping

The [reference/component map](VISUAL_JOURNEY_MAPPING.md) was written and committed
before visual changes (`7f48fa2`, based on main `688e318`). It records all five
owner-supplied references, existing component/state authorities, transitions,
empty/typing/loading/generated/exploring/story/collected/fallback/error states and
concepts that would need new backend functionality. Reference photographs were
reviewed in chat but are not committed or used as application assets.

This implementation adapts `EditorialExperience` and `LivingAdvertisement`;
`JourneyVisuals` contains only small pure presentation components. The original
React state, API requests, catalog permissions, validated editorial plan and local
collection store remain authoritative. No backend, shared model contract,
migration, production config, new dependency, font service or AI call is added.

## Visual decisions and functional connections

1. **Discover:** white shell, a sans-serif Curio wordmark, a large serif question,
   two approved illustration planes, a prominent real textarea and existing prompt
   suggestions/optional Meta consent. Hairline paths respond to native focus and
   nonempty input; they do not claim intent was analyzed. HUD geometry is
   aria-hidden and cannot intercept pointer input. Mobile keeps both images small
   and preserves usable form space, labels, touch targets and skip navigation.
2. **Generate:** a pending-only assembly scene appears in the entry area while
   `busy` awaits the existing editorial request. Its displayed images are labeled
   approved illustration studies, not selected/generated model results. There is
   no numerical progress, fake streaming, forced delay or extra inference. The
   existing request timeout and authored fallback remain. With immediate responses
   the scene may be fleeting; reduced motion is fully static. Disabled controls
   and the real pending status remain accessible.
3. **Read & Explore:** the validated layout enum still selects the existing
   compositions. White framing, larger editorial type, full unchanged images and
   quiet blue focus/selection accents replace the prior paper/earth palette.
   Existing hotspots retain geometry, keyboard/touch activation and disclosures.
   A selected detail opens the existing grounded context while the original image
   remains above it. Attribution and citations remain separate and readable.
4. **Curiosity Journey:** the current story's actual `visualThread` becomes an
   ordered detail → relationship → story trail. The existing related rail is
   arranged around a named current-story origin and its real clickable choices.
   Selecting another story clears/replaces the thread through existing handlers;
   no invented graph edges, people, material facts or product identities appear.
   Mobile uses a sequential trail and compact two-column related choices.
5. **Collect:** the same version-bound saved records become a white personal
   gallery. A first item is a centered featured plane; multiple records use a
   responsive gallery. Existing rename/move, revisit, remove and clear controls
   remain real controls. Count and shelves reflect the existing store; permissions
   and publication revalidation still govern image display after reload.

The approximate 80/15/5 balance is a design rule, not a measured percentage:
editorial content dominates; contextual hairlines/indexes communicate focus and
relationships; cool holographic color is confined to small accents. No canvas,
permanent particle field, infinite empty-state animation, inaccessible carousel or
dense sci-fi network was added. Mouse hover is an enhancement, never a requirement.

## Interaction acceptance

`tests/visual-journey.spec.ts` verifies at 1440 and 390 pixels:

- Empty entry → first native Tab/skip link → prompt focus → typing.
- Actual held editorial request → disabled submission → visible assembly in the
  viewport → disclosed authored fallback without Meta consent.
- Original image → existing Paper shade hotspot → grounded reveal → Return to
  original image with focus restoration → connected story with heading focus.
- Actual detail/relationship/current-story trail → related discovery → Collect.
- Close/Escape → refine and focus prompt → collection → reload → revisit story.
- Remove the exact saved story → close with focus restored → reload confirms zero.
  Collection capture additionally asserts heading focus and returns the scroll
  position to the top so its real count/header and featured item are visible.
- Reduced motion yields static assembly; no external requests or paid inference.

A separate normal-motion test checks focus-responsive HUD, a real prompt-validation
error with **zero endpoint calls**, one consented mocked/validated Muse response,
actual pending animation and cleanup, then the generated state. It is a mocked
contract test, not new live-model evidence. Existing tests continue to cover two
personalized editions, permission refusal/revocation, unavailable media/storage,
SAM grouping/alignment, caching, budgets, source citations and browser startup.

Reload intentionally restores collection references, **not the current edition,
prompt history or AI prose**. This existing privacy boundary is preserved. Refine
is tested before reload; collection revisit/removal is tested after reload.

## Before / after evidence

Baseline screenshots were captured from the unmodified app at main `688e318`
using `CURIO_VISUAL_BASELINE=true`; only the new test harness existed. The baseline
flag omits assertions for new visual-only attributes and skips the new-only
normal-motion case; it is never enabled in CI.
The standard CI test runs strict after-state assertions. Both use real pending
request interception and approved local illustrations, with no live inference.

| Stage | Desktop before → after | Mobile before → after |
| --- | --- | --- |
| Discover | [before](evidence/visual-v1/before/discover-1440.png) → [after](evidence/visual-v1/after/discover-1440.png) | [before](evidence/visual-v1/before/discover-390.png) → [after](evidence/visual-v1/after/discover-390.png) |
| Generate, genuinely pending | [before](evidence/visual-v1/before/generate-1440.png) → [after](evidence/visual-v1/after/generate-1440.png) | [before](evidence/visual-v1/before/generate-390.png) → [after](evidence/visual-v1/after/generate-390.png) |
| Read / Explore | [before](evidence/visual-v1/before/read-explore-1440.png) → [after](evidence/visual-v1/after/read-explore-1440.png) | [before](evidence/visual-v1/before/read-explore-390.png) → [after](evidence/visual-v1/after/read-explore-390.png) |
| Collect | [before](evidence/visual-v1/before/collect-1440.png) → [after](evidence/visual-v1/after/collect-1440.png) | [before](evidence/visual-v1/before/collect-390.png) → [after](evidence/visual-v1/after/collect-390.png) |

Actual related-journey detail: [desktop](evidence/visual-v1/after/journey-1440.png)
/ [mobile](evidence/visual-v1/after/journey-390.png). Before/after acceptance JSON
beside the images records interaction mode, real test request count, reverse
navigation, collection persistence/removal and zero external requests.

## Reproduction

```sh
npm ci
npm run build
npm run test:browser -- tests/visual-journey.spec.ts
```

Screenshots and JSON regenerate under `test-results/visual-v1/after`. The GitHub CI
`reader-verification` artifact also contains the rest of the existing browser
suite's evidence. Local Chromium uses `CHROMIUM_PATH=/usr/bin/chromium` when the
Playwright-distributed browser is unavailable; CI installs Playwright Chromium.

## Manual editorial and React review

- Inspected desktop/mobile Discover and actual pending frames: central prompt,
  serif hierarchy, negative space and approved images dominate. The assembly was
  moved into the entry so pending feedback is visible without scrolling to a new
  disconnected screen. Logo/control typography remains restrained sans-serif.
- Inspected the current-story/related composition: actual catalog suggestions are
  visible alongside their origin. Ordered text carries the relationship even if
  geometry, color or motion cannot be perceived.
- Collect remains a gallery rather than a simulated 3D media browser; all editing
  and revisit controls remain in document order. Single-item centering avoids an
  empty catalog-row appearance. Content may require normal vertical scrolling.
- Preserved native controls, semantic form/dialog/heading structure, visible
  focus outlines, 44px controls, original image alt text and attribution. Existing
  contrast/overflow tests remain required. Forced-colors rules remove decorative
  HUD and preserve boundaries; this is not a claim of a full WCAG audit.
- Presentation values derive from existing state. No effect duplicates state,
  provider request, collection persistence or publication approval. New components
  are hoisted/pure, props are bounded typed catalog records, and no new external
  library or network request is introduced. React review checklist applied.

## Explicit limitations and separate live checklist

- Approved illustrations substitute for the references' photographs. No claim of
  literal photographic matching or new authorized owner-gallery content is made.
- The related UI presents existing suggestions and visual threads, not a universal
  semantic knowledge graph. The collection is a responsive gallery, not the
  reference's speculative 3D carousel or cloud account service.
- [ ] Revised Muse editorial quality: separate owner-approved live acceptance;
  existing successful Focused Home regression stays valid, no new paid calls.
- [ ] Arbitrary external-image SAM: reviewed exact media permit/transport and
  explicit live-call approval; authored mock hotspots never imply genuine SAM.
- [ ] Owner gallery: follow [OWNER_GALLERY_INTAKE.md](OWNER_GALLERY_INTAKE.md) for
  provenance, exact bytes and independent display/analysis/edit rights. All 33
  unverified third-party candidates remain unpublished.
- [ ] Safari/Firefox, physical-device and new production checks remain manual.
  No production configuration, migration, deployment or merge is part of this PR.

## Verification results — 2026-10-28

| Check | Actual local result |
| --- | --- |
| Install | `npm ci --ignore-scripts` passed. |
| Typecheck / lint / additional existing SAM-grounding lint | Passed. |
| Unit/security | **252 passed, 10 skipped**, all 26 files passed on the full rerun. |
| Production build | Passed; 378.09 kB JavaScript / 116.85 kB gzip; CSS 55.26 kB / 11.87 kB gzip. |
| Worker compatibility | `wrangler deploy --dry-run` passed, no deployment. |
| Compiled Worker / local D1 / Durable Object integration | Passed; permissions, consent, budgets, caching, pending-candidate exclusion and local API/SPA checks preserved. |
| Full Chromium | **41 passed** (1.9 min); includes all prior 38 and three new visual-state/journey tests. |
| Before capture | Both desktop/mobile baseline journeys passed against unmodified main UI. |
| External requests in new end-to-end demo / paid calls / production writes | **0 / 0 / 0**. |

An initial local unit run overlapped Chromium and hit an existing five-second D1
incremental-persistence test timeout (251 passed, one timeout, 10 skipped). The
entire unit suite was rerun without concurrent browser work and passed without
changing assertions or timeouts. The first baseline harness also attempted Refine
after reload; it was corrected to reflect the existing privacy contract that
only collections, not editions, persist. Both required reverse paths remain tested.

The required GitHub CI run and remote results are recorded in the PR description
after completion. These local and mocked checks are not new live Meta evidence,
a production smoke test, or a claim of broad physical-device/WCAG certification.
