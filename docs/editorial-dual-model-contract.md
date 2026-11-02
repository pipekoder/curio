# Editorial model modes (PR #75)

TypeScript consumers can import `EditorialMode`, `EditorialGenerationMetadata`, and `EditorialModelCapabilities` from `shared/editorial-model-contract.ts`.

The existing `POST /api/editorial` workflow remains the only editorial pipeline. The optional top-level `editorialMode` is `lite` or `hybrid`; omission means `lite`. It is accepted alongside either the existing `{prompt, consent}` shape or the strict preference shape. Unknown modes or extra request fields return HTTP 400. A request for Hybrid when unavailable returns HTTP 503 `{ "code": "hybrid_unavailable", "error": "Hybrid editorial mode is currently unavailable." }` **before budget reservation or model inference**. It never silently becomes Lite. All existing consent, publication, pilot authorization, source, budget and review gates remain in force. A disabled or rejected ordinary Lite request still returns the existing disclosed deterministic fallback.

```json
{ "prompt": "Explore Scandinavian seating and daily rituals", "consent": true, "editorialMode": "lite" }
```

`GET /api/editorial/capabilities` is read-only and requires no token or model call:

```json
{
  "version": "curio-editorial-model-routing-v1",
  "defaultMode": "lite",
  "liteAvailable": true,
  "hybridAvailable": false,
  "modes": [
    { "id": "lite", "label": "Lite", "description": "Muse Spark editorial workflow" },
    { "id": "hybrid", "label": "Hybrid", "description": "Muse Wonder Chief Editor with Spark review" }
  ]
}
```

`liteAvailable` includes the existing deterministic experience; it does not promise a paid Meta result. Public `hybridAvailable` requires the Hybrid flag, explicit owner attestation of provider compatibility, the exact allowed model ID, and the existing editorial/review/public AI flags. An authorized six-version pilot request may use Hybrid while public AI is off, but the public capability remains false and the existing pilot token/session gate still applies. It does not disclose credentials or quotas. The UI should hide or disable Hybrid while false and handle HTTP 503 if availability changes between capability read and submission.

A **successful reviewed Meta response** retains `plan`, `items`, `source: "meta"`, `retrieval`, `cached`, `inference`, `editorialSources` and other existing fields, and adds safe metadata:

```json
{
  "generation": {
    "version": "curio-editorial-model-routing-v1",
    "editorialMode": "hybrid",
    "chiefEditorModel": "muse-wonder-1.0",
    "reviewerModel": "muse-spark-1.3",
    "revisionModel": null,
    "confirmationModel": null
  }
}
```

`revisionModel` and `confirmationModel` become `muse-spark-1.3` only if those stages actually ran and the revised plan passed confirmation. Existing saved editions without `generation` are Lite-era records; consumers should treat the field as optional and must not claim a particular model ran for deterministic output. The response continues to report aggregate provider token usage when supplied. It does not contain a cost estimate because no verified Wonder price is available. The server uses mode plus routing version in the isolate-local cache key; a cached response carries its original generation metadata. Publication and exact-version permissions are revalidated before a cache hit.

## Routing and safety

The only routed role is Chief Editor: Lite uses `muse-spark-1.3`, Hybrid uses `muse-wonder-1.0`. Planner, Reviewer, Revision and Confirmation remain Spark. A request still reserves four shared Durable Object inference units and claims one per editorial stage. The four-unit limit is a **call-count** bound, not a monetary-equivalence claim. Existing lifetime/daily ceilings, cooldown, IP/secure-tester controls and fallback remain unchanged. V3 evidence is loaded independently of mode. No additional research, model call or private source is granted to Wonder.

Wonder availability, JSON Schema `response_format`, `reasoning_effort: minimal`, `max_completion_tokens: 2200`, 15-second timeout, account quota and price **have not been verified against the configured Meta account**. The code therefore keeps `EDITORIAL_HYBRID_ENABLED=false` and `EDITORIAL_WONDER_PROVIDER_VERIFIED=false` by default. No paid test was authorized. Before activation, the owner must verify API entitlement, model ID, the exact request/response format, token ceiling, latency and provider price in a separately authorized controlled call. Existing unit accounting cannot enforce a model-specific currency ceiling; leave Hybrid disabled until the owner accepts a bounded provider spend cap or adds enforceable currency accounting. A provider error never switches the selected model; the existing deterministic fallback applies.

The deployment-safe sequence is to retain all default-off values in `wrangler.jsonc`, verify Cloudflare's effective Production settings after the existing Git deployment process, and set Hybrid flags only after separate approval and capability/cost verification. A repository deploy can overwrite dashboard-managed variables; compare and restore the effective flags before any live test. Roll back by setting `EDITORIAL_HYBRID_ENABLED=false` and verifying `GET /api/editorial/capabilities` reports `hybridAvailable:false`; Lite and prior saved editions continue to work. This PR itself does not activate or deploy anything.
