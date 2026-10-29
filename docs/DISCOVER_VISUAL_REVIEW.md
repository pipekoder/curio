# Discover visual review

Reference #1 is implemented through React text/form elements, CSS composition and perspective media planes, and SVG orbital paths. The five media planes load five different images from the owner's 12-image archive; no reference screenshot is rendered. `DISCOVER_ASSET_ALLOCATION.json` assigns each source image a single stage and role. The other seven images are reserved and are not rendered in this PR.

Run locally:

```sh
npm ci
VITE_DISCOVER_REVIEW=true npm run build
npm run preview -- --host 127.0.0.1 --port 4188 --strictPort
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-discover-preview.mjs
```

The real prompt, suggestions, consent and submission controller remain wired. In the static preview, submission uses the existing authored fallback and discloses AI was not used. The later four stages await visual approval.

The Discover allocation has no missing image count: five supplied, five assigned. The other stages have seven reserved images in total. Exact additional image counts for those stages cannot be determined before their visual implementation and review; no additional media was sourced.

Remaining visible differences from Reference #1: independent photos are similar in theme but have different compositions and cannot match the pictured source frames exactly; type glyph metrics, orbital nodes and sphere refraction also differ. No inference or production setting is changed.
