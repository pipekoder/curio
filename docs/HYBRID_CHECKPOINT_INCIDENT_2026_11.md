# Incident: Hybrid 3-Article generation looped Chief Editor calls (2026-11)

Status: resolved. No code change was deployed for this incident.

## Symptom

Hybrid 3-article generation failed repeatedly in Production. Live logs
showed multiple completed `muse-wonder-1.0` Chief Editor calls (all
`attempt: 1`) accumulating on one job, `generationStage: chief_editor`,
and no progress to Reviewer — while the UI reported failure after each
try and the owner retried twice on the same job.

## Root cause

Migration `0011_article_edition_checkpoints.sql` had never been applied
to the Production D1 database, so the `article_edition_checkpoints`
table did not exist there.

Every owner run therefore failed at the first checkpoint write: Chief
completed, the checkpoint INSERT threw `no such table`, the run failed
as resumable `checkpoint_unavailable`, and each retry resumed the same
job with nothing adopted — re-running a paid Chief call every cycle.
The 202 responses (`preparing` / `analysis_pending` / `reviewing` with
a growing invocation log) were the backend truthfully reporting this
cycle, not a polling defect.

Contributing factors:

- Deploys do not apply D1 migrations automatically (`npm run deploy` is
  build + `wrangler deploy`; CI has no deploy job), and migration 0011
  arrived via merge without a recorded Production apply.
- All repository tests apply migration 0011 to their fixture databases,
  so no test exercised the missing-table path.

## Resolution

The owner manually applied migration 0011 to Production D1. Hybrid
3-article generation then completed successfully with no code deploy,
confirming the diagnosis. PR #130 (checkpoint-degradation workaround)
was closed without merging to preserve strict checkpoint integrity;
PR #129's polling improvements remain in `main`.

## Prevention: verify migrations before every deploy

Before each Production deployment, confirm the remote database has
every migration in `migrations/`:

```sh
npx wrangler d1 migrations list curio-catalog --remote --config wrangler.jsonc
```

If any migration is pending, apply it in a separately approved step
before deploying the code that depends on it:

```sh
npx wrangler d1 migrations apply curio-catalog --remote --config wrangler.jsonc
```

Do not deploy code that depends on a migration until `migrations list`
shows it recorded. Consider adding this check as a documented manual
gate in the release procedure; per repository policy it must not run
automatically in CI.
