import type { Outcome } from '../types/winmix';

export type RankerName = 'current' | 'predictive';

export interface WalkForwardObservation {
  id: string;
  kickoffIso: string;
  season: string;
  league: 'angol' | 'spanyol' | string;
  currentProb: number;
  predictiveProb: number;
  outcome: boolean;
  coreRank?: 1 | 2 | 3 | null;
  top3?: boolean;
  fingerprint?: string[];
}

export interface RankerMetrics {
  ranker: RankerName;
  n: number;
  brier: number;
  logLoss: number;
  ece: number;
  precision: number;
  coverage: number;
  top3HitRate: number;
  confidenceInterval: { lo: number; hi: number };
  byCoreRank: Record<'1' | '2' | '3', { n: number; precision: number }>;
  bySeason: Record<string, { n: number; brier: number; logLoss: number; precision: number }>;
  byLeague: Record<string, { n: number; brier: number; logLoss: number; precision: number }>;
}

export interface WalkForwardComparison {
  current: RankerMetrics;
  predictive: RankerMetrics;
  delta: { brier: number; logLoss: number; ece: number; precision: number };
  holdoutStart: string | null;
  evaluatedAt: string;
}

export interface FingerprintCandidate {
  key: string;
  features: string[];
  discoveryN: number;
  discoveryRate: number;
  validationN: number;
  validationRate: number;
  brier: number;
  logLoss: number;
  improvesOverBaseline: boolean;
  productionCandidate: boolean;
}

const clamp = (value: number) => Math.min(1 - 1e-12, Math.max(1e-12, value));
const brier = (p: number, y: boolean) => (p - (y ? 1 : 0)) ** 2;
const logLoss = (p: number, y: boolean) => -(y ? Math.log(clamp(p)) : Math.log(clamp(1 - p)));

function wilson(hits: number, n: number) {
  if (!n) return { lo: 0, hi: 0 };
  const z = 1.96;
  const p = hits / n;
  const d = 1 + z * z / n;
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { lo: (p + z * z / (2 * n) - spread) / d, hi: (p + z * z / (2 * n) + spread) / d };
}

function ece(rows: WalkForwardObservation[], probabilities: number[]) {
  if (!rows.length) return 0;
  return [0, 0.2, 0.4, 0.6, 0.8].reduce((sum, min, index, edges) => {
    const max = edges[index + 1] ?? 1;
    const bucket = rows.map((row, i) => ({ row, p: probabilities[i] })).filter(({ p }) => p >= min && (p < max || max === 1));
    if (!bucket.length) return sum;
    const meanP = bucket.reduce((s, item) => s + item.p, 0) / bucket.length;
    const meanY = bucket.filter((item) => item.row.outcome).length / bucket.length;
    return sum + bucket.length / rows.length * Math.abs(meanP - meanY);
  }, 0);
}

function groupMetrics(rows: WalkForwardObservation[], probabilities: number[]) {
  const n = rows.length;
  const hits = rows.filter((row, i) => (probabilities[i] >= 0.5) === row.outcome).length;
  return {
    n,
    brier: n ? rows.reduce((s, row, i) => s + brier(probabilities[i], row.outcome), 0) / n : 0,
    logLoss: n ? rows.reduce((s, row, i) => s + logLoss(probabilities[i], row.outcome), 0) / n : 0,
    precision: n ? hits / n : 0,
  };
}

