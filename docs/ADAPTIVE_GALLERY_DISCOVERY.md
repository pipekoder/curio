# Adaptive Gallery Discovery MVP: actual integration contract

This implementation is an on-demand, bounded **local/operator tool**, plus a
persistent D1 review/publication pipeline. It is not an autonomous crawler,
scheduled synchronizer, media-file store, or a rights acquisition system.

## Status and evidence

The synthetic integration test discovers an original fixture once, persists it,
reviews its identity and independent permissions, explicitly publishes it,
retrieves it and selects it in a mocked Muse editorial request. No second crawl
is needed. Browser tests exercise the published record and Collect across reload,
and refuse an unconfirmed record without requesting its image.

The six supplied source URLs have been attempted. See
[evidence/discovery-six-source-report.json](evidence/discovery-six-source-report.json).
**Actual external image harvest: 0.** Six attributed source/gallery metadata
observations are persisted locally, across three source hosts. There are zero
published external images and no model calls. These observations are not a
successful crawl. Generic managed-proxy access does not provide the verified DNS
pinning contract required by this transport, so it fails closed with
`proxy_dns_pinning_unverified`. This is an environment blocker, not evidence that
the publishers denied access. Dynamic extraction against all six live sources
remains unverified. The 30–50 initial-image target remains unmet; it is not filled
with invented URLs, thumbnails, or the 33 existing unverified third-party assets.

The executable engine covers HTML, lazy images, picture/srcset variants,
OpenGraph, bounded JSON/JSON-LD, linked collection/product/story pages, XML
sitemaps and an isolated browser for bounded scrolling and approved navigation
buttons. Meaningful hash/query routes are preserved. Depth is configurable up to
32, not fixed at three levels. Unsupported pages and exhausted budgets produce
partial manifests with explicit reasons. Missing publisher copy stays null.

## Persistence and identities

Apply `0003_discovery_content.sql` **locally**, after existing migrations 0001 and
0002. No production migration is performed by this feature or its CI.

| Table | Meaning |
| --- | --- |
| `brand_sources` (existing) | Stable source identity, `source-` + first 40 hex digits of SHA-256(hostname); verified brand identity remains a separate review. |
| `discovery_runs` | Immutable manifest, scope URL, status and timestamp; exact run replay is idempotent, changed reuse of a run ID is rejected. |
| `content_nodes` | Stable SHA-256(source ID, original URL, kind); current version and availability. |
| `content_versions` | Immutable extracted text, descriptions, attribution, image URLs/variants, metadata fingerprint, extraction method and time. |
| `content_sightings` | Per-run added, updated, unchanged, removed or inaccessible state. |
| `content_edges` | Run-scoped contains, links_to, illustrates and variant_of relationships. |
| `content_reviews` | Append-only, exact-content-version display/analysis/edit review ledger. |
| `content_catalog_links` | Exact content version → existing Asset Intelligence asset version. |
| `catalog_publications` | Explicit operator-reviewed Reader `CatalogItem` publication; not a crawler approval. |

Brand/source → gallery/collection → product/story → image relationships are
retained when available in navigation or structured publisher data; they are not
inferred as verified brand facts. Image aliases with equal measured SHA-256 are
linked as variants. URL variants are deduplicated within extraction. No query
parameters are blindly stripped. Asset Intelligence retains its existing URL and
version identities. Publication blocks simultaneous aliases of an already
published image fingerprint.

A content fingerprint covers the canonical extracted record, including image
fingerprint when measured. An unchanged current record reuses its version. A
changed record receives a new version, including if old content reappears later;
previous reviews are retained and **never transferred**. Complete snapshots may
mark previously observed content from that scope removed. Partial/blocked runs
do not infer removal; observed inaccessible pages are recorded separately.
Removal is conservative at the content-node level, so overlapping source scopes
may require operator reconciliation. History and refusals remain auditable.

Only URLs, text and metadata are persisted. Optional image verification reads
bounded bytes in memory for SHA-256 and dimensions; it does not store image files.
D1 graph writes use a bounded JSON batch rather than a query per discovered node.
There is no fixed library-size limit: each job/page is bounded, and more jobs can
be imported incrementally.

## Permissions and publication

1. Discovery creates pending candidates; public accessibility and publisher
   license links are **not rights grants**.
2. `discovery/reviews` records purpose-specific review evidence for the exact
   content version. An approval here does not grant Asset Intelligence rights.
3. `discovery/promote` imports an image into existing Asset Intelligence with
   pending permissions and zero AI calls, retaining the content-version link.
   Repeating promotion reuses the existing version without changing grants.
4. Existing catalog permission reviews independently authorize `display`,
   `ai_analysis` and `edits`, with evidence, rights holder and revision checking.
   Existing identity and reader reviews confirm attribution, source page,
   licensing evidence and accessible exact image bytes/dimensions.
