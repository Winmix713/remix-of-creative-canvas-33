## 1. Executive summary

**WinMix is not yet operating through the intended Supabase → server engine → versioned outputs → browser architecture.** The historical data is present and readable, but the application still uses browser-owned state and browser calculations.

I audited [commit `940870dd6141b4133424387b936ac93e514ae834`](https://github.com/Winmix713/remix-of-creative-canvas-33/commit/940870dd6141b4133424387b936ac93e514ae834), dated September 21, 2026. The relevant local source files were verified against that revision. No files, code, dependencies, commits, or database records were changed.

Read-only checks against the central project established:

| Item | Verified result |
|---|---|
| Project | `yvwnchyedxkajtwwkkqd` |
| Data version | `baseline-v1`, sealed, current |
| English data | 62 seasons; 14,880 matches |
| Spanish data | 41 seasons; 9,840 matches |
| Total | **103 seasons; 24,720 matches** |
| Browser’s season-list query | Successfully returned all 103 seasons |
| Browser’s match query | Successfully returned 240 matches for a sampled season |
| Publicly visible engine runs, predictions, features, calibration and team states | Empty |
| `winmix_current_engine_status` | Empty |
| `winmix-engine` endpoint | HTTP 404: function not found |
| `winmix-ingest` endpoint | Deployed; GET returned its POST-only response |
| Anonymous access to jobs and parameter snapshots | Denied |

These observations do **not** establish whether private queued or failed jobs exist, or certify live database immutability and write restrictions.

The most consequential findings are:

- **P0:** privileged Edge Function handlers lack server-caller authorization.
- **P1:** no completed-run reader supplies the production UI.
- **P1:** automatic full-history weights leak future outcomes into historical predictions.
- **P1:** parallel league-result merging discards earlier leagues’ newly computed predictions.
- **P1:** the server deployment contract, output serialization, and version checks are incomplete.

The canonical model should be retained. The necessary work is a controlled migration plus specific, demonstrated correctness fixes.

## 2. Verified current architecture

| Layer | Actual implementation |
|---|---|
| Application state | `WinmixProvider` calls `useWinmixEngine`; seasons, weights, calibration, rounds and slips live in React state |
| Durable browser state | `storage.ts` persists to localStorage; per-match pipeline outputs are stripped |
| Historical orchestration | `computeLeaguePipeline()` in `src/utils/pipeline.ts` |
| Prediction mathematics | `forecastCore()` in `src/utils/forecastCore.ts` |
| Browser execution | `pipelineRunner.ts` uses Web Workers, with an inline fallback |
| Shared server boundary | `src/engine-core/index.ts` re-exports the canonical pipeline |
| Upcoming fixture predictions | `predictFixture()` delegates to `forecastCore()`, using browser-supplied history and fitted parameters |
| Selection layer | `roundAnalysis.ts` → `patterns.ts` → evidence/eligibility/strategy helpers → `slip.ts` |
| Supabase browser integration | Hand-written REST reads, historical-data download, advisory ratings, and calls to the ingest function |
| Server engine source | Claims a job, reads a sealed version and parameter snapshot, computes both leagues, inserts outputs, requests promotion |
| Production run consumption | **Not implemented in the browser** |

There is one shared mathematical forecasting implementation. There are multiple execution and selection paths around it. Sharing `forecastCore()` does not by itself guarantee identical chronology, parameters, or selection behavior.

## 3. Actual data-flow map

The current browser flow is:

```text
localStorage restoration ───────────────────────────────┐
                                                      │
Supabase seasons/matches → reconstructed CSV → import ──┤
                                                      ├→ useWinmixEngine
GitHub CSV download → import ──────────────────────────┤
                                                      │
Local CSV / JSON import ───────────────────────────────┘
    ↓
validation / canonical team names / deduplication / ordering
    ↓
automatic weights from all loaded league matches
    ↓
pipelineRunner → worker or inline computeLeaguePipeline
    ↓
prefix features → forecastCore → predictions
    ↓
result observation → later temperature / M1 / ensemble refits
    ↓
React seasons + calibration → analytics pages
    ↓
localStorage persistence, with per-match predictions removed
```

The fixture and ledger flow is:

```text
browser history + current weights + final fitted model
    ↓
predictFixture → H2H patterns → evidence / ranking / slip selection
    ↓
saved local slip → manually entered result → gradeLine
    ↓
pattern performance weights → subsequent pattern stability / selection
```

The server flow exists in source:

```text
job → sealed data version + parameter snapshot
    ↓
computeLeaguePipeline
    ↓
features + predictions + market calibration
    ↓
run marked succeeded → promotion RPC
```

It currently stops short of production: the function is not deployed, its generated import is absent from Git, and the browser does not read its outputs.

## 4. Prediction-flow and leakage audit

The central historical loop has a sound temporal boundary: it forecasts before appending the current result to history or training samples. Temperature, logistic and ensemble refits then affect later matches. H2H, venue statistics and form features inside that loop use the supplied historical prefix.

The following surrounding defects prevent a blanket “time-safe” conclusion.

**F1 — P1: Full-history automatic weights leak future outcomes.**  
**Location:** [src/hooks/useWinmixEngine.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/hooks/useWinmixEngine.ts#L232), `applyRecommendedTeamWeights()` and `importFiles()`; `src/utils/autoWeights.ts`, `computeAutoTeamWeights()`.  
**Evidence:** importing computes recommendations from every loaded match in a league, applies them, then replays historical predictions using that single weight map. An in-memory reproduction kept the first match unchanged and changed only later results: its home probability changed from **0.73475 to 0.19587**. With fixed weights, its forecast remained unchanged.  
**Risk:** historical evaluation, fitted features and subsequent calibration incorporate future information.  
**Action:** establish effective-dated weights: historical evaluation must use weights available at its cutoff, or an explicitly predeclared fixed baseline. Preserve operator overrides separately.  
**Prediction impact:** **Yes**, a demonstrated leakage correction; version and regression-test it.

**F2 — P1: Historical and fixture paths disagree on ordering and scope.**  
**Location:** [src/utils/fixtures.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/fixtures.ts#L182), `buildLeagueHistory()`; `src/utils/pipeline.ts`, `orderedSeasons()`; `src/utils/roundAnalysis.ts`, `buildLeagueContext()`.  
**Evidence:** the pipeline orders seasons by `seasonIndex`, then `createdAt`; fixture history reverses that precedence. Fixture history includes all seasons without consuming `historyScope`, whose default is `season-only`. I reproduced different first-season ordering.  
**Risk:** audit and fixture forecasts can use different form, H2H and goal histories. The fixture path also has no historical as-of cutoff.  
**Action:** define one ordering and explicit scope/cutoff contract. Current all-history forecasting is valid only for fixtures after that history; it must not be presented as historical replay.  
**Prediction impact:** **Yes** where the existing paths disagree; parity required.

**F3 — P1: Checkpoint and import fingerprints omit predictive inputs.**  
**Location:** [src/utils/pipeline.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/pipeline.ts#L152), `identityOf()`, `prefixSignatureOf()`, `reusableCount()`; `src/utils/csv.ts`, `contentHashForMatches()`.  
**Evidence:** identities include teams, date and final scores, but omit half-time scores. The flattened checkpoint signature also does not encode season boundaries. Changing one half-time result reused all 30 checkpointed matches; the next match’s `htGoalRate5` remained **0.54167**, versus **0.70833** after a full rebuild. The import content hash also remained identical.  
**Risk:** corrected data can be rejected as duplicate or accepted with stale features, fits and predictions.  
**Action:** fingerprint all predictive inputs, ordered season boundaries and relevant contract versions; invalidate existing incomplete fingerprints.  
**Prediction impact:** corrects stale predictions; the forecasting formula need not change.

**F4 — P1: Experimental Dixon–Coles results can enter production forecasting.**  
**Location:** [src/utils/pipeline.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/pipeline.ts#L696), experiment evaluation and `validatedRho`; `src/hooks/useRoundAnalysis.ts`, `fittedModels`; `src/utils/fixtures.ts`, `predictFixture()`.  
**Evidence:** historical canonical forecasts explicitly receive `dixonColesRho: null`. Afterwards, rho is fitted on the collected sample and evaluated on that same sample. A favorable interval can publish rho into `modelFit`, which upcoming fixture forecasts consume.  
**Risk:** an in-sample experimental result changes production probabilities while the displayed historical audit describes the uncorrected model.  
**Action:** keep research outputs separate from production parameters. Require a separately versioned, genuinely out-of-sample promotion process.  
**Prediction impact:** changes the enabled experimental path; default experiments-off behavior can remain unchanged.

Glicko observations remain a separate experimental report in the inspected path. `computeDebugInSampleT()` and the oracle entropy estimate are diagnostic consumers, not canonical forecasting inputs. I found no separate implemented generator-structure research subsystem; future work must not reuse the Dixon–Coles automatic-promotion mechanism.

**F5 — P2: Final 1X2 probabilities are not marginals of the goal-market matrix.**  
**Location:** [src/utils/forecastCore.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/forecastCore.ts#L1100), `forecastCore()`.  
**Evidence:** final 1X2 probabilities come from the calibrated B1/M1 ensemble; goal markets come from the Poisson joint matrix. With valid weights 10 and 0, a reproduction produced `P(home win)=0.80696` but `P(home scores ≥1)=0.77686`.  
**Risk:** consumers cannot treat these outputs as one coherent joint probability distribution, despite the file’s introductory invariant.  
**Action:** preserve both sources explicitly in the output contract and correct the invariant claim. Resolve cross-market coherence through a separately versioned model correction and parity evaluation, not an incidental infrastructure edit.  
**Prediction impact:** provenance/documentation changes do not; mathematical reconciliation would.

## 5. Team weights, ratings, and manual override audit

Several protections already work:

- `applyRecommendedTeamWeights()` skips keys present in `manualWeightOverrides`.
- Manual edits record override provenance.
- Older browser snapshots without provenance conservatively preserve existing weights as manual.
- “Apply automatic weights” explicitly warns that it replaces manual choices.

**F6 — P1: Weight editing and restoration are not consistently scoped.**  
**Location:** [src/hooks/useWinmixEngine.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/hooks/useWinmixEngine.ts#L1199), `setWeight()`, `saveWeights()`, returned `teamWeights`; `src/hooks/useOpsActions.ts`, `preApplySnapshot` and `revertAutoWeights()`.  
**Evidence:** the public engine exposes draft weights before saving; `saveWeights()` recomputes only the currently selected league although the draft holds both leagues. The revert snapshot contains no league identifier, and restoration applies it to the current league.  
**Risk:** unsaved weights can influence fixture analysis; cross-league edits can leave historical predictions stale; switching leagues before reverting can restore the wrong values or defaults.  
**Action:** separate committed and draft selectors, track dirty leagues, and bind restoration snapshots to their originating league.  
**Prediction impact:** fixes which parameter snapshot is used; preserve weight formulas.

Cloud-side preservation is weaker: the legacy ingester labels every uploaded team weight as automatic, discussed in F9.

## 6. Supabase / server-side engine audit

**F7 — P1: Configuration can silently select the old project and accepts inappropriate keys.**  
**Location:** [src/utils/cloudConfig.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/cloudConfig.ts#L18), fallback constants and `resolveCloudEnv()`; `src/integrations/supabase/client.ts`, generated client.  
**Evidence:** missing or invalid environment configuration selects `oaadhaapbgzyibyadgdh` with a hard-coded publishable key. Any HTTP(S) URL and nonempty key are accepted. Both client implementations recognize `sb_secret_` without rejecting it. The generated client accepts only `VITE_SUPABASE_PUBLISHABLE_KEY`; the active REST path also accepts `VITE_SUPABASE_ANON_KEY`. No active application import of the generated client was found.  
**Risk:** wrong-project reads and uploads, hidden configuration failures, and browser exposure if a privileged key is mistakenly supplied.  
**Action:** use one validated configuration contract, enforce the central production project, reject secret/service-role credentials, and remove the baked-in fallback. Keep invalid configuration visible.  
**Prediction impact:** infrastructure only.

The local public configuration and `supabase/config.toml` point to the central project. This does not establish the environment baked into a separately deployed website.

**F8 — P1: The repository cannot reproduce the central engine deployment.**  
**Location:** [supabase/functions/winmix-engine/index.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/supabase/functions/winmix-engine/index.ts#L6), engine import; `scripts/build-engine-core.mjs`; `supabase/migrations/`.  
**Evidence:** the imported `_shared/engine-core.bundle.ts` is absent from the audited Git revision. A generator exists, but no repository deployment workflow invokes it. The three committed migrations create the older cloud tier, not the version/job/run/output schema used by the function. The first migration also assumes an existing `touch_updated_at()` function. Live `winmix-engine` returned 404.  
**Risk:** deployment depends on undocumented database state and an unbuilt artifact.  
**Action:** capture the reconciled central schema as reviewed migrations; make bundle generation and validation required deployment steps; verify against the central project.  
**Prediction impact:** infrastructure only.

**F9 — P1: The legacy ingester does not implement versioned ingestion or preserve override provenance.**  
**Location:** [supabase/functions/winmix-ingest/index.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/supabase/functions/winmix-ingest/index.ts#L143), season/team/match upserts; `src/utils/cloudSync.ts`, `syncSeasonsToCloud()`.  
**Evidence:** it upserts by legacy season and match conflict keys, supplies no data-version identifier, accepts browser-provided weights, and writes `weight_source: "auto"` for all teams. Season metadata is written before match validation finishes.  
**Risk:** this path cannot enforce the intended sealed-version lifecycle; failures can leave partial metadata, and manual provenance is lost. The exact live constraints’ response to these writes was not tested.  
**Action:** remove automatic browser synchronization from production. Retain ingestion only as an authorized server workflow into a draft version, with validation before sealing. Do not re-upload the existing baseline.  
**Prediction impact:** infrastructure and parameter integrity; unintended weight changes affect predictions.

**F10 — P1: Server output serialization is incomplete.**  
**Location:** [supabase/functions/winmix-engine/index.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/supabase/functions/winmix-engine/index.ts#L105), `outputsOf()` and calibration writes; `src/utils/forecastCore.ts`, `toMatchPipeline()`.  
**Evidence:** lambda serialization reads `pipeline.model_output` or `pipeline.lambdas`; neither exists on the actual `MatchPipeline`. Both database lambda fields therefore become null. The serializer also omits `context`; only market calibration reports are persisted, not the complete final calibration/model state. No team-state snapshots are written.  
**Risk:** a successful run would still lack information required for faithful UI hydration, diagnostics and subsequent fixture forecasting.  
**Action:** define a typed, versioned run-output contract and preserve required context, lambdas, fitted parameters, calibration and team-state outputs without changing their calculations.  
**Prediction impact:** serialization/infrastructure only.

**F11 — P1: Requested model versions are not enforced.**  
**Location:** [supabase/functions/winmix-engine/index.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/supabase/functions/winmix-engine/index.ts#L185), snapshot validation.  
**Evidence:** `model_version`, `feature_schema_version` and `pipeline_contract_version` are selected but never compared with the executing engine. Feature schema is separately hard-coded as `2`. Source integrity checks compare row count, not a recomputed content fingerprint.  
**Risk:** a run can claim a snapshot contract different from the code actually executed; equal-sized changed input is not detected by the function’s check.  
**Action:** reject unsupported contracts, record the build/commit identity, validate the actual input fingerprint and make effective weight/override semantics explicit.  
**Prediction impact:** infrastructure; valid matching runs remain numerically unchanged.

**F12 — P1: Completion and recovery depend on an unverified job contract.**  
**Location:** same engine file, `insertChunks()`, `failRun()` and completion/promotion sequence.  
**Evidence:** writes occur in independent chunks; failures are marked without inspecting failure-update errors. The handler has no lease renewal, bounded retry, or restart recovery. Success is written before calling a promotion RPC whose definition is absent from the repository.  
**Risk:** interruption can leave partial outputs or stuck jobs; publishing and retry behavior cannot be audited from this repository.  
**Action:** commit and test claim/lease/retry/promotion semantics, validate output coverage, and publish atomically only after completion. Keep incomplete runs outside public production reads.  
**Prediction impact:** infrastructure only.

The full 24,720-match workload also needs a measured runtime/memory acceptance check. Hosted Edge Functions currently document a 2-second CPU limit and 256 MB memory limit; I did not benchmark this workload in Deno and am not asserting that it fits or fails. [Supabase limits](https://supabase.com/docs/guides/functions/limits)

## 7. LocalStorage, CSV, and browser pipeline migration audit

**F13 — P1: Browser state remains the production authority.**  
**Location:** [src/App.tsx](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/App.tsx#L184), cloud bootstrap and `handleLoadMatches()`; `src/hooks/useWinmixEngine.ts`, boot/import; `src/utils/storage.ts`, `stripPipeline()`.  
**Evidence:** startup restores localStorage and recomputes missing predictions. Cloud bootstrap runs only when `hasData` is false, downloads historical data, converts it to CSV, and invokes the browser pipeline. The standard load button fetches 37 hard-coded GitHub CSV files through `remoteSeasons.ts`. No browser source reads completed engine runs or versioned predictions.  
**Risk:** users with any local data bypass central hydration; sessions can disagree; startup performs forbidden production computation and can trigger an upload back to Supabase.  
**Action:** make production startup read one published successful run. Put import, GitHub download, browser computation and local ledger tools behind an explicit migration/diagnostic mode.  
**Prediction impact:** infrastructure migration; preserve the server’s stored numbers.

**F14 — P2: Cloud-to-CSV conversion loses identity and has incomplete recovery.**  
**Location:** [src/utils/supabaseTier.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/supabaseTier.ts#L265), `fetchCloudSeasonList()` and `fetchCloudSeasonData()`; `App.tsx`, bootstrap effect.  
**Evidence:** reconstruction drops database match identity and source metadata, ignores `kickoff_iso` when constructing dates, and joins CSV fields without escaping. Reimport generates new season identities. Reads are not data-version scoped; cached downloads are keyed only by season ID. Automatic bootstrap uses one `Promise.all` and a one-attempt flag.  
**Risk:** identity and chronology can change; one failed download aborts hydration; retrying cloud health does not reset bootstrap.  
**Action:** consume typed rows directly, preserve identifiers/order/version, paginate deterministically, and retry the actual run load with bounded concurrency.  
**Prediction impact:** transport only for valid unchanged input; correcting altered chronology can change results.

The sampled season’s 240 rows are below normal pagination limits. I found no evidence that pagination alone explains the current 24,720-match visibility problem.

## 8. Prediction persistence, ledger, and calibration audit

There are two different feedback paths:

1. **Historical model learning:** forecast → result observation → later M1/ensemble/temperature refit. Its ordering is sound, subject to F1–F3.
2. **Ledger feedback:** entered results → pattern-type performance weights → later pattern stability and selection. This does **not** feed the canonical historical model.

**F15 — P1: Issued predictions and settlements are not an immutable, reproducible ledger.**  
**Location:** [src/utils/slip.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/slip.ts#L1884), `lineOf()` and `draftToSlip()`; `src/hooks/useWinmixEngine.ts`, `updateSlipLine()`; `src/utils/ledger.ts`, `computePatternPerformance()`.  
**Evidence:** slips preserve selection/evidence versions, but lack engine-run, data-version and parameter-snapshot references. Settlement merges arbitrary `Partial<SlipLine>` values into the issued record. There is no settlement timestamp/event history; slips can be deleted. Feedback reads all currently settled lines without an as-of cutoff. The saved line omits `modelProb`; market feedback measures `line.hitRate`.  
**Risk:** past recommendations cannot be reconstructed against their exact inputs, edits can change feedback retrospectively, and ledger “predicted” rates are not necessarily canonical model probabilities.  
**Action:** preserve an immutable issue record linked to a run and parameter snapshot; append settlement/correction events; save probability provenance and feedback cutoffs. Keep legacy slips explicitly marked as legacy.  
**Prediction impact:** persistence alone does not; time-scoped feedback can change later selection.

**F16 — P2: The oracle diagnostic uses the old venue normalizers.**  
**Location:** [src/utils/oracle.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/oracle.ts#L125), `estimateEntropyFloor()`; `src/utils/forecastCore.ts`, lambda calculations.  
**Evidence:** the oracle divides the home-goal calculation by away GPM and the away-goal calculation by home GPM; the canonical model uses the corrected opposite denominators.  
**Risk:** displayed headroom and saturation compare against a differently normalized diagnostic.  
**Action:** align the diagnostic’s venue normalization with the canonical primitive and retain its explicit in-sample status.  
**Prediction impact:** diagnostics only.

Database immutability remains **unverified**, not proven absent: the current versioning/immutability DDL is missing from the repository, and anonymous access cannot establish privileged mutation protections.

## 9. Frontend and state-management audit

**F17 — P1: Combining parallel league runs loses computed results.**  
**Location:** [src/hooks/useWinmixEngine.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/hooks/useWinmixEngine.ts#L702), `runPipelineForLeagues()`; `src/utils/pipelineRunner.ts`, `mergeSeasons()`.  
**Evidence:** both jobs receive the same starting snapshot. Each result contains its computed league plus untouched other leagues. The hook repeatedly assigns `working.seasons = result.seasons`. Reproduction with one match per league finished with English unscored and Spanish scored.  
**Risk:** earlier leagues’ new predictions are discarded while their calibration and checkpoints are retained. Match counts themselves are not removed.  
**Action:** merge only each completed league’s seasons into the accumulated result, or accumulate by stable season identity.  
**Prediction impact:** state-integrity correction; no mathematical change.

**F18 — P2: Fixture-analysis freshness ignores model and data changes.**  
**Location:** [src/hooks/useRoundAnalysis.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/hooks/useRoundAnalysis.ts#L31), `roundSignature()`, restored analysis and `stale`.  
**Evidence:** freshness records only fixture IDs and team pairs. Completed analyses are restored without data/run/weights/calibration/model identity. Clearing the separate context cache does not invalidate already-produced analyses.  
**Risk:** old recommendations can appear current after importing data, changing weights or recalculating calibration.  
**Action:** bind analysis output to its complete immutable input/run signature; invalidate or explicitly retain it as an older snapshot.  
**Prediction impact:** freshness/infrastructure only.

Current UI computation responsibilities are:

| Surface | Business computation or trigger |
|---|---|
| `App` / `TopBar` | Cloud bootstrap, GitHub import, full recomputation |
| Operations / `useOpsActions` | Automatic weights, rebuild, cloud upload/download |
| `FixturePredictor` / `useRoundAnalysis` | Forecasting, H2H patterns, calibration-based evidence, slip selection |
| `HeadToHead` | H2H aggregation, recommended weights, goal-profile/risk calculations |
| `LeagueAnalyzer` | Standings, positions, fixture inference and result matrices |
| `PipelineAudit` / `useLeagueForecastStats` | Reliability, market calibration, evaluation windows and optional in-sample temperature |
| `PredictionLedger` | Settlement-derived performance and feedback weights |

Several surfaces repeat aggregation using shared helpers. That is different from having duplicate forecasting formulas. The immediate migration requirement is to control their input provenance and remove production recomputation, not rewrite these pages.

## 10. Type and data-integrity audit

CSV and JSON imports already share useful score-integrity rules, preserve ambiguous undated repeat fixtures, and explicitly distinguish chronological from source ordering.

**F19 — P2: Runtime boundary validation is incomplete.**  
**Location:** [src/utils/supabaseTier.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/supabaseTier.ts#L162), response schemas; `src/utils/storage.ts`, `hydrate()`; `src/utils/checkpointStore.ts`, `usable()`; ingest `checkScores()`.  
**Evidence:** numeric strings are transformed with `Number` without validating the resulting finite/range-constrained number; league/order strings are cast to narrower types. Storage hydration mostly trusts nested objects. Checkpoint validation omits arrays later dereferenced by resume. The server’s duplicated half-time validator omits the browser validator’s integer check.  
**Risk:** malformed data can survive validation, fail later, or produce divergent browser/server acceptance.  
**Action:** validate finite numbers, integer scores, enums, required checkpoint fields and relationships at boundaries; share the domain validation contract.  
**Prediction impact:** valid data unchanged; invalid input is rejected or explicitly repaired.

**F20 — P2: Static contract defects are outside the current build guarantee.**  
**Location:** [src/utils/pipelineCache.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/utils/pipelineCache.ts#L44), duplicate helpers; `useOpsActions.ts:271`; cloud component tests; `tsconfig.json`; Edge Function files.  
**Evidence:** `pipelineCache.ts` declares three helpers twice and failed an in-memory module parse with “Identifier `isRecord` has already been declared.” No consumer imports this cache. `downloadFromCloud()` calls the two-argument `importFiles()` with three arguments. Cloud component tests omit newly required props. Both Edge Functions use `@ts-nocheck` and are outside the root TypeScript include. `build` runs Vite without a type-check step.  
**Risk:** a Vite build cannot establish repository-wide or server-contract correctness. The unused cache also cannot support a claim that startup avoids recomputation.  
**Action:** repair the narrow defects, regenerate central database types, and add explicit browser/server type checks to the verification contract.  
**Prediction impact:** infrastructure only.

## 11. Security audit

**F21 — P0: Publicly callable handlers reach service-role operations without server authorization.**  
**Location:** [supabase/functions/winmix-engine/index.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/supabase/functions/winmix-engine/index.ts#L169), request handler; `supabase/functions/winmix-ingest/index.ts`, request handler; `_shared/cron-auth.ts`.  
**Evidence:** neither handler validates a scheduler/admin credential before constructing its privileged client. The existing cron-auth helper is unused. An isolated test of the actual engine handler, with a mocked database and no network, reached job claiming without an Authorization header. `verify_jwt=true` is the only configured gateway check.  
**Risk:** admitting a public application credential can expose privileged ingestion or job execution. Database RLS does not protect operations performed through the service-role client.  
**Action:** require explicit server-to-server authorization before every privileged operation, reject public credentials, and remove browser access to these write paths. No user-login flow is required.  
**Prediction impact:** security/infrastructure only.

Supabase documents the gateway check and handler authorization as separate layers; API-key admission alone does not establish an authorized privileged caller. [Authorization headers](https://supabase.com/docs/guides/functions/auth-headers)

Additional verified conclusions:

- I found no literal service-role secret in the inspected active browser source.
- The hard-coded fallback is a **public** key; its defect is routing and configuration, not secret exposure.
- Central REST reads returned CORS permission for the application origin.
- Ingest allows wildcard CORS and advertises more methods than its handler supports. Restricting CORS is useful hygiene, but cannot replace authorization.
- The server-only engine does not need browser CORS.
- Old migrations grant public reads and restrict direct writes. Their existence does not certify the live versioned schema’s full policy set.
- Anonymous denial on jobs and parameter snapshots should not be “fixed” by exposing administrative tables.

## 12. Test audit

I executed the existing pure suites directly from the audited source using an in-memory TypeScript loader:

| Existing suite | Result |
|---|---|
| Joint matrix invariants | 10/10 cases passed |
| Core evidence | 14/14 cases passed; gate checks passed |
| Core tiers | 16/16 cases passed |
| Marquee ranking | 6/6 cases passed |
| Canonical selection | 7/8 cases passed |

I also executed the targeted reproductions described above. **I did not run the full Vitest suite, Vite build or Deno deployment checks:** this copy has no installed repository dependencies, and the request prohibits adding them and creating build artifacts.

**F22 — P2: Tests encode obsolete fallback behavior and contradictory gate expectations.**  
**Location:** [src/__tests__/cloudConfig.test.ts](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/src/__tests__/cloudConfig.test.ts#L36), resolution tests; `src/utils/coreCanonicalTests.ts`, case G; `vite.config.ts`, test inclusion.  
**Evidence:** cloud tests require invalid configuration to fall back and the running app never to be unconfigured. Canonical case G requires excluded evidence to be rejected, but `PHASE6_MARKET_GATING_ACTIVE=false` deliberately permits it; the evidence suite already accounts for that flag. The `*Tests.ts` suites are not automatically collected by the configured `*.test/*.spec` pattern.  
**Risk:** tests can preserve the wrong production architecture while meaningful model-contract checks remain outside normal test execution.  
**Action:** replace fallback expectations, explicitly supply test configuration, wire pure suites into automated tests, and resolve case G against the chosen existing gate policy. Do not activate a model gate just to make a test pass.  
**Prediction impact:** test changes alone do not; changing gate policy would.

The specifically obsolete fallback assertions are:

- `cloudConfig.test.ts:36–45`: invalid URL → fallback.
- `cloudConfig.test.ts:47–58`: whitespace key → fallback.
- `cloudConfig.test.ts:60–63`: null only when both environment and fallback are invalid.
- `cloudConfig.test.ts:65–70`: built-in fallback means the app is never unconfigured.

`supabaseTier.test.ts` and `cloudTier.e2e.test.tsx` also rely on implicit configured state; give them explicit configuration fixtures. The former’s “REST-root fallback” test is mislabeled: the implementation probes `winmix_seasons`. The latter’s local-mode degradation expectations need updating for production run loading.

**F23 — P1: Verification scripts do not prove what their names/comments claim.**  
**Location:** [scripts/supabase/parity-check.mjs](https://github.com/Winmix713/remix-of-creative-canvas-33/blob/940870dd6141b4133424387b936ac93e514ae834/scripts/supabase/parity-check.mjs), parity loop; `schema-check.mjs`; `bootstrap.mjs`; `security-audit.mjs`.  
**Evidence:** parity performs one limited match read, skips missing local teams, compares only venue net values, and never compares `recommendedWeight` with `auto_weight_index` or engine predictions. Schema checks request `limit=0`, then accept the empty result as schema success. The bootstrap “write protection” check performs a SELECT. Security scanning does not establish database policies or handler authorization.  
**Risk:** green script output can be mistaken for schema, security or model parity certification.  
**Action:** make checks assert their actual contracts: complete version-scoped coverage, output parity, manifest compatibility, and authorization/write-denial tests in an isolated test database.  
**Prediction impact:** verification infrastructure only.

Missing high-value regressions include both-league merging, future-data perturbation, half-time corrections, experiment isolation, run serialization, interrupted publication, stale-run refresh, and normal startup making no GitHub/import/pipeline calls.

## 13. Obsolete documentation / configuration inventory

**F24 — P3: Documentation and scaffold configuration describe several different systems.**  
**Location:** the files below and their configuration/architecture sections.  
**Evidence:** they contain obsolete project references, offline-first instructions, historical plans, or conflicting tooling declarations.  
**Risk:** future changes can reconnect the wrong project or implement stale architecture.  
**Action:** update the operational source-of-truth documents after the contracts are fixed; label historical material as archival.  
**Prediction impact:** documentation/tooling only.

| File or group | Verified issue |
|---|---|
| `src/docs/supabase-migration.md` | Names `oaadhaapbgzyibyadgdh`; declares localStorage authoritative and fallback configuration intentional |
| `docs/CLOUD_STATE_MACHINE.md` | Describes optional cloud/local degradation, not required run loading |
| `docs/SUPABASE_ERD.md` | Describes the older cloud schema |
| `public/newdocs/CONFIGURATION_REFERENCE.md` | References `wclutzbojatqtxwlvtab` |
| `public/newdocs/OPERATIONS_RUNBOOK.md` | References `wclutzbojatqtxwlvtab` |
| `public/newdocs/SYSTEM_AUDIT_2025-11.md` | References `wclutzbojatqtxwlvtab` |
| `lastinfo.md`, development plans, repository exports | Historical proposals and assertions; not proof of current behavior |
| `README.md` | Generic Magic Patterns template instructions |
| `.eslintrc.cjs` and `eslint.config.js` | Parallel configurations; flat configuration imports packages absent from root declared dependencies |
| Root and `src/package.json`; multiple lockfiles | Conflicting dependency/tooling declarations |
| Current `.gitignore` | Omits the generated engine-bundle rule claimed by the build-script comment |
| Tracked `dist/` | Historical build material; not used as architectural truth |

The inspected generated bundle contains both central and old project references, but that is an inventory observation—not evidence about the currently served website.

## 14. Files that must change

These are bounded changes tied to findings, not a proposed rewrite.

| Area | Files |
|---|---|
| Production state/read path | `src/App.tsx`, `src/contexts/WinmixContext.tsx`, `src/hooks/useWinmixEngine.ts`, cloud context/hook, `src/utils/supabaseTier.ts` |
| Configuration and keys | `src/utils/cloudConfig.ts`; reconcile or retire the unused generated client |
| Browser migration paths | `src/utils/cloudSync.ts`, `src/utils/remoteSeasons.ts`, `src/hooks/useOpsActions.ts`, operation controls |
| Engine deployment/security/output | `supabase/functions/winmix-engine/index.ts`, `winmix-ingest/index.ts`, server authorization helper, `supabase/config.toml`, `scripts/build-engine-core.mjs`, package deployment checks |
| Database contract | Add reconciled central-schema migrations under `supabase/migrations/`; regenerate `src/integrations/supabase/types.ts` |
| Proven integrity defects | `useWinmixEngine.ts`, `useOpsActions.ts`, `useRoundAnalysis.ts`, `pipeline.ts` fingerprints, `csv.ts` hashes |
| Ordering/scope | `fixtures.ts`, `roundAnalysis.ts`, relevant canonical ordering helpers |
| Serialization and traceability | `src/types/winmix.ts`, `forecastCore.ts` output adapter, `slip.ts`, `ledger.ts` |
| Diagnostics/types | `oracle.ts`, `pipelineCache.ts`, boundary schemas, type-check configuration |
| Verification | Five existing Vitest files as applicable, pure-suite integration, Supabase verification scripts |
| Operational documentation | Files identified in section 13 |

## 15. Files that must not change without a parity test

- **Forecast mathematics:** `forecastCore.ts`, `stats.ts`, `logistic.ts`, `constants.ts`, `decision.ts`.
- **Chronology and learning:** `pipeline.ts`, `fixtures.ts`, `roundAnalysis.ts`, `matchDate.ts`, checkpoint logic.
- **Weights and identity:** `autoWeights.ts`, `teams.ts`, CSV/JSON normalization and integrity helpers.
- **Selection behavior:** `patterns.ts`, `bttsProfile.ts`, `coreEligibility.ts`, `coreEvidence.ts`, `coreStrategy.ts`, `slip.ts`, marquee logic.
- **Calibration and feedback:** `marketEval.ts`, `ledger.ts`, `bootstrap.ts`, experimental branches.

For infrastructure-only changes, compare identical inputs, effective weights, ordering and versions, allowing only explicitly nondeterministic metadata such as timestamps and run IDs.

For proven corrections such as F1, parity should establish that changes are confined to the intended defect; forcing identical leaked outputs would be the wrong acceptance criterion.

## 16. Strict recommended implementation order

1. **Close privileged public write/execution paths.** Add server authorization; remove production browser auto-ingest.
2. **Fix central configuration.** Remove the old-project fallback and reject privileged browser keys.
3. **Reconcile the database contract.** Commit migrations, role policies, immutability rules, and claim/promotion definitions matching the central project.
4. **Define one complete run contract.** Include run/data/model/parameter identity, coverage, ordering, predictions, features and required diagnostic state.
5. **Establish reproducible checks.** Capture fixed-input numerical baselines and add the demonstrated failing regressions.
6. **Correct integrity defects.** Fix league merging, parameter-draft scope, checkpoint identities and stale analysis signatures.
7. **Resolve temporal correctness.** Establish time-valid weight policy and shared ordering/scope; isolate experiments. Version numerical changes separately.
8. **Complete and validate the server worker.** Typed serialization, version checks, bundle generation, resource measurement, interruption recovery and atomic promotion.
9. **Produce one verified baseline run.** Validate both league counts and output completeness before publication.
10. **Switch production startup to that run.** Preserve existing presentation; prohibit raw-data reimport and canonical browser recomputation.
11. **Complete versioned issuance/settlement before production live feedback.** Keep unsupported fixture generation explicitly diagnostic until a server-owned output path exists.
12. **Update tests and operational documentation.** Start new UI/model/feature work only after these boundaries are reliable.

**A. What is the single most important blocker?**

The missing production handoff: **there is no published completed engine run available to the browser, and no browser loader that consumes such a run as its authority.**

**B. Is Supabase already the real production source of truth, or only partially?**

**Only partially.** It demonstrably contains the sealed historical baseline. The application’s effective state, computations and ledger remain browser-owned.

**C. What prevents the UI from showing the 24,720 already-uploaded matches?**

The UI counts `useWinmixEngine.seasons`, not central database coverage. Existing local data skips cloud bootstrap; missing environment configuration selects the old project; empty-store bootstrap downloads everything and recomputes before committing, with one-shot failure handling.

The central read queries worked during this audit. No data re-upload is required. I cannot identify a particular deployed browser’s failing branch without its runtime configuration and error state. The missing engine run blocks the intended production path, while the legacy raw-data reader is demonstrably capable of reading central data.

**D. What is the smallest safe Phase 1 that makes the web application read a completed Supabase engine run?**

A central-only public read client that resolves one promoted successful run, pins its `run_id` and data version, loads validated paginated outputs and referenced match/season metadata, and supplies the existing UI through a read-only adapter.

Startup must bypass CSV conversion, imports, auto-weight application, upload synchronization and browser pipeline execution. Show explicit loading, no-run, failed-load and stale-run states. Preserve one validated prior run on refresh failure. This Phase 1 can display historical results; arbitrary new fixture generation remains outside it.

**E. Which changes are required before deploying `winmix-engine`?**

Server-caller authorization; reconciled database/RPC migrations; generated and checked engine bundle; validated model/schema contracts; corrected typed output serialization; complete required run state; time-valid parameter provenance; safe retry/lease/failure handling; atomic promotion; and a measured full-baseline resource/parity check.

Do not deploy the current handler unchanged.

**F. Which tests must be changed because they encode obsolete fallback behaviour?**

The four groups in `src/__tests__/cloudConfig.test.ts` at lines **36–45, 47–58, 60–63 and 65–70**. Replace fallback success with explicit invalid/unconfigured behavior.

Also give `supabaseTier.test.ts` and `cloudTier.e2e.test.tsx` explicit configuration fixtures; update the former’s obsolete REST-root probe expectation and the latter’s production local-mode fallback expectations.