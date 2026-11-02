# Silver Field Sources: public citation contract v1

The existing `POST /api/editorial` response may contain `plan.culturalEvidenceVersion`, feature `culturalClaims: [{sourceId,narrativeText}]`, and `editorialSources[].citations` with source/passage IDs, canonical URL and publication. That array has **no permitted supporting text** and is part of a generation snapshot. It cannot establish that a citation remains available after its asset publication or evidence review is revoked. Silver Field must not treat it as the Sources data contract.

## Read-only lookup

`POST /api/editorial/citations` accepts `{ "plan": EditorialPlan }`, the validated plan already returned by `/api/editorial`. This is a read-only operation; it performs no inference or writes. Send JSON from the same origin with the browser's normal `Origin` header. Send no user prompt, preferences or operator token. The response is `PublicCitations` from `shared/public-citations.ts`:

```ts
type PublicCitations = {
  version: 'curio-public-citations-v1';
  features: Array<{
    featureIndex: number; catalogId: string; assetId: `version-${string}`; headline: string;
    citations: Array<{
      claimId: string; sourceId: string; narrativeText: string;
      claimKind: 'factual' | 'comparison' | 'interpretation';
      evidenceStatus: 'operator_reviewed'; reviewStatus: 'approved';
      sources: Array<{
        sourceId: string; passageId: string; canonicalUrl: string;
        publication: string | null;
        support: {kind: 'reviewed_paraphrase' | 'approved_excerpt'; text: string};
      }>;
    }>;
  }>;
};
```

Synthetic example (not a real Curio source or model result):

```json
{
  "version": "curio-public-citations-v1",
  "features": [{
    "featureIndex": 0,
    "catalogId": "catalog-example",
    "assetId": "version-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "headline": "An Everyday Study",
    "citations": [{
      "claimId": "claim:ritual",
      "sourceId": "version-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:cultural_claim:claim:ritual",
      "narrativeText": "An approved editorial comparison about an everyday ritual.",
      "claimKind": "comparison",
      "evidenceStatus": "operator_reviewed",
      "reviewStatus": "approved",
      "sources": [{
        "sourceId": "source:example", "passageId": "passage:example",
        "canonicalUrl": "https://example.org/article", "publication": "Example Review",
        "support": {"kind": "reviewed_paraphrase", "text": "An approved editorial comparison about an everyday ritual."}
      }]
    }]
  }]
}
```

`publication` is `null` when no operator-reviewed publication name exists. The existing evidence schema has no independently reviewed source-title field, so the API does not invent one. `reviewed_paraphrase` is the reviewed claim text, **not a quotation or the retrieved passage**. `approved_excerpt` is the exact passage text only when the source is approved for quotation and the passage is at most 400 characters; longer passages use the paraphrase. Neither status claims that Curio independently verified the source's factual truth.

The server revalidates the plan's source/narrative binding, current D1 publication and AI-analysis grant, active exact-version R2 media identity, private evidence-pack approval, captured passage fingerprint, source rights and review status on **every lookup**. No private R2 key, raw pack, model instruction, operator name, review history or unapproved passage is returned. Missing or stale evidence yields `404`; malformed/cross-origin requests yield `400`/`403`; V3 or public catalog disabled yields `503`. V2.1 plans with no cultural claims return `features: []` while V3 is enabled. Responses have `Cache-Control: no-store`.

## Muse Code handoff

When `plan.culturalEvidenceVersion === 'curio-cultural-evidence-v3.0.0'` and a feature has `culturalClaims`, request citations on Sources open and after restoring an edition from storage. Match `featureIndex`, `catalogId`, `assetId` and `sourceId`; render only returned entries, never construct a citation from the older `editorialSources` snapshot. Show `publication` if present, otherwise identify the source by its canonical URL. Label support according to `support.kind`; an approved paraphrase is not a direct quote. Render all returned text as React text, never HTML. Hide the citation affordance on empty response, 404, 403, 503 or network error. Recheck when reopening Sources so revoked material cannot persist in view. The feature and narrative remain readable without citations. No new frontend data fields are required for V2.1 or deterministic fallback editions.
