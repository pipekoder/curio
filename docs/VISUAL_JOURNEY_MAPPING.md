# Visual V1: reference-to-functional mapping (before implementation)

Base: main after PR #26, `688e3180725b45f906003d31b9f4433f15526aa4`.
All five owner-supplied references were reviewed in chat. They are art direction,
not licensed application imagery, factual product data or model evidence. Their
photographs will not be committed. This is one existing React journey, not five
new screens or copies of state/API logic.

## Reference → current component → visual translation

| Reference | Existing implementation and authority | Planned presentation |
| --- | --- | --- |
| 01 Discover | `App.tsx` skip link/header; `EditorialExperience.tsx` prompt, suggestions, consent, `create()`; `shared/editorial-intent.ts` bounded interpretation. | White editorial entry, large serif question, central real textarea and submit; approved illustration planes; a few hairline orbital arcs. CSS focus-within and a derived nonempty-prompt state activate HUD feedback. No pointer-following particles, fake understanding labels or new preference controls. |
| 02 Generate | Existing `busy` lifecycle around POST `/api/editorial`, 20-second request bound, `requestId`, validated response and deterministic fallback. | Pending-only assembly of approved image/type planes and an honest pending label. No numerical progress, fake streaming, forced timer or claim that an image was generated. Consent remains explicit, controls remain disabled while pending, and fallback retains “AI not used”. |
| 03 Read & Explore | Existing `edition.plan` compositions; `ReaderCatalogContext`, `CatalogImage`, `Attribution`; `LivingAdvertisement` ready-image geometry, authored/authorized SAM regions, selection and reveal. | Immersive white image-first compositions, delicate technical indexes, subtle spotlight only on hover/focus/selection. Existing detail reveal sits beside/below the unchanged image; material appearance and model/authored disclosures remain separate from facts and attribution. |
| 04 Curiosity Journey | `openStory`, `visualThread`, `follow`, `related`, `branchId`; current modal, source citations and related rail. | A readable source-detail → relationship → current-story trail and related image planes. Connectors describe only the existing supplied visual thread or actual related choices. On mobile, a sequential editorial trail replaces the spacious desktop arrangement. No invented knowledge graph, categories or relationship claims. |
| 05 Collect | `saved`, `save`, `persist`, `readCollection`, shelf rename/remove/clear and Continue exploring; exact asset IDs, localStorage and `loadReaderItems` publication revalidation. | A curated image gallery of the actual saved records; generous spacing, floating-plane treatment and restrained focus/hover emphasis. Existing shelf controls, remove, revisit and real count remain. No invented 24-item count, accounts, synchronization or duplicate collection store. |

80% editorial / 15% contextual intelligence / 5% holographic accents: pure white
shell, dark readable text, images and serif hierarchy first. HUD is noninteractive
and aria-hidden unless it communicates actual state through existing accessible
controls/status. Local system font stacks avoid new external requests. Touch has
no hover dependency; reduced motion preserves all content in static form.

## Interaction and transition map

```text
Discover (empty ↔ typing/focus; suggestions fill the same prompt)
  → submit valid prompt + optional consent
  → Generate (actual busy request; controls disabled; no forced delay)
  → validated edition OR disclosed authored fallback
  → Read (same edition and published/compiled authoritative catalog)
  → Explore (existing loaded-image hotspot; original image retained)
  → Contextual story (existing connected-story callback)
  → Related discovery (existing related rail / follow logic)
  → Collect (same save/persist action and exact asset version)
  → reopen / reload / Continue exploring → existing contextual story
```

Reverse paths: Return to original image/Escape closes a detail; Close exploration
or Escape returns from a dialog to the originating control; existing refine action
returns to the prompt; revisiting a collection story uses `openStory`, never a new
route or fabricated content. Removing a saved item updates the same store. Reload
keeps collection references, not a conversation, prompt history or raw model data.
A displayed related choice is a recommendation from existing curated/ranked logic,
not proof of shared designer, brand, origin, material or influence.

## State inventory

| State | Existing source | Visual/accessibility behavior |
| --- | --- | --- |
| Empty | `prompt === ''`, no edition | Calm entry, static paths, invalid/empty submit disabled; usable skip link and label. |
| Typing / focus | prompt and native focus | Few arcs/points gain quiet emphasis; no claimed AI interpretation and no obstruction of input. |
| Loading | `busy === true` | Pending assembly visible only during the request; accessible pending status; disabled controls; previous edition can remain readable. |
| Generated | validated `edition` | Real title/plan, authoritative imagery, accurate source disclosure; heading focus maintained. |
| Exploring | current LivingAdvertisement selection | Existing hover/focus highlight, visible contextual reveal and Return control; no rectangle wall or invented boxes. |
| Story open | `panel` is an actual catalog ID | Current story, citations, actual visual thread and related choices; modal semantics/focus preserved. |
| Collected | `saved` exact asset/kind entries | Real count and collection gallery; revisit/remove/rename; no fictional saved data. |
| Fallback | `edition.source === 'deterministic'` | Same complete reader; explicit authored / AI-not-used label remains prominent. |
| Error | `promptError`, storage error, unavailable image/API | Existing accessible alert/status and approved fallback/unavailable image; no success-themed HUD pretending work completed. |

## Already implemented vs concepts needing backend work

Already implemented: prompt interpretation/suggestions/consent; editorial API and
validated plans; deterministic offline generation; D1 exact-version publication
checks; approved illustrations; authored hotspots and bounded authorized SAM
results; story/citation/related/refinement logic; local Collect and revalidation.

Frontend-only translation: orbital focus treatment, pending assembly, typography,
image planes, contextual relationship trail, responsive gallery and accessible
transitions. Any new presentation state must be derived from existing state, not
another request, store or model result.

Not implemented or implied by the references: model completion percentages;
streaming model reasoning; newly generated photographs; verified “bouclé” material
or designer/product identity; arbitrary external-image SAM; a global graph of
people/brands/materials/places; cloud accounts or collections; automatic gallery
rights approval. These require evidence, permissions and/or separately reviewed
backend work. None will be faked in this PR.

## Acceptance and safeguards

Capture before/after Discover, genuinely pending Generate, Read/Explore and
Collect at 1440/390. Test typing/focus, consent, pending/fallback, actual hotspots,
story → related → Collect, return/refine, removal, reload, reduced motion and
keyboard/touch. Preserve all existing unit/security/browser tests, API schemas,
D1 permissions, budgets, model grounding, SAM geometry and disabled production
settings. No backend code, migrations, credentials or paid inference changes.
