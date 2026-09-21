import { describe, expect, it } from 'vitest';
import {
  evaluateBttsBandHealth,
  isBttsEligibleForCore,
} from '../utils/coreEligibility';

describe('Policy A and gate/rank separation', () => {
  it.each([
    { label: 'Elche–Real Madrid', modelProb: 0.62, band: '55–65%' },
    { label: 'Wolverhampton–Newcastle', modelProb: 0.424, band: '40–55%' },
    { label: 'Real Madrid–Getafe', modelProb: 0.598, band: '55–65%' },
  ])('$label: excluded evidence is a terminal hard veto', ({ modelProb, band }) => {
    const result = isBttsEligibleForCore({
      modelProb,
      hitRate: 0.66,
      band,
      evidenceLevel: 'excluded',
    });

    expect(result.eligible).toBe(false);
    expect(result.state).toBe('BLOCKED');
    expect(result.reason).toBe('evidence_refuted');
    expect(result.shadowWouldFail).toBe(true);
  });

  it('keeps the 55–65% condition as ranking-only bonus', () => {
    expect(evaluateBttsBandHealth('55–65%', 0.6, 0.55)).toMatchObject({
      isExcluded: false,
      priorityBonus: 25,
    });

    expect(evaluateBttsBandHealth('55–65%', 0.6, 0.54)).toMatchObject({
      isExcluded: false,
      priorityBonus: 0,
    });

    expect(evaluateBttsBandHealth('40–55%', 0.6, 0.8)).toMatchObject({
      isExcluded: false,
      priorityBonus: 0,
    });
  });
});
