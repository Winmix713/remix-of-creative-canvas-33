import { describe, expect, it } from 'vitest';
import { compareCoverage, defineBttsTarget, evaluateBttsModels, fitIsotonic, fitPlatt, isProductionCandidate } from '../utils/bttsAudit';

const rows = Array.from({ length: 40 }, (_, index) => ({ id: String(index), kickoffIso: `2026-01-${String(index + 1).padStart(2, '0')}`, season: '2025/26', league: index % 2 ? 'angol' : 'spanyol', bttsProbability: index % 4 === 0 ? 0.75 : 0.35, bttsOutcome: index % 4 === 0, h2h: 0.5, modelGap: 0, stability: 0.7, modelAgreement: 0.7 }));

describe('BTTS audit layer', () => {
  it('maps BTTS independently from 1X2 fields', () => {
    const target = defineBttsTarget([{ btts_probability: 0.6, btts_outcome: true, pHome: 0.7, pAway: 0.2 }]);
    expect(target.probabilityField).toBe('btts_probability');
    expect(target.outcomeField).toBe('btts_outcome');
    expect(target.oneXTwoProbabilityFields).toEqual(['pHome', 'pAway']);
  });
  it('fits train-only calibration functions', () => {
    expect(fitPlatt([0.2, 0.8], [false, true]).predict(0.8)).toBeGreaterThan(0.5);
    expect(fitIsotonic([0.2, 0.8], [false, true]).predict(0.8)).toBeGreaterThan(0.5);
  });
  it('evaluates models on chronological test data and exposes coverage', () => {
    const results = evaluateBttsModels(rows);
    expect(results).toHaveLength(7);
    expect(results[0].n).toBe(12);
    expect(compareCoverage(rows)).toHaveLength(6);
  });
  it('requires all primary metrics to preserve promotion safety', () => {
    const results = evaluateBttsModels(rows, 'none');
    expect(isProductionCandidate(results[0], results[1])).toBe(true);
    expect(isProductionCandidate(results[0], { ...results[1], ece: results[0].ece + 0.1 })).toBe(false);
  });
});
