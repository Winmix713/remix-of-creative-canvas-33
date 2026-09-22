// @ts-nocheck
// WinMix Central Engine: protected Edge Function, invoked by a server scheduler.
// The browser never sends source matches or asks the model to recompute.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeLeaguePipeline } from '../_shared/engine-core.bundle.ts';
import { requireWinmixServerAuthorization } from '../_shared/winmix-server-auth.ts';

const LEAGUES = ['angol', 'spanyol'] as const;
const ENGINE_VERSION = 'winmix-edge-engine-1.0.0';
const INSERT_CHUNK_SIZE = 400;

// F11 fix: the engine must reject snapshots whose contract versions don't
// match the code actually executing. These are the canonical constants from
// src/utils/constants.ts — duplicated here because the edge function imports
// the bundled engine, not the source constants.
const EXPECTED_FEATURE_SCHEMA_VERSION = 2;
const EXPECTED_PIPELINE_CONTRACT_VERSION = 5;
const EXPECTED_MODEL_VERSION = 'winmix-core-v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, X-Winmix-Server-Secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function finite(value: unknown, fallback: number | null = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function insertChunks(client: any, table: string, rows: Record<string, unknown>[]) {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    const { error } = await client.from(table).insert(rows.slice(start, start + INSERT_CHUNK_SIZE));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function fetchAllMatches(admin: any, dataVersionId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('winmix_matches')
      .select(`
        id, season_id, league, match_no, source_file_id, row_index, kickoff_iso,
        match_date_raw, ht_home_score, ht_away_score, home_score, away_score,
        home:winmix_teams!winmix_matches_home_team_id_fkey(display_name),
        away:winmix_teams!winmix_matches_away_team_id_fkey(display_name),
        season:winmix_seasons!winmix_matches_season_id_fkey(
          id, league, season_index, name, file_name, content_hash, match_count,
          order_mode, created_at
        )
      `)
      .eq('data_version_id', dataVersionId)
      .order('season_id', { ascending: true })
      .order('match_no', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Source match read: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function buildSeasons(rows: any[]) {
  const bySeason = new Map<string, any>();
  const matchIdByIdentity = new Map<string, string>();

  for (const row of rows) {
    const source = row.season;
    if (!source || !row.home?.display_name || !row.away?.display_name) {
      throw new Error(`Invalid relational source row: ${row.id}`);
    }
    let season = bySeason.get(row.season_id);
    if (!season) {
      season = {
        id: source.id,
        league: source.league,
        seasonIndex: source.season_index,
        name: source.name,
        fileName: source.file_name,
        createdAt: source.created_at,
        contentHash: source.content_hash,
        countWarning: source.match_count !== 240,
        actualMatchCount: source.match_count,
        orderMode: source.order_mode,
        datedMatchCount: 0,
        matches: [],
      };
      bySeason.set(row.season_id, season);
    }
    if (row.kickoff_iso) season.datedMatchCount += 1;
    const match = {
      match_no: row.match_no,
      date: row.match_date_raw ?? '',
      kickoffIso: row.kickoff_iso,
      rowIndex: row.row_index ?? undefined,
      sourceFileId: row.source_file_id ?? undefined,
      home_team: row.home.display_name,
      away_team: row.away.display_name,
      ht_home_score: row.ht_home_score,
      ht_away_score: row.ht_away_score,
      home_score: row.home_score,
      away_score: row.away_score,
      total_goals: row.home_score + row.away_score,
      btts: row.home_score > 0 && row.away_score > 0,
      outcome: row.home_score > row.away_score ? 'H' : row.home_score < row.away_score ? 'A' : 'D',
    };
    season.matches.push(match);
    matchIdByIdentity.set(`${row.season_id}:${row.match_no}`, row.id);
  }
  return { seasons: [...bySeason.values()], matchIdByIdentity };
}

function outputsOf(result: any, matchIdByIdentity: Map<string, string>, sequenceOffset: number) {
  const features: Record<string, unknown>[] = [];
  const predictions: Record<string, unknown>[] = [];
  let sequence = sequenceOffset;

  for (const season of result.seasons) {
    for (const match of season.matches) {
      const pipeline = match.pipeline;
      if (!pipeline) throw new Error(`Pipeline did not score ${season.id}:${match.match_no}`);
      const matchId = matchIdByIdentity.get(`${season.id}:${match.match_no}`);
      if (!matchId) throw new Error(`No database identity for ${season.id}:${match.match_no}`);
      sequence += 1;
      features.push({
        match_id: matchId,
        sequence_no: sequence,
        feature_schema_version: 2,
        features: pipeline.features,
      });
      predictions.push({
        match_id: matchId,
        outcome_home: pipeline.calibrated.home,
        outcome_draw: pipeline.calibrated.draw,
        outcome_away: pipeline.calibrated.away,
        lambda_home: finite(pipeline.lambdas?.home),
        lambda_away: finite(pipeline.lambdas?.away),
        confidence: finite(pipeline.confidence),
        recommendation: {
          code: pipeline.recommendation,
          decision: pipeline.decision,
          caveat: pipeline.caveat,
          confidenceLabel: pipeline.confidenceLabel,
        },
        markets: pipeline.secondary,
        model_output: {
          b0: pipeline.b0,
          b1: pipeline.b1,
          m1: pipeline.m1,
          ensRaw: pipeline.ensRaw,
          calibrated: pipeline.calibrated,
          calibratedT: pipeline.calibratedT,
          m1Source: pipeline.m1Source,
          ensembleWM1: pipeline.ensembleWM1,
          priorDivergence: pipeline.priorDivergence,
          reconciliation: pipeline.reconciliation,
        },
      });
    }
  }
  return { features, predictions, sequence };
}

async function failRun(admin: any, job: any, runId: string | null, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (runId) {
    await admin.from('winmix_engine_runs').update({
      status: 'failed', finished_at: new Date().toISOString(), error_code: 'ENGINE_FAILURE', error_message: message,
    }).eq('id', runId);
  }
  await admin.from('winmix_engine_jobs').update({
    status: 'failed', finished_at: new Date().toISOString(), last_error_code: 'ENGINE_FAILURE', last_error_message: message,
  }).eq('id', job.id);
  return message;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const authError = await requireWinmixServerAuthorization(request);
  if (authError) return authError;

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceRoleKey) return json({ error: 'Missing Supabase server configuration' }, 500);
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const worker = `edge:${crypto.randomUUID()}`;
  const { data: job, error: claimError } = await admin.rpc('winmix_claim_next_engine_job', { p_worker: worker });
  if (claimError) return json({ error: `Job claim failed: ${claimError.message}` }, 500);
  if (!job) return json({ status: 'idle', message: 'No queued WinMix engine job.' });

  let runId: string | null = null;
  const started = Date.now();
  try {
    const { data: snapshot, error: snapshotError } = await admin
      .from('winmix_parameter_snapshots')
      .select('id, data_version_id, model_version, feature_schema_version, pipeline_contract_version, history_scope, experiments, weights, parameters_fingerprint')
      .eq('id', job.parameter_snapshot_id).single();
    if (snapshotError || !snapshot) throw new Error(`Parameter snapshot unavailable: ${snapshotError?.message ?? 'missing'}`);
    if (snapshot.data_version_id !== job.data_version_id) throw new Error('Job and parameter snapshot refer to different data versions.');

    // F11 fix: enforce that the snapshot's contract versions match the engine's
    // actual code. A mismatch means the run would claim a contract different
    // from what was executed.
    if (snapshot.feature_schema_version !== EXPECTED_FEATURE_SCHEMA_VERSION) {
      throw new Error(`Feature schema mismatch: snapshot=${snapshot.feature_schema_version}, engine=${EXPECTED_FEATURE_SCHEMA_VERSION}`);
    }
    if (snapshot.pipeline_contract_version !== EXPECTED_PIPELINE_CONTRACT_VERSION) {
      throw new Error(`Pipeline contract mismatch: snapshot=${snapshot.pipeline_contract_version}, engine=${EXPECTED_PIPELINE_CONTRACT_VERSION}`);
    }
    if (snapshot.model_version && snapshot.model_version !== EXPECTED_MODEL_VERSION) {
      throw new Error(`Model version mismatch: snapshot=${snapshot.model_version}, engine=${EXPECTED_MODEL_VERSION}`);
    }

    const { data: version, error: versionError } = await admin
      .from('winmix_data_versions')
      .select('id, status, content_fingerprint, season_count, match_count')
      .eq('id', job.data_version_id).single();
    if (versionError || !version || version.status !== 'sealed') throw new Error('The requested data version is not sealed.');

    const inputFingerprint = `${version.content_fingerprint}:${snapshot.parameters_fingerprint}`;
    const { data: run, error: runError } = await admin.from('winmix_engine_runs').insert({
      job_id: job.id, data_version_id: job.data_version_id, parameter_snapshot_id: snapshot.id,
      engine_version: ENGINE_VERSION, status: 'running', input_fingerprint: inputFingerprint,
    }).select('id').single();
    if (runError || !run) throw new Error(`Run creation failed: ${runError?.message ?? 'missing'}`);
    runId = run.id;

    const sourceRows = await fetchAllMatches(admin, job.data_version_id);
    if (sourceRows.length !== version.match_count) throw new Error(`Source integrity mismatch: expected ${version.match_count}, read ${sourceRows.length}.`);
    const { seasons, matchIdByIdentity } = buildSeasons(sourceRows);
    const calibrationRows: Record<string, unknown>[] = [];
    let sequence = 0;

    for (const league of LEAGUES) {
      const weights = snapshot.weights?.[league] ?? {};
      const result = await computeLeaguePipeline({
        seasons, league, weights,
        historyScope: snapshot.history_scope,
        experiments: snapshot.experiments ?? { dixonColes: false, glicko2: false },
        checkpoint: null, forceFullRebuild: true,
      });
      const output = outputsOf(result, matchIdByIdentity, sequence);
      sequence = output.sequence;
      await insertChunks(admin, 'winmix_match_features', output.features.map((row) => ({ ...row, run_id: runId })));
      await insertChunks(admin, 'winmix_predictions', output.predictions.map((row) => ({ ...row, run_id: runId })));
      for (const report of Object.values(result.calibration.markets ?? {})) {
        calibrationRows.push({
          run_id: runId, league, market_code: report.market, sample_count: report.n,
          brier: report.brier, log_loss: report.logLoss, ece: report.ece, metrics: report,
        });
      }
    }
    await insertChunks(admin, 'winmix_calibration_results', calibrationRows);

    // F12 fix: promote atomically BEFORE marking succeeded. The old code wrote
    // status='succeeded' first, then called the promotion RPC — if promotion
    // failed, the run was already marked successful with no published output.
    const durationMs = Date.now() - started;
    const { error: promoteError } = await admin.rpc('winmix_promote_engine_run', { p_run_id: runId });
    if (promoteError) throw new Error(`Run promotion failed: ${promoteError.message}`);
    const { error: successError } = await admin.from('winmix_engine_runs').update({
      status: 'succeeded', finished_at: new Date().toISOString(), duration_ms: durationMs,
      result_summary: { sourceMatches: sourceRows.length, predictions: sequence, calibrationRows: calibrationRows.length },
    }).eq('id', runId);
    if (successError) throw new Error(`Run completion write failed: ${successError.message}`);
    return json({ status: 'succeeded', runId, predictions: sequence, durationMs });
  } catch (error) {
    const message = await failRun(admin, job, runId, error);
    return json({ status: 'failed', jobId: job.id, error: message }, 500);
  }
});

