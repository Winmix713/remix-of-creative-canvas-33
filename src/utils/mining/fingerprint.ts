import { chronologicalMiningSplits } from './splits';

export interface FingerprintRow { outcome: boolean; fingerprint?: readonly string[]; predictiveProbability: number; }
export interface FingerprintHypothesis { key: string; features: string[]; discoveryN: number; selectionN: number; validationN: number; holdoutN: number; validationRate: number; holdoutRate: number; validationBrier: number; status: 'HYPOTHESIS' | 'CANDIDATE'; }

export function mineFingerprintHypotheses(rows: readonly FingerprintRow[], minN = 10): FingerprintHypothesis[] {
  const splits = chronologicalMiningSplits(rows);
  const keys = [...new Set(splits[0].rows.flatMap((row) => row.fingerprint ?? []))];
  const rate = (sample: FingerprintRow[], key: string) => { const matched = sample.filter((row) => row.fingerprint?.includes(key)); return matched.length ? matched.filter((row) => row.outcome).length / matched.length : 0; };
  return keys.map((key) => {
    const matched = splits.map((split) => split.rows.filter((row) => row.fingerprint?.includes(key)));
    const validation = matched[2]; const holdout = matched[3];
    const validationRate = validation.length ? validation.filter((row) => row.outcome).length / validation.length : 0;
    const validationBrier = validation.length ? validation.reduce((sum, row) => sum + (row.predictiveProbability - (row.outcome ? 1 : 0)) ** 2, 0) / validation.length : 0;
    const baseline = splits[2].rows.length ? splits[2].rows.filter((row) => row.outcome).length / splits[2].rows.length : 0;
    const stable = matched[0].length >= minN && matched[2].length >= minN && validationRate > baseline && validationBrier < 0.25;
    const status: FingerprintHypothesis['status'] = stable ? 'CANDIDATE' : 'HYPOTHESIS';
    return { key, features: key.split('|'), discoveryN: matched[0].length, selectionN: matched[1].length, validationN: validation.length, holdoutN: holdout.length, validationRate, holdoutRate: holdout.length ? holdout.filter((row) => row.outcome).length / holdout.length : 0, validationBrier, status };
  }).sort((a, b) => Number(b.status === 'CANDIDATE') - Number(a.status === 'CANDIDATE') || b.validationRate - a.validationRate);
}

export const fingerprintRate = (rows: readonly FingerprintRow[], key: string) => {
  const matched = rows.filter((row) => row.fingerprint?.includes(key));
  return matched.length ? matched.filter((row) => row.outcome).length / matched.length : 0;
};
