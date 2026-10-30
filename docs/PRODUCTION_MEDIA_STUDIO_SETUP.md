# Production Media Studio setup

The manual workflow `.github/workflows/production-media-setup.yml` applies the remaining D1 migrations, stores the Content Studio operator secret and deploys the existing `curio` Worker. It runs only through `workflow_dispatch`; push and pull-request events cannot start it.

## GitHub secrets

Configure these repository or Environment secrets:

- `CLOUDFLARE_API_TOKEN`: reuse the existing token if it has **Account / D1 / Edit** and **Account / Workers Scripts / Edit** for the Cloudflare account containing Curio. Wrangler also needs read access to the existing Worker bindings during deployment. Do not create a second token if the existing token already has these permissions.
- `CLOUDFLARE_ACCOUNT_ID`: the 32-character account ID containing Worker `curio`, D1 database `curio-catalog` and R2 bucket `curio-media`.
- `CONTENT_STUDIO_OPERATOR_TOKEN`: a random value of at least 32 characters. This becomes the Worker secret `CATALOG_OPERATOR_TOKEN` and is the credential entered into `/internal/media`. Generate it independently from the Cloudflare token.

The repository contains no Cloudflare credential or operator token. No Meta credential is required or read.

## Reviewed production configuration

`wrangler.jsonc` retains the existing `CATALOG_DB`, `MEDIA_BUCKET`, assets and Durable Object bindings and sets:

- `PUBLIC_APP_ORIGIN=https://curio.shuang-han807.workers.dev`
- `CATALOG_OPERATOR_ENABLED=true`
- `CATALOG_PUBLIC_ENABLED=true`
- `MAGAZINE_AI_ENABLED=false`
- `ASSET_AI_ENABLED=false`
- `SAM_DECODER_ENABLED=false`

Enabling the catalog operator boundary does not enable paid inference. Requests still require the long operator token, exact same-origin request and existing Worker security checks.

## Owner-authorized execution

After this workflow and configuration are reviewed and merged:

1. Open **Actions → Production Media Studio setup → Run workflow** on `main`.
2. Enter the exact current 40-character `main` commit SHA.
3. Enter `MIGRATE AND DEPLOY CURIO MEDIA`.
4. Run the workflow only after explicit production authorization.

The workflow verifies the exact database UUID, existing R2 binding, origin and disabled AI flags. It accepts only an ordered migration history beginning with `0001` and `0002`; it then lets Wrangler apply only the pending suffix. The expected production state applies `0003_discovery_content.sql` followed by `0004_media_studio.sql`. If either is already applied, Wrangler does not reapply it. Unexpected, missing or reordered history stops the run.

After migration, the workflow verifies all four migration records, the added tables, existing-table row counts, foreign keys and D1 integrity. It then stores `CATALOG_OPERATOR_TOKEN`, builds the reviewed commit, deploys the existing Worker and checks the Content Studio route.

No database reset, deletion, seed, paid inference or new Cloudflare resource occurs. A failed migration or verification stops the workflow before secret configuration and deployment. Do not rerun a failed migration blindly; inspect the migration history first.

The live route after a successful authorized run is:

`https://curio.shuang-han807.workers.dev/internal/media`
