# Discover / Read prototype — visual review required

This is a focused prototype, **not visually complete or accepted**. It starts from
main `688e318` (PR #26), never from rejected PR #28. Only Discover and Read & Explore
have new presentation. Generate, Journey and Collect retain existing functional
presentation until explicit visual approval.

## Original files and scope

[Original-file inspection](REFERENCE_FILE_INSPECTION.md) documents all five PNGs,
original dimensions, fingerprints, composition, layers, geometry, typography,
lighting, interactions and functional constraints. It was committed before code.
Original files were opened at native resolution, not inferred from descriptions.

Local prototype: `/?prototype=reference`. Without that query, the current main
interface is unchanged. The switch is presentation-only; it cannot enable models,
operator access, media rights or production features. Start with `npm ci`,
`npm run build`, `npm run preview -- --host 127.0.0.1` and open the preview URL with
the query. Use a balanced prompt spanning home, fashion and travel for a multi-image
edition. Leave Meta consent unchecked for the complete authored fallback.

## Implementation and real state

`ReferencePrototype.tsx` adapts the existing `EditorialExperience` controller;
there is no second generator, catalog, collection store or model request. It uses
the same prompt/consent/error/busy state, editorial endpoint, validated plan and
publication-checked catalog. All URLs still pass `CatalogImage` permission checks.

Discover uses the original 573 × 543 stage, the measured five-plane arrangement,
centered monoline wordmark and two-line question, orbital geometry, iridescent
sphere, 341 × 54 input and four reference suggestions. Suggestions fill the real
prompt, the arrow submits it, and pending status follows the existing request.
Explicit consent and truthful media/source information remain below the visual
stage rather than fabricating a consent-free AI interaction.

Read uses a 505 × 543 stage, skewed rear scene, separate middle glass plane,
foreground image, caption glass, context plane and right image rail. The real
validated edition selects eligible images and determines the page count. Thumbnails
change the actual selected asset with heading focus; current authored/authorized
hotspots open grounded context and update the context panel. Return restores focus
and retains the source image. The story arrow/Related stories use the old story
handler; Collect still saves the exact version and reopens after reload.

The reader selection point is attached to the **actual existing authored region**,
not moved to an arbitrary reference coordinate. Display transforms do not create a
mask, derivative image file, material identity or new SAM result.

## Side-by-side comparison without public reference-photo publication

Public evidence contains actual browser screenshots only:

- [Discover, 573 × 543](evidence/reference-prototype/discover-573x543.png)
- [Read & Explore, 505 × 543](evidence/reference-prototype/read-505x543.png)
- [Input/frame geometry](evidence/reference-prototype/discover-geometry.json)
- [Reader state and geometry](evidence/reference-prototype/reader-state.json)

The owner's originals and side-by-side composites stay outside Git. To regenerate
private comparisons after browser tests:

```sh
node scripts/reference-comparison.mjs \
  /tmp/curio-approved-style-references \
  test-results/reference-prototype \
  /tmp/curio-reference-review
```

Set `CHROMIUM_PATH=/usr/bin/chromium` if using the local system browser. The script
verifies original SHA-256 and identical reference/capture pixel dimensions, embeds
original/browser images side by side, blocks outbound browser requests and writes
mode-0600 PNG/HTML into a mode-0700 directory outside the repository. Do not upload
that directory as a public PR/CI artifact: design approval does not establish
publication rights for the reference photographs. It is for private owner review.

## Visual-difference assessment

| Dimension | Discover | Read & Explore |
| --- | --- | --- |
| Geometry | Same native stage/aspect. Prompt rectangle is measured against x132/y306/w341/h54; browser values are in JSON. Five preview planes occupy the corresponding asymmetric regions. Orbital curves are reconstructed, not exact raster/vector traces. | Same native stage/aspect. Rear scene bounds are recorded relative to the stage and compared with approximate x174/y54/w229/h418. Middle glass, foreground, caption and rail use original coordinate landmarks. Existing region geometry remains authoritative. |
| Composition / scale | Wordmark, question, sphere, pill input and baseline suggestions follow the reference's central hierarchy; no site nav/landing sections in the prototype stage. | Left editorial column, dominant layered image, right context/thumbnail rail and lower-left caption preserve the specified spatial hierarchy. Real plan counts/content lengths can differ. |
| Typography | Custom thin SVG wordmark approximates the reference's geometric lettering; Georgia/system sans approximate editorial/body fonts. Original font files are unknown. | Serif title and small sans body/caption follow measured sizes, but actual approved asset names and narratives differ from reference copy. |
| Layering | Distinct tilted image planes behind the input; sphere behind the prompt/right image. CSS perspective and glass blur approximate the original compositing. | Separate rear, middle and foreground planes; frosted caption/context above them. Foreground currently remains an entire approved illustration, not a photorealistic isolated chair. This is a major mismatch. |
| Depth / lighting | Plane borders, diffuse shadows, atmosphere and a multi-gradient sphere reproduce the kind of depth. The sphere is not the original refractive rendering; reflections/edge highlights differ. | Perspective floor, diffuse shadows and translucent slabs create depth. No physically rendered light transport, object shadow or genuine alpha cutout reproduces the original chair's volume. |
| Imagery / factual content | Approved original Curio illustrations replace the photographs, producing a substantial difference in texture, palette and visual density. Publication rights are not invented. | Same major photographic mismatch. Whole-image context preview is **not** a fabric swatch. Curio attribution replaces unverified designer/material claims. |

These differences are not resolved by passing CI. No visual-completion or
same-photographic-design claim is made.

## Corrections still required before visual acceptance

1. Independently authorized, composition-compatible photography and an authorized
   foreground cutout/mask are needed to reproduce the chair, scene, material and
   subject surfaces. Current illustrations cannot provide the reference's volume
   or photorealistic lighting; no segmentation or license has been fabricated.
2. Tune original-font match, wordmark curves, tiny label placement, optical blur,
   sphere highlights and irregular orbit paths in direct owner review.
3. Refine foreground/sidecar overlap using the final approved image's actual
   geometry. A genuine object region cannot simply be moved to match a reference.
4. Keep consent, publication disclosures and keyboard/touch affordances usable;
   these required controls are additional to the conceptual reference frames.
5. Obtain explicit visual approval of these two screens before any new visual
   Generate/Journey/Collect work. They are deliberately not redesigned here.

## Functional verification procedure

```sh
npm run build
npm run test:browser -- tests/reference-prototype.spec.ts
```

Tests capture exact original-sized browser renders, check measured input geometry,
real input/suggestion/consent/pending/fallback behavior, source/region retention,
context changes, selected asset/page changes with keyboard focus, story opening,
collection persistence after reload and responsive operation at 390/1440. Provider
responses are mocked/disabled; no new live Muse or SAM evidence is claimed.

All existing contracts, server rights/budgets/model validation and production flags
remain intact. Unit/security, Worker/integration and full Chromium results are
recorded below after execution; they establish functionality, not visual approval.

## Recorded landmarks and functional checks — 2026-10-29

- Discover native PNG: **573 × 543**. Measured input: x132.53, y305.92,
  width339.80, height53.80 versus inspected approximately x132/y306/w341/h54.
  Maximum coordinate/size difference on this landmark is about 1.2 px.
- Read native viewport PNG: **505 × 543**, without resizing. Rear plane bounds
  relative to the stage: x174.11, y52.83, width229.24, height420.84 versus inspected
  approximately x174/y54/w229/h418. The native flow has a fractional stage origin
  near y0.94; top-border alignment and optical geometry still require review.
- These are DOM measurements against approximate inspected landmarks, not a
  pixel-match score. They say nothing about the missing photographic foreground,
  surface texture, exact typeface or physically rendered lighting.
- Full unit/security suite passed with one local worker: **252 passed, 10 skipped**,
  26 files passed. Initial two-worker execution hit four existing five-second
  workerd startup/time-limit failures; no assertions/timeouts were weakened.
- Full Chromium suite: **42 passed** (1.3 min), including four prototype tests and
  all 38 existing browser tests. Touch is exercised at 390 px; desktop at 1440 px.
- Typecheck, lint, production build passed. JavaScript 383.36 kB / 118.14 kB gzip;
  CSS 48.05 kB / 10.91 kB gzip. Worker dry-run and compiled Worker/local D1/
  Durable Object integration passed. GitHub CI is recorded in the PR after completion. No live inference, production write,
  migration, deployment or merge is part of the prototype.
