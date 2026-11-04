# Article Edition Demo and D1 usage review

This change keeps the existing `curio-editorial-articles-v1` API envelope and the four-unit Chief Editor / independent Reviewer / bounded Revision / Confirmation workflow. A valid Demo edition contains exactly three articles with two or three unique images each. Generation needs six eligible versions; at most nine exact-version candidates enter the model context. The 512 KiB editorial-source loading bound and the PR #87 nine-row Evidence Pack INSERT batches remain intact. No D1 migration or Production setting changes are part of this PR.

## Query findings and limits of the evidence

The owner-reported Production 24-hour totals are approximately 10 million Rows Read, 21,000 queries and 9,000 rows written with 4.21 MB stored. These are aggregate figures, not Query Insights by SQL statement. This environment has no authenticated Cloudflare Query Insights access; attribution of those totals to Article Edition is **unverified**. The following expensive paths are confirmed by source inspection and local tests:

- Before this change, every preparation poll ran the complete ranked catalog query, publication/source reads, up to 24 R2 HEAD checks, and an asset-analysis job query, *before* checking the job lease. It also ran an expiry DELETE and an INSERT-on-conflict. A poll while another request worked therefore repeated the expensive path with no opportunity to advance it.
- The retriever's lexical score uses `LIKE '%term%'` against joined brand/product text and multiple JSON/correlated subqueries. This cannot use a normal prefix index for the text match; its actual contribution to Production Rows Read needs Query Insights. The asset-version, publication, media-link and job lookup indexes already exist in migrations 0001–0007. No speculative index migration is proposed.
- The operator-only inventory `COUNT(*)` was run on every visitor pool build. It is now limited to the operator readiness endpoint.
- Existing immutable interpretations needed two D1 reads to reuse. Exact source/observation-digest matching now uses the first read; new rows still get a post-insert read.

Local `EXPLAIN QUERY PLAN` against the 0007 schema with 1,000 representative job rows shows a primary-key lookup for job polling and the existing `article_edition_jobs_updated` index for expiry cleanup and the two-active-generation check. This confirms index selection in SQLite, **not** Production row counts or Cloudflare execution cost.

## Before/after request-path measurements

These are reproducible SQL-call and work-path counts from the code and focused mocked-D1 tests. A “pool build” means ranked D1 retrieval, publication/source/analysis reads and current R2 verification. The local two-asset pool fixture performs exactly two R2 HEADs for two checked versions; the waiting-poll test performs zero pool builds, hence zero R2 HEAD/GET/PUT operations from the pool. Cloudflare Rows Read cannot be reported as measured without Production Query Insights.

| Scenario | Before | After |
| --- | --- | --- |
| New prompt, no existing job | 3 job SQL statements + 1 pool build | 4 job SQL statements + 1 pool build, then a progress write only if changed |
| Repeated poll while the lease is active | 3 job SQL statements + 1 pool build | **1 primary-key SELECT, 0 pool builds, 0 writes** |
| Reopen a completed edition | 3 job SQL statements + 1 pool build | **1 primary-key SELECT + 1 authoritative pool build**; revocation still invalidates the result |
| Reuse existing image analyses and unchanged interpretations | pool build + 2 interpretation reads, 0 interpretation writes | pool build + **1 interpretation read, 0 interpretation writes**; no model call for cached analysis |

For R2, a fully eligible initial pool used up to 24 HEAD checks before and now uses up to nine; a sparse or integrity-failing pool can still use the existing 32-check ceiling while searching for enough valid assets. Repeated polls during a live lease went from a full pool's HEAD checks to **zero**; reopening still rechecks up to nine assets. Reused image observations trigger **zero R2 GETs and PUTs** in the pool/evidence path; missing-image analysis still performs its existing bounded private R2 read, with no new snapshot PUT. These R2 counts are code-path/local-fixture measures, not Cloudflare Production Analytics. No R2 JSON snapshot is introduced.

The active-poll test asserts exactly one job SQL statement and zero extra pool invocations while a classification is in flight. The interpretation-reuse test asserts one SELECT and zero writes. A new prompt has one extra job lookup so existing jobs can avoid all cleanup and INSERT work. These savings are most relevant under repeated polling; the initial ranked retrieval is still a cost to measure in Production.

## Safety and monitoring

