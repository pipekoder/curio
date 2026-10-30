# Discover → Explore integration review

This branch combines draft PR #34 (`68ebc7f`) and draft PR #35 (`c2f8284`) on `06c3135` without modifying either source branch. The merge preserves same-origin `/explore`, validated-edition session restoration, consent, published-media checks, object interaction, and collection behavior. The only source changes after the merges restore the approved Discover headline, keep the keyword chooser above the prompt, and prevent mobile sentence/actions/prompt overlap. The lint script includes files from both PRs.

## Browser evidence

Rendered locally at 1440 × 900 and 390 × 844 with Chromium, with `/api/editorial` returning 503 to exercise the disclosed authored fallback. No Meta inference was made.

| Stage | Desktop | Mobile |
| --- | --- | --- |
| Discover | [desktop-discover.png](desktop-discover.png) | [mobile-discover.png](mobile-discover.png) |
| Keyword chooser | [desktop-prompt-library.png](desktop-prompt-library.png) | [mobile-prompt-library.png](mobile-prompt-library.png) |
| Reader | [desktop-explore-viewport.png](desktop-explore-viewport.png) · [full page](desktop-explore.png) | [mobile-explore.png](mobile-explore.png) |
| Object detail | [desktop-object.png](desktop-object.png) | [mobile-object.png](mobile-object.png) |
| Collection | [desktop-collect.png](desktop-collect.png) | — |

[Continuous desktop interaction recording](desktop-journey.webm) (5.3 seconds) shows template selection, prompt submission, `/explore`, image exploration, authored chair hotspot, related story, save, and collection opening. Actual browser interactions confirmed both desktop and mobile chair hotspots and details. The captured Reader uses approved demo media; its hotspot is explicitly manually authored, not SAM output.

## Visual review notes

The Discover composition retains the floating photos, orbits, wordmark, sphere, and light editorial background. The original headline now reads “What are you curious about?” The interactive sentence occupies the central area between headline and prompt. At 390 px its text is closer to the left photographic plane than at desktop width; this is a remaining visual tradeoff for owner review. The Reader retains PR #35's full-width chapter continuation and same-origin route. No other stages, backend, model integrations, permissions, or deployment settings changed.

Prior CI evidence belongs to the source PRs (#34 run 69, #35 run 72). Per owner instruction, this integration did not repeat the existing test suites or wait for a new CI run. Browser evidence above verifies the specific merged interaction path; it does not replace CI.
