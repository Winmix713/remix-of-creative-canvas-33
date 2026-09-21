import { describe, expect, it } from 'vitest';
import { computeCoreScore } from '../utils/coreScore';
import { evaluateBacktest } from '../utils/backtest/metrics';
import { walkForwardWindows } from '../utils/backtest/walkForward';
import { mineFingerprintHypotheses } from '../utils/mining/fingerprint';

describe('remaining WinMix phases', () => {
  it('keeps excluded evidence at a hard zero score', () => {
    expect(computeCoreScore({ calibratedProbability: 0.95, evidenceLevel: 'excluded', evidenceSampleSize: 50 }).predictiveScore).toBe(0);
    expect(computeCoreScore({ calibratedProbability: 0.7, evidenceLevel: 'calibrated', evidenceSampleSize: 20 }).predictiveScore).toBeGreaterThan(0.7);
  });

  it('creates deterministic chronological evaluation windows', () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({ id: String(index), kickoffIso: `2026-01-0${index + 1}`, season: '26', league: 'angol', currentProbability: 0.5, predictiveProbability: index % 2 ? 0.9 : 0.1, outcome: index % 2 === 1 }));
    expect(walkForwardWindows(rows.reverse(), 2).map((window) => window.start)).toEqual(['2026-01-01', '2026-01-03']);
    expect(evaluateBacktest(rows, (row) => row.predictiveProbability).n).toBe(4);
  });

  it('keeps mining hypotheses isolated from production decisions', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ outcome: index % 2 === 0, predictiveProbability: index % 2 === 0 ? 0.8 : 0.2, fingerprint: index % 2 === 0 ? ['stable|h2h'] : [] }));
    const result = mineFingerprintHypotheses(rows, 6);
    expect(result[0].status).toBe('HYPOTHESIS');
    expect(result[0].key).toBe('stable|h2h');
  });
});
