export type MiningSplitName = 'discovery' | 'selection' | 'validation' | 'holdout';

export interface MiningSplit<T> { name: MiningSplitName; rows: T[]; start: number; end: number; }

export function chronologicalMiningSplits<T>(rows: readonly T[], ratios = [0.4, 0.2, 0.2, 0.2]): MiningSplit<T>[] {
  const total = ratios.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
  const names: MiningSplitName[] = ['discovery', 'selection', 'validation', 'holdout'];
  let cursor = 0;
  return names.map((name, index) => {
    const start = cursor;
    const end = index === names.length - 1 ? rows.length : Math.min(rows.length, cursor + Math.floor(rows.length * Math.max(0, ratios[index]) / total));
    cursor = end;
    return { name, rows: rows.slice(start, end), start, end };
  });
}
