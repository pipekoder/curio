# Approved one-off D1 migration 0001

Prepared only: **no dispatch, migration, remote inspection, deployment or paid
model call was performed to build this PR**. The owner reports that production
contains only `_cf_KV`, points to the expected UUID and has operator access off.
The workflow rechecks those properties rather than trusting a past observation.
Worker code/configuration and migration SQL remain unchanged.

## What is allowed to run

`.github/workflows/d1-migrate-0001.yml` has **workflow_dispatch only**. It does not
run on push, PR, schedule, workflow_call or workflow_run. Ordinary PR CI tests
its code with fake services and local SQLite; that is not migration execution.
Actions are pinned by commit, checkout does not persist credentials, and the
token has only `contents:read`/`actions:read` GitHub permissions. Production
credentials exist only in the approved migration step, after `npm ci
--ignore-scripts`. No deployment, seeding, operator activation, DO reset,
Vectorize resource, AI request or automatic rollback is implemented.

The target is fixed in code: `curio-catalog`,
`b39c4f63-74ee-47f6-bb1d-7388ecc88bc7`, binding `CATALOG_DB`.
Only the unchanged, version-controlled `0001_catalog.sql` is staged for Wrangler;
SHA-256 `61ece1ec93c0123324b0a9af7ccb9fdefc5b465e63355817c84f756dfce827c2`.
Other migrations, changed SQL, non-main refs, forks, mismatched reviewed SHA,
advanced main, run reattempts and debug logging are rejected. Migration directory
is copied into a private temporary, migration-only config with the exact account
and UUID, so Wrangler cannot opportunistically apply later migrations.

## Required GitHub setup (owner action, not done by this PR)

1. Protect `main` and require security review of this workflow, its scripts,
   migration, package lock and Environment settings. Do not approve unreviewed
   changes to code that can receive production secrets.
2. Create the exact Environment **`production-d1-migration`**. Set required
   reviewers (at least one explicitly listed trusted user other than the dispatcher), enable
   **Prevent self-review**, disable admin bypass, and restrict deployments to a
   single custom **branch** policy named `main` (no tags or wildcards).
3. Verify your GitHub plan supports required reviewers on this private repo.
   GitHub documents that Free/Pro/Team required-reviewer protection is limited
   to public repositories. **If unavailable, execution is blocked**; do not
   make the repo public or replace Environment approval with a text input as
   a workaround. Arrange a supported approval mechanism/plan separately.
4. Store the token and backup URL secrets **in this Environment**, not repo-wide
   secrets. The pre-approval job reads the existing Environment policy via the
   GitHub API; missing policy, missing reviewers or inaccessible policy stops the
   job before production secrets. The approved step repeats that audit and
   requires a real `approved` review event for this run and Environment from a
   different, explicitly configured user reviewer. Team-only reviewer lists are
   not supported by this guard; it does not request private org membership access.
   An admin bypass from an unlisted user is insufficient.

### Cloudflare token and account variables

Use a dedicated expiring **`CLOUDFLARE_D1_MIGRATION_TOKEN`** Environment secret.
Restrict resources to the intended account and grant only:

- Account D1 Edit, required for applying the migration (also reads/exports D1).
- Account Settings Read, for exact account ID/name verification.
- Workers Scripts Read, for live deployment/version bindings inspection.

No Workers Edit, zone permissions, R2, broad global API key or Meta credential.
Cloudflare D1 token permissions may cover the account's D1 databases rather
than one database; do not claim database-only authorization if the token UI
cannot express it. The fixed UUID/account checks are additional restrictions.
Revoke/expire the migration token after the approved operation.

Environment variables (not dispatch inputs):

| Variable | Owner-verified value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Exact intended 32-character account ID |
| `D1_EXPECTED_ACCOUNT_NAME` | Exact account name, checked against Account Details |
| `D1_BACKUP_HOST` | Exact HTTPS hostname of existing private backup storage |
| `D1_BACKUP_PRIVATE_CONFIRMED` | `true`, only after checking the private ACL/access policy |
| `D1_BACKUP_PUBLIC_KEY` | PEM RSA public recovery key, 3072 bits minimum |
| `D1_BACKUP_KEY_SHA256` | SHA-256 of that public key's SPKI DER bytes |

## Durable private recovery is mandatory

Before approving a run, provision/use an **already approved private** backup
location and prepare unique, short-lived, method-limited signed URLs for the
same new object. This PR does not select/provision a storage provider or add R2.
Set Environment secrets `D1_BACKUP_UPLOAD_URL` (PUT) and
`D1_BACKUP_DOWNLOAD_URL` (GET). Both must use HTTPS and the exact configured host,
with no redirects. Confirm anonymous access is denied, ciphertext cannot be
publicly listed, retention is suitable and URLs last through approval/execution.
Use a new object and URLs per fresh dispatch; do not overwrite prior recovery.
Retain the private object identifier/run-to-backup mapping outside Git so an
authorized operator can retrieve it after the signed URLs expire.

Create and retain the private key **offline, outside Git and GitHub Actions**:

```sh
umask 077
mkdir -p "$HOME/curio-offline-recovery"
cd "$HOME/curio-offline-recovery"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out recovery-private.pem
openssl pkey -in recovery-private.pem -pubout -out recovery-public.pem
openssl pkey -pubin -in recovery-public.pem -outform DER | openssl dgst -sha256
```

Keep the private key in protected encrypted offline storage and test recovery
with a non-production fixture before approval. Only the public PEM/fingerprint
go in Environment variables. The supplied decrypt helper accepts an unencrypted
PEM; protect its storage, never upload it, and never run decryption in Actions.

