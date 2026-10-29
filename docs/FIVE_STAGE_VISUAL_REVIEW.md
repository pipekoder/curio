# Five-stage local visual review

This draft extends the approved Discover visual language to Generate, Read & Explore, Curiosity Journey and Collect. No flattened reference is used in the frontend. Generate is rendered only while the existing editorial request is pending; it shows no guessed percent or model output. Reader uses the validated edition and existing authorized image/hotspot components. Journey uses real related catalog items and story navigation. Collect uses the existing browser storage, asset-version identifiers and permission revalidation; the visual stage adds Revisit and Remove controls.

## Editorial allocation

`DISCOVER_ASSET_ALLOCATION.json` assigns each of the 12 owner photographs to exactly one stage. The seven previously reserved files are now allocated as follows: Generate 03/07, Read 08/12, Journey 06/09, Collect 04. Discover keeps 01/02/05/10/11. No owner photo appears across stages.

The references depict more photographic panels than the available allocation. For an independent photograph in every illustrated photo plane, additional source files are needed: Generate 3, Read & Explore 3, Curiosity Journey 4, Collect 4; total **14**. Current UI renders the allocated photographs and uses validated catalog content or translucent glass planes where a source image is absent. It does not treat the decorative owner's photographs as verified catalog items or place hotspots on them. All active hotspot annotations remain attached to their actual catalog image. No new real-brand or material claims are made.

## Run and inspect locally

```sh
npm ci
VITE_DISCOVER_REVIEW=true npm run build
npm run preview -- --host 127.0.0.1 --port 4188 --strictPort
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-visual-journey.mjs
```

The browser check captures all stages at 390, 768 and 1440px and verifies real pending state, deterministic fallback, story opening, collection save/revisit/reload/remove, and zero Meta calls. The reference design remains the visual target; passing functional tests does not establish visual approval.

Known visual differences: missing independent photos for 14 image planes; the existing authorized catalog illustrations remain in the live Reader, Journey and Collect; glass lighting and 3D perspective are approximated in CSS; the narrow Generate panel cannot preview a plan before the endpoint responds. The stage layouts are responsive adaptations of desktop references, not separately supplied mobile designs.