5. `discovery/publish` requires current active linked content, an approved content
   display review, current exact asset version, fingerprint/dimensions, reader
   eligibility, independent display grant and a validated complete `CatalogItem`.
   Reviewed alt text, attribution, source page, URL and evidence must match D1.
   Real advertiser identity must match the separately verified source identity.
   Merchant links are not enabled by this feature.
6. Every public read rechecks the current D1 version, availability, review and
   grant. Archive, changed content, rejected/blocked display, or stale provenance
   removes the record. Independent AI/edit grants are hydrated from D1, not from
   stale published JSON. Analysis refusal propagates to the linked catalog grant.
   Pending/rejected candidates, raw crawl manifests and review history are never
   served by the public catalog endpoint.

Published metadata is public: the operator must use safe public evidence
references, verify factual copy, and avoid including private review documents,
secrets or personal data in a publication. The strict schema does not establish
that a human-written claim is true. Unverified publisher descriptions remain
attributed source material, separate from verified facts and model observations.

## HTTP API (implemented, not a proposed interface)

All operator endpoints below are relative to
`/api/operator/catalog/intelligence`. Existing operator middleware requires
`CATALOG_OPERATOR_ENABLED=true`, `CATALOG_DB`, token of at least 32 characters,
`Authorization: Bearer …`, matching `Origin: PUBLIC_APP_ORIGIN`, trusted
`CF-Connecting-IP` and JSON for writes. Responses use `Cache-Control: no-store`.

| Method/path | Input | Output |
| --- | --- | --- |
| POST `/discovery/runs` | Strict `DiscoveryManifest` in `shared/discovery.ts`, max 256,000 bytes; max 50 pages, 400 nodes, 1,200 edges. | 201 `{jobId,replay,states?,rightsGranted?}`. Each state has `nodeId,versionId,state`; first import returns `rightsGranted:false`. |
| GET `/discovery/content?cursor=&limit=20` | Content-node cursor max 80 chars, limit 1–50. | `{items:[content node + latest content_json + review summaries]}`; next cursor is last item's `id`. |
| GET `/discovery/content/:id` | **Content version ID**, despite route's generic `id` name. | Version + source/original URL/current version/availability + up to 100 edges and review history, or null. |
| POST `/discovery/reviews` | `{versionId,purpose,status,evidence,reviewer}`; purpose `display/ai_analysis/edits`; status `pending/approved/rejected/blocked`; approval requires evidence. | `{reviewed:true,catalogRightsGranted:false}`. |
| POST `/discovery/promote` | `{versionId}` content version. | `{versionId,contentVersion,permissions:'pending',aiCalls:0}` or existing link with `reused:true,permissionsUnchanged:true,aiCalls:0`. Returned version ID is the **asset version**. |
| POST `/discovery/publish` | `{versionId,item,reviewer}` asset version and complete strict `CatalogItem` from `shared/catalog.ts`. | `{publishedForReader:true,versionId,aiCalls:0}`. |

Existing endpoints remain authoritative:
`PATCH /api/operator/catalog/versions/:id/permissions`,
`POST /api/operator/catalog/intelligence/reviews/identity`,
`POST /api/operator/catalog/intelligence/reviews/reader`,
`POST /api/operator/catalog/intelligence/classify` and `/retrieve`.
Schema/invalid JSON errors return 400, oversize bodies 413, review conflicts 409,
missing configuration/schema or unexpected operation failures 503. The run endpoint has its own explicit 256,000-byte limit.

**Reader endpoint:** `GET /api/catalog/published?ids=version-…[,version-…]` or
`?cursor=version-…`. Requires a separate `CATALOG_PUBLIC_ENABLED=true` and D1;
unset/false returns 503. This flag is not added to production settings. Each
request permits at most 60 exact asset-version IDs, or 50 items per cursor page.
Returns strict `{items:CatalogItem[],nextCursor:string|null}`, never candidates.
Unavailable schema yields an empty page. There is no public crawl, promotion,
review, rights mutation or model-call endpoint introduced here.

## Reader and AI integration requirements

`src/load-reader-catalog.ts` fetches only same-origin published records, with a
five-second timeout, no-store and bounded exact IDs. It never trusts the `items`
from an editorial response as authority for new external URLs. The returned
publication is separately validated and used to build the exact-version display
registry. `ReaderCatalogContext` supplies the same approved pool and permissions
to existing images, attribution, stories, related discoveries and Collect.
Collection storage contains references; reload rehydrates through D1 publication
checks. Offline/unavailable/unapproved content falls back to approved authored
illustrations. No imported publisher asset or private Norm photograph is bundled.

The existing editorial pool combines authoritative published records with D1
preference ranking only when the public catalog flag is explicitly enabled;
existing compiled-record retrieval still works when it is disabled. Public
publication does not imply permission to send its data/image to Meta. The live
editorial request filters non-authored records without independent AI-analysis
evidence. Deterministic editions remain possible without inference. Muse image
observations enter planning only through existing fingerprint/version-bound,
current-permission Meta jobs; mock classification is not live evidence.

