# Meta embeddings and Vectorize: decision record, October 27, 2026

## Decision

Keep D1 authoritative and make Vectorize an optional, rebuildable accelerator.
**No eligible hosted Meta embedding endpoint is confirmed for this account.**
Do not create an index, invent a Muse Spark embeddings endpoint, request numeric
vectors from a chat model, or substitute non-Meta/Cloudflare AI inference.
Proceed with ingestion and deterministic D1 retrieval now. Search-index design
below is proposed architecture, not an implemented or live-tested service.

## Availability, eligibility and cost evidence

The current [Meta model catalog](https://dev.meta.ai/docs/models) describes
generation/understanding, image generation, transcription and segmentation;
it does not list embedding output. The [API reference](https://dev.meta.ai/docs/api-reference)
does not document an embeddings resource. These are documentation findings,
not proof that no private/partner feature exists. Muse Spark's image input is
not evidence of an embedding output API. SAM boxes/masks are not embeddings.

No Meta inference/embedding connector is exposed in this session. The managed
environment reports no configured credentials, so authenticated `GET /v1/models`
and dashboard/team entitlement were not checked. No key was searched for in
files, no inference request was made, and no provider/service was provisioned.
Obtain account-specific model-list/capability evidence through the owner's
approved access before selecting a model. A model appearing in a list alone
still needs its documented embedding contract, dimensionality and price.

The [official hackathon page](https://dev.meta.ai/events/global-hackathon) allows
Meta open-weight models generally. It does not establish that each research
checkpoint below is eligible under the accepted rules or licensed for Curio's
advertising use. Confirm the exact checkpoint/license/track with the organizer
before runtime integration. No partner credit or account access is assumed.

| Option | Input/output and dimensions | Vectorize suitability | Actual access, license and cost |
| --- | --- | --- | --- |
| Muse Spark 1.3 Standard / Meta Model API | Documented multimodal understanding → text; no documented embedding dimensions | No embedding adapter can currently be justified | Existing selected model remains `muse-spark-1.3`; no embedding entitlement or price confirmed |
| Meta SONAR `text_sonar_basic_encoder` | Text → 1024-dimensional sentence vector; speech encoders also exist, not image embeddings | Fits 1536 maximum; normalized cosine is a proposed retrieval metric to validate | Public weights/code, not a configured hosted API. Text encoder/decoder are non-commercial; MIT code does not clear model use. Hosting price/RPM unknown |
| Meta ImageBind `imagebind_huge` | Text and image in a shared 1024-dimensional space (also other modalities) | Fits; L2-normalize both branches and validate cosine retrieval | Public checkpoint, no configured endpoint. Non-commercial restriction; README describes NC while LICENSE text says NC-SA. Exact obligations/use need review. Hosting price/RPM unknown |
| Meta DINOv2 ViT-S/14 base backbone | Image → 384-dimensional visual feature; no text encoder in this backbone | Fits; normalized cosine for image-to-image discovery, not text-query search | Base code/weights Apache 2.0; exact checkpoint still needs eligibility and deployment review. No configured hosted access, price or quotas |
| Meta dino.txt supplied checkpoint | Text/image shared **2048-dimensional** output | **Does not fit** Vectorize's 1536 maximum unchanged | Public research implementation; exact weights/vocabulary terms and eligibility need review. No configured endpoint. Do not arbitrarily truncate vectors to fit |

Primary sources:
[SONAR usage/dimensions](https://github.com/facebookresearch/SONAR#usage),
[SONAR model licenses](https://github.com/facebookresearch/SONAR/blob/main/LICENSE.md),
[ImageBind output dimensions](https://github.com/facebookresearch/ImageBind/blob/main/imagebind/models/imagebind_model.py),
[ImageBind license](https://github.com/facebookresearch/ImageBind/blob/main/LICENSE),
[DINOv2 base model/Apache license](https://github.com/facebookresearch/dinov2),
[DINOv2 feature dimensions](https://github.com/facebookresearch/dinov2/blob/main/dinov2/models/vision_transformer.py),
[dino.txt 2048 output](https://github.com/facebookresearch/dinov2/blob/main/dinov2/hub/dinotxt.py).
No weights were downloaded or models executed as part of this research.

There is no verified embedding inference price or account quota to quote.
Self-hosted weights do not imply free compute or a Worker-compatible PyTorch
runtime. Any separate model host requires reviewed access, license, costs,
secrets, input rights and inference-budget enforcement. Do not deploy these
weights inside the existing Worker or call an arbitrary hosted model fallback.

For the existing non-embedding workflow, [Meta's published pricing](https://dev.meta.ai/docs/pricing-rate-limits)
lists Muse Spark Standard at $1.25/M input and $4.25/M output tokens ($0.15/M
cached input); published team limits are 3000 RPM/4M TPM. These are published
general figures, not verified account entitlement or permission to call. Curio's
much lower shared cooldown/hour/day/lifetime limits still govern. The default
20-call lifetime ceiling cannot silently fund 100–200 per-image classifications
plus embeddings and reader generation. Cache, use mocked contracts honestly and
prioritize a small explicitly authorized live subset. No ceiling is raised here.

## Minimal Vectorize integration design (not implemented)

1. **Contract before provisioning.** Confirm exact eligible Meta checkpoint/API,
   output dimension (1–1536), preprocessing, tokenizer/pooling, L2 normalization,
   finite nonzero vectors, input limits, price and private host entitlement. Store
   an immutable embedding-spec hash. Recommend cosine for a validated normalized
   semantic space; use the model's documented metric if it differs. Create a
   dedicated index per incompatible model/spec. Dimension and metric cannot
   change after index creation. No index name/dimension is configured yet.
2. **Stable IDs that fit.** Existing D1 IDs are `asset-` + 64 hex characters,
   **70 bytes**, exceeding Vectorize's **64-byte** vector-ID limit. Use the
   existing digest *without* `asset-` as the 64-byte vector ID. Reconstruct the
   D1 ID by prefixing `asset-`; do not change D1 IDs or truncate their digest.
   Similarly store the version digest without `version-` in indexed metadata.
   Full prefixed IDs exceed Vectorize's 64-byte indexed-field value limit.
3. **D1 input and provenance.** Build input only from an active exact version's
   reviewed metadata/knowledge or separately AI-permitted pixels. Record spec,
   version, canonical input hash, permissions revision digest, model origin and
   generation timestamp. Facts/citations remain separate from model tags. Never
   make synthetic/demo annotations look like model-derived intelligence. Private
   reader preferences must not become persistent vector metadata.
4. **Transactional outbox, not dual-write authority.** Add a separately reviewed
   D1 index-state/outbox migration in the search PR. In the same D1 transaction as
   version/metadata/grant/archive changes, enqueue idempotent upsert/delete work
   with expected generation. An operator-triggered bounded drain performs
   `upsert` or `deleteByIds`; no scheduled image refresh is needed. Check current
   D1 generation/grants immediately before the mutation. Keep per-asset ordering
   so an older job cannot intentionally overwrite a newer generation. Record
   mutation IDs and failed jobs; bounded retries must not repeat paid embedding
   calls without authorization/reservation.
5. **Immediate revocation safety.** Archive or revoke display/AI-processing rights
   in D1 first and enqueue vector deletion. Vectorize mutations are asynchronous;
   an accepted mutation is not proof of immediate search visibility/removal.
   Every search hit must be rehydrated from D1 and rejected if archived, revoked,
   missing, no longer the latest version, or mismatched in input/spec/grant hash.
   This is the safety boundary even during queue delays or stale-write races.
   Remove affected cached embeddings as required by the grant. A later fresh
   permission never resurrects an old revoked job without a new reviewed generation.
6. **Reader query.** Embed only consented/approved query text using the same
   confirmed Meta spec and the existing budget. Cache only under an explicit
   privacy/retention policy. Query a bounded topK (≤50 when returning metadata),
   batch hydrate candidate IDs in D1, apply independent publication identity/
   licensing/exact-URL gates, then deterministically rerank/diversify. Vector
   scores are relevance estimates, not facts or advertiser verification.
   Return public-safe catalog records, never raw pending source/legal notes.
7. **Rebuild from authority.** Paginate D1's latest eligible versions, validate
   grant/spec/input hashes and populate a separate reviewed replacement index.
   Reuse permission-valid, version/spec-bound vectors from a proposed D1 derived
   cache; generate missing vectors only with explicit inference authorization
   and reserved budget. A rebuild is not permission to make bulk paid calls.
   Verify counts, stale/revoked rejection and a small relevance sample before an
   approved index-pointer switch. Keep D1 usable while rebuilding; old index
   deletion and account changes are separate approved actions.
8. **Metadata fallback always works independently.** Existing `D1Catalog.query`
   already provides tested latest-version/category/aesthetic/grant filtering,
   archive exclusion, bounded pagination and stable ID order. That is working
   retrieval, **not yet weighted personalization ranking**. The next Asset
   Intelligence PR should add the deterministic ranking slice below before
   any Vectorize dependency. No endpoint/provider failure may route to a
   non-Meta model or expose pending content.

### Deterministic D1 ranking slice for the next PR

Use each current eligible version's latest non-mock Muse category/aesthetic
scores. Compute a bounded weighted overlap with reader allocations/aesthetics,
plus exact normalized approved-tag token overlap; stable asset ID breaks ties.
Return the component scores as recommendation explanations, then apply an
explicit reader diversity choice. Hydrate and verify current display/identity/
license/source eligibility independently of scoring. Missing metadata uses
reviewed authored tags with an explicit authored label, then fictional fallbacks
if no real image is approved. Unknown availability must not become `available`.

Implement ranking in bounded D1 SQL with bound parameters over the eligible pool,
not by scoring only the first 50 asset IDs and missing later candidates. Reuse it
when Vectorize is absent, disabled, times out, has no eligible matches or reaches
budget/quota. Test deterministic ordering, unknown IDs, revoked grants, stale
versions, full-pool coverage, missing metadata and no provider calls. This scope
does not require embeddings and must not wait for their eligibility research.

## Vectorize compatibility and operating limits

The [current limits](https://developers.cloudflare.com/vectorize/platform/limits/)
allow up to 1536 float32 dimensions and 64-byte IDs; metadata is limited to
10 KiB/vector. Indexed metadata fields retain only 64 bytes. Keep filter fields
short and put authority in D1. Metadata-index setup must precede a reviewed
backfill; broad search without public-safe D1 hydration is never sufficient.

[Index configuration](https://developers.cloudflare.com/vectorize/best-practices/create-indexes/)
is immutable. [API upsert/delete/query](https://developers.cloudflare.com/vectorize/reference/client-api/)
does not require Workers AI: external, eligible Meta vectors can be supplied.
The vector database is storage/search, not a model inference provider.

[Published pricing](https://developers.cloudflare.com/vectorize/platform/pricing/):
Free includes 30M queried dimensions/month and 5M stored dimensions; Paid includes
50M queried/10M stored, then $0.01/M queried and $0.05/100M stored dimensions.
For scale only, 200 × 1024 = 204,800 stored dimensions, within the published Free
storage allowance before any other indexes. This is not an inference-cost estimate
or confirmation of the owner's plan, usage, quota or permission to provision.

## Next smallest development PR

**Asset Intelligence v1: on-demand gallery manifests, technical checks, Muse
classification contract, persistent metadata ranking.** Keep this independent
of Vectorize provisioning and live inference approval.

- Add a new migration for technical accessibility checks (attempt time, status,
  final reviewed URL/HTTP status and content type, blocked/unverified states),
  independently of existing display/AI/edit grants. Do not retrofit accessibility
  from successful ingestion or override pending licensing.
- Add bounded operator-triggered source adapters for the ten Issue #5 source
  entries. Exact approved gallery seeds and reviewed media hosts only; no arbitrary
  URL fetch, redirects across unreviewed hosts, private addresses, login/CAPTCHA
  bypass, headless access-control evasion or recursive crawling. Manual manifests
  remain supported for JS/blocked galleries. Record observed facts only. Aim for
  100–200 genuinely discovered URLs, about 5–20/source; report actual count and
  24-cell coverage separately. Never generate plausible filenames to meet a count.
- Implement a default-off, exact-version/AI-rights-gated Muse Spark 1.3 Standard
  image-classification adapter with strict existing intelligence output schema,
  content-hash cache, bounded approved-image access and shared budget reservation.
  Mock transport first; no paid test until specifically approved. Do not weaken
  PR #9's bundled-PNG-only SAM gate to implement this separate vision workflow.
- Persist structured classifications and sourced facts separately. Add the
  full-pool deterministic retrieval/ranking slice above, keeping the public
  adapter's exact URL/identity/licensing gates and six fictional fallbacks.
- Test fixture galleries/malicious URLs/blocked sources/dedupe/versioning,
  independent accessibility/grants, prompt injection/untrusted metadata, output
  binding, cache/budget behavior, full-pool ranking and browser error/provenance
  states. Live accessibility counts and live model output are separate evidence.

After that: connected plan/story citations, vetted advanced motion presets,
curiosity branches and local Collect. Functional cutoff remains October 30;
100–200 candidates is not a promise of 100–200 paid analyses. Brand-domain access,
written permissions, Meta entitlement/spend approval and remaining reader work
are the risks; embedding deployment is deliberately not on the critical path.