function metricFor(ranker: RankerName, rows: WalkForwardObservation[]): RankerMetrics {
  const ordered = rows.slice().sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso) || a.id.localeCompare(b.id));
  const probabilities = ordered.map((row) => ranker === 'current' ? row.currentProb : row.predictiveProb);
  const base = groupMetrics(ordered, probabilities);
  const hits = ordered.filter((row, i) => (probabilities[i] >= 0.5) === row.outcome).length;
  const coreRows = ordered.filter((row) => row.coreRank != null);
  const byCoreRank = ({ 1: 1, 2: 2, 3: 3 } as const) as Record<'1' | '2' | '3', number>;
  const rankStats = Object.fromEntries(Object.keys(byCoreRank).map((rank) => {
    const subset = coreRows.filter((row) => String(row.coreRank) === rank);
    const rankHits = subset.filter((row) => row.outcome).length;
    return [rank, { n: subset.length, precision: subset.length ? rankHits / subset.length : 0 }];
  })) as RankerMetrics['byCoreRank'];
  const aggregate = (subset: WalkForwardObservation[]) => {
    const ps = subset.map((row) => ranker === 'current' ? row.currentProb : row.predictiveProb);
    return groupMetrics(subset, ps);
  };
  const by = (field: 'season' | 'league') => Object.fromEntries([...new Set(ordered.map((row) => row[field]))].map((key) => [key, aggregate(ordered.filter((row) => row[field] === key))]));
  return {
    ranker,
    n: ordered.length,
    brier: base.brier,
    logLoss: base.logLoss,
    ece: ece(ordered, probabilities),
    precision: base.precision,
    coverage: rows.length ? coreRows.length / rows.length : 0,
    top3HitRate: coreRows.length
      ? coreRows.filter((row) => row.top3 ?? (row.coreRank != null && row.coreRank <= 3 && row.outcome)).length / coreRows.length
      : 0,
    confidenceInterval: wilson(hits, ordered.length),
    byCoreRank: rankStats,
    bySeason: by('season'),
    byLeague: by('league'),
  };
}

export function compareWalkForward(rows: readonly WalkForwardObservation[], holdoutFraction = 0.2): WalkForwardComparison {
  const ordered = rows.slice().sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso) || a.id.localeCompare(b.id));
  const holdoutIndex = Math.max(0, Math.floor(ordered.length * (1 - holdoutFraction)));
  const holdout = ordered.slice(holdoutIndex);
  const current = metricFor('current', holdout);
  const predictive = metricFor('predictive', holdout);
  return {
    current,
    predictive,
    delta: {
      brier: predictive.brier - current.brier,
      logLoss: predictive.logLoss - current.logLoss,
      ece: predictive.ece - current.ece,
      precision: predictive.precision - current.precision,
    },
    holdoutStart: holdout[0]?.kickoffIso ?? null,
    evaluatedAt: new Date().toISOString(),
  };
}

export function mineBttsFingerprints(rows: readonly WalkForwardObservation[], minDiscoveryN = 20, minValidationN = 20): FingerprintCandidate[] {
  const ordered = rows.slice().sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso));
  const split = Math.max(1, Math.floor(ordered.length * 0.7));
  const discovery = ordered.slice(0, split);
  const validation = ordered.slice(split);
  const keys = [...new Set(discovery.flatMap((row) => row.fingerprint ?? []))];
  return keys.map((key) => {
    const d = discovery.filter((row) => row.fingerprint?.includes(key));
    const v = validation.filter((row) => row.fingerprint?.includes(key));
    const vRate = v.length ? v.filter((row) => row.outcome).length / v.length : 0;
    const baseline = validation.length ? validation.filter((row) => row.outcome).length / validation.length : 0;
    const vProb = v.map((row) => row.predictiveProb);
    const vMetrics = groupMetrics(v, vProb);
    const stable = d.length >= minDiscoveryN && v.length >= minValidationN && vRate > baseline;
    return {
      key,
      features: key.split('|'),
      discoveryN: d.length,
      discoveryRate: d.length ? d.filter((row) => row.outcome).length / d.length : 0,
      validationN: v.length,
      validationRate: vRate,
      brier: vMetrics.brier,
      logLoss: vMetrics.logLoss,
      improvesOverBaseline: stable,
      productionCandidate: stable && vMetrics.brier < 0.25,
    };
  }).sort((a, b) => Number(b.productionCandidate) - Number(a.productionCandidate) || b.validationRate - a.validationRate);
}

export function outcomeToBoolean(outcome: Outcome, target: Outcome): boolean {
  return outcome === target;
}
