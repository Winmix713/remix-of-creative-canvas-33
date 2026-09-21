export type CalibrationMethod = 'none' | 'platt' | 'isotonic';
export type PredictiveModelName = 'baseline' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface BttsTargetDefinition {
  probabilityField: string;
  outcomeField: string;
  oneXTwoProbabilityFields: string[];
  targetPositiveValue: boolean | number | string;
  calibrationPopulation: string;
  notes: string[];
}

export interface BttsAuditRow {
  id: string;
  kickoffIso: string;
  league: string;
  season: string;
  bttsProbability: number;
  bttsOutcome: boolean;
  currentProbability?: number;
  h2h?: number;
  modelGap?: number;
  stability?: number;
  modelAgreement?: number;
  preMatchEvidence?: Record<string, number | null | undefined>;
}

export interface CalibrationFit {
  method: CalibrationMethod;
  sampleSize: number;
  slope: number;
  intercept: number;
  predict: (probability: number) => number;
}

export interface BttsModelResult {
  model: PredictiveModelName;
  calibration: CalibrationMethod;
  n: number;
  brier: number;
  logLoss: number;
  ece: number;
  coverage: number;
  confidenceInterval: { lo: number; hi: number };
  byLeague: Record<string, { n: number; brier: number; logLoss: number; ece: number }>;
}

const EPSILON = 1e-12;
const clamp = (value: number) => Math.min(1 - EPSILON, Math.max(EPSILON, value));
const logit = (p: number) => Math.log(clamp(p) / (1 - clamp(p)));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function defineBttsTarget(rows: readonly Record<string, unknown>[]): BttsTargetDefinition {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  const probabilityCandidates = ['btts_probability', 'bttsProbability', 'prob_btts', 'btts_prob', 'BTTS'];
  const outcomeCandidates = ['btts_outcome', 'bttsOutcome', 'btts', 'BTTS_OUTCOME'];
  const probabilityField = probabilityCandidates.find((key) => keys.has(key)) ?? 'btts_probability';
  const outcomeField = outcomeCandidates.find((key) => keys.has(key)) ?? 'btts_outcome';
  return {
    probabilityField,
    outcomeField,
    oneXTwoProbabilityFields: [...keys].filter((key) => /^(p?home|p?draw|p?away|home_prob|draw_prob|away_prob)$/i.test(key)),
    targetPositiveValue: true,
    calibrationPopulation: 'rows with finite BTTS probability and observed BTTS outcome',
    notes: [
      'BTTS ranking must use the BTTS-specific probability, never max(pHome, pDraw, pAway).',
      'Outcome-derived fields are excluded from pre-match features.',
      'Field mapping must be confirmed against the exported schema before promotion.',
    ],
  };
}

function metrics(probabilities: readonly number[], outcomes: readonly boolean[]) {
  const n = probabilities.length;
  if (!n) return { n: 0, brier: 0, logLoss: 0, ece: 0 };
  const bins = Array.from({ length: 10 }, () => ({ p: 0, y: 0, n: 0 }));
  let brier = 0;
  let logLoss = 0;
  probabilities.forEach((raw, index) => {
    const p = clamp(raw);
    const y = outcomes[index] ? 1 : 0;
    brier += (p - y) ** 2;
    logLoss += -(y ? Math.log(p) : Math.log(1 - p));
    const bin = bins[Math.min(9, Math.floor(p * 10))];
    bin.p += p; bin.y += y; bin.n += 1;
  });
  const ece = bins.reduce((sum, bin) => bin.n ? sum + bin.n / n * Math.abs(bin.p / bin.n - bin.y / bin.n) : sum, 0);
  return { n, brier: brier / n, logLoss: logLoss / n, ece };
}

function wilson(hits: number, n: number) {
  if (!n) return { lo: 0, hi: 0 };
  const z = 1.96; const p = hits / n; const denominator = 1 + z * z / n;
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { lo: Math.max(0, (p + z * z / (2 * n) - spread) / denominator), hi: Math.min(1, (p + z * z / (2 * n) + spread) / denominator) };
}

export function fitPlatt(probabilities: readonly number[], outcomes: readonly boolean[], iterations = 80): CalibrationFit {
  let slope = 1; let intercept = 0;
  const learningRate = 0.08;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let slopeGradient = 0; let interceptGradient = 0;
    probabilities.forEach((probability, index) => {
      const prediction = sigmoid(intercept + slope * logit(probability));
      const error = prediction - (outcomes[index] ? 1 : 0);
      slopeGradient += error * logit(probability);
      interceptGradient += error;
    });
    const scale = Math.max(1, probabilities.length);
    slope -= learningRate * slopeGradient / scale;
    intercept -= learningRate * interceptGradient / scale;
  }
  return { method: 'platt', sampleSize: probabilities.length, slope, intercept, predict: (probability) => sigmoid(intercept + slope * logit(probability)) };
}

