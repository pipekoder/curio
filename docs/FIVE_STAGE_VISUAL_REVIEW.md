# Five-stage local visual review

Draft PR #30 carries a coded React/CSS/SVG interface for Discover, Generate, Read & Explore, Curiosity Journey and Collect. The five supplied reference images are design references only; none is used as a page asset. A natural-language prompt uses the existing editorial endpoint and deterministic fallback. Generate appears only during an actual pending request, with no guessed percent or model output. Read now uses the first validated editorial selection for its primary image, headline and narrative; page controls switch between selected features. Authored local fallback may use the approved Reader photos and their manual demo hotspots. Story and related-discovery controls use existing authored catalog relationships. Collect retains exact asset identities, permission revalidation and browser persistence.

## Asset allocation and media truth

`DISCOVER_ASSET_ALLOCATION.json` records all **26 unique supplied PNG byte streams** with stage, role, source filename, dimensions and SHA-256. Discover retains 5 original images. The other 7 original images and 14 newly supplied images are allocated: Generate 5, Read 5, Journey 6 and Collect 5. **No additional image files are missing for the documented stage allocation.** The new files remain byte-identical to the owner's ZIP. No independent image was generated or sourced.

The Reader can present any selected, permission-checked feature. Five approved local images are eligible only for the frontend demo Reader: chairs `08`/`16`, surface `12`, furnishing `17` and portrait `18`. The former catalog illustration overlay is removed. Chair and garment hotspots are manually authored against visible source pixels, never claimed as SAM detections. They open clearly labeled fictional product records with fictional prices and assumptions. Other images have story context without a product. These records are frontend-only and excluded from Worker AI selection and D1 publication. Display is approved for this demo; AI analysis and edits remain pending. Journey image nodes provide visual context; related links come from authored metadata or existing catalog ranking. Collect saves exact asset versions and revalidates them on reload.

## Local run

```sh
npm ci
VITE_DISCOVER_REVIEW=true npm run build
npm run preview -- --host 127.0.0.1 --port 4188 --strictPort
# In a second terminal:
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-visual-journey.mjs
CURIO_REFERENCE_DIR=/path/to/private/five-reference-images CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-visual-references.mjs
```

The browser check captures each stage at 390, 768 and 1440 px, including genuine pending state, fallback disclosure, keyboard hotspot interaction, story navigation, collection save/revisit/reload/remove and zero model calls. The reference capture script produces native-size side-by-side comparisons under ignored `test-results/visual-journey/native/`. The focused Reader comparison and actual browser screenshot for this correction are in `docs/evidence/pr30/`; the comparison embeds only Reference #3 for owner review, not as an interface asset.

## Visual and functional limits

The image set is complete for the defined slots, but the owner's supplied chair has a different shape, crop and environment from the chair in Reference #3. The result cannot be pixel-identical. CSS approximates the reference's glass refraction, volumetric light and perspective; it does not synthesize 3D imagery. A static frontend preview has no live Worker API, so it shows the existing authored fallback and discloses AI was not used. Live Meta and SAM behavior remain gated by their existing server-side permissions and budgets. Visual approval is separate from CI success.
