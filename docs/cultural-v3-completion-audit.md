# Cultural V3 completion audit (main `c8c8f0a`, draft #75)

| Capability | Current implementation | Missing dependency / work | Production readiness | Risk / priority |
| --- | --- | --- | --- | --- |
| Cultural V3 | #75 default-off planner, lexical retrieval, reviewed R2 pack and short-form source reuse | Live evidence-pack and prose validation after owner approval | Off; no live V3 test | High / P0 |
| Research retrieval | #70 allowlist pattern reused; #75 lexical passages, fingerprints and token/phrase RRF where meaningful | Human source-quality review and real source allowlist | Lexical with optional RRF; no Hybrid RAG claim | Medium / P0 |
| Knowledge graph | Bounded typed edges, model candidates, deduplication, conflict detection and operator retrieval | Real operator-reviewed graph data | No reviewed graph data known | High / P0 |
| Claim verification | Technical identity, rights, passage proofs, narrative spans, review history and revocation | Human semantic support and rights judgment | No approved packs known | High / P0 |
| Adaptive research | One reserved planner call, up to two operator-URL rounds, safe stop/narrow/candidate | Live operator acceptance | Operator-only, not executed live | Medium / P0 |
| Muse editorial | #68 V2.1 and independent Reviewer, revision, confirmation; optional cited V3 sources | Real paired V2.1/V3 editorial evaluation | Existing public AI works per owner; V3 off | High / P0 |
| Long-form | #71 lease and 18-step state machine; private Muse adapter/route and per-step budget | Migration 0006 Production status and paid private acceptance unverified | Flag off, not live | High / P1 |
| SAM objects | #69 exact-version capture/review/public API; #73 Inspect regions | Live SAM captures and account validation unverified | Flag off | Medium / P1 |
| Research traceability | Pack claims cite passages; feature `culturalClaims` bind source IDs to exact narrative spans; safe citation metadata | Optional Silver Field source inspection affordance owned by frontend team | Backend implemented, frontend not changed | High / P0 |
| Inspect continuity | #73 regions render only for approved versions; explicit selection and close | Browser regression against current main, no visual edits | Code-tested, live data unknown | Medium / P1 |
| Budgets / consent | #74 shared DO 100/100 standard caps; four-unit editorial; operator auth | Explicit long-form per-step accounting and secure no-retry tests | Existing DO; no cap change planned | High / P0 |
| Flags / caches / rollback | #75 default-off, pack key includes exact versions, current publication pool rechecked | Production readback before activation | No V3 activation | High / P0 |

Source of truth is repository code, not inferred Production state. #70 is an unmerged operator retrieval slice; its allowlist and bounds were reused, not its branch. #71 has no live model route. #69/#73 do not establish that any paid SAM capture exists. Existing V2.1 and Silver Field are preserved.

The owner narrowed the Hackathon scope: no embedding provider, vector database or paid semantic search. The repo uses only lexical retrieval; RRF fuses token and exact-phrase rankings when both have signal. No Hybrid RAG or semantic capability is claimed.

No new graph database is justified. D1 migration 0006 remains the existing #71 dependency for private long-form jobs; no Production migration is authorized here. Evidence packs and fingerprints use private R2. The highest trust risk is semantic support: citation existence is not factual verification. Operator review and independent Reviewer remain mandatory. The highest operational risk is hidden paid work: no public request should call research automatically; every operator-paid step must reserve shared budget first.
