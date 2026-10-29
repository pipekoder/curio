# Discover visual review

Reference #1 is implemented through React text/form elements, CSS composition and perspective media planes, and SVG orbital paths. The five media planes load five different images from the owner's first 12-image archive; no reference screenshot is rendered. `DISCOVER_ASSET_ALLOCATION.json` now records 26 unique owner images, each assigned to a single stage.

Run locally:

```sh
npm ci
VITE_DISCOVER_REVIEW=true npm run build
npm run preview -- --host 127.0.0.1 --port 4188 --strictPort
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-discover-preview.mjs
```

The real prompt, suggestions, consent and submission controller remain wired. In the static preview, submission uses the existing authored fallback and discloses AI was not used. The remaining four stages are implemented in this draft; see `FIVE_STAGE_VISUAL_REVIEW.md` for the cross-stage acceptance evidence and known differences.

The Discover allocation remains five images. The four other stages now use the seven previously reserved images plus the 14 additional owner-supplied photographs. No image file is missing from the documented allocation.

Remaining visible differences from Reference #1: independent photos are similar in theme but have different compositions and cannot match the pictured source frames exactly; type glyph metrics, orbital nodes and sphere refraction also differ. No inference or production setting is changed.
