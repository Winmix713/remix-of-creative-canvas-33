/**
 * Three-way comparison for side-by-side team metrics.
 *
 * Values are rounded to the precision the UI displays, so two numbers that LOOK equal are a
 * 'tie' (rendered neutral) instead of one green / one red because of hidden decimals.
 */
export type ComparisonResult = 'a' | 'b' | 'tie' | null;

export interface CompareOptions {
  /** true when the smaller value is better (rank, goals conceded). */
  lowerIsBetter?: boolean;
  /** Displayed decimals; values are compared after rounding to this precision. Default 0. */
  decimals?: number;
}

const isNum = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function getComparison(
  aVal: number | null | undefined,
  bVal: number | null | undefined,
  { lowerIsBetter = false, decimals = 0 }: CompareOptions = {},
): ComparisonResult {
  if (!isNum(aVal) || !isNum(bVal)) return null;
  const factor = 10 ** decimals;
  const a = Math.round(aVal * factor);
  const b = Math.round(bVal * factor);
  if (a === b) return 'tie';
  return (lowerIsBetter ? a < b : a > b) ? 'a' : 'b';
}
