# Full-catalog article contract (draft, default off)

The existing `POST /api/editorial` stays unchanged for requests without `editionFormat`. Its deterministic, disclosed 2D/Silver Field baseline remains available, including when article generation is disabled or the catalog cannot support an article edition. This branch adds an opt-in **article response**; it does not modify the Exhibition or Expanded Story UI.

Rollback is immediate at the contract boundary: keep or set `EDITORIAL_ARTICLES_ENABLED=false` and stop sending `editionFormat`. The ordinary Editorial path and its baseline remain available. Before any future activation, compare the deployed Worker flag readback with `wrangler.jsonc` and the existing Cloudflare dashboard settings so a Git build cannot silently overwrite manually managed AI flags. No Production flag change is part of this PR.

Send the existing prompt or preference shape, consent, and optional `editorialMode: "lite" | "hybrid"`, plus `editionFormat: "curio-editorial-articles-v1"`. The article path requires `EDITORIAL_ARTICLES_ENABLED=true`, the existing public Editorial/Reviewer AI flags, consent, published D1/R2 content and the existing shared four-unit inference budget. The new flag is false in `wrangler.jsonc`. No schema migration or new endpoint is needed. Existing six-version pilot settings continue to govern the existing editorial path but are not used by this separate opted-in article format. Production activation requires an owner-reviewed operational test and frontend support.

Response on approved AI output:

```json
{
  "format": "curio-editorial-articles-v1",
  "source": "meta",
  "retrieval": "d1",
  "cached": false,
  "articleEdition": {
    "version": "curio-editorial-articles-v1",
    "title": "A supported edition title",
    "deck": "A supported edition introduction",
    "articles": [{
      "id": "article-version-<64 lowercase hex digits>",
      "headline": "An article headline",
      "deck": "An article introduction",
      "narrative": "The complete bounded editorial narrative.",
      "heroAssetId": "version-<64 lowercase hex digits>",
      "images": [{"catalogId":"catalog-id","assetId":"version-<64 lowercase hex digits>","brandName":"Owner supplied brand","brandSourceId":"version-...:brand_name","productSourceIds":["version-...:product_description"]}],
      "sourceIds": ["version-...:brand_name", "version-...:product_description"]
    }]
  },
  "items": [],
  "generation": {"editorialMode":"lite","chiefEditorModel":"muse-spark-1.3","reviewerModel":"muse-spark-1.3","revisionModel":null,"confirmationModel":null},
  "inference": {"attempted":true,"reservedUnits":4,"latencyMs":1234,"usage":null}
}
```

The example contains one abbreviated article and item list for readability. A valid Hackathon Demo edition has **exactly 3 articles**, each with **2–3 distinct images** and **6–9 images total**, the hero first, exact `catalogId`/`assetId` joins, an owner-supplied brand caption, and same-version source references. Images cannot repeat across articles in one edition. Stable article IDs derive from the exact hero version. `items` are the freshly revalidated published catalog records; the frontend must join images to them on both IDs and use only their approved `image.externalUrl`, `alt`, dimensions and attribution. Never build a URL from an ID. Recheck publication when revisiting or reopening; revoked versions and media 404s fail closed. Hero IDs can key Exhibition docks and camera targets. Expanded Story can render `narrative` and the ordered images, placing `brandName` beneath each. Cultural citations, when present, use `culturalClaims` and the existing approved `/api/editorial/citations` path; source IDs alone are not permission to show private research.

Non-AI responses have `source:"deterministic"`, `articleEdition:null`, `status`, and `fallbackReason`. `disabled`, `consent_required`, `unavailable`, `insufficient_content`, and `fallback` are machine-readable states. `insufficient_content` returns HTTP 409 and `eligibleImages`/`requiredImages:6`. Use the existing no-format Editorial call to show the disclosed deterministic baseline; do not synthesize articles or imply a model succeeded. The article route does not expose private factual sources or internal observations.

The D1 retriever scores the full published eligible catalog before returning up to 96 ranked records. It uses category, aesthetics, tags and bounded lexical matches against owner brand/product text. The article pool then verifies current publication, display and analysis grants, exact-version Muse observations, editorial metadata, R2 object size/hash/version and SHA deduplication before offering at most 9 candidates to the Chief Editor. The Chief receives sources, visual contexts and approved cultural claims as distinct evidence categories. The independent Reviewer uses the shared Editorial Standard; a rejection, unresolved high-severity concern, failed confirmation or invalid reference produces a disclosed fallback. Revision is prose-only and cannot change image or source identity. Lite uses Spark throughout; Hybrid uses the existing verified Wonder Chief route and Spark review/revision. Both reserve four units before any provider call, with no extra model stage. Calls are individually bounded to 20 seconds and 8,000/3,000 completion tokens; actual provider quota and quality for a three-article single-pass response remain **unverified** without an owner-approved live test.

Current owner-created mockup content remains owner-supplied, not independently verified merchant fact. Existing per-version publication/rights controls remain authoritative; there is no new bulk approval shortcut or permission rewrite. Catalog versions without complete metadata, rights or visual evidence do not enter AI articles. Existing publishing can approve owner batches before retrieval; this branch adds no migration or approval UI. A nine-image window supports three articles with two or three images each. Very large or sparse catalogs can require a later paginated retrieval policy; this implementation never fills gaps with unapproved media.

For Muse Code: implement the article format behind a frontend opt-in after owner review, retain the ordinary path as baseline, map each article ID to an Exhibition dock, join its hero and story images using exact `catalogId`/`assetId` pairs, render stored attribution and owner brand captions, preserve Sources UI and revalidation. The spatial adapter and staging checks use the same three-article and two-image minimum contract.
