# WinMix — AI Assistant Working Rules

## Project identity

WinMix is a personal analytics and prediction tool for virtual football. One operator, one model, no multi-user requirements.

## Branch discipline

- One focused change per task, on its own branch. Never commit straight to main.
- Do not refactor unrelated code. Do not rename, move, or delete files unless the task says so.
- Do not modify the engine core (`src/engine-core`, `src/utils` pipeline/calibration/slip logic) as a side effect of UI work.
- Keep the model single: no second competing prediction model.

## Database rules

- NEVER run DDL, DROP, TRUNCATE, DELETE, REVOKE/GRANT, or create tables/functions/policies/extensions without explicit operator approval for that specific change.
- Inspect the real existing structure first, then propose. Prepare changes as a SQL draft and STOP for review.
- Test any schema change on a Supabase branch first, never directly on production.
- Never expose or ask for service-role keys. Never put secrets in client code.

## Required checks

Before declaring a task done, all four must pass with output shown:
1. `npx tsc --noEmit -p .`
2. `npx vitest run`
3. `npm run test:core`
4. `npm run build`

If one fails, say so. Do not weaken or delete tests to get green. Do not claim browser testing unless it was actually performed.

## Terminology

Without stored, timestamped external odds, never use "value", "EV", "edge", "mispriced", or "recommended odds" in UI or docs. Model-only probabilities are "model-implied".

## Trusted documentation

`docs/SPEC.md`, `docs/CONTRACT.hu.md`, `docs/DATA_VERSION_CONTRACT.md`, `docs/CLOUD_STATE_MACHINE.md`, `docs/SUPABASE_ERD.md`, the code itself, and the live database. Historical docs in `docs/archive/` are context-only.

## Open decisions (do not implement)

1. Teams RLS policy: Option A vs Option B — operator decides.
2. Evidence rule conflict (`>= 0.58` vs RED VETO) — Policy A vs Policy B undecided.
3. Slips/ledger persistence — needs approval and design first.
