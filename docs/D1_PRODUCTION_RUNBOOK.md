# Existing D1 database: binding and reviewed migration procedure

> Current owner-reported state: production migrations 0001 and 0002 are complete and verified (17 tables, 10 indexes, one audit trigger). This development did not query or modify production. The remote migration commands below document the earlier rollout procedure; **do not rerun them without approval, because Wrangler applies every pending migration**. Further writes, ingestion, operator enablement and deployment still require separate approval. See [Editorial Experience v1](EDITORIAL_EXPERIENCE_V1.md).

This PR starts from main `fd8795d` (merged #9 and #10). It only prepares repository
configuration for the **owner-supplied existing** `curio-catalog` database,
ID `b39c4f63-74ee-47f6-bb1d-7388ecc88bc7`, binding `CATALOG_DB`, migrations
directory `migrations`. Its actual remote state/account identity has not been
queried or verified here. Do not create another database.

`CATALOG_OPERATOR_ENABLED` is explicitly `false`. A D1 binding is not permission
to enable the operator API, publish candidates or run AI. Existing Worker entry,
assets, compatibility date, observability, Durable Object binding/migration,
Meta model selection, inference ceilings and SAM controls are preserved. No
operator token is committed. No automatic migration/deployment is added to CI.

## Migration review

`0001_catalog.sql` is unchanged. Its ten metadata tables, six explicit indexes
and permission audit trigger use D1-supported SQLite DDL, JSON validity checks,
foreign keys and row triggers. `PRAGMA foreign_keys=ON` is compatible with D1's
always-enabled foreign keys; there is no disable-FK/rebuild-table step. Parent
tables precede references. The referenced version IDs have UNIQUE constraints.
The permission trigger records revisions; the application uses `RETURNING`
rather than assuming update change counts exclude trigger writes.

No image BLOB, model invocation, DROP, remote extension or explicit transaction
statement occurs. Wrangler manages migration application and its history.
Application-level Zod validation supplies stricter structured metadata/geometry
rules than SQL alone; direct database writes must not bypass that validation.

Migration is additive but **not blindly rerunnable**: CREATE statements do not
use IF NOT EXISTS. Use Wrangler's migration history. If existing tables predate
that history, stop and reconcile schema/history in a separately reviewed plan;
do not mark the migration applied or remove tables to get past a conflict.
Local workerd/D1 tests cover rollback, foreign keys, the audit trigger, version
isolation, grants, strict JSON and concurrent permission review. This does not
prove the remote database is empty or migration-ready.

## Commands prepared, not executed remotely

Use the locked npm dependency (`npm ci`) and the intended authenticated Cloudflare
account. Commands below use the database name and explicit production config,
not the local dummy configuration. Confirm `d1 info` reports the exact UUID
above and the expected account before any write. All remote actions below need
owner authorization; this task executed only local checks and CLI `--help`.

### Preflight and backup, after approval for remote inspection

```sh
npx wrangler d1 info curio-catalog --config wrangler.jsonc
npx wrangler d1 migrations list curio-catalog --remote --config wrangler.jsonc
npx wrangler d1 execute curio-catalog --remote --config wrangler.jsonc --command "SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name;"
npx wrangler d1 time-travel info curio-catalog --config wrangler.jsonc --json
npx wrangler d1 export curio-catalog --remote --config wrangler.jsonc --output /tmp/curio-catalog-before-0001.sql
```

Record the pre-migration Time Travel bookmark outside the repo, with timestamp
and reviewed deployment SHA. Retain the export securely; it may contain private
provenance. Confirm it completed and the bookmark can be used within the
account's retention window (Free: 7 days; Paid: 30 days). Time Travel commands
are remote even without a `--remote` flag. Exports and schema reads also consume
remote resources; none were performed here.

### Migration: separate explicit approval for production write

With operator access still disabled and migration 0001 reviewed as pending:

```sh
npx wrangler d1 migrations apply curio-catalog --remote --config wrangler.jsonc
```

Confirm the interactive target; do not add this command to CI. Noninteractive
Wrangler skips confirmation, so an absent prompt is not approval. A failed
migration rolls back that migration; earlier successful migrations remain.
Stop on error and inspect before retrying. No seed import or paid inference is
part of schema migration. Deployment is a separate approved action.

### Verify schema: read-only, after migration

```sh
npx wrangler d1 migrations list curio-catalog --remote --config wrangler.jsonc
npx wrangler d1 execute curio-catalog --remote --config wrangler.jsonc --file scripts/catalog-schema-check.sql --json
```

Expected: 0001 recorded/applied, all ten named tables, all six named indexes,
`permission_audit` trigger, permission columns including rights_holder/revision,
no foreign-key violations and quick_check `ok`. A fresh unseeded catalog has
zero sources/assets/versions. If the database already has data, validate expected
counts rather than requiring zero or deleting it. Keep the operator API disabled
until a separate reviewed credential/origin/ingestion plan is approved.

## Rollback

First stop operator writes in a separately authorized operational change. A code
rollback to the previous reviewed Worker can retain the additive catalog tables;
do not drop D1 tables or reset the Durable Object inference budget. The binding
itself does not require destructive schema rollback.

If restoring data is necessary, obtain explicit approval for the exact recorded
pre-migration bookmark and account. **This restores the entire D1 database,
including migration history, and discards later catalog writes.** It does not
restore Worker code, settings or the inference Durable Object. Preserve post-
migration data/export before an approved restore if it is needed for recovery.

```sh
# Set this privately to the reviewed bookmark recorded before migration.
CURIO_D1_PRE_MIGRATION_BOOKMARK='<reviewed bookmark>'
npx wrangler d1 time-travel restore curio-catalog --config wrangler.jsonc --bookmark "$CURIO_D1_PRE_MIGRATION_BOOKMARK"
npx wrangler d1 migrations list curio-catalog --remote --config wrangler.jsonc
npx wrangler d1 execute curio-catalog --remote --config wrangler.jsonc --command "PRAGMA quick_check; PRAGMA foreign_key_check;"
```

Do not execute the post-migration table check against a restored empty database:
those tables may no longer exist. If Time Travel retention has expired, prepare
a separate reviewed restoration into an approved recovery target using the
verified export; do not improvise an overwrite or provision resources here.

## Local validation only

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run worker:check
npm run test:integration
npm run test:browser
```

The production configuration is used by local Wrangler integration, which
emulates the real binding without contacting the real UUID. Even an empty local
schema must return operator 503/no-store with the flag off, never query tables.
The existing local-only config remains available for manual ingestion testing.
No remote development (`--remote`), deployment, resource creation or AI call is
needed for these checks.

References reviewed October 27, 2026:
[D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/),
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[plan limits](https://developers.cloudflare.com/d1/platform/limits/).

## Recorded verification for this binding PR

Node 24.19.0/npm 11.9.0 locally; hosted CI uses Node 22.

- Clean installation: 197 packages; audit: 0 vulnerabilities.
- Typecheck and all 160 unit/component/security/D1 tests passed (10 files).
- Production build and Worker dry run passed; Worker 162.44 KiB gzip.
- Worker integration passed, including the newly bound empty-schema disabled
  operator path and existing SAM/D1 credential isolation and inference budget.
- All 12 Chromium tests passed, including Living Ads touch/keyboard/reduced motion.
- Applied 0001 **locally** using production config in isolated temporary state,
  then executed the exact schema-check file: 10 tables, 6 indexes, audit trigger,
  required permission columns, no FK violations, quick_check `ok`, zero records.
- Remote D1 inspections/writes, resource creation, paid inference, merge and
  deployment performed by this task: zero. The supplied remote UUID is not a
  claim that its current schema, account or production binding has been verified.
