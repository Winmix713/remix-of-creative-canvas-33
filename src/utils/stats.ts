import { CALIB_MIN_SAMPLE, VENUE_DECAY_LAMBDA } from './constants';
import type {
  MatchRow,
  Outcome,
  Probs,
  SignTestResult,
  TemperatureFit } from
'../types/winmix';

/** Poisson PMF via the P(k) = P(k-1) * lambda / k recurrence. */
export function poissonPmfArray(lambda: number, maxK: number): number[] {
  const arr = new Array<number>(maxK + 1);
  arr[0] = Math.exp(-lambda);
  for (let k = 1; k <= maxK; k++) arr[k] = arr[k - 1] * lambda / k;
  return arr;
}

export function adaptiveMaxGoals(lambda: number): number {
  return Math.min(15, Math.max(7, Math.ceil(lambda + 5 * Math.sqrt(Math.max(0.01, lambda)))));
}

/**
 * Exponential decay (recency weighting) + shrinkage toward the league mean.
 *
 * Weight formula: `w_t = lambda^(n - 1 - t)` — the newest observation carries
 * weight 1. Zero-length and uniform cold-start inputs return the league mean
 * instead of dividing by zero, so the result is always finite.
 */
export function decayedShrunkAvg(
values: number[],
leagueAvg: number,
lambda: number,
k: number)
: number {
  const n = values.length;
  if (n === 0) return leagueAvg;
  let weightedSum = 0;
  let weightSum = 0;
  values.forEach((v, idx) => {
    const w = Math.pow(lambda, n - 1 - idx);
    weightedSum += v * w;
    weightSum += w;
  });
  const rawAvg = weightSum > 0 ? weightedSum / weightSum : leagueAvg;
  const shrunk = (n * rawAvg + k * leagueAvg) / (n + k);
  return Number.isFinite(shrunk) ? shrunk : leagueAvg;
}

/**
 * Venue-specific attack rate. The decay is a NAMED PARAMETER (defaulting to
 * {@link VENUE_DECAY_LAMBDA}) so the adaptation speed lives in `constants.ts`
 * and can be swept in an ablation without touching this function.
 */
export function venueAttack(
venueMatches: MatchRow[],
isHome: boolean,
leagueAvg: number,
lambda: number = VENUE_DECAY_LAMBDA,
k = 5)
: number {
  const scored = venueMatches.map((m) => isHome ? m.home_score : m.away_score);
  return decayedShrunkAvg(scored, leagueAvg, lambda, k);
}

export function venueDefense(
venueMatches: MatchRow[],
isHome: boolean,
leagueAvg: number,
lambda: number = VENUE_DECAY_LAMBDA,
k = 5)
: number {
  const conceded = venueMatches.map((m) => isHome ? m.away_score : m.home_score);
  return decayedShrunkAvg(conceded, leagueAvg, lambda, k);
}

/** Temperature scaling — the exact same distribution is fitted and applied. */
export function calibrateWithT(raw: Probs, T: number): Probs {
  const lH = Math.log(Math.max(1e-6, raw.home)) / T;
  const lD = Math.log(Math.max(1e-6, raw.draw)) / T;
  const lA = Math.log(Math.max(1e-6, raw.away)) / T;
  const s = Math.exp(lH) + Math.exp(lD) + Math.exp(lA);
  return { home: Math.exp(lH) / s, draw: Math.exp(lD) / s, away: Math.exp(lA) / s };
}

interface EceBin {
  min: number;
  max: number;
  predicted: number[];
  actual: number[];
}

function makeBins(): EceBin[] {
  return [
  { min: 0.0, max: 0.2, predicted: [], actual: [] },
  { min: 0.2, max: 0.4, predicted: [], actual: [] },
  { min: 0.4, max: 0.6, predicted: [], actual: [] },
  { min: 0.6, max: 0.8, predicted: [], actual: [] },
  { min: 0.8, max: 1.0, predicted: [], actual: [] }];

}

function fillBins<T>(
list: T[],
getProbs: (item: T) => Probs,
getOutcome: (item: T) => Outcome)
: {bins: EceBin[];total: number;} {
  const bins = makeBins();
  let total = 0;
  const keys: Array<keyof Probs> = ['home', 'draw', 'away'];
  list.forEach((item) => {
    const p = getProbs(item);
    const outcome = getOutcome(item);
    keys.forEach((out) => {
      const prob = p[out];
      const act =
      out === 'home' && outcome === 'H' ||
      out === 'draw' && outcome === 'D' ||
      out === 'away' && outcome === 'A' ?
      1 :
      0;
      const b = bins.find((bin) => prob >= bin.min && prob < bin.max) ?? bins[bins.length - 1];
      b.predicted.push(prob);
      b.actual.push(act);
      total++;
    });
  });
  return { bins, total };
}

