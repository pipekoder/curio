# Editorial Experience v1

A complete demonstration of **Discover → Explore → Understand → Follow Curiosity → Collect**, based on merged Asset Intelligence v1 (#13). The owner's completed production schema (17 tables, 10 indexes, one trigger) is unchanged. This PR adds no migrations, production writes, deployment or Cloudflare configuration changes.

## Try the journey

1. Run `npm ci` and `npm run dev`. The reader works when the Worker is unavailable: failed/disabled requests use a local deterministic edition.
2. In “A world shaped by your eye”, choose interests, aesthetic tags, category emphasis totaling 100 and Focused, Balanced or Surprise Me. Consent is optional. “Compose my edition” works with all inference disabled.
3. Compare **paper / quiet lamp**, 100 home, Focused, with **woodland / path / walking**, 100 travel, Surprise Me. The former leads with a lamp and full-frame hero; the latter uses landscape studies, a layered opening and a different cover palette/title. Balanced brings different active categories into the opening sequence.
4. Navigate the horizontal chapter strip, scroll through varied compositions, and select existing authored image hotspots. All movement presets are authored CSS; AI never supplies code, styles, positions or URLs. The entire art container moves together so hotspots stay attached to the image.
5. Open “Explore the story”. Read the publisher record, separate historical context and subjective interpretation. Follow an object or aesthetic chip into related discoveries; open another story without restarting the edition.
6. Collect an image and a story, name a collection, move saved items between collections, reload, revisit and continue exploring. Remove individual items or clear all. Storage failures retain a session-only collection with an explanation.

Desktop/mobile browser tests produce `editorial-home-{1280,390}.png`, `editorial-travel-{1280,390}.png` and `editorial-story-{1280,390}.png` in the CI `reader-verification` artifact. They exercise the entire journey, not just screenshots. Existing reader, image safety, Living Advertisement alignment and reduced-motion tests remain.

## Public retrieval and rights

`POST /api/editorial` accepts interests (1,000 characters maximum), aesthetics, category weights, mode and optional consent in a bounded 4 KiB JSON body. It requires the exact configured `PUBLIC_APP_ORIGIN`. No catalog operator credential is used or exposed. Responses have `Cache-Control: no-store`.

The Worker calls the existing D1 Asset Intelligence reader retrieval: latest active versions, independent display/identity/licensing/technical access reviews, category/aesthetic/interest-tag ranking, canonical-brand diversity and bounded seeded serendipity. Focused suppresses diversity; Balanced mixes categories; Surprise Me permits the maximum existing 0.25 exploration share. Reader preferences are never written to D1. D1 order is preserved for deterministic real-catalog plans.

D1 results must additionally match a compiled, exactly approved external image in the existing public registry. No raw D1 URL, source label, processing job, permission evidence or private metadata row becomes a public asset. An eligible D1 row alone cannot publish itself. Empty, unavailable or unapproved results fall back to the authorized authored fictional illustrations. The client also binds every plan's exact catalog/asset pair to the published registry; local/offline fallback uses only original fictional placeholders. Existing 33 real candidates remain private, with zero claimed new rights or real-image eligibility.

The legacy magazine endpoint/UI and library remain available. Existing SAM operator authentication, bundled-PNG permits, default-off gates and shared inference budget are unchanged.

## Editorial intelligence and bounded generation

Only `muse-spark-1.3` (Muse Spark 1.3 Standard) is used. The new planner sends **public catalog metadata only**, never image pixels, operator data or private candidates. Image-analysis rights are not inferred from display rights.

Zod validates exact asset pairs, uniqueness, active category weights, headline/narrative choices, layout and motion enums. To prevent unsupported claims rather than merely labeling them as AI prose, Muse chooses from per-asset, human-authored subjective copy variants. It directs selection, sequence, copy choice, layouts and motion; it cannot introduce novel factual prose, citations, brands, product details, image URLs or executable frontend code. Issue title/deck are fixed to the validated preference-based cover. This is bounded editorial composition, not unrestricted article generation. Unknown fields, unsupported copy, stale asset IDs or arbitrary motion presets fail back to the authored edition.

Layout choices: full-frame hero, split/asymmetric, layered typography and image composition, horizontal story composition, and essay. A horizontal chapter strip connects the vertical narrative. Scroll reveal and progressive CSS view-timeline parallax are restrained; browsers without view timelines retain static compositions. IntersectionObserver is cleaned up and optional. Reduced-motion removes motion without removing the hotspot centering transforms. Native dialogs provide modal focus containment and Escape/return behavior. Images keep their existing lazy loading, fallback, attribution and source controls.

## Story provenance

Publisher facts are the reviewed Curio illustration records, linked to the bundled `editorial-sources.html` and original SVGs. The fictional names are not real advertisers/products and do not imply actual materials, manufacturing methods, designer identity, availability or travel destinations. Verified real-brand background is omitted because none is currently eligible.

Independent context is a short, human-reviewed paraphrase of [V&A, Arts and Crafts: an introduction](https://www.vam.ac.uk/articles/arts-and-crafts-an-introduction), checked October 27, 2026: the British late-nineteenth-century movement was concerned with how objects were made. It is explicitly contextual, not a claim that a fictional study descends from that movement. No museum image is copied or embedded. Subjective interpretation is separately labeled. Sources are fixed reviewed records; AI cannot generate or alter citations. Dynamic source-grounded real-brand articles require a later approved source corpus and are not represented as implemented here.

Related discovery uses the same read-only D1 request with the selected detail/theme, broad category allocations and **consent false**. It cannot trigger another paid call. Local metadata ranking remains available offline. Authored object regions remain distinct from actual SAM detections. No live SAM or new segmentation capability was enabled.

## Collection privacy

Versioned browser storage key: `curio.collection.v1`. At most 60 entries, containing only approved asset IDs, image/story kind and a user-chosen collection label. No preferences, generated articles, secrets, image bytes or arbitrary URLs are persisted. Corrupt/unknown/withdrawn compiled records are rejected on load. No account, tracking, sharing, synchronization or cloud collection write is introduced. Storage is browser-local and can be cleared in the interface. A story save is a bookmark to the current reviewed story, not a frozen AI transcript.

## Cost, caching and operations

Production `MAGAZINE_AI_ENABLED=false` and `CATALOG_OPERATOR_ENABLED=false` are unchanged. To permit a future authorized live test requires separate approval and the existing configured Meta key/model, exact app Origin, long rate-limit salt, Durable Object binding, trusted edge address and explicit reader consent. No settings were changed here.

An uncached enabled/consented plan reserves **one unit** through the unchanged budget: rolling 60-second cooldown, 3/IP/hour, 20/day and deployment lifetime ceiling (20 currently). Failures count; there is no automatic retry or refund. Failed configuration, blocked budget, unavailable provider and invalid output all return the deterministic edition. Meta fetches use manual redirect handling and reject non-success status; Workers does not support `redirect: "error"`. The same compatibility correction is applied to the existing Asset Intelligence fetches, preserving their redirect rejection and image fingerprint gates.

Plan cache: SHA-256 of specification, preferences and freshly filtered public pool; five-minute TTL; at most 30 entries per isolate. Only plans and hashed keys are cached, never API credentials or raw preferences. Every hit rechecks current authoritative pool eligibility. Cache is best effort, not cross-isolate/persistent. Authored source-backed stories need zero enrichment calls and cannot become stale through generated citations.

**Estimated first live comparison:** two uncached editions = two Muse calls, at most 4,400 completion tokens plus actual metadata/prompt tokens. They must be spaced according to existing cooldown/quotas. Cache hits, local editions, stories, curiosity branches and Collect require zero calls. Live pricing/latency and provider schema acceptance remain unverified; no paid test was made. All model responses used in tests are mocked.

## Validation and limitations

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run worker:check`, `npm run test:integration` and `npm run test:browser`. Lint applies recommended TypeScript and React Hooks rules to the new vertical-slice modules; broad legacy lint migration is outside this change. Ordinary CI runs every check and uploads browser evidence.

No real-image showcase, verified real-brand product histories, new live segmentation, remote cache, embedding search or unrestricted factual article generation is claimed. The implemented public slice is complete using six authorized fictional studies and a reviewed contextual source. Rights approval, real brand/source verification and separately approved live Muse/SAM tests remain the main constraints for a genuine brand demonstration by October 30. Accounts, checkout, sharing and scheduled ingestion remain out of scope.

## Recorded verification

Local `npm ci`, TypeScript, scoped ESLint, all **182 unit/component/security tests (13 files)**, production build, Wrangler dry-run, combined Worker integration and **16 Chromium tests** passed. Production dependency audit: zero vulnerabilities. Worker integration uses real local D1/SQLite Durable Objects and mocked provider responses, verifies all 33 pending assets stay private, cache hits and budget rejection, and rejects provider redirects without forwarding credentials. No real provider calls, production D1 writes or deployments occurred.

Review snapshots: [focused home edition](evidence/editorial-home.png), [surprise travel edition](evidence/editorial-travel.png), [mobile story](evidence/editorial-story-mobile.png). These use only the authorized fictional illustrations and authored test preferences. Full browser evidence is also uploaded by CI.