export function fitIsotonic(probabilities: readonly number[], outcomes: readonly boolean[]): CalibrationFit {
  const points = probabilities.map((probability, index) => ({ probability, outcome: outcomes[index] ? 1 : 0 })).sort((a, b) => a.probability - b.probability);
  const blocks: Array<{ min: number; max: number; sum: number; n: number }> = [];
  points.forEach((point) => {
    blocks.push({ min: point.probability, max: point.probability, sum: point.outcome, n: 1 });
    while (blocks.length > 1) {
      const previous = blocks[blocks.length - 2]; const current = blocks[blocks.length - 1];
      if (previous.sum / previous.n <= current.sum / current.n) break;
      blocks.splice(-2, 2, { min: previous.min, max: current.max, sum: previous.sum + current.sum, n: previous.n + current.n });
    }
  });
  return {
    method: 'isotonic', sampleSize: probabilities.length, slope: 1, intercept: 0,
    predict: (probability) => {
      const block = blocks.find((candidate) => probability <= candidate.max) ?? blocks.at(-1);
      return block ? clamp(block.sum / block.n) : 0.5;
    },
  };
}

function probabilityFor(row: BttsAuditRow, model: PredictiveModelName) {
  const base = row.bttsProbability;
  if (model === 'baseline' || model === 'A') return base;
  const h2h = finite(row.h2h) ? row.h2h : 0;
  const gap = finite(row.modelGap) ? row.modelGap : 0;
  const stability = finite(row.stability) ? row.stability : 0;
  const agreement = finite(row.modelAgreement) ? row.modelAgreement : 0;
  const evidence = row.preMatchEvidence ? Object.values(row.preMatchEvidence).filter(finite).reduce((sum, value) => sum + value, 0) / Math.max(1, Object.values(row.preMatchEvidence).filter(finite).length) : 0;
  const adjustment = model === 'B' ? 0.12 * (h2h - 0.5) : model === 'C' ? 0.12 * (h2h - 0.5) - 0.08 * gap : model === 'D' ? 0.12 * (h2h - 0.5) - 0.08 * gap + 0.08 * (stability - 0.5) : model === 'E' ? 0.12 * (h2h - 0.5) - 0.08 * gap + 0.08 * (stability - 0.5) + 0.08 * (agreement - 0.5) : 0.1 * (evidence - 0.5);
  return sigmoid(logit(base) + adjustment);
}

export function evaluateBttsModels(rows: readonly BttsAuditRow[], calibration: CalibrationMethod = 'platt'): BttsModelResult[] {
  const ordered = rows.slice().sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso) || a.id.localeCompare(b.id));
  const split = Math.max(1, Math.floor(ordered.length * 0.7));
  const train = ordered.slice(0, split); const test = ordered.slice(split);
  const names: PredictiveModelName[] = ['baseline', 'A', 'B', 'C', 'D', 'E', 'F'];
  return names.map((model) => {
    const trainRaw = train.map((row) => probabilityFor(row, model));
    const fit = calibration === 'platt' ? fitPlatt(trainRaw, train.map((row) => row.bttsOutcome)) : calibration === 'isotonic' ? fitIsotonic(trainRaw, train.map((row) => row.bttsOutcome)) : { predict: (p: number) => p };
    const testRaw = test.map((row) => probabilityFor(row, model));
    const probabilities = testRaw.map((probability) => fit.predict(probability));
    const base = metrics(probabilities, test.map((row) => row.bttsOutcome));
    const byLeague = Object.fromEntries([...new Set(test.map((row) => row.league))].map((league) => {
      const subset = test.map((row, index) => ({ row, probability: probabilities[index] })).filter(({ row }) => row.league === league);
      return [league, metrics(subset.map((item) => item.probability), subset.map((item) => item.row.bttsOutcome))];
    }));
    const hits = probabilities.filter((probability, index) => (probability >= 0.5) === test[index]?.bttsOutcome).length;
    return { model, calibration, ...base, coverage: test.length ? test.filter((row) => row.bttsProbability >= 0.58).length / test.length : 0, confidenceInterval: wilson(hits, test.length), byLeague };
  });
}

export function compareCoverage(rows: readonly BttsAuditRow[], levels = [0.001, 0.005, 0.01, 0.02, 0.05, 1]) {
  const ordered = rows.slice().sort((a, b) => b.bttsProbability - a.bttsProbability || a.kickoffIso.localeCompare(b.kickoffIso));
  return levels.map((level) => { const sample = ordered.slice(0, Math.max(1, Math.ceil(ordered.length * level))); return { coverage: level, n: sample.length, hitRate: sample.length ? sample.filter((row) => row.bttsOutcome).length / sample.length : 0 }; });
}

export function isProductionCandidate(current: BttsModelResult, candidate: BttsModelResult) {
  return candidate.brier <= current.brier && candidate.logLoss <= current.logLoss && candidate.ece <= current.ece;
}

export const bttsMetrics = metrics;

