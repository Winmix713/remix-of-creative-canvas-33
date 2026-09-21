import type { BacktestObservation } from './walkForward';

export interface BacktestMetrics {
  n: number;
  brier: number;
  logLoss: number;
  ece: number;
  precision: number;
  coverage: number;
  top3HitRate: number;
  confidenceInterval: { lo: number; hi: number };
}

const clamp = (p: number) => Math.max(1e-12, Math.min(1 - 1e-12, p));
const wilson = (hits: number, n: number) => {
  if (!n) return { lo: 0, hi: 0 };
  const z = 1.96;
  const p = hits / n;
  const d = 1 + z * z / n;
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { lo: Math.max(0, (p + z * z / (2 * n) - spread) / d), hi: Math.min(1, (p + z * z / (2 * n) + spread) / d) };
};

export function evaluateBacktest(rows: readonly BacktestObservation[], probability: (row: BacktestObservation) => number): BacktestMetrics {
  const n = rows.length;
  const hits = rows.filter((row) => (probability(row) >= 0.5) === row.outcome).length;
  const bins = Array.from({ length: 5 }, () => ({ p: [] as number[], y: [] as number[] }));
  rows.forEach((row) => { const p = clamp(probability(row)); const index = Math.min(4, Math.floor(p * 5)); bins[index].p.push(p); bins[index].y.push(row.outcome ? 1 : 0); });
  const ece = n ? bins.reduce((sum, bin) => bin.p.length ? sum + bin.p.length / n * Math.abs(bin.p.reduce((a, b) => a + b, 0) / bin.p.length - bin.y.reduce((a, b) => a + b, 0) / bin.y.length) : sum, 0) : 0;
  return {
    n,
    brier: n ? rows.reduce((sum, row) => sum + (probability(row) - (row.outcome ? 1 : 0)) ** 2, 0) / n : 0,
    logLoss: n ? rows.reduce((sum, row) => { const p = clamp(probability(row)); return sum - (row.outcome ? Math.log(p) : Math.log(1 - p)); }, 0) / n : 0,
    ece,
    precision: n ? hits / n : 0,
    coverage: n ? rows.filter((row) => row.coreRank != null).length / n : 0,
    top3HitRate: n ? rows.filter((row) => row.top3 && row.outcome).length / n : 0,
    confidenceInterval: wilson(hits, n),
  };
}
