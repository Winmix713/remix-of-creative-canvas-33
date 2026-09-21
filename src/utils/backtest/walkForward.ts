export interface BacktestObservation {
  id: string;
  kickoffIso: string;
  season: string;
  league: string;
  currentProbability: number;
  predictiveProbability: number;
  outcome: boolean;
  coreRank?: 1 | 2 | 3 | null;
  top3?: boolean;
}

export interface BacktestWindow {
  start: string;
  end: string;
  n: number;
  currentBrier: number;
  predictiveBrier: number;
  currentLogLoss: number;
  predictiveLogLoss: number;
}

const clamp = (p: number) => Math.max(1e-12, Math.min(1 - 1e-12, p));
const brier = (p: number, y: boolean) => (p - (y ? 1 : 0)) ** 2;
const loss = (p: number, y: boolean) => -(y ? Math.log(clamp(p)) : Math.log(clamp(1 - p)));

export function walkForwardWindows(rows: readonly BacktestObservation[], windowSize = 100): BacktestWindow[] {
  const ordered = rows.slice().sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso) || a.id.localeCompare(b.id));
  if (windowSize <= 0) return [];
  const windows: BacktestWindow[] = [];
  for (let start = 0; start + windowSize <= ordered.length; start += windowSize) {
    const sample = ordered.slice(start, start + windowSize);
    windows.push({
      start: sample[0].kickoffIso,
      end: sample[sample.length - 1].kickoffIso,
      n: sample.length,
      currentBrier: sample.reduce((s, row) => s + brier(row.currentProbability, row.outcome), 0) / sample.length,
      predictiveBrier: sample.reduce((s, row) => s + brier(row.predictiveProbability, row.outcome), 0) / sample.length,
      currentLogLoss: sample.reduce((s, row) => s + loss(row.currentProbability, row.outcome), 0) / sample.length,
      predictiveLogLoss: sample.reduce((s, row) => s + loss(row.predictiveProbability, row.outcome), 0) / sample.length,
    });
  }
  return windows;
}

export function exportBacktestJson<T>(report: T): string {
  return JSON.stringify(report, null, 2);
}
