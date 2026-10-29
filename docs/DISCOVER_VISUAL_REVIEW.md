# Discover photographic visual review

Scope: Discover only, based on main `688e318`. No Reader/Generate/Journey/Collect redesign. PR29 is used only as a source for Discover presentation code; its illustrative assets are replaced.

## Private local setup

The supplied ZIP contains flattened references, not independent photographs. Copy `curio_01_discovery_entry.png` (573 × 543, SHA256 `a87cf637c6bcc1437a8db9ce1e6662fea52881ac8248102c311a2baea92cf7ba`) to ignored `public/preview-private/discover-reference.png`. Five CSS-clipped regions reuse its actual photographic planes. The complete reference is not used as a page wallpaper; typography, orbits, sphere, form and controls are browser elements.

Do not commit this image or photographic review screenshots, promote it into the public catalog, or infer publication/AI rights from this review. No image is sent to Meta.

```sh
npm ci
VITE_DISCOVER_REVIEW=true npm run build
npm run preview -- --host 0.0.0.0 --port 4188 --strictPort
# In another terminal:
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-discover-preview.mjs
```

The build switch changes frontend presentation only. The real existing prompt/consent/create controller is reused. A static preview has no Worker endpoint: submission uses the existing deterministic fallback and explicitly reports AI not used. It does not demonstrate live Muse generation. After submission it stops at a result notice, without rendering later screens.

## Visual review

Desktop canvas is exactly 573 × 543. Mobile is adapted to a 390px viewport with readable type, a full-width real input, two-column inspiration buttons and separate consent. The wordmark, photographic positions, prompt, headline and orbit composition follow reference1. Remaining differences: font glyph metrics, holographic refraction/lighting, orbital paths/node placement, and fine translucency/shadows. Mobile composition is an adaptation, not an original supplied mobile reference.

Automatic checks are functional evidence, not visual approval. Await explicit owner approval before extending to any other screen.
