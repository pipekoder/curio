# Read & Explore: immersive vertical-slice refinement

This update affects only the Reader in draft PR #32. The five-stage reference set remains the art direction. Reference #3 is the direct comparison target.

## Interaction and layout

The Reader now spans the available viewport width. Its editorial headline, original image, contextual reading column, page navigation and story action are laid out as a responsive grid. At 1440 px the annotation follows the image horizontally; at 390 px it follows the image vertically in document order. The hotspot itself remains image-relative, while the detail is ordinary flowing content. The Explore control remains attached to the image and the Reader state reducer, original image, keyboard/touch handling, focus restoration, save feedback and Journey handoff are unchanged.

The approved chair photograph uses one manually authored hotspot on the visible seat. Its product is explicitly fictional; the manual annotation is **not** a SAM detection. The lamp is an existing authored illustration with authored regions and commentary (mock segmentation). Its reveal now shares the Reader's contextual column rather than floating over the image. Neither path makes a model call.

## Browser evidence

| Path | Desktop | Mobile | Continuous recording |
| --- | --- | --- | --- |
| Chair | [Reader](evidence/interaction-slice/refinement/chair-immersive-1440.png) · [selected detail](evidence/interaction-slice/refinement/chair-detail-immersive-1440.png) | [Reader](evidence/interaction-slice/refinement/chair-immersive-390.png) · [selected detail](evidence/interaction-slice/refinement/chair-detail-immersive-390.png) | [1440 px](evidence/interaction-slice/refinement/chair-1440.webm) · [390 px](evidence/interaction-slice/refinement/chair-390.webm) |
| Lamp | [Reader](evidence/interaction-slice/refinement/interaction-reader-1440.png) · [selected detail](evidence/interaction-slice/refinement/interaction-detail-1440.png) | [Reader](evidence/interaction-slice/refinement/interaction-reader-390.png) · [selected detail](evidence/interaction-slice/refinement/interaction-detail-390.png) | [1440 px](evidence/interaction-slice/refinement/lamp-1440.webm) · [390 px](evidence/interaction-slice/refinement/lamp-390.webm) |

[Reference #3 beside the chair render](evidence/interaction-slice/refinement/comparison-chair-detail-immersive-1440.png) and [beside the lamp render](evidence/interaction-slice/refinement/comparison-interaction-detail-1440.png) show the composition at browser scale. The image remains dominant, with contextual reading adjacent rather than a floating product card. The reference's isolated chair foreground cutout is still absent: only the complete approved chair photograph exists, and no authorized cutout or mask was supplied. The lamp path is deliberately an illustration, not an imitation of the photographic reference.

## Validation

- Typecheck, lint and production build passed.
- 8 focused reducer/Living Advertisement unit tests passed.
- 13 affected Chromium tests passed: chair and lamp desktop/mobile recordings, touch and keyboard exploration, Reader/Journey/Collect flow, fallback, prompt differentiation and existing five-stage regressions.
- Recording tests assert full-width Reader geometry and that selected detail appears to the right of the image at 1440 px or below it at 390 px.
- Automated editorial requests were mocked or disabled. No live Meta or SAM inference was executed.

The reference's front-plane photographic cutout and exact depth treatment still need an authorized photographic mask or separately licensed image layer. This is a visual-review limitation, not a claim of complete reference fidelity.
