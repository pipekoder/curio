# Persistent advertising catalog foundation

Implements the first focused storage slice of [Issue #8's confirmed architecture](https://github.com/pipekoder/curio/issues/8#issuecomment-6442380103).
Rebased onto main `73bb9da`, which includes merged PR #9. The existing six
fictional illustrations, public reader, Meta model allowlist and inference
budgets are preserved. This PR makes **no inference request** and performs no
source fetch, Cloudflare provisioning, remote migration, merge or deployment.

## Smallest practical PR sequence and deadline

| Step | Scope | Target (Europe/Stockholm) |
| --- | --- | --- |
| Existing #9 | Merged by owner; Living Ads and SAM controls included in this branch; production verification remains separate | Oct 27 |
| D1 foundation (this PR) | Migration, operator-only manifest ingestion, exact URLs, versions, grants/audit, query and coverage | Oct 27 |
| Asset intelligence and sourced knowledge | Authorized on-demand gallery discovery, availability/terms review, Muse vision structured tags and fact cache; mocked first, shared budget before any approved live call | Oct 28 |
| Connected editorial journey | Deterministic shortlist → validated Meta plan/story/citations → vetted motion presets → curiosity branch → local Collect with opt-in reuse | Oct 29–30 |

Oct 30 is the functional cutoff, with Oct 31–Nov 4 reserved for evaluation,
video, documentation and submission. No accounts, checkout, public sharing or
scheduled refresh. Retain one cohesive Discover → Explore → Understand → Follow
Curiosity → Collect journey; reduce visual variety and extra motion before
reducing source safety or accessible interactions. Do not promise completion of
live-model demonstrations without account, rights and explicit spend approval.

**Critical risks:** earlier #9 preview bot comments reported failed builds; this
rebase does not establish current hosting status. Production verification requires
separately approved deployment. Current candidate pool is ten exact URLs and six gallery seeds, not
100–200 inspected assets. Availability, written display/AI terms and source
facts are unverified. Network policy currently permits package/GitHub hosts,
not the supplied brand/press domains; gallery investigation needs supported
network access or owner-supplied manual manifests. Some galleries need JS or
may block automation; never bypass access controls. Asset collection/review,
live Muse/SAM approval and the remaining two functional PRs are the main risks
to October 30. Rules/portal verification from Issue #8 also remains open.
The existing default lifetime inference ceiling is 20 calls (shared with reader
generation); 100–200 candidates cannot simply become 100–200 single-image model
calls. Preserve the ceiling, cache reusable results and prioritize a small
explicitly authorized live subset. Any later batch-input strategy needs contract
verification and budgeting; this PR does not increase limits or claim full indexing.

## Storage and identity

`migrations/0001_catalog.sql` creates:

- `brand_sources`: owner-supplied source identity, gallery/individual seed URL,
  issue provenance. Names are supplied source labels, not verified advertisers.
- `catalog_assets`: exact URL identity, archive state. SHA-256 of the **exact
  unchanged URL** identifies a logical asset. Tracking/query variations are not
  silently normalized; URL similarity is not proof of identical bytes.
- `asset_versions`: immutable version key, optional reviewed byte fingerprint,
  dimensions, alt/credit, source classification and provenance. Monotonic local
  sequence selects the latest version; timestamps are not ordering assumptions.
- `asset_discoveries`: source association/page and metadata-retrieval timestamp.
  No source page, dimensions or alternative text is guessed from filenames.
- `asset_permissions` / `permission_history`: independent display, AI-analysis
  and edit grants, evidence, rights holder, human reviewer, timestamp and optimistic revision;
  append-only update audit. New versions always start pending, even if an older
  version has approvals. Revocation changes only the exact version/purpose.
- `asset_intelligence`: strict eight aesthetic/three category scores, reusable
  tags, objects/mood/composition/themes. `muse-spark-1.3` only; mock and actual
  Meta interpretations are distinct. Scores/objects are not verified facts.
- `editorial_facts`: separately human-verified statement, source, optional exact
  version, citation URL, publisher and retrieval/review timestamps. Version facts
  must cite a source associated with that version. The operator is responsible
  for factual review; storing a record is not automatic fact verification.
- `object_regions`: optional exact-version/dimension normalized boxes, labels
  and nullable confidence; authored demo vs `sam-3.1` results remain distinct.
  There is no new SAM inference or mask rendering in this PR.
- `catalog_imports`: successful transaction receipt; actor label, count and time.

No image blobs, image proxy, credentials, reader preferences or account data.
Catalog provenance is not a private legal-document vault: keep sensitive grants
elsewhere and store a safe evidence reference. Repository seed URLs are already
owner-provided in Issue #5; they are not license approvals.

## On-demand ingestion

`seeds/issue-5-candidates.json` contains all ten supplied exact image URLs and all
six gallery entry URLs. There are ten source records (four direct-URL groups,
six gallery seeds). Source pages, HTTP/browser loading, dimensions, alt text,
credits, identity and permissions remain **unverified**. `retrievedAt` in these
seeds describes retrieval of owner issue metadata, **not image retrieval**.
No brand asset is publicly exposed, downloaded, copied, analyzed or approved.

The foundation deliberately implements the manual-manifest option requested in
Issue #8. An operator supplies reviewed source metadata and extracted exact URLs;
the deterministic importer does not crawl URLs. Gallery extraction and legal/
technical review belong to the next slice and remain pending. Do not manufacture
90–190 candidates to claim the 100–200 target. Aim for roughly 5–20 per supplied
brand/source, but neither is a hard limit. Deduplicate overlaps between galleries.

An import transaction accepts up to ten sources and five candidates (64 KiB).
The CLI splits any larger manifest into independent idempotent transactions.
An unknown source or changed immutable version causes **the entire batch** to
roll back, including its receipt. Earlier successful CLI batches remain committed;
fix the failed batch and rerun. Reimports never reset grants or unarchive assets.
Changing version metadata requires a new explicit `versionKey`; a changed URL
gets a separate exact-URL asset. Discovery records are append-only first sightings.
Conflicting source identity also rejects the batch; use a new reviewed source ID.

## Local-only setup

```sh
npm ci
npm run build
npx wrangler d1 migrations apply CATALOG_DB --local --config wrangler.catalog-local.jsonc
```

Create an ignored `.dev.vars` with a private random token of at least 32
characters: `CATALOG_OPERATOR_TOKEN=<private token>`. Do not commit or print it.
The local-only config uses a dummy database UUID, enables the private catalog
route and leaves magazine inference disabled. It contains no provider key.

```sh
npx wrangler dev --local --config wrangler.catalog-local.jsonc --port 18788
```

In another shell, set `CURIO_CATALOG_OPERATOR_TOKEN` securely to the same token:

```sh
node scripts/catalog-import.mjs seeds/issue-5-candidates.json
```

This CLI only accepts `http://127.0.0.1`, refuses redirects and cannot target a
remote Worker. The local trusted-IP header is solely for this local flow; at a
deployed edge, use Cloudflare's edge-set header and never client-supplied
X-Forwarded-For. Automated integration uses fake credentials and denies **all**
outbound requests. No real `.dev.vars` is needed to run tests.

## Private operator API

All `/api/operator/catalog/*` endpoints are off unless the flag is exactly
`true`, D1 is bound, a ≥32-character private operator credential is configured,
and an exact app origin exists. Every request requires a constant-time checked
Bearer token, exact Origin and trusted edge address. Writes require JSON. All
responses are no-store; raw SQL/errors and credentials are never returned.
No CORS/public operator UI or unauthenticated pending-catalog endpoint exists.

| Method/path suffix | Purpose |
| --- | --- |
| `GET /status` | Candidate/active/display-approved counts, 24 coverage cells and target ranges |
| `GET /sources` | First 200 private source records |
| `GET /sources/:id/facts` | First 100 reviewed source facts |
| `POST /imports` | Strict v1 source/candidate manifest, transactional pending-only ingestion |
| `POST /query` | Stable asset-ID cursor, 1–50 results; category, aesthetic, permission/status and archive filters |
| `GET /assets/:id` | Exact asset, latest 50 versions, up to 100 records per annotation type, provenance/grants |
| `PATCH /versions/:id/permissions` | Human review `{purpose,status,evidence,rightsHolder,reviewer,expectedRevision}`; stale review →409 |
| `PATCH /assets/:id` | `{archived:true|false}`; soft deletion/restoration retains provenance |
| `POST /annotations` | Strict discriminated intelligence/fact/regions records, append-only IDs |

Purpose values are `display`, `ai_analysis`, `edits`; statuses are `pending`,
`approved`, `rejected`, `blocked`. Approval requires evidence and a rights holder. New imports cannot
carry grants. A private operator may import *already-produced* Meta metadata,
but live-origin intelligence/SAM records require an analysis-approved active
version. Authored/mock annotations are labeled and never count as Meta indexing.
Region dimensions must exactly match the version; out-of-frame boxes fail.

Category/aesthetic retrieval and coverage use only the latest actual Meta
interpretation per latest active version, with score ≥0.5; mocks do not improve
coverage. Coverage reports both indexed and separately display-approved counts.
Zero coverage is truthful until approved enrichment exists. `active_candidates`
means unarchived records, **not verified HTTP availability**. Querying an exact
permission does not imply any other permission or verified advertiser identity.

**This API is a private review tool, not public publication authority.** Nothing
in D1 feeds the reader or existing inference yet. Future public adapters must
retain exact-source approvals, independently verified advertiser identity,
licensing and evidence, permission revocation, source citation validation and
the existing Meta-only shared inference reservations. D1 approval alone does
not bypass the compiled external-URL registry or PR #9's exact SAM raster permit.
The legacy demo's 24-slot limit remains only on that static demo adapter; the
persistent catalog has no equivalent cap. Dynamic adapter work is next.

## Cloudflare configuration, migration and rollback review

`wrangler.jsonc` and production settings are unchanged. No real database exists
because of this work. After owner approval, provision a reviewed D1 database,
add a `CATALOG_DB` binding and migration directory, configure the private token
as a server secret and exact origin, review/back up data, then separately approve
the remote migration. Start with the operator flag absent/false; never put an
operator credential in the frontend. The local dummy UUID must never be used as
a real remote binding. Deployment is a separate approval, not part of setup.

Migration is additive and forward-only. Before remote use, review the SQL and
backup/Time Travel availability. Code rollback: disable the operator flag and
remove the binding in a coordinated rollback while retaining D1 data. Do not
drop production tables or replay migrations blindly; restore a reviewed backup
or write an additive corrective migration. Locally, discard only the isolated
catalog dev state and reapply to test a clean database. Archive mistaken imports
and retain their receipts; use explicit new versions rather than destructive edits.

Free compatibility: no R2/queues/cron or paid inference is added. Each maximum
import uses 41 SQL statements; status uses 25; detail reads use 7. These fit the
50 D1 queries per Workers Free invocation. Indexed pagination avoids a fixed
library cap. Provider storage/daily read/write/CPU quotas still apply; measure
production usage before enabling a larger library. Local workerd verification
does not establish production CPU or billing behavior.

## Verification

Run the README checks: typecheck, tests, production build, Worker dry run,
integration and Chromium. Tests execute the real migration in local D1/workerd,
transaction rollback, dedupe/version isolation, concurrent permission revision,
audit, archive/reinstate, safe pagination, exact geometry, Meta-only structures,
mock separation and citations. Production-bundle integration covers private
route gates, malformed/oversized inputs, three-batch seed import, reimport,
persistence across runtime restart and zero outbound requests. Existing magazine
and reader/browser tests remain intact. These are local/mocked checks, not live
Muse/SAM validation or permission/availability review of the candidates.

### Recorded local results, October 27 (before rebase)

Node 24.19.0/npm 11.9.0; hosted CI targets Node 22.

| Check | Result |
| --- | --- |
| Clean install | 196 packages |
| Audit | 0 vulnerabilities, including development dependencies |
| Typecheck | Passed |
| Unit/component/security/D1 | 126 passed, 0 failed, 8 files; original 108 retained |
| Final catalog changes | 18 focused D1/operator tests rerun and passed |
| Production build | Passed; unchanged frontend 102.44 kB gzip |
| Worker dry run | Passed; final Worker 146.22 KiB gzip |
| Worker integration | Passed: original budget/magazine/SPA checks and persistent D1 checks |
| Local migration | Real Wrangler local migration applied successfully |
| Chromium | 8 passed, 0 failed; desktop/mobile, reduced motion, hybrid rights/fallback/security |
| Library scale | 125 synthetic test-only candidates paginated in real local D1; not real-brand inventory |
| Actual seed | 10 pending candidates, 10 source records (including 6 galleries), 0 new approved assets |
| Real model calls / remote writes | 0 / 0 |

The final contract/rights-holder changes were rechecked with typecheck, all 18
catalog tests, a rebuilt Worker and production-bundle D1 integration. CI runs the
entire sequence again. Existing harmless dependency-comment build warnings remain.

### Combined verification after PR #9 merge, October 27

Rebased onto `73bb9dad872fdfb0a26e2ae97bd60acae29058de`. Conflicts in
the CI branch list and Worker binding type retain both features. The SAM adapter,
rights/permit gate, shared inference budget and production Wrangler configuration
are unchanged from main; D1 API/schema modules are unchanged from original #10.

| Check | Result |
| --- | --- |
| Clean install / audit | 197 packages; 0 vulnerabilities |
| Typecheck | Passed |
| Combined unit/component/security/D1 tests | 160 passed, 0 failed, 10 files |
| Production build | Passed; client JS 105.00 kB gzip |
| Worker dry run | Passed; Worker 162.44 KiB gzip |
| Worker integration | Passed: magazine budget, default-off SAM, persisted D1 and SPA |
| Combined operator isolation | D1 token cannot authorize SAM; SAM token cannot access D1; exact image analysis permission still required |
| Chromium | 12 passed, 0 failed; includes Living Ads touch/keyboard/geometry and reader tests |
| Paid calls / remote D1 writes / production changes | 0 / 0 / 0 |

The cross-feature checks execute the production Worker bundle with every outbound
request blocked. Merely enabling catalog operations does not enable SAM. Even an
authorized SAM operator cannot analyze the fictional fixtures without the
separate image grant. Hosted CI repeats all combined checks on the rebased head.
PR #10 remains open for owner review; it is not merged or deployed by this task.
