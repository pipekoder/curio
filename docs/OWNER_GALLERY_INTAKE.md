# Owner gallery: local-only intake and acceptance

A future owner-supplied gallery is **not yet approved**. This checklist prepares
intake using the merged PR #25 pipeline; it grants no rights, enables no production
feature, and performs no AI inference. The existing approved illustrations remain
the hackathon demo fallback.

## Before intake

- Obtain the gallery/source name and original HTTPS entry URL, individual original
  image URLs, collection/product/story relationships where actually supplied,
  source publisher and retrieval date. Do not invent missing names/descriptions.
- Establish reuse/publication permission for supplied text as well; otherwise
  retain review-only metadata/citations rather than reproducing publisher copy.
- Record attributed source text separately from verified editorial facts and
  model interpretations. Verify any brand/product/designer identity independently.
- For each exact image version, record original URL, SHA-256 of original bytes,
  MIME, width/height, alt text, attribution and rights-holder identity. Preserve
  available descriptions and campaign metadata with their source URLs.
- If a resized derivative is proposed, record both original and derivative URLs
  or private file references, both hashes, derivative dimensions/MIME and the
  transformation. Rights for the original do not automatically authorize edits,
  publication of the derivative, or analysis of different bytes.
- Obtain separate evidence for **display/publication**, **AI analysis** and
  **editing**. Note scope, attribution conditions, expiry/territory restrictions
  and the approving person. Public availability or press access is not a grant.
  Keep absent permissions pending. Curio does not automatically enforce license
  expiry/territory conditions; do not approve publication if those conditions
  cannot be honored. Revoke manually when evidence changes.
- Keep private rights documents, gallery manifests, originals and derivatives in
  a mode-0700 directory outside Git, e.g. `/tmp/curio-owner-gallery`; files should
  be mode 0600. Never commit private media or private evidence. A public catalog
  record may contain only reviewed, safe public evidence references.

Hash local bytes without changing them:

```sh
sha256sum /tmp/curio-owner-gallery/REPLACE_WITH_IMAGE.jpg
file /tmp/curio-owner-gallery/REPLACE_WITH_IMAGE.jpg
```

The pipeline's bounded image-verification mode can measure fetched bytes;
publication requires fingerprint/dimensions, not just an HTTP success or metadata
claim. No image bytes are stored in D1. See the exact schemas and contracts in
[ADAPTIVE_GALLERY_DISCOVERY.md](ADAPTIVE_GALLERY_DISCOVERY.md).

## Local setup only

```sh
npm ci
npm run build
npx wrangler d1 migrations apply curio-catalog --local --persist-to .wrangler/owner-gallery
```

Use a private ignored `.dev.vars` with a new local operator token of at least 32
characters. Keep `MAGAZINE_AI_ENABLED=false`, `ASSET_AI_ENABLED=false` and
`SAM_DECODER_ENABLED=false`; do not supply live Meta credentials. Then:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 18788 \
  --persist-to .wrangler/owner-gallery \
  --var CATALOG_OPERATOR_ENABLED:true --var CATALOG_PUBLIC_ENABLED:true \
  --var PUBLIC_APP_ORIGIN:https://curio.test
```

These command-line flags affect only local workerd. Do not edit production vars,
run remote migrations, deploy, or reuse a production operator token. Set the same
local token privately as `CURIO_CATALOG_OPERATOR_TOKEN` for CLI persistence.

## Intake → review → reusable publication

1. **Extract or import.** Configure reviewed source/CDN hosts and bounded budgets
   in a private config. Use the on-demand CLI below, or import an existing strict
   `DiscoveryManifest` from `shared/discovery.ts`. Do not bypass a managed proxy,
   robots rules, authentication or publisher restrictions. A blocked or partial
   extraction is an unresolved intake result, not successful harvesting.

   ```sh
   npm run discover -- 'REPLACE_WITH_HTTPS_GALLERY_URL' /tmp/curio-owner-gallery/config.json .wrangler/owner-gallery-manifests --persist
   # Reuse an existing manifest without another crawl:
   npm run discover -- ingest /tmp/curio-owner-gallery/manifest.json
   ```

2. **Inspect persisted provenance.** With local operator authentication, inspect
   `GET /api/operator/catalog/intelligence/discovery/content` and
   `/discovery/content/:contentVersionId`. Check original URLs, attributed copy,
   relationships, extraction method, hashes and incremental states. Initial
   content is pending and must not appear at `GET /api/catalog/published`.
3. **Review exact content.** Record independent purpose reviews via
   `POST /api/operator/catalog/intelligence/discovery/reviews`. Pending/rejected
   evidence remains auditable. An approved content review does not grant a
   catalog permission; a new content version never inherits old approvals.
4. **Promote the exact image.** POST `{versionId: contentVersionId}` to
   `/api/operator/catalog/intelligence/discovery/promote`. Save its returned
   **asset** version ID. It imports pending metadata with zero AI calls; repeated
   promotion reuses the same link and leaves permissions unchanged.
5. **Review catalog rights and identity.** Use existing version permission PATCH
   (`/api/operator/catalog/versions/:assetVersionId/permissions`, with current
   `expectedRevision`), identity and reader-review endpoints. Confirm rights,
   source identity, accessible exact bytes, attribution, licensing and alt text.
   Approve only evidenced purposes. Display-only publication must keep analysis
   and edits pending when those rights are absent. Do not fabricate approvals to
   make a local test pass.
6. **Publish explicitly to local D1.** Submit a complete strict `CatalogItem` and
   asset version ID to POST `/api/operator/catalog/intelligence/discovery/publish`.
   Use the exact catalog ID, URL, dimensions, attribution and evidence required by
   `worker/catalog-publications.ts`. Do not claim the gallery is owner-created
   unless that is established; `owner_supplied` describes provenance of supplied
   content, not copyright ownership. Only reviewed brand facts belong in copy.
7. **Verify independent retrieval.** GET
   `/api/catalog/published?ids=REPLACE_WITH_ASSET_VERSION_ID`. The Reader rechecks
   this authoritative publication before using an editorial response's image.
   For a manual local full Reader check, open workerd's built UI and generate a
   relevant prompt with Meta consent unchecked; check image attribution, story,
   related discovery and Collect after reload. No second extraction is needed.
8. **Test refusal and updates.** In the disposable local DB, reject/revoke display
   and verify the item disappears from public retrieval and Collect rehydration.
   Re-import unchanged content and confirm no duplicate/version churn. Changed
   bytes/metadata must create a new pending version with historical evidence
   retained. Re-publication requires a fresh exact-version review. Restore no
   grants automatically.

## Repeatable pipeline check before owner review

```sh
npx vitest run tests/discovery-persistence.test.ts tests/discovery-api.test.ts
npm run test:browser -- tests/discovery-reader.spec.ts tests/demo-readiness.spec.ts
```

Run browser checks after `npm run build`. These tests use original synthetic
fixtures/approved illustrations and mocked responses; they do **not** approve or
validate a future owner's actual gallery.

## AI/SAM are separate readiness decisions

Muse image understanding additionally needs exact server media authorization,
current analysis rights, matching version/hash/dimensions, eligible model access,
existing budget protection and separately approved live-test limits. Publication
alone never authorizes inference. Cached observations must match the current
fingerprint/version/permission revision before entering editorial planning.

The public SAM adapter does not yet accept arbitrary external D1 imagery; it
requires its existing exact raster permit. The private Norm adapter remains a
separate private workflow. Do not bypass these restrictions for a new gallery or
represent mock boxes as genuine SAM results. New live calls and a new media
adapter require separate authorization/review.
