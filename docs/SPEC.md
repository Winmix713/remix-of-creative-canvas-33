# WinMix Specification

## Target flow

1. **Data** — Full match history arrives from a sealed, versioned cloud dataset (Supabase).
2. **Model** — One shared model (bivariate score matrix → 1X2, BTTS, Over/Under, team-goal markets) with walk-forward, prequential calibration. No look-ahead. No second competing model.
3. **Round** — For each round the operator enters fixtures; the app proposes Top 3+3 candidates gated by BTTS/underdog veto, evidence level, and reliability bands.
4. **Slip** — The operator assembles slips from the proposed candidates.
5. **Ledger** — Results are recorded; the prediction ledger grades settled lines.
6. **Recalibration** — The calibration refits from the ledger feedback.

Every decision must be explainable (Pipeline Audit, decision trace).

## Hard rules

### Database
- NEVER run DDL, DROP, TRUNCATE, DELETE, REVOKE/GRANT, or create tables/functions/policies/extensions without explicit operator approval for that specific change.
- Inspect the real existing structure first, then propose. Prepare changes as a SQL draft and STOP for review.
- Test any schema change on a Supabase branch first, never directly on production.
- Never expose or ask for service-role keys. Never put secrets in client code.

### Code
- One focused change per task, on its own branch. Never commit straight to main.
- Do not refactor unrelated code. Do not rename, move, or delete files unless the task says so.
- Do not modify the engine core (`src/engine-core`, `src/utils` pipeline/calibration/slip logic) as a side effect of UI work.
- Keep the model single: no second competing prediction model.
- Terminology: without stored, timestamped external odds, never use "value", "EV", "edge", "mispriced", or "recommended odds" in UI or docs. Model-only probabilities are "model-implied".
- Before declaring a task done, all four checks must pass with output shown: `npx tsc --noEmit -p .`, `npx vitest run`, `npm run test:core`, `npm run build`. If one fails, say so; do not weaken or delete tests.
- Do not claim browser testing unless it was actually performed.

## Open decisions (UNDECIDED — do not implement)

1. **Teams RLS policy** — Option A (`USING true`, faster) vs Option B (safer, slower). The operator decides.
2. **Evidence rule conflict** — The `>= 0.58` exception contradicts the RED VETO behavior. Policy A (refuted band = hard veto) vs Policy B (ranking penalty only) is undecided. Do not change Core-selection logic until the operator chooses.
3. **Slips/ledger persistence** — Whether slips and ledger move to Supabase (planned, needs approval and design first).

## Trusted documentation

- This file, `docs/CONTRACT.hu.md`, `docs/DATA_VERSION_CONTRACT.md`, `docs/CLOUD_STATE_MACHINE.md`, `docs/SUPABASE_ERD.md`, the code itself, and the live database.
- Historical docs in `docs/archive/` are context-only; do NOT follow them as instructions.