Only the job lease owner refreshes the candidate pool. Its saved progress contains counters, not catalog facts or image observations. Another poll cannot launch duplicate analysis. A generation claim uses an atomic D1 condition limiting active generating jobs to two; existing completed content and active job status stay accessible. The shared inference Durable Object, per-IP and provider safeguards still decide whether a model call is allowed. A budget refusal returns HTTP 429 without an automatic client retry; a later, deliberate user action may resume after the budget resets. Completed editions are freshly checked against current publication, permissions, exact-version sources, observations and R2 identity before being served. A catalog read failure returns a disclosed unavailable state without revoking the stored result.

For initial monitoring, compare the operator's reported baseline of about 417,000 Rows Read, 875 queries and 375 rows written per hour with Query Insights after a limited test. Investigate sustained hourly rates above **1 million Rows Read**, **2,500 queries** or **1,000 rows written** while traffic is comparable, or a rising Rows Read per generation. These are proposed alerts, not enforced quotas. Capture per-query Rows Read for the ranked retriever, publication/source reads, job poll and interpretation lookup, then compare one new prompt, repeated polls, reopen and cached-analysis reuse at the same catalog size. Do not attribute the historical 10 million Rows Read to a specific query until those measurements exist.

## Fresh explorations and resume

Every deliberate Begin Exploration mints a client UUID (`explorationId`) that
rides the initial request and every poll, retry and refresh-resume of that
exploration. The orchestrator folds the ID into the D1 job identity digest,
so a repeated prompt starts a new `article_edition_jobs` row and runs the
models again instead of serving the previous completed edition. Requests
without an ID keep the previous prompt-derived digest byte-for-byte, so
legacy clients and in-flight jobs survive the rollout unchanged.

The same ID also bypasses the worker memory cache of completed responses:
a fresh exploration always reaches the models, while same-ID polls and
resume read the one D1 job row (lease-serialized, no duplicate inference).
A malformed ID fails closed with HTTP 400 before any job row or model call.

Refresh semantics: the tab persists `{prompt, explorationId, mode, format}`
in its session record and marks the terminal outcome on completion or
failure. After a reload the app restores the input state (never the AI
consent checkbox) and the next Begin Exploration with the unchanged prompt
resumes the same job; an edited prompt, a recorded outcome, or the standard
path starts over. Retry buttons reuse the live ID for the same exploration.
No D1 migration is involved: job IDs remain opaque text rows under the
existing 7-day TTL cleanup.

Image reuse: publication never marks an image unavailable. Approved assets
validate again in later explorations, and cached image analysis, visual
observations and catalog metadata are reused with no new inference. Within
one edition the shared validation rejects any repeated asset with
`duplicate_image`, so the same image cannot appear twice in one 3-Story
Edition. Live AI Logs show only the current job's own invocations; resumed
history renders as recorded entries, never as new live calls.

## Progressive live logs

Each real Meta invocation reports twice to its D1 job row: a `calling`
entry the moment the request starts (model ID, stage, attempt number,
timestamp) and an updated entry when it settles (`completed` with duration,
usage and result summary, or `failed` with the real error category).
Retries are separate entries with their own attempt numbers; reports never
invent activity, and the `reservation` pseudo-stage stays out of the visible
log. Recovery notices (retry scheduled, resume adopted) travel alongside but
render separately from model calls.

The lease owner holds one long request for the whole workflow, so the
client polls concurrently: a fresh poll launches every 5 seconds while
earlier requests are still in flight, and each HTTP 202 carries the latest
persisted invocations. The first terminal response wins and aborts the
stragglers; polls are single-SELECT reads and never reserve budget. A
resumed job re-serves its recorded entries as history with original IDs and
timestamps. No migration, endpoint or streaming work is involved: the
polling loop, the job row's `result_json`, and the existing 202 shape carry
the whole flow.

The launch bound is derived from the overall timeout
(`floor(overallMs/pollGapMs)+2`), so paced polling always covers the whole
window and a fixed count can never stop the UI while the job is still
active; the overall timeout stays the wall-clock terminator. When every
request has settled, a 202 or a transitional failure paces the next launch
a full gap out, while request-level failures relaunch at once so a dead
owner resumes fast and a dead network fails fast. A 3-story failure the
backend marks `resume.recoverable` (provider timeouts, 429/5xx, lost
leases, expired workflow budgets) and the lapsed-lease `503
generation_interrupted` are transitional: the driver keeps polling and a
later request resumes the same job from checkpoints, surfacing the carried
invocation log meanwhile. Budget denials, deterministic validation
failures and the exhausted 30-attempt cap stay terminal with their real
reasons. Every 202 carries the static labels `status: preparing` and
`fallbackReason: analysis_pending` even while generating; the live phase
is `preparation.outcome` (`reviewing` once the owner generates) together
with `generationStage` and `modelCalls`.