export function computeECEGeneric<T>(
list: T[],
getProbs: (item: T) => Probs,
getOutcome: (item: T) => Outcome)
: number {
  const { bins, total } = fillBins(list, getProbs, getOutcome);
  if (total === 0) return 0;
  let ece = 0;
  bins.forEach((b) => {
    if (b.predicted.length === 0) return;
    const avgPred = b.predicted.reduce((a, c) => a + c, 0) / b.predicted.length;
    const avgAct = b.actual.reduce((a, c) => a + c, 0) / b.actual.length;
    ece += b.predicted.length / total * Math.abs(avgPred - avgAct);
  });
  return ece;
}

export function computeECEForSlice(slice: MatchRow[]): number {
  return computeECEGeneric(
    slice.filter((m) => m.pipeline),
    (m) => m.pipeline!.calibrated,
    (m) => m.outcome
  );
}

export interface ReliabilityPoint {
  label: string;
  actual: number;
  perfect: number;
}

/** Reliability diagram data over the calibrated distribution. */
export function computeReliability(matches: MatchRow[]): ReliabilityPoint[] {
  const labels = ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'];
  const { bins } = fillBins(
    matches.filter((m) => m.pipeline),
    (m) => m.pipeline!.calibrated,
    (m) => m.outcome
  );
  return bins.map((b, idx) => ({
    label: labels[idx],
    actual: b.actual.length ?
    b.actual.reduce((a, c) => a + c, 0) / b.actual.length * 100 :
    0,
    perfect: b.predicted.length ?
    b.predicted.reduce((a, c) => a + c, 0) / b.predicted.length * 100 :
    (b.min + b.max) * 50
  }));
}

export interface CalibSample {
  ensRaw: Probs;
  outcome: Outcome;
}

/** Grid-search temperature fit on strictly prior data. */
export function fitTemperature(sample: CalibSample[]): TemperatureFit | null {
  if (!sample || sample.length < CALIB_MIN_SAMPLE) return null;
  let bestT = 1.0;
  let minLoss = Infinity;
  for (let t = 0.7; t <= 1.8 + 1e-9; t += 0.05) {
    let loss = 0;
    for (const s of sample) {
      const c = calibrateWithT(s.ensRaw, t);
      const p = s.outcome === 'H' ? c.home : s.outcome === 'D' ? c.draw : c.away;
      loss += -Math.log(Math.max(1e-6, p));
    }
    if (loss < minLoss) {
      minLoss = loss;
      bestT = t;
    }
  }
  bestT = parseFloat(bestT.toFixed(2));
  const ece = computeECEGeneric(
    sample,
    (s) => calibrateWithT(s.ensRaw, bestT),
    (s) => s.outcome
  );
  return { T: bestT, ece, n: sample.length, avgLogLoss: minLoss / sample.length };
}

export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  let p =
  d *
  t * (
  0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

/** Sign test on paired per-match Brier deltas (ensemble vs B1). */
export function pairedSignTest(slice: MatchRow[]): SignTestResult {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  slice.forEach((m) => {
    if (!m.pipeline) return;
    const d = m.pipeline.reconciliation.brierEns - m.pipeline.reconciliation.brierB1;
    if (d < -1e-9) wins++;else
    if (d > 1e-9) losses++;else
    ties++;
  });
  const n = wins + losses;
  if (n === 0) {
    return { wins, losses, ties, n: 0, p: 1, z: 0, significant: false, direction: 'none' };
  }
  const mean = n / 2;
  const sd = Math.sqrt(n * 0.25);
  const cc = 0.5;
  const z = sd > 0 ? (Math.abs(wins - mean) - cc) / sd : 0;
  const pTwoSided = 2 * (1 - normalCdf(Math.abs(z)));
  return {
    wins,
    losses,
    ties,
    n,
    p: Math.max(0, Math.min(1, pTwoSided)),
    z,
    significant: pTwoSided < 0.05,
    direction: wins > losses ? 'ensemble_better' : losses > wins ? 'b1_better' : 'none'
  };
}