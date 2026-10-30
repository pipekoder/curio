# Curio Content Studio

The owner-only Content Studio is served by the existing Curio application at `/internal/media`. It uses the existing catalog operator boundary: `CATALOG_OPERATOR_ENABLED=true`, a same-origin `PUBLIC_APP_ORIGIN`, a trusted Cloudflare client address and a `CATALOG_OPERATOR_TOKEN` of at least 32 characters. The token is entered in the Studio and retained only in the browser session. Production setup is performed only by the manual workflow documented in [Production Media Studio setup](PRODUCTION_MEDIA_STUDIO_SETUP.md); ordinary CI does not create or reveal the operator credential.

## Upload and import

1. Open `/internal/media` and enter the existing catalog operator token.
2. Drop one or more owner-created JPG, PNG or WebP mockups. Each original must be at most 2 MiB, at most 4096 pixels on either side and at most 4 megapixels. Those bounds match the existing Muse/SAM data transport instead of accepting originals that cannot be analyzed later.
3. Uploads are fingerprinted before R2 storage. An exact SHA-256 duplicate is rejected. Stable identities are `asset-<sha256>` and `version-<sha256>`; the private R2 key is `originals/<first-two-hash-characters>/<sha256>.<ext>`.
4. Paste multiple brand/product/campaign blocks, or choose a structured JSON file. Select **Extract structured records**, edit the bounded JSON review, then save it. Exact filenames in `imageFilenames` are matched automatically. Missing or ambiguous matches remain visible in the library and can be assigned manually.
5. The library shows associations and whether the exact asset is available to Reader, Muse and SAM. Delete archives the catalog asset, blocks all three permissions, removes the publication and deletes its R2 object.

Text blocks use this repeatable format:

```text
Brand: Northline Studio
Story: A fictional owner-created mockup brand.
Description: Owner-supplied demo copy.
Country: Sweden

Product: Fold Chair
Brand: Northline Studio
Category: home
Description: A fictional folded chair concept.
Materials: textile appearance, curved form
Price: 1250
Currency: USD
Images: fold-chair-front.jpg, fold-chair-detail.jpg
```

JSON accepts `brands`, `products` and `campaigns` arrays with the same fields. Products support `home`, `fashion` or `travel`, an array of materials, optional numeric price and three-letter currency, image filenames and Curio lifestyle tags. Every stored entity is marked `mockup`; prices and materials remain owner-supplied fictional metadata and are never represented as verified commerce information.

## Persistence and permission flow

Migration `0004_media_studio.sql` adds mockup brands, products, campaigns, media objects, relationships and import batches. Image bytes never enter D1. Upload creates the existing catalog asset/version, provenance, access check, exact-version content link, reader review and separate `display`, `ai_analysis` and `edits` permission rows. Because the operator declares these files owner-created, each permission is explicitly approved with `docs/MEDIA_STUDIO.md` evidence and `pipekoder` as rights holder. This is an auditable use of the current permission architecture, not a bypass.

The private R2 bucket has two delivery paths:

- `/api/operator/media/assets/:version/file` requires catalog operator authentication and is for owner inspection.
- `/api/media/:version` is a no-store Worker response available only while the exact version is active, display-approved and present in `catalog_publications`. The bucket and object key are never public. Reader and Collect use this controlled URL through the existing published-catalog response.

## R2 to Meta AI

Neither upload nor metadata import triggers inference. When an existing workflow explicitly requests inference with consent:

1. `resolveR2MediaPermit` checks the exact latest catalog version, active content version, archive state and independent D1 AI-analysis grants.
2. The Worker reads the object through `env.MEDIA_BUCKET`, checks byte size, MIME header, dimensions and SHA-256 against D1, and creates an in-memory data URL.
3. Asset Intelligence passes that verified data URL to the existing Muse Spark 1.3 structured-output adapter. Cache keys continue to include exact version, fingerprint, analysis spec and permission revision.
4. The existing SAM 3.1 Decoder uses the published catalog identity and the same verified bytes. Its operator credential, explicit consent, request limit, inference budget, no-retry behavior and result validation remain in force.
5. Editorial generation sees the asset through the existing D1 retriever and publication hydrator. Image observations remain linked to the original version. Reader and Collect retain the same version ID.

The adapters accept only Meta `muse-spark-1.3` and `sam-3.1`. This PR makes no model call and adds no provider or S3 credentials.

## Local setup and migration

Apply migrations only to a local D1 database while reviewing this PR:

```sh
npx wrangler d1 migrations apply curio-catalog --local
npm run worker:dev
```

R2 local persistence is supplied by Wrangler through the existing `MEDIA_BUCKET` binding. Production migration, secret configuration and deployment use `.github/workflows/production-media-setup.yml` after explicit owner authorization. The workflow applies `0003` before `0004`, stores `CATALOG_OPERATOR_TOKEN` as a Worker secret, preserves the existing R2 binding and keeps every paid inference flag disabled.
