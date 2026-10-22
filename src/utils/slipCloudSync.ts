/**
 * slipCloudSync — cloud mirror for slips and their lines.
 *
 * Behind the SLIP_CLOUD_SYNC feature flag (default OFF). localStorage stays
 * the source of truth; this layer writes an additional copy to Supabase so
 * slips survive a browser reset and are queryable in the ledger.
 *
 * Idempotent upserts by stable client-generated ids. Offline-safe: errors
 * are swallowed and logged, never thrown to the caller.
 */

import { getSupabase } from '../integrations/supabase/client';
import type { Slip, SlipLine } from '../types/winmix';

export const SLIP_CLOUD_SYNC_ENABLED = false;

interface SlipRow {
  id: string;
  round_name: string;
  combined_prob: number;
  core_strategy: string | null;
  veto_mode: string | null;
  rule_version: string | null;
  execution_path: string | null;
  spec_null_reason: string | null;
  created_at: string;
}

interface SlipLineRow {
  id: string;
  slip_id: string;
  role: string;
  fixture_label: string;
  league: string;
  type: string;
  code: string;
  label: string;
  stability: number;
  hit_rate: number;
  sample: number;
  decision: string | null;
  band: string | null;
  band_hit_rate: number | null;
  band_calibrated: boolean | null;
  band_diagnosis: string | null;
  ht_home: number | null;
  ht_away: number | null;
  ft_home: number | null;
  ft_away: number | null;
  evidence_level: string | null;
  core_tier: string | null;
  core_selection_rule_version: string | null;
  head_to_head_record: unknown;
  goal_stats: unknown;
  ht_stats: unknown;
  top_modal_scores: unknown;
  reversal_stats: unknown;
  goal_profile: unknown;
  btts_risk: unknown;
  core_evidence: unknown;
}

function toSlipRow(slip: Slip): SlipRow {
  return {
    id: slip.id,
    round_name: slip.roundName,
    combined_prob: slip.combinedProb,
    core_strategy: slip.coreStrategy ?? null,
    veto_mode: slip.vetoMode ?? null,
    rule_version: slip.ruleVersion ?? null,
    execution_path: slip.executionPath ?? null,
    spec_null_reason: slip.specNullReason ?? null,
    created_at: slip.createdAt,
  };
}

function toSlipLineRow(slipId: string, line: SlipLine): SlipLineRow {
  return {
    id: line.id,
    slip_id: slipId,
    role: line.role,
    fixture_label: line.fixtureLabel,
    league: line.league,
    type: line.type,
    code: line.code,
    label: line.label,
    stability: line.stability,
    hit_rate: line.hitRate,
    sample: line.sample,
    decision: line.decision ?? null,
    band: line.band ?? null,
    band_hit_rate: line.bandHitRate ?? null,
    band_calibrated: line.bandCalibrated ?? null,
    band_diagnosis: line.bandDiagnosis ?? null,
    ht_home: line.htHome,
    ht_away: line.htAway,
    ft_home: line.ftHome,
    ft_away: line.ftAway,
    evidence_level: line.evidenceLevel ?? null,
    core_tier: line.coreTier ?? null,
    core_selection_rule_version: line.coreSelectionRuleVersion ?? null,
    head_to_head_record: line.headToHeadRecord ?? null,
    goal_stats: line.goalStats ?? null,
    ht_stats: line.htStats ?? null,
    top_modal_scores: line.topModalScores ?? null,
    reversal_stats: line.reversalStats ?? null,
    goal_profile: line.goalProfile ?? null,
    btts_risk: line.bttsRisk ?? null,
    core_evidence: line.coreEvidence ?? null,
  };
}

export interface SlipSyncResult {
  synced: number;
  errors: string[];
}

/**
 * Upsert a batch of slips (and their lines) to the cloud mirror.
 * Errors are collected, never thrown. Returns a summary.
 */
