# Discover visual review

The Discover interface is coded in React, CSS and SVG. Its prompt, suggestions, consent and submission reuse the existing editorial controller. Five CSS media planes reproduce the positions and perspective silhouettes in Reference #1. The supplied ZIP contains only flattened reference images, so each plane currently has a neutral temporary surface. No screenshot fragment or illustration is rendered.

Required independent photographs, in reference order: (1) left interior with lounge chair; (2) upper-right mountain/landscape; (3) small upper-right interior/detail; (4) lower-left sculptural object; (5) right fashion figure. The original files and usage permissions must be supplied before matching those planes or publishing them. Keep their provenance and rights review separate from this frontend prototype.

```sh
npm ci
VITE_DISCOVER_REVIEW=true npm run build
npm run preview -- --host 127.0.0.1 --port 4188 --strictPort
# In another terminal
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-discover-preview.mjs
```

The review build changes frontend presentation only. Static preview submission invokes the existing authored fallback and discloses that AI was not used. No later screen is rendered. Visual approval is required before extending the redesign.

Remaining visual differences: missing five independent photos; font glyph metrics; orbital path/node precision; sphere refraction and lighting. Mobile is an adaptation because no mobile reference was supplied.
