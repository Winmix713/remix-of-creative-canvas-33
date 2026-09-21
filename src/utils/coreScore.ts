import type { CoreEvidenceLevel } from '../types/winmix';

export interface CoreScoreInput {
  calibratedProbability: number;
  evidenceLevel: CoreEvidenceLevel;
  evidenceSampleSize: number;
  evidenceRequired?: number;
  wilsonDistance?: number | null;
  uncertainty?: number;
  risk?: number;
}

export interface CoreScoreBreakdown {
  predictiveScore: number;
  probability: number;
  evidenceAdjustment: number;
  uncertaintyAdjustment: number;
  riskAdjustment: number;
  components: { probability: number; evidence: number; uncertainty: number; risk: number };
}

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** Deterministic, bounded score for eligible candidates. Excluded evidence is never scored. */
export function computeCoreScore(input: CoreScoreInput): CoreScoreBreakdown {
  const probability = clamp(input.calibratedProbability);
  const sample = Math.max(0, input.evidenceSampleSize);
  const required = Math.max(1, input.evidenceRequired ?? 20);
  const evidenceStrength = clamp(sample / required);
  const distance = clamp(input.wilsonDistance ?? 0);
  const evidenceAdjustment = input.evidenceLevel === 'calibrated'
    ? 0.12 * evidenceStrength * (1 - distance)
    : input.evidenceLevel === 'conditional'
      ? -0.04 * (1 - evidenceStrength)
      : -1;
  const uncertaintyAdjustment = -0.12 * clamp(input.uncertainty ?? 0);
  const riskAdjustment = -0.16 * clamp(input.risk ?? 0);
  const predictiveScore = input.evidenceLevel === 'excluded'
    ? 0
    : clamp(probability + evidenceAdjustment + uncertaintyAdjustment + riskAdjustment);
  return {
    predictiveScore,
    probability,
    evidenceAdjustment,
    uncertaintyAdjustment,
    riskAdjustment,
    components: {
      probability,
      evidence: evidenceStrength,
      uncertainty: clamp(input.uncertainty ?? 0),
      risk: clamp(input.risk ?? 0),
    },
  };
}

export function comparePredictiveScores(a: CoreScoreBreakdown, b: CoreScoreBreakdown): number {
  return b.predictiveScore - a.predictiveScore;
}
