import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsert = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();
const mockOrder = vi.fn();

vi.mock('../integrations/supabase/client', () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      upsert: (rows: unknown, opts?: unknown) => {
        mockUpsert(table, rows, opts);
        return { error: null };
      },
      select: (cols: string) => {
        mockSelect(table, cols);
        return {
          order: (col: string, opts: unknown) => {
            mockOrder(col, opts);
            if (table === 'winmix_slips') {
              return { data: [{ id: 's1', round_name: 'R1', combined_prob: 0.5, core_strategy: null, veto_mode: null, rule_version: null, execution_path: null, spec_null_reason: null, created_at: '2026-01-01T00:00:00Z' }], error: null };
            }
            return { data: [{ id: 'l1', slip_id: 's1', role: 'btts_top', fixture_label: 'A-B', league: 'angol', type: 'goal_market', code: 'BTTS', label: 'BTTS', stability: 60, hit_rate: 0.7, sample: 10, decision: 'actionable', band: 'high', band_hit_rate: 0.65, band_calibrated: true, band_diagnosis: 'calibrated', ht_home: null, ht_away: null, ft_home: null, ft_away: null, evidence_level: 'calibrated', core_tier: 'primary', core_selection_rule_version: 'core-selection/2.8', head_to_head_record: null, goal_stats: null, ht_stats: null, top_modal_scores: null, reversal_stats: null, goal_profile: null, btts_risk: null, core_evidence: null }], error: null };
          },
        };
      },
      delete: () => ({
        eq: (col: string, val: string) => {
          mockDelete(table, col, val);
          return { error: null };
        },
      }),
    }),
  }),
}));

import { syncSlipsToCloud, loadSlipsFromCloud, deleteSlipFromCloud, SLIP_CLOUD_SYNC_ENABLED } from '../utils/slipCloudSync';
import type { Slip } from '../types/winmix';

const sampleSlip: Slip = {
  id: 's1',
  createdAt: '2026-01-01T00:00:00Z',
  roundName: 'R1',
  combinedProb: 0.5,
  lines: [{
    id: 'l1',
    role: 'btts_top',
    fixtureLabel: 'A-B',
    league: 'angol',
    type: 'goal_market',
    code: 'BTTS',
    label: 'BTTS',
    stability: 60,
    hitRate: 0.7,
    sample: 10,
    decision: 'actionable',
    band: 'high',
    bandHitRate: 0.65,
    bandCalibrated: true,
    bandDiagnosis: 'calibrated',
    htHome: null,
    htAway: null,
    ftHome: null,
    ftAway: null,
    headToHeadRecord: { homeWins: 5, draws: 2, awayWins: 3, total: 10, homeWinPct: 0.5, drawPct: 0.2, awayWinPct: 0.3, homeUnbeatenStreak: 0, awayUnbeatenStreak: 0 },
    goalStats: { avgGoals: 2.5, bttsPct: 0.7, over25Pct: 0.6, over15Pct: 0.8, over35Pct: 0.3 },
    htStats: null,
    topModalScores: [],
    reversalStats: null,
  }],
};

describe('slipCloudSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled by default', () => {
    expect(SLIP_CLOUD_SYNC_ENABLED).toBe(false);
  });

  it('no-ops when flag is off', async () => {
    const result = await syncSlipsToCloud([sampleSlip]);
    expect(result.synced).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('load returns null when flag is off', async () => {
    const result = await loadSlipsFromCloud();
    expect(result).toBeNull();
  });

  it('delete no-ops when flag is off', async () => {
    const errors = await deleteSlipFromCloud('s1');
    expect(errors).toEqual([]);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