Real image analysis still requires an explicitly reviewed exact server media
permit in `worker/asset-sources.ts`, current analysis permission, eligible model,
operator authentication, cost/inference budget and separate live-call approval.
This feature does not manufacture media permits from URLs. The current public
SAM adapter still restricts calls to its exact permitted bundled raster; arbitrary
D1 external images are **not** automatically supported for live segmentation.
Use the independent private Norm adapter only under its own exact-version rules.
A separately reviewed transport/permit extension is required before SAM can
consume other external assets. Geometry, conservative object grouping, raw SAM
results, inference budgets and model validation are preserved unchanged.

## Local execution (no production commands)

```sh
npm ci
npm run build
npx wrangler d1 migrations apply curio-catalog --local --persist-to .wrangler/discovery-dev
```

Create an ignored, private `.dev.vars` (never commit it), using a freshly generated
32+ character local `CATALOG_OPERATOR_TOKEN`. Keep `MAGAZINE_AI_ENABLED=false`,
`ASSET_AI_ENABLED=false` and `SAM_DECODER_ENABLED=false`. Start only local workerd:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 18788 \
  --persist-to .wrangler/discovery-dev \
  --var CATALOG_OPERATOR_ENABLED:true --var CATALOG_PUBLIC_ENABLED:true \
  --var PUBLIC_APP_ORIGIN:https://curio.test
```

Set the same local token privately as `CURIO_CATALOG_OPERATOR_TOKEN` in the CLI
terminal. Do not echo it. A bounded config file contains e.g.
`{"hosts":["press.hm.com"],"maxPages":6,"maxImages":30,"dynamic":true}`.
Add CDN/script hosts only after independently reviewing them. A host allowlist
permits network discovery, never publication or analysis.

```sh
npm run discover -- 'https://press.hm.com/image-gallery/hm-home' /tmp/curio-discovery-config.json .wrangler/discovery-manifests --persist
# Re-import the saved manifest without another crawl:
npm run discover -- ingest .wrangler/discovery-manifests/REPLACE_WITH_RUN_ID.json
# Bounded six-source acceptance; writes only local D1 and a counts report:
npm run discover:acceptance
```

CLI persistence is deliberately fixed to loopback port 18788 and the local origin;
there is no remote import switch. Manifests are private mode 0600, defaulting to
ignored `.wrangler/discovery-manifests`, outside generic CI artifact uploads.
Use a network environment that supports validated DNS-pinned HTTPS; **do not
unset or bypass a managed proxy**. Robots rules/Crawl-delay, host checks and
private/reserved-IP rejection apply to redirects and every browser request.
The isolated browser blocks service workers, non-GETs, WebSockets, downloads and
image/media/font requests, and serializes remaining requests through the same
broker. No login, CAPTCHA bypass or credentialed scraping is implemented.

## Remaining acceptance blockers

- Six-source real extraction and the initial real-image count need an authorized
  compatible egress environment; owner-imported, accurately attributed manifests
  may also enter the same review pipeline without another crawl.
- Display/publication and AI-analysis/edit permissions must be established
  independently by the owner. No external image is approved by this PR.
- Dynamic pages requiring additional reviewed hosts or unsupported interaction
  patterns may remain partial; actual live success is not claimed.
- Production migration/activation and additional external SAM media support each
  require separate review and authorization. No production configuration changes,
  model calls, merge or deployment are part of this PR.

## Verification on 2026-10-28

- `npm ci` (local install used `--ignore-scripts`): passed.
- `npm run typecheck`, `npm run lint`, existing additional SAM/grounding lint: passed.
- `npm test`: **248 passed, 10 skipped**, 26 files passed. Skips require private
  owner files/captured inference evidence and are not simulated as live results.
- `npm run build`: passed (373.57 kB JavaScript, 115.37 kB gzip).
- `npm run worker:check`: passed, dry-run only; production variables unchanged.
- `npm run test:integration`: passed, compiled Worker/local D1/Durable Object
  security, permissions, cache, budget, API and SPA checks; zero real model calls.
- `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`: **36 passed** (1.4 min).
  Includes JS-gallery extraction via a test-only broker, authoritative Reader
  publication checks, Collect reload, keyboard/mobile/reduced-motion regressions.
- `npm run discover:acceptance`: local persistence succeeded; six real-source
  attempts blocked by managed-proxy/DNS-pinning incompatibility, **0 images**.

The automated Muse/provider requests are mocked. Existing genuine private Muse
and SAM evidence is neither reproduced nor committed. No new live inference,
production D1 write, migration, activation, deployment or merge was performed.
GitHub CI runs the same required suites on the PR; its result/link is recorded in
the PR conversation rather than claiming a local run is remote CI evidence.
