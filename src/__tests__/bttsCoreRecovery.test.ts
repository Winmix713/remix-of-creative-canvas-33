/**
 * BTTS CORE RECOVERY — 7-match fixture regression suite.
 *
 * Verifies the three changes from the BTTS Core gate fix plan:
 *  1. Policy A direction-aware: underconfident bands do NOT exclude.
 *  2. Quadrant relaxation is SHADOW only (flag=false) — live thresholds stay.
 *  3. Stability floor relaxation is SHADOW only (flag=false) — live floor stays.
 *
 * The shadow verdict must show which candidates WOULD have passed under the
 * relaxed thresholds, without changing actual Core placement.
 */

import { describe, expect, it } from 'vitest';
import { resolveCoreEvidence } from '../utils/coreEvidence';
import {
  BTTS_QUADRANT_RELAXED_ACTIVE,
  BTTS_RELAXED_THRESHOLDS,
  bttsShadowQuadrantOf,
  decisionQuadrantOf,
  SECONDARY_MARKET_THRESHOLDS } from
'../utils/decision';
import { evaluateBttsBandHealth } from '../utils/coreEligibility';
import {
  BTTS_STABILITY_RELAXED_ACTIVE,
  CORE_SELECTION_RULE_VERSION,
  computeBttsShadowVerdict,
  coreQualityFailures,
  effectiveDecisionOf,
  getBttsRankingScore,
  selectCoreSet } from
'../utils/slip';
import { CORE_STABILITY_MIN, CORE_STABILITY_MIN_SHADOW, BAND_MIN_SAMPLE } from '../utils/constants';
import { wilsonInterval } from '../utils/bootstrap';
import {
  MARKET_CALIBRATION_BANDS,
  diagnoseMarketBand } from
'../utils/decision';
import type {
  MarketCalibrationBand,
  MarketCalibrationBandKey,
  CoreEvidenceSnapshot,
  PatternHit } from
'../types/winmix';

function bandOf(key: MarketCalibrationBandKey, n: number, hits: number, avgP: number): MarketCalibrationBand {
  const spec = MARKET_CALIBRATION_BANDS.find((s) => s.key === key);
  const ci = wilsonInterval(hits, n);
  const evaluable = n >= BAND_MIN_SAMPLE;
  const diagnosis = diagnoseMarketBand(n, avgP, ci);
  const hitRate = n === 0 ? 0 : hits / n;
  return {
    key,
    label: spec?.label ?? key,
    range: spec?.label ?? key,
    n,
    hits,
    avgP,
    hitRate,
    gap: avgP - hitRate,
    ciLo: ci.lo,
    ciHi: ci.hi,
    calibrated: evaluable && diagnosis === 'calibrated',
    evaluable,
    diagnosis
  };
}

function makeBttsPattern(
  id: string,
  fixtureLabel: string,
  opts: {
    modelProb: number;
    hitRate: number;
    stability: number;
    marketConfidence: number;
    effectiveSampleSize?: number;
    bandKey?: MarketCalibrationBandKey;
    bandN?: number;
    bandHits?: number;
    bandAvgP?: number;
  }): PatternHit {
  const modelProb = opts.modelProb;
  const bandKey = opts.bandKey ?? 'p55_65';
  const bandN = opts.bandN ?? 6;
  const bandHits = opts.bandHits ?? 4;
  const bandAvgP = opts.bandAvgP ?? modelProb;

  const band = bandOf(bandKey, bandN, bandHits, bandAvgP);
  const snapshot: CoreEvidenceSnapshot = resolveCoreEvidence({
    registered: true,
    modelProb,
    marketBands: [band],
    globalBand: null
  });

  const confidence = opts.marketConfidence;
  const quadrant = decisionQuadrantOf(modelProb, confidence, SECONDARY_MARKET_THRESHOLDS);

  return {
    id,
    fixtureId: id,
    fixtureLabel,
    league: 'spanyol',
    type: 'goal_market',
    code: 'BTTS',
    label: 'Mindkét csapat szerez gólt',
    rawRate: opts.hitRate,
    hitRate: opts.hitRate,
    sample: 10,
    effectiveSampleSize: opts.effectiveSampleSize ?? 8.0,
    usedReverse: false,
    sufficiency: 'warm',
    agreement: 'neutral',
    stability: opts.stability,
    impliedOdds: 1 / modelProb,
    weightApplied: 1,
    decision: quadrant,
    marketConfidence: confidence,
    marketDecision: quadrant,
    band: 'good',
    bandHitRate: snapshot.hitRate,
    bandCalibrated: snapshot.level === 'calibrated',
    bandDiagnosis: snapshot.diagnosis,
    modelProb,
    marketBand: snapshot.bandKey,
    marketBandHitRate: snapshot.hitRate,
    marketBandCalibrated: snapshot.level === 'calibrated',
    marketBandDiagnosis: snapshot.diagnosis,
    marketCalibrationStatus:
    snapshot.level === 'calibrated' ? 'calibrated' :
    snapshot.level === 'excluded' ? 'uncalibrated' : 'unevaluated',
    coreEvidence: snapshot,
    evidence: [],
    headToHeadRecord: {
      homeWins: 3, draws: 3, awayWins: 3, total: 9,
      homeWinPct: 1 / 3, drawPct: 1 / 3, awayWinPct: 1 / 3,
      homeUnbeatenStreak: 2, awayUnbeatenStreak: 0
    },
    goalStats: {
      avgGoals: 3.0, bttsPct: opts.hitRate, over25Pct: 0.64,
      over15Pct: 0.84, over35Pct: 0.4
    },
    htStats: null,
    topModalScores: [],
    reversalStats: null,
    goalProfile: null,
    bttsRisk: null
  };
}