The workflow exports SQL and captures the current Time Travel bookmark with
Wrangler into private runner temporary state outside the checkout. It encrypts
SQL, bookmark and target provenance using AES-256-GCM with a random key, wrapping
that key using RSA-OAEP-SHA256. It uploads **only ciphertext to private storage**,
downloads it with the separate signed GET and verifies a matching SHA-256 before
any migration. No Cloudflare/GitHub token is sent to backup storage. Plaintext
and private Wrangler logs are removed in `finally`; hosted ephemeral runners are
required. Export limit is 64 MiB; larger recovery needs a separate reviewed plan.

Backups, bookmarks, signed URLs, raw CLI output, raw API results and private
keys are **never Actions artifacts**. Only a fixed allowlisted JSON report with
commit/hash, boolean checks and expected schema counts is uploaded (14 days).
It contains no account name, SQL, row contents, bookmark or backup URL. Failures
emit a generic message; inspect booleans and use controlled private diagnostics,
never enable runner/step debugging or expose raw logs to get past a blocker.

## Manual execution, only after explicit approval

1. Review and merge this PR separately; **do not dispatch merely because it is
   merged**. Confirm Environment protection, account scope, private backup/key
   recovery, token expiry and production `CATALOG_OPERATOR_ENABLED=false`.
2. Agree on a short maintenance window: no dashboard/schema edits or other D1
   writers. Workflow concurrency serializes this workflow, not external writers.
   Record the reviewed current main SHA and exact approved migration hash.
3. On explicit execution authorization, choose Actions → **Approved production
   D1 migration 0001** → Run workflow. Select `main`, paste the exact reviewed
   40-character main SHA and `MIGRATE curio-catalog 0001` confirmation. These
   inputs are assertions, **not substitutes for Environment approval**.
4. A different configured reviewer inspects the SHA/changes/target/backup setup
   and approves the Environment job. The run stops if main advanced, Environment
   protections changed or actual approval is missing. Do not use admin bypass.
5. Read the sanitized report. Expected successful outcome is `verified`, with
   10 tables, 6 indexes, audit trigger, one `0001_catalog.sql` history row and
   successful FK/integrity checks. Every traffic-serving Worker version must
   still have the correct D1 binding and operator flag false.

Before backup and again immediately before the migration, preflight performs
only SELECTs. It permits `_cf_KV`, SQLite internals and an optional **empty**
`d1_migrations`. It never calls `d1 migrations list` (which can create history).
Existing catalog tables, other user tables or any applied-history row stop the
one-off run; there is no implicit repair, replay or delete. Wrangler creates
history only inside the subsequently approved migration phase.

Backup export/Time Travel are recovery operations, not schema migration. Only
after durable backup read-back does the workflow invoke Wrangler `d1 migrations
apply ... --remote`. Post-checks use SELECT and integrity PRAGMAs. No Worker
deployment/settings write is performed, and operator access remains disabled.

## Failure and recovery

No automatic retry, restore, DROP or history rewrite. A rerun is rejected: use
a new explicitly authorized dispatch after investigation and fresh backup URLs.
Treat a cancelled run as uncertain until read-only inspection establishes whether
the migration committed; cancellation does not roll back a remote request.
If `migrationAttempted=true` but verification is false, outcome is
`needs-inspection`: a timed-out/failed CLI does **not** prove the write failed.
Inspect production read-only before taking another action. A failed post-check
does not cause a destructive rollback.

An authorized operator retrieves the encrypted object privately and decrypts
on a secure offline machine, outside Git (output refuses to overwrite files):

```sh
node /path/to/reviewed/curio/scripts/d1-migration/decrypt.mjs \
  downloaded-recovery.enc recovery-private.pem recovery.json
```

`recovery.json` contains the SQL, bookmark and exact target/commit. Treat it as
private backup data. Any restore requires separate explicit approval; see the
[production recovery runbook](D1_PRODUCTION_RUNBOOK.md). Time Travel retention
is plan-dependent; confirm it in advance and retain the encrypted export/private
key beyond that window. No restore command is run by this workflow.

## Security review checklist and local evidence

Review workflow events, fixed Environment, main-only checks, review-history API,
secret placement, action pins, locked dependencies, migration hash, child argv,
private temporary paths, encryption/fingerprint, private upload/read-back and
the exact artifact path. Validate backup storage ACLs externally; a successful
signed PUT does not prove private access. Protect Environment configuration and
all workflows that can reference its secrets.

`npm run test:migration-workflow` uses fake remote transports and real local
SQLite, never Cloudflare. It covers approval/target/hash/flag rejection,
unexpected schemas/history, export/upload/readback failures, crypto roundtrip/
tampering, real local post-schema validation, cleanup and artifact allowlisting.
Ordinary CI also retains the full application/security/Worker/browser suite.
Live Cloudflare contracts, repository plan/Environment setup and private backup
storage are not claimed verified by mocked tests; the workflow fails closed.

Sources: [GitHub Environment protection and plan availability](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
[Environment API](https://docs.github.com/en/rest/deployments/environments),
[review history API](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).

### Recorded local checks, October 27

- 160 application/component/security/D1 tests passed; 26 migration-specific
  tests passed with mocked transports and real local SQLite.
- Typecheck, production build, Worker dry run and Worker integration passed.
- All 12 Chromium tests passed; original reader/Living Ads behavior retained.
- Workflow parsed and passed actionlint 1.7.7; action references are commit-pinned.
- Clean `npm ci --ignore-scripts` installed 198 packages; Wrangler CLI initialized
  correctly without lifecycle scripts. Audit: zero vulnerabilities.
- Production Wrangler configuration, Worker sources and migration bytes are
  unchanged from main. Live workflow/approval/storage/API behavior remains
  unexecuted; no production state was inspected or changed for this PR.
