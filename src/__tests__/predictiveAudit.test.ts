import { describe, expect, it } from 'vitest';
import { compareWalkForward, mineBttsFingerprints, type WalkForwardObservation } from '../utils/predictiveAudit';

const rows: WalkForwardObservation[] = Array.from({ length: 10 }, (_, index) => ({
  id: `m-${index}`,
  kickoffIso: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  season: index < 5 ? '2025/26' : '2026/27',
  league: index % 2 ? 'angol' : 'spanyol',
  currentProb: 0.55,
  predictiveProb: index >= 8 ? 0.9 : 0.55,
  outcome: index >= 8,
  coreRank: index < 3 ? ((index + 1) as 1 | 2 | 3) : null,
  top3: index < 3,
  fingerprint: index === 5 || index === 6 || index >= 8 ? ['H2H|MODEL|STABLE'] : [],
}));

describe('predictive audit', () => {
  it('evaluates only the chronological holdout and compares both rankers', () => {
    const result = compareWalkForward(rows, 0.2);
    expect(result.holdoutStart).toContain('2026-01-09');
    expect(result.current.n).toBe(2);
    expect(result.predictive.n).toBe(2);
    expect(result.predictive.brier).toBeLessThan(result.current.brier);
    expect(result.predictive.logLoss).toBeLessThan(result.current.logLoss);
    expect(result.predictive.byCoreRank['1'].n).toBe(0);
  });

  it('keeps fingerprint discovery separate from later validation', () => {
    const result = mineBttsFingerprints(rows, 2, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: 'H2H|MODEL|STABLE',
      discoveryN: 2,
      validationN: 2,
      productionCandidate: true,
    });
  });
});

