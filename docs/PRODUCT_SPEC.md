# Curio — Hackathon V1 Product Spec

**Vision:** From advertising to discovery. Can AI-powered exploration turn passive ad exposure into active brand discovery, while improving brand recall and consumer trust?

## Experience
1. **Interactive homepage**: Enter free-text interests; select one or more lifestyles; allocate percentages across Home & Interior, Fashion & Styling, Travel & Places (must sum to 100).
2. **Magazine generator**: Use a Meta Muse Spark model at runtime to select from an approved ad catalog and return a validated structured editorial plan (issue title, sections, referenced ad IDs, summaries, captions, rationale). The UI renders magazine pages; do not invent ad records.
3. **Ad Decoder**: Let a reader inspect an ad and explore its visual details. Use SAM 3.1 for spatial region/segmentation outputs where supported; use Muse Spark to explain style and noteworthy details. Identify hypotheses as hypotheses; do not hallucinate exact products, sources, brands, or purchase links.
4. **Sharing (P1)**: Stable shareable read-only magazine issue URL.

## Categories
- Home & Interior
- Fashion & Styling
- Travel & Places

## Lifestyles
1. Japanese Wabi-Sabi
2. Gaudí / Catalan Modernism
3. Scandinavian
4. French Style
5. British Vintage & Eclectic
6. Quiet Luxury
7. Urban Creative
8. Nature & Outdoor

## Content
Start with 24 labeled synthetic ad assets: 8 lifestyles × 3 categories × 1 image. Generated using **Meta Muse Image**, not another image model. Add properly licensed ads as provided. Every asset must carry source, licensing/permission status, category, lifestyle, creator attribution where applicable, and a review status. No unverified real-brand attribution.

## Non-negotiable competition constraints
- **All AI models actually called by the running product must be Meta models.** Codex is allowed as a development tool, not a runtime model.
- Keep API credentials strictly server-side; never commit secrets or expose them to the browser.
- Product, code comments, documentation, and submission materials in English.
- Keep original Git history intact for eventual public review.
- Do not claim the product improves recall or reduces advertising cost before testing.

## Success criteria
- A new visitor can configure lifestyle and category mix, generate and read an issue, and explore one ad end-to-end.
- A real Meta API response is captured and shown in demo evidence; no simulated result should be labeled live.
- Basic error states, validation, loading state, tests, and sensible fallback behavior are present.
- Public demo can be used without credentials, but abuse protections and rate limiting protect paid API usage.

## Excluded from V1
Real-time Ad Library ingestion, advertising auctions, payment, checkout, user accounts, community feed, publishing subscriptions, direct product identification without verification.
