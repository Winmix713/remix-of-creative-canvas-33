import { describe, expect, it } from 'vitest';
import {
  TARGET_DEFINITION,
  auditLeakage,
  buildCoverage,
  calibratePlatt,
  compareModels,
  csvToResearchRows,
  productionVerdict,
  runValidation,
  validateNoVetoOverride,
} from '../utils/researchValidation';

const rows = Array.from({ length: 24 }, (_, index) => ({
  id: `fixture-${index}`,
  kickoffIso: `2025-01-${String(index + 1).padStart(2, '0')}`,
  season: '2024/25',
  league: index % 2 ? 'england' : 'spain',
  bttsProbability: 0.35 + (index % 5) * 0.1,
  outcomeBtts: index % 3 !== 0,
  h2hSignal: index % 2,
}));

describe('research validation harness', () => {
  it('locks the target definition to joint BTTS and settled outcomes', () => {
    expect(TARGET_DEFINITION.bttsProbabilityField).toContain('joint score-matrix');
    expect(TARGET_DEFINITION.realisedOutcomeField).toContain('home_score');
  });

  it('flags post-match fields and retains pre-match fields', () => {
    expect(auditLeakage(['h2hSignal', 'home_score'])).toEqual([
      expect.objectContaining({ field: 'h2hSignal', status: 'SAFE' }),
      expect.objectContaining({ field: 'home_score', status: 'LEAKAGE' }),
    ]);
  });

  it('produces deterministic calibration and coverage outputs', () => {
    const calibrator = calibratePlatt(rows.slice(0, 16), (row) => row.bttsProbability);
    expect(calibrator(rows[16])).toBeGreaterThan(0);
    expect(calibrator(rows[16])).toBeLessThan(1);
    expect(buildCoverage(rows)).toHaveLength(6);
    expect(compareModels(rows)).toHaveLength(6);
    expect(runValidation(rows).status).toBe('EXPERIMENTAL');
  });

  it('never accepts a veto override regression', () => {
    expect(validateNoVetoOverride('excluded evidence is terminal hard veto')).toBe(true);
    expect(validateNoVetoOverride('excluded may override when probability >= 0.58')).toBe(false);
  });

  it('only promotes a leakage-free untouched holdout candidate', () => {
    const metrics = { n: 120, brier: 0.12, logLoss: 0.3, ece: 0.03, slope: 1, intercept: 0 };
    expect(productionVerdict({ baseline: { ...metrics, brier: 0.2, logLoss: 0.5 }, candidate: metrics, leakageFree: true, vetoSemanticsUnchanged: true, holdoutUntouched: true, multiWindowImprovement: true })).toBe('PRODUCTION CANDIDATE');
    expect(productionVerdict({ baseline: metrics, candidate: metrics, leakageFree: false, vetoSemanticsUnchanged: true, holdoutUntouched: true, multiWindowImprovement: true })).toBe('REJECTED');
  });

  it('parses the supplied fixture without inventing a positive probability', () => {
    const parsed = csvToResearchRows('date,home_team,away_team,home_score,away_score\n2025-01-01,A,B,1,1');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].outcomeBtts).toBe(true);
    expect(parsed[0].bttsProbability).toBe(0.5);
  });
});