describe('BTTS Core Recovery — 7-match fixture', () => {
  // Seven La Liga fixtures from the round audit
  const girona = makeBttsPattern('girona-san-sebastian', 'Girona – San Sebastian', {
    modelProb: 0.736, hitRate: 0.736, stability: 57, marketConfidence: 57,
    bandKey: 'p65_75', bandN: 100, bandHits: 78, bandAvgP: 0.736
  });
  const vigo = makeBttsPattern('vigo-osasuna', 'Vigo – Osasuna', {
    modelProb: 0.62, hitRate: 0.62, stability: 68, marketConfidence: 62,
    bandKey: 'p55_65', bandN: 120, bandHits: 72, bandAvgP: 0.60
  });
  const villarreal = makeBttsPattern('villarreal-madrid', 'Villarreal – Madrid F.', {
    modelProb: 0.65, hitRate: 0.65, stability: 60, marketConfidence: 60,
    bandKey: 'p65_75', bandN: 80, bandHits: 52, bandAvgP: 0.65
  });
  const getafe = makeBttsPattern('madrid-getafe', 'Madrid F. – Getafe', {
    modelProb: 0.545, hitRate: 0.545, stability: 58, marketConfidence: 29,
    bandKey: 'p40_55', bandN: 6, bandHits: 4, bandAvgP: 0.545
  });
  const bilbao = makeBttsPattern('bilbao-villarreal', 'Bilbao – Villarreal', {
    modelProb: 0.549, hitRate: 0.549, stability: 54, marketConfidence: 26,
    bandKey: 'p40_55', bandN: 6, bandHits: 4, bandAvgP: 0.549
  });
  const valencia = makeBttsPattern('valencia-sevilla', 'Valencia – Sevilla', {
    modelProb: 0.55, hitRate: 0.55, stability: 56, marketConfidence: 28,
    bandKey: 'p40_55', bandN: 6, bandHits: 4, bandAvgP: 0.55
  });
  const osasuna = makeBttsPattern('osasuna-bilbao', 'Osasuna – Bilbao', {
    modelProb: 0.519, hitRate: 0.519, stability: 50, marketConfidence: 22,
    bandKey: 'p40_55', bandN: 671, bandHits: 228, bandAvgP: 0.519
  });

  const all = [girona, vigo, villarreal, getafe, bilbao, valencia, osasuna];

  describe('Policy A direction-aware (LIVE)', () => {
    it('Girona–San Sebastian: underconfident band → conditional, NOT excluded', () => {
      const snap = girona.coreEvidence!;
      expect(snap.level).not.toBe('excluded');
      // Underconfident: reality hits more often than signalled
      // The band should be conditional (direction-aware: not a refutation)
    });

    it('Osasuna–Bilbao: overconfident band → excluded (genuine refutation)', () => {
      const snap = osasuna.coreEvidence!;
      // 671 observations, 228 hits → hit rate ~34%, signalled ~52% → overconfident
      expect(snap.diagnosis).toBe('overconfident');
      expect(snap.level).toBe('excluded');
    });
  });

  describe('Shadow flags are OFF', () => {
    it('BTTS_QUADRANT_RELAXED_ACTIVE is false', () => {
      expect(BTTS_QUADRANT_RELAXED_ACTIVE).toBe(false);
    });

    it('BTTS_STABILITY_RELAXED_ACTIVE is false', () => {
      expect(BTTS_STABILITY_RELAXED_ACTIVE).toBe(false);
    });

    it('CORE_SELECTION_RULE_VERSION bumped to 2.8', () => {
      expect(CORE_SELECTION_RULE_VERSION).toBe('core-selection/2.8');
    });
  });

  describe('Live gate: effectiveDecisionOf uses live thresholds', () => {
    it('Madrid F.–Getafe (54.5%/29): live quadrant is ignore (below 58%/56)', () => {
      const q = effectiveDecisionOf(getafe);
      expect(q).toBe('ignore');
    });

    it('Bilbao–Villarreal (54.9%/26): live quadrant is ignore', () => {
      const q = effectiveDecisionOf(bilbao);
      expect(q).toBe('ignore');
    });

    it('Osasuna–Bilbao (51.9%/22): live quadrant is ignore', () => {
      const q = effectiveDecisionOf(osasuna);
      expect(q).toBe('ignore');
    });

    it('Girona (73.6%/57): live quadrant is actionable', () => {
      const q = effectiveDecisionOf(girona);
      expect(q).toBe('actionable');
    });
  });

  describe('Live gate: coreQualityFailures uses live stability floor (55)', () => {
    it('Bilbao–Villarreal (stability 54) fails stability at live floor', () => {
      const failures = coreQualityFailures(bilbao);
      expect(failures).toContain('stability');
    });

    it('Valencia–Sevilla (stability 56) passes stability at live floor', () => {
      const failures = coreQualityFailures(valencia);
      expect(failures).not.toContain('stability');
    });
  });

  describe('Shadow verdict: relaxed thresholds would recover three more', () => {
    it('Madrid F.–Getafe: shadow wouldPass=true (quadrant relaxation)', () => {
      const shadow = computeBttsShadowVerdict(getafe);
      expect(shadow).not.toBeNull();
      expect(shadow!.wouldPass).toBe(true);
      expect(shadow!.relaxedBy).toContain('quadrant');
    });

    it('Bilbao–Villarreal: shadow wouldPass=true (quadrant + stability)', () => {
      const shadow = computeBttsShadowVerdict(bilbao);
      expect(shadow).not.toBeNull();
      expect(shadow!.wouldPass).toBe(true);
      expect(shadow!.relaxedBy).toContain('quadrant');
      expect(shadow!.relaxedBy).toContain('stability');
    });

    it('Valencia–Sevilla: shadow wouldPass=true (quadrant relaxation)', () => {
      const shadow = computeBttsShadowVerdict(valencia);
      expect(shadow).not.toBeNull();
      expect(shadow!.wouldPass).toBe(true);
      expect(shadow!.relaxedBy).toContain('quadrant');
    });

    it('Osasuna–Bilbao: shadow wouldPass=false (quadrant still fails)', () => {
      const shadow = computeBttsShadowVerdict(osasuna);
      expect(shadow).not.toBeNull();
      // Osasuna: 51.9% < 54% even under relaxed pMin → still ignore
      expect(shadow!.wouldPass).toBe(false);
    });

    it('Girona: shadow is null-level (already passing, no relaxation needed)', () => {
      const shadow = computeBttsShadowVerdict(girona);
      expect(shadow).not.toBeNull();
      // Already passes live → relaxedBy is empty, wouldPass is false (no relaxation needed)
      expect(shadow!.wouldPass).toBe(false);
      expect(shadow!.relaxedBy).toHaveLength(0);
    });

    it('Non-BTTS pattern: shadow verdict is null', () => {
      const nonBtts: PatternHit = {
        ...girona, id: 'non-btts', code: 'O2.5' };
      expect(computeBttsShadowVerdict(nonBtts)).toBeNull();
    });
  });

  describe('Shadow quadrant uses relaxed thresholds', () => {
    it('bttsShadowQuadrantOf(0.545, 29) returns actionable or volatile', () => {
      const sq = bttsShadowQuadrantOf(0.545, 29);
      // pMin=0.54, cMin=25 → 54.5% >= 54% and 29 >= 25 → actionable
      expect(sq).toBe('actionable');
    });

    it('bttsShadowQuadrantOf(0.519, 22) returns ignore (below relaxed pMin)', () => {
      const sq = bttsShadowQuadrantOf(0.519, 22);
      // 51.9% < 54% → ignore even under relaxed
      expect(sq).toBe('ignore');
    });
  });

  describe('Stability shadow floor', () => {
    it('CORE_STABILITY_MIN_SHADOW is 52', () => {
      expect(CORE_STABILITY_MIN_SHADOW).toBe(52);
    });

    it('Bilbao (stability 54) passes shadow floor but not live floor', () => {
      expect(54 >= CORE_STABILITY_MIN_SHADOW).toBe(true);
      expect(54 < CORE_STABILITY_MIN).toBe(true);
    });
  });

  describe('Relaxed thresholds are strictly lower than live', () => {
    it('BTTS_RELAXED_THRESHOLDS.pMin < SECONDARY_MARKET_THRESHOLDS.pMin', () => {
      expect(BTTS_RELAXED_THRESHOLDS.pMin).toBeLessThan(SECONDARY_MARKET_THRESHOLDS.pMin);
    });

    it('BTTS_RELAXED_THRESHOLDS.cMin < SECONDARY_MARKET_THRESHOLDS.cMin', () => {
      expect(BTTS_RELAXED_THRESHOLDS.cMin).toBeLessThan(SECONDARY_MARKET_THRESHOLDS.cMin);
    });
  });

  describe('0..3 Core invariant — no force fill', () => {
    it('returns empty array (Core 0) when candidate list is empty', () => {
      const picks = selectCoreSet([], 3);
      expect(picks).toHaveLength(0);
    });

    it('returns empty array (Core 0) when all candidates are blocked by hard gates', () => {
      const blockedCandidate: PatternHit = {
        ...osasuna,
        id: 'blocked-elche',
        fixtureId: 'f-elche',
        modelProb: 0.38, // < 40% absolute gate
        decision: 'ignore',
      };
      const picks = selectCoreSet([blockedCandidate], 3);
      expect(picks).toHaveLength(0);
    });

    it('returns exactly available valid count without attempting to force fill to 3', () => {
      const singleWinner = selectCoreSet([girona], 3);
      expect(singleWinner).toHaveLength(1);
      expect(singleWinner[0].id).toBe('girona-san-sebastian');
    });

    it('never exceeds slots limit even with many candidates', () => {
      const picks = selectCoreSet(all, 2);
      expect(picks.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Red veto — refuted evidence band cannot receive goldmine bonus', () => {
    it('refuted band with modelProb >= 0.58 gets -100 penalty, NOT +25 bonus', () => {
      const evalResult = evaluateBttsBandHealth('40–55%', 0.63, 0.60, 'excluded');
      expect(evalResult.isExcluded).toBe(true);
      expect(evalResult.priorityBonus).toBe(-100);
      expect(evalResult.reason).toContain('Cáfolt sáv');
    });

    it('unrefuted band with modelProb >= 0.58 gets +25 goldmine bonus', () => {
      const evalResult = evaluateBttsBandHealth('55–65%', 0.63, 0.60, 'calibrated');
      expect(evalResult.isExcluded).toBe(false);
      expect(evalResult.priorityBonus).toBe(25);
    });

    it('getBttsRankingScore severely demotes refuted candidates', () => {
      const scoreRefuted = getBttsRankingScore({
        modelProb: 0.63,
        hitRate: 0.60,
        confidence: 60,
        band: '40–55%',
        evidenceLevel: 'excluded',
      });
      const scoreNormal = getBttsRankingScore({
        modelProb: 0.63,
        hitRate: 0.60,
        confidence: 60,
        band: '55–65%',
        evidenceLevel: 'calibrated',
      });
      expect(scoreRefuted).toBeLessThan(scoreNormal);
      // Difference between +25 * 0.5 and -100 * 0.5 is 62.5 points
      expect(scoreNormal - scoreRefuted).toBeCloseTo(62.5);
    });
  });
});
