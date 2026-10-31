# Editorial Knowledge V2

`shared/editorial-knowledge-v2.ts` contains Curio's original manifesto, journalism principles, narrative guidance and six voice profiles. Its examples are authored for Curio. They are prompts for editorial judgment, not article templates or verified product claims. The existing Editorial Standard v1 remains the scoring contract.

## Research provenance and limits

High-level journalism principles were distilled from the general editorial practices described by [Vogue's About page](https://www.vogue.com/info/about-vogue) and the [American Press Institute's journalism guidance](https://americanpressinstitute.org/journalism-essentials/). Curio has no affiliation with either publication. No article text or distinctive prose is copied into the knowledge library.

The requested 2017–2026 Nobel Literature review should be checked against the [Nobel Prize's official Literature laureate index](https://www.nobelprize.org/prizes/lists/all-nobel-prizes-in-literature/) and the corresponding official laureate biographies. The development environment's request to the Nobel API returned a 403 network policy response, so individual laureate biographies and the 2026 award could not be verified here. The narrative techniques in the library are **Curio's original editorial interpretations**, not claims about, quotations from, or imitations of particular laureates. A verified year-by-year research table remains a content research task before calling that subsection complete.

## Editing and activation

1. Edit the manifesto, a principle, technique, voice profile or example in `shared/editorial-knowledge-v2.ts`.
2. Run `npx vitest run tests/editorial-knowledge-v2.test.ts` and review the prompt diff. Bump `EDITORIAL_KNOWLEDGE_VERSION` for substantive guidance changes; the version participates in the isolate cache key when V2 is enabled.
3. Run repository checks and release through the existing Cloudflare workflow. Do not overwrite manually managed `wrangler.jsonc` production variables during release.
4. After deployment approval, set `EDITORIAL_KNOWLEDGE_V2_ENABLED=true` only alongside the existing Reviewer flag, pilot allowlist and pilot secret. The flag defaults off. Roll back by setting it false through the existing Cloudflare configuration process, then redeploy the accepted version. Do not alter the inference ceilings.

The API response remains unchanged. Cached plans are checked against the current publication pool before reuse. V2 changes use a distinct cache key. No live Muse request is part of this PR.
