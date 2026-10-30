# Curio live editorial pilot readiness

This change prepares, but does not execute, a six-image Muse Spark pilot. It does not enable inference or alter production configuration.

## Six-asset boundary

Set `EDITORIAL_PILOT_VERSION_IDS` server-side to exactly six unique comma-separated `version-<sha256>` identifiers. The Worker rejects a missing, malformed, duplicated or non-six allowlist before attempting editorial inference. This value contains catalog identities, not credentials, but it belongs in Worker configuration rather than browser code.

Each selected version must be active and published, have complete owner-supplied Content Studio brand/product context, and have a current successful real Muse image-understanding result tied to the current AI permission revision. Generic upload defaults and mock analysis do not qualify. The authenticated read-only operator preflight is:

```text
GET /api/operator/catalog/intelligence/pilot/readiness
```

Every asset must report `published`, `editorialMetadata`, `imageAnalysis` and `editorialReady` as true before enabling magazine inference.

## Chief Editor contract

Content Studio facts and Muse visual observations remain separate inputs:

- `factualSources` contains exact owner-supplied mockup fields with stable source IDs. These records are not independently verified.
- `visualContext` contains exact-version Muse observations and explicitly treats appearances as uncertain rather than material or product facts.

Muse creates original editorial sequencing and visual interpretation. It returns source IDs, never rewritten product facts. Curio validates IDs against the selected asset and renders stored source values verbatim with an owner-supplied/unverified disclosure. Generated prose is rejected for unsupported observations, promotional language, source identities, prices, invented commerce claims, malformed source references or unsafe markup. Deterministic fallback remains available.

## Configuration still required for an approved live run

Keep all inference flags false while preparing the records. Confirm the existing server-only `META_API_KEY`, `RATE_LIMIT_SALT`, `INFERENCE_BUDGET`, `META_SPARK_MODEL=muse-spark-1.3`, `MAGAZINE_MAX_CALLS`, `CATALOG_DB`, `MEDIA_BUCKET`, `PUBLIC_APP_ORIGIN` and catalog operator credential. Then, under separate owner approval, enable only `ASSET_AI_ENABLED` while creating the six image analyses. Turn it off before enabling only `MAGAZINE_AI_ENABLED` for one editorial request.

Do not enable SAM for this pilot PR. Do not reset or increase the existing inference budget to overcome a failed reservation. A failed provider or validation result returns the deterministic fallback and is not automatically retried.
