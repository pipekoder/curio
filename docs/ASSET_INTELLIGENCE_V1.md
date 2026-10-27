# Asset Intelligence v1

This is a private, on-demand D1 workflow for Issues #5 and #8. It adds migration `0002_asset_intelligence.sql`; the owner's completed production migration `0001_catalog.sql` is unchanged. **Update for Editorial Experience v1: the owner reports production migrations 0001 and 0002 complete and verified (17 tables, 10 indexes, one trigger). This development did not query or modify production.** No production import, deployment, paid inference, or Cloudflare setting change is included.

## Actual inventory and permissions

`seeds/asset-intelligence-v1.json` contains **33 unique genuine candidate URLs**: the owner's 10 original URLs (Oliver Bonas 4, BOLIA 3, Experimental Group 1, Hoshino Resorts 2) and 23 exact image links observed on [Norm Residence](https://normcph.com/project/norm-residence/). These are URL records, not downloaded image files. The latter project's publisher is **Norm Architects**. Issue #5's legacy “Normann Copenhagen” gallery label has not been treated as verified identity; an explicit identity review must resolve it. Original immutable source records are preserved.

The new links were observed through the research web connector, not verified as reachable from a Worker. The original ten retain owner-metadata/unverified access status. H&M and Zara galleries and the Presscloud gallery currently require JavaScript or further source review; the extractor does not bypass these restrictions or invent download endpoints. The Norm publisher page links to the supplied showroom. No copied article text or image pixels are committed.

After a local manifest import: discovered **33**, imported **33**, display-approved **0**, real AI-enriched **0**, reader-eligible **0**. Five publisher labels are represented; labels are not verified brand identities. All display, AI-analysis and editing grants remain pending. Category/aesthetic hints are provisional editorial hypotheses, not visual classifications or proof that all 8 aesthetics × 3 categories are covered. The architecture has no fixed pool limit; per-request batch/result limits bound resource use. Work toward 100–200 candidates remains open.

`node scripts/asset-intelligence-plan.mjs` prints seven prospective Muse classification versions spanning the five publisher labels and three prospective Norm hero versions. **Zero are ready for paid analysis.** Heroes have not been visually assessed. Rights, dimensions, SHA-256 and server media permits are missing. Existing SAM accepts separately authorized bundled PNGs only; these JPEG candidates do not qualify. Any conversion needs editing/adaptation rights and separate review. No live SAM claims are made.

## Local development only

Install with `npm ci`, then prepare isolated local D1 state:

```sh
npx wrangler d1 migrations apply CATALOG_DB --local --persist-to .wrangler/asset-intelligence
npm run build
npx wrangler dev --local --ip 127.0.0.1 --port 18788 --persist-to .wrangler/asset-intelligence --var CATALOG_OPERATOR_ENABLED:true --var PUBLIC_APP_ORIGIN:https://curio.test
```

Provide a generated local-only `CATALOG_OPERATOR_TOKEN` (at least 32 characters) through an ignored `.dev.vars` file. Never reuse a production credential. In a second terminal set `CURIO_CATALOG_OPERATOR_TOKEN` to that local token securely, then:

```sh
node scripts/asset-intelligence-import.mjs
node scripts/asset-intelligence-plan.mjs
```

The importer refuses non-loopback targets. It submits source batches of ten and item batches of five, with zero AI calls. Gallery staging uses one bound JSON insert; mixed import batches are validated against the Workers Free 50-query budget. Exact URL and immutable version IDs deduplicate reimports. The operation uses several transactions: a failed later stage can leave discovery/base records committed. Correct the input and reimport idempotently; no inference is automatically started. Delete ignored local state to reset development data. Do not run remote migration commands under this PR's authorization.

## Operator API

All routes below are under `/api/operator/catalog/intelligence` and inherit the existing default-off flag, long bearer token, exact app Origin, trusted edge IP, JSON body limit and `no-store` protections. Production `CATALOG_OPERATOR_ENABLED=false` is unchanged. API credentials stay server-side; no browser operator client is introduced.

| Route | Purpose |
| --- | --- |
| `GET /stages` | Independent discovered/imported/display/real AI/mock/reader readiness counts |
| `POST /discover` `{sourceId}` | Fetch one server-registered source page, extract exact URLs into discovery staging; no image GET or AI |
| `POST /discovered` `{cursor,limit}` | Cursor-paginated discovery queue; cursor is last image URL |
| `POST /imports` `{sources,items}` | Explicitly import reviewed metadata candidates, always pending grants |
| `POST /access` `{versionId}` | HEAD-only technical accessibility on reviewed hosts; never grants rights |
| `GET /versions/:id/readiness` | Analysis blockers, technical access and processing jobs |
| `POST /classify` `{versionId,mode,consent:true}` | Explicit mock or gated Meta classification; mock is default |
| `POST /retrieve` | Weighted D1 preference ranking; scope defaults to reader readiness |
| `POST /reviews/identity` | Human-reviewed canonical brand/name and source evidence |
| `POST /reviews/reader` | Human alt text, attribution, source and licensing review |

Use existing `/versions/:id/permissions` PATCH for independent display/AI/edit reviews with optimistic revisions, evidence, rights holder and existing audit trigger. New identity/reader reviews do not grant permissions. Publisher names, campaign titles, descriptions and alt text are kept as publisher metadata. Verified facts remain in the existing separately reviewed editorial annotations. AI output cannot write identity, licensing or verified editorial facts.