export async function syncSlipsToCloud(slips: Slip[]): Promise<SlipSyncResult> {
  if (!SLIP_CLOUD_SYNC_ENABLED) return { synced: 0, errors: [] };
  if (slips.length === 0) return { synced: 0, errors: [] };

  const errors: string[] = [];
  let synced = 0;

  try {
    const sb = getSupabase();
    const slipRows = slips.map(toSlipRow);
    const { error: slipErr } = await sb
      .from('winmix_slips')
      .upsert(slipRows, { onConflict: 'id' });

    if (slipErr) {
      errors.push(`slips upsert: ${slipErr.message}`);
      return { synced: 0, errors };
    }

    const lineRows: SlipLineRow[] = [];
    for (const slip of slips) {
      for (const line of slip.lines) {
        lineRows.push(toSlipLineRow(slip.id, line));
      }
    }

    if (lineRows.length > 0) {
      const { error: lineErr } = await sb
        .from('winmix_slip_lines')
        .upsert(lineRows, { onConflict: 'id' });

      if (lineErr) {
        errors.push(`slip_lines upsert: ${lineErr.message}`);
        return { synced: 0, errors };
      }
    }

    synced = slips.length;
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return { synced, errors };
}

/**
 * Load all slips (and their lines) from the cloud mirror.
 * Returns null if the flag is off or an error occurs.
 */
export async function loadSlipsFromCloud(): Promise<Slip[] | null> {
  if (!SLIP_CLOUD_SYNC_ENABLED) return null;

  try {
    const sb = getSupabase();
    const { data: slipRows, error: slipErr } = await sb
      .from('winmix_slips')
      .select('*')
      .order('created_at', { ascending: true });

    if (slipErr || !slipRows) return null;

    const { data: lineRows, error: lineErr } = await sb
      .from('winmix_slip_lines')
      .select('*')
      .order('id');

    if (lineErr || !lineRows) return null;

    const linesBySlip = new Map<string, SlipLineRow[]>();
    for (const row of lineRows as SlipLineRow[]) {
      const arr = linesBySlip.get(row.slip_id) ?? [];
      arr.push(row);
      linesBySlip.set(row.slip_id, arr);
    }

    return (slipRows as SlipRow[]).map((row) => {
      const lines = linesBySlip.get(row.id) ?? [];
      return {
        id: row.id,
        createdAt: row.created_at,
        roundName: row.round_name,
        combinedProb: row.combined_prob,
        coreStrategy: (row.core_strategy ?? undefined) as Slip['coreStrategy'],
        vetoMode: (row.veto_mode ?? undefined) as Slip['vetoMode'],
        ruleVersion: (row.rule_version ?? undefined) as Slip['ruleVersion'],
        executionPath: (row.execution_path ?? undefined) as Slip['executionPath'],
        specNullReason: (row.spec_null_reason ?? undefined) as Slip['specNullReason'],
        lines: lines.map((l) => ({
          id: l.id,
          role: l.role as SlipLine['role'],
          fixtureLabel: l.fixture_label,
          league: l.league as SlipLine['league'],
          type: l.type as SlipLine['type'],
          code: l.code,
          label: l.label,
          stability: l.stability,
          hitRate: l.hit_rate,
          sample: l.sample,
          decision: (l.decision ?? undefined) as SlipLine['decision'],
          band: (l.band ?? undefined) as SlipLine['band'],
          bandHitRate: l.band_hit_rate ?? null,
          bandCalibrated: l.band_calibrated ?? undefined,
          bandDiagnosis: (l.band_diagnosis ?? undefined) as SlipLine['bandDiagnosis'],
          htHome: l.ht_home,
          htAway: l.ht_away,
          ftHome: l.ft_home,
          ftAway: l.ft_away,
          headToHeadRecord: l.head_to_head_record as SlipLine['headToHeadRecord'],
          goalStats: l.goal_stats as SlipLine['goalStats'],
          htStats: (l.ht_stats ?? null) as SlipLine['htStats'],
          topModalScores: l.top_modal_scores as SlipLine['topModalScores'],
          reversalStats: (l.reversal_stats ?? null) as SlipLine['reversalStats'],
          goalProfile: (l.goal_profile ?? null) as SlipLine['goalProfile'],
          bttsRisk: (l.btts_risk ?? null) as SlipLine['bttsRisk'],
          coreEvidence: (l.core_evidence ?? null) as SlipLine['coreEvidence'],
          evidenceLevel: (l.evidence_level ?? undefined) as SlipLine['evidenceLevel'],
          coreTier: (l.core_tier ?? null) as SlipLine['coreTier'],
          coreSelectionRuleVersion: (l.core_selection_rule_version ?? null) as SlipLine['coreSelectionRuleVersion'],
        })),
      };
    });
  } catch {
    return null;
  }
}

/**
 * Delete a slip and its lines from the cloud mirror.
 * Errors are swallowed and logged.
 */
export async function deleteSlipFromCloud(slipId: string): Promise<string[]> {
  if (!SLIP_CLOUD_SYNC_ENABLED) return [];
  const errors: string[] = [];
  try {
    const sb = getSupabase();
    const { error } = await sb.from('winmix_slips').delete().eq('id', slipId);
    if (error) errors.push(error.message);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }
  return errors;
}
