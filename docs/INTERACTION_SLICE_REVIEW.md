# Interaction slice review

This PR demonstrates the Reader portion of [the interaction blueprint](INTERACTION_BLUEPRINT.md). The five approved visual references remain authoritative; this change does not redesign Generate, Journey, Collection or the image allocation. The route remains `/` with production AI disabled.

## Evidence

- [Reference #3 beside the current approved-chair Reader](evidence/interaction-slice/reference-03-vs-chair-reader.png). The left half is the supplied reference; the right half is a real Chromium screenshot scaled to the same 505 × 543 comparison size.
- [Desktop Reader](evidence/interaction-slice/reader-chair-1440.png), [mobile Reader](evidence/interaction-slice/reader-390.png), [mobile object detail](evidence/interaction-slice/detail-390.png), [Journey](evidence/interaction-slice/journey-390.png) and [Collection](evidence/interaction-slice/collection-390.png).
- Continuous browser recordings: [390 px](evidence/interaction-slice/journey-390.webm) and [1440 px](evidence/interaction-slice/journey-1440.webm). The recordings use a captured, **mocked** Muse-shaped plan to select the existing authored Paper Moon Lamp illustration. They show no live Meta inference. The chair-photo touch test uses the disabled-AI authored fallback.

## Review by dimension

| Dimension | Result and limit |
| --- | --- |
| Visual fidelity | Reference #3's typography, tilted main image, caption and right-side photo rail remain recognizable. The owner-supplied chair photograph differs from the reference render; its composition has no licensed cutout for the foreground chair, so one is not fabricated. |
| Interaction clarity | Explore is an explicit image-integrated action. Annotations appear only while active. A selected object opens context alongside the original image; closing returns focus to the hotspot. |
| Motion quality | The active image briefly flattens to make editorial detail readable; context enters with a short opacity/position transition. Reduced-motion disables it. |
| Functional correctness | Spread selection, story/Journey, save, explicit Collection open and return preserve the mounted Reader and current spread. Saves announce success in place instead of navigating away. |
| Accessibility | Keyboard and touch paths are exercised. Buttons remain native; the model/authoring provenance remains visible. Mobile detail is scrollable and reachable. |
| Integration readiness | Existing `LivingAdvertisement`, `readerSegmentation`, plan validation, D1 publication filtering and collection version checks remain in use. A mocked plan drives the lamp recording; the authored chair path uses no AI. |

The remaining full-width adaptation is limited by the existing reference-aspect Reader canvas on desktop. The larger interaction system described in the blueprint—especially a richer Journey history and collection return context beyond the currently mounted session—remains for the subsequent phase after this vertical slice is reviewed. No SAM result was invented and no paid model call was made.