Discovery extracts ordinary links/images/lazy attributes/srcset and bounded JSON metadata. It never evaluates scripts, crawls recursively, guesses URLs or follows redirects. New gallery/media hosts need server policy review. Requests have time, byte and recursion limits. Source fetch failures and JavaScript-only galleries remain visible for manual ingestion. Accessibility observations are independent of all rights records.

## Classification, cache and cost controls

The adapter uses only `muse-spark-1.3` (Muse Spark 1.3 Standard), fixed Meta chat-completions endpoint and validated JSON Schema output: exact version/fingerprint, category/aesthetic scores, tags, objects, colors, mood, composition, themes and relevance. Strings are data, never executable frontend code. Image text is explicitly untrusted. No URLs, publisher descriptions or unverified identity claims enter the visual prompt. No provider fallback exists.

Live analysis requires **all** existing operator controls, `ASSET_AI_ENABLED=true`, the existing exact Meta model/API-key config, explicit consent, latest active version, a current approved AI grant with evidence, dimensions/SHA-256 and an exact server-side media permit matching that evidence. `analysisMediaPermits` is empty. Approved media is bounded (2 MB, 4 MP, 4096 pixels per side), no redirects, MIME/header/dimensions/actual SHA rechecked before sending image bytes as a data URL. Technical host access alone is not an analysis permit.

Cache identity includes stable version, image hash, classification schema version, Meta model, mock/real origin and AI permission revision. Atomic job claims prevent duplicate concurrent work. No automatic retries or refunds occur; failed/expired jobs need a new explicit request with `retryFailed:true`. Grants/latest version are rechecked before inference and publication; revocation hides old real results. Mocks never fetch images, reserve budget or become real enrichment. Model output is stored separately from verified facts.

Each uncached real classification reserves one unit through the unchanged Durable Object budget shared with magazine generation: 60-second cooldown, 3/IP/hour, 20/day, existing deployment lifetime ceiling (currently 20). SAM's separate one-shot protections remain intact. Seven first-pass approved classifications would use **7 model calls**, at most **8,400 output tokens** (1,200/call), plus unmeasured image/input tokens. A cache hit uses zero. Token pricing and actual image-token usage remain unverified; monetary estimates would be speculative. Three future SAM heroes would need separately approved SAM calls and compatible assets. No calls were executed here.

## Retrieval and reader boundary

`POST /retrieve` accepts allocations `{home,fashion,travel}` totaling 100, selected aesthetics, tags, optional category/aesthetic filters, `brandDiversity`, `serendipity` (0–0.25), stable `seed`, `scope` (`reader` or private `review`), `includeMock` (false) and limit 1–50. It ranks the **full active latest-version D1 pool before LIMIT**. Relevance = 0.6 category + 0.3 aesthetic + 0.1 tag match. Optional seeded exploration blends within the capped share; repeated source/canonical-brand hits receive a diversity penalty. Responses expose score components and whether evidence was Meta, mock, or provisional editorial hints. Preferences are not persisted.

Reader readiness requires current display grant, rights-holder/evidence, human identity/alt/attribution/licensing review and latest reachable HEAD observation. AI-analysis permission remains independent: an approved display image can use editorial metadata without inference. Revoked/archived/stale records are excluded. `AssetRetriever` is the future Vectorize seam; any index must rehydrate/recheck authoritative D1 versions and permissions. No Vectorize index, embedding model or external dependency was introduced.

**Public D1 reader rollout is deliberately still gated:** `publicReaderConnected:false`. The existing magazine's compiled exact-URL registry and six fictional images, Living Advertisements, reduced-motion behavior, SAM token/rights gates and inference limits are preserved. Private retrieval readiness does not authorize bypassing that public registry. Real-image reader integration needs approved assets and a separate review.

## Review and rollout blockers

Review additive migration 0002, extractor host policy, Meta structured contract, independent grants, revoked-result cache behavior, concurrent jobs and existing budget usage. Run CI and browser tests. Production migration/ingestion, operator enablement, permit additions, paid smoke tests and deployment each remain outside this PR's authorization. Keep operator access false until separately approved.

The October 30 deadline is most at risk from unavailable reuse/AI-analysis permissions, JavaScript-only source galleries, missing reviewed image fingerprints and the untested live Meta image contract. The next focused change should connect approved D1 selections to the reader, without loosening its URL/permission registry. Full 24-cell coverage, editorial enrichment and the complete 100–200-image pool are not claimed complete by this foundation.

## Verification recorded for this PR

Local installation and TypeScript checks passed. All **176 unit/component/security tests across 12 files** and **13 Chromium tests** passed. Production React build and Wrangler dry-run passed. Combined local workerd integration covers the existing magazine budget, D1/SAM security separation, static reader and new 33-record import/retrieval/mock cache. The additive schema has 17 application tables, 10 explicit indexes, the preserved audit trigger, `quick_check=ok` and no foreign-key violations. Production dependency audit reports zero vulnerabilities. All provider responses used in tests are mocked; no paid calls or production writes were made. Live Meta image classification and permissions remain unverified/pending. The owner subsequently confirmed production migration 0002 complete.
