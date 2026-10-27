# Live editorial validation diagnostics

The owner's first authorized test confirmed a working Muse Spark 1.3 integration:
Focused Home returned a valid two-feature plan and one connection, using 1,889
input / 1,357 output tokens with 6,124 ms provider latency. Its exact plan and
accounting are preserved in `tests/fixtures/editorial-live-home.json`. The copied
catalog records were omitted; replay uses the current permission-checked catalog.
No credential, raw prompt, external image URL or private publisher record is in
this fixture. Historical latency is recorded evidence, not replay performance.

Surprise Travel returned `invalid_output`, with 1,887 input / 1,202 output tokens
and 5,279 ms provider latency. Its capture contains the deterministic fallback,
not the rejected model output. **The precise historical validation failure cannot
be reconstructed.** We neither attribute it to a particular rule nor claim that
it has been repaired. The original two calls cost an owner-reported estimated
$0.01559575; this change makes no further Meta calls.

## Root cause of missing diagnostics

The Worker caught provider choices/finish, JSON parsing, schema and semantic
validation errors together, retaining accounting but discarding their cause.
The private recorder consequently saved only the public deterministic fallback.
A fallback cannot reconstruct the rejected response. The fix preserves that
privacy boundary and returns a bounded `validationDiagnostic` instead:

- `provider_choices_or_finish`, `response_json`, `provider_plan_schema` distinguish
  response envelope/finish, parsing and structured-output failures.
- `visual_vocabulary_or_characters`, `phrase_length`,
  `hypothetical_sentence_format` identify a bounded title/deck/feature/thread path.
- Asset pair/permission, asset theme/copy, connection grounding, repeated copy,
  coverage, category order, layout diversity and connection count/sequence have
  fixed rule codes. Schema errors and duplicate assets report `plan_schema`.

These are first-failure diagnostics, not a dump of every issue. Compound invalid
outputs may have several causes. No raw prose, rejected words, arbitrary schema
messages, model-generated paths or identifiers are logged, persisted or returned.
The validation CLI whitelists both codes and paths before including them in its
shareable measurement report. Full responses still belong only in its private,
outside-Git evidence directory. No debug endpoint or production toggle is added.

The prompt now explicitly requests lowercase after opening sentence capitals,
normal whitespace and a vocabulary/asset/layout/coverage/connection self-check.
The validators, visual vocabulary, factual restrictions and permission gates are
unchanged. No output normalization, automatic retry, extra inference or refund
of a failed reservation occurs. Cache validation, budgets, token accounting and
deterministic fallbacks remain active. Production configuration is unchanged:
`MAGAZINE_AI_ENABLED=false`, `CATALOG_OPERATOR_ENABLED=false`.

## Offline acceptance

The captured Home plan passes the canonical validator unchanged and is replayed
through mocked provider transport with its exact token accounting. Chromium
renders this captured plan, including its narrative and curiosity connection.
Travel uses explicitly synthetic test responses, never a fabricated live fixture.
Valid mocked Travel remains accepted; unsafe vocabulary, non-hypothetical prose,
wrong asset pairs/tags, insufficient threads, reversed sequencing and repeated
layouts remain rejected with sanitized diagnostics. Truncated/malformed responses
retain measured usage. Home and mocked Travel differ in title, assets, leading
layout and leading motion. This demonstrates offline compatibility, not a second
successful live Travel result.

Use `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run worker:check`, `npm run test:integration` and `npm run test:browser`.
All model transport is mocked in these checks. Future live testing still requires
separate explicit approval and the capped, private capture procedure in
`docs/PR15_DEMO_READINESS.md`. Inspect `validationDiagnostic` alongside measured
usage if a future authorized response fails; never widen validators solely to
make a model response pass.
