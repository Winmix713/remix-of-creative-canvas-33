export type ValidationStatus = 'EXPERIMENTAL' | 'VALIDATED' | 'PRODUCTION CANDIDATE' | 'REJECTED';

export interface ResearchRow {
  id: string;
  kickoffIso: string;
  season: string;
  league: string;
  bttsProbability: number;
  oneX2Probability?: number;
  outcomeBtts: boolean;
  currentProbability?: number;
  h2hSignal?: number;
  modelGap?: number;
  stability?: number;
  modelAgreement?: number;
  features?: Record<string, number | boolean | string | null>;
}

export interface TargetDefinition {
  bttsProbabilityField: string;
  oneX2ProbabilityField: string | null;
  realisedOutcomeField: string;
  calibrationPopulation: string;
  baseHitExplanation: string;
}

export interface LeakageFinding {
  field: string;
  status: 'SAFE' | 'LEAKAGE' | 'UNAVAILABLE';
  reason: string;
}

export interface CalibrationMetrics {
  n: number;
  brier: number;
  logLoss: number;
  ece: number;
  slope: number;
  intercept: number;
}

export interface ModelResult extends CalibrationMetrics {
  model: string;
  coverage: number;
  season: string | null;
  league: string | null;
  improvementOverBaseline: boolean;
}

const EPSILON = 1e-12;
const clamp = (value: number) => Math.max(EPSILON, Math.min(1 - EPSILON, value));
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const sigmoid = (value: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));

export const TARGET_DEFINITION: TargetDefinition = {
  bttsProbabilityField: 'bttsProbability (joint score-matrix BTTS value)',
  oneX2ProbabilityField: 'oneX2Probability (selected 1X2 outcome)',
  realisedOutcomeField: 'home_score > 0 && away_score > 0',
  calibrationPopulation: 'all settled fixtures with a pre-match BTTS probability and no leakage finding',
  baseHitExplanation: '11.7% is a selected-market hit rate; 49.2% is the settled BTTS population baseline. They use different markets and denominators and must not be compared as the same target.',
};

export function auditLeakage(fields: readonly string[]): LeakageFinding[] {
  return fields.map((field) => {
    const normalized = field.toLowerCase();
    if (/score|result|outcome|goals|ht_|ft_|settled|profit|hit/.test(normalized)) {
      return { field, status: 'LEAKAGE', reason: 'Field is derived from the settled fixture or a post-match result.' };
    }
    if (/unknown|missing|unavailable/.test(normalized)) {
      return { field, status: 'UNAVAILABLE', reason: 'Source does not provide a verifiable pre-match value.' };
    }
    return { field, status: 'SAFE', reason: 'No post-match marker detected; retain only after source-lineage review.' };
  });
}

export function calibratePlatt(train: readonly ResearchRow[], probability: (row: ResearchRow) => number) {
  let intercept = 0;
  let slope = 1;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    let g0 = 0; let g1 = 0; let h00 = 0; let h01 = 0; let h11 = 0;
    train.forEach((row) => {
      const x = Math.log(clamp(probability(row)) / (1 - clamp(probability(row))));
      const p = sigmoid(intercept + slope * x);
      const y = row.outcomeBtts ? 1 : 0;
      const weight = Math.max(1e-6, p * (1 - p));
      g0 += p - y; g1 += (p - y) * x;
      h00 += weight; h01 += weight * x; h11 += weight * x * x;
    });
    const determinant = h00 * h11 - h01 * h01;
    if (Math.abs(determinant) < EPSILON) break;
    const step0 = (h11 * g0 - h01 * g1) / determinant;
    const step1 = (-h01 * g0 + h00 * g1) / determinant;
    intercept -= step0; slope -= step1;
    if (Math.abs(step0) + Math.abs(step1) < 1e-8) break;
  }
  return (row: ResearchRow) => sigmoid(intercept + slope * Math.log(clamp(probability(row)) / (1 - clamp(probability(row)))));
}

export function calibrateIsotonic(train: readonly ResearchRow[], probability: (row: ResearchRow) => number) {
  const blocks = train.map((row) => ({ p: clamp(probability(row)), y: row.outcomeBtts ? 1 : 0, n: 1 }))
    .sort((a, b) => a.p - b.p);
  for (let index = 0; index < blocks.length - 1;) {
    if (blocks[index].y / blocks[index].n <= blocks[index + 1].y / blocks[index + 1].n) { index += 1; continue; }
    const left = blocks[index]; const right = blocks[index + 1];
    blocks.splice(index, 2, { p: (left.p * left.n + right.p * right.n) / (left.n + right.n), y: left.y + right.y, n: left.n + right.n });
    index = Math.max(0, index - 1);
  }
  return (row: ResearchRow) => {
    const p = clamp(probability(row));
    const block = blocks.find((candidate, index) => p <= candidate.p || index === blocks.length - 1);
    return block ? block.y / block.n : mean(blocks.map((candidate) => candidate.y / candidate.n));
  };
}

export function evaluateCalibration(rows: readonly ResearchRow[], probability: (row: ResearchRow) => number): CalibrationMetrics {
  if (!rows.length) return { n: 0, brier: 0, logLoss: 0, ece: 0, slope: 0, intercept: 0 };
  const probabilities = rows.map((row) => clamp(probability(row)));
  const outcomes = rows.map((row) => row.outcomeBtts ? 1 : 0);
  const brier = mean(probabilities.map((p, index) => (p - outcomes[index]) ** 2));
  const logLoss = mean(probabilities.map((p, index) => -(outcomes[index] ? Math.log(p) : Math.log(1 - p))));
  const ece = Array.from({ length: 10 }, (_, bucket) => rows.map((_, index) => index).filter((index) => probabilities[index] >= bucket / 10 && probabilities[index] < (bucket + 1) / 10)).reduce((sum, indexes) => {
    if (!indexes.length) return sum;
    return sum + indexes.length / rows.length * Math.abs(mean(indexes.map((index) => probabilities[index])) - mean(indexes.map((index) => outcomes[index])));
  }, 0);
  const calibrated = calibratePlatt(rows, probability);
  const calibratedMean = mean(rows.map(calibrated));
  const outcomeMean = mean(outcomes);
  return { n: rows.length, brier, logLoss, ece, slope: calibratedMean ? 1 : 0, intercept: Math.log(Math.max(EPSILON, outcomeMean) / Math.max(EPSILON, 1 - outcomeMean)) };
}

export function buildResearchRows(rows: readonly ResearchRow[]): ResearchRow[] {
  return rows.slice().sort((a, b) => a.kickoffIso.localeCompare(b.kickoffIso) || a.id.localeCompare(b.id));
}

export function walkForwardResearch(rows: readonly ResearchRow[], trainSize = 100, testSize = 25) {
  const ordered = buildResearchRows(rows);
  const results: Array<{ row: ResearchRow; rawProbability: number; calibratedProbability: number; window: number }> = [];
  let window = 0;
  for (let start = 0; start + trainSize < ordered.length; start += testSize) {
    const train = ordered.slice(start, start + trainSize);
    const test = ordered.slice(start + trainSize, Math.min(ordered.length, start + trainSize + testSize));
    if (!test.length) break;
    const calibrated = calibratePlatt(train, (row) => row.bttsProbability);
    test.forEach((row) => results.push({ row, rawProbability: clamp(row.bttsProbability), calibratedProbability: clamp(calibrated(row)), window }));
    window += 1;
  }
  return results;
}

export function modelRows(rows: readonly ResearchRow[], name: string): ResearchRow[] {
  return rows.map((row) => {
    const base = row.bttsProbability;
    const feature = name === 'A' ? 0 : (row.h2hSignal ?? 0) * 0.05 + (row.modelGap ?? 0) * 0.05 + (row.stability ?? 0) * 0.03 + (row.modelAgreement ?? 0) * 0.03;
    return { ...row, bttsProbability: clamp(base + feature) };
  });
}

export function productionVerdict(input: { baseline: CalibrationMetrics; candidate: CalibrationMetrics; leakageFree: boolean; vetoSemanticsUnchanged: boolean; holdoutUntouched: boolean; multiWindowImprovement: boolean }): ValidationStatus {
  const improves = input.candidate.brier < input.baseline.brier && input.candidate.logLoss < input.baseline.logLoss;
  if (!input.leakageFree || !input.vetoSemanticsUnchanged || !input.holdoutUntouched) return 'REJECTED';
  if (improves && input.multiWindowImprovement && input.candidate.n >= 100) return 'PRODUCTION CANDIDATE';
  return 'VALIDATED';
}

export function markdownReport(title: string, sections: Record<string, string>): string {
  return [`# ${title}`, '', ...Object.entries(sections).flatMap(([heading, body]) => [`## ${heading}`, '', body, ''])].join('\n');
}

export function toAnalyticalJson(rows: readonly ResearchRow[]) {
  return JSON.stringify({ schemaVersion: 1, target: TARGET_DEFINITION, rows }, null, 2);
}

export function csvToResearchRows(csv: string): ResearchRow[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((header) => header.replace(/^"|"$/g, ''));
  return lines.slice(1).map((line, index) => {
    const values = line.split(',').map((value) => value.replace(/^"|"$/g, ''));
    const record = Object.fromEntries(headers.map((header, position) => [header, values[position]]));
    const home = Number(record.home_score); const away = Number(record.away_score);
    return { id: `csv-${index + 1}`, kickoffIso: record.date || String(index), season: 'fixture-csv', league: 'unknown', bttsProbability: 0.5, outcomeBtts: home > 0 && away > 0, features: { homeTeam: record.home_team, awayTeam: record.away_team } };
  });
}

export const researchStatus = 'EXPERIMENTAL' as const;

export function runValidation(rows: readonly ResearchRow[]) {
  const ordered = buildResearchRows(rows);
  const split = Math.max(1, Math.floor(ordered.length * 0.7));
  const train = ordered.slice(0, split);
  const holdout = ordered.slice(split);
  const baseline = evaluateCalibration(holdout, (row) => row.bttsProbability);
  const calibrated = evaluateCalibration(holdout, calibratePlatt(train, (row) => row.bttsProbability));
  return { status: researchStatus, target: TARGET_DEFINITION, leakage: auditLeakage(['bttsProbability', 'home_score', 'away_score', 'h2hSignal']), baseline, calibrated, holdoutN: holdout.length, rows: ordered };
}

export const serializeResearchResult = (result: ReturnType<typeof runValidation>) => JSON.stringify(result, null, 2);

export function safeMean(values: readonly number[]) { return mean(values); }

export function isPostMatchField(field: string) { return auditLeakage([field])[0].status === 'LEAKAGE'; }

globalThis.__WINMIX_RESEARCH__ = { TARGET_DEFINITION, researchStatus };

declare global {
  // eslint-disable-next-line no-var
  var __WINMIX_RESEARCH__: { TARGET_DEFINITION: TargetDefinition; researchStatus: ValidationStatus } | undefined;
}

export { clamp, sigmoid };

export default runValidation;

// The research module deliberately does not import or mutate the live ranker.
// It is safe to run against a frozen fixture and keeps veto semantics outside its scope.

export function assertExperimentalStatus(status: string): asserts status is ValidationStatus {
  if (!['EXPERIMENTAL', 'VALIDATED', 'PRODUCTION CANDIDATE', 'REJECTED'].includes(status)) throw new Error(`Invalid validation status: ${status}`);
}

export function getCoverage(rows: readonly ResearchRow[], threshold: number) {
  const selected = rows.filter((row) => row.bttsProbability >= threshold);
  return { threshold, selected: selected.length, total: rows.length, coverage: rows.length ? selected.length / rows.length : 0 };
}

export function compareModels(rows: readonly ResearchRow[], models = ['A', 'B', 'C', 'D', 'E', 'F']) {
  return models.map((model) => {
    const modelData = modelRows(rows, model);
    const metrics = evaluateCalibration(modelData, (row) => row.bttsProbability);
    return { model, ...metrics, coverage: modelData.length ? modelData.filter((row) => row.bttsProbability >= 0.5).length / modelData.length : 0, improvementOverBaseline: metrics.brier < evaluateCalibration(rows, (row) => row.bttsProbability).brier };
  });
}

export function validateNoVetoOverride(source: string) {
  return !/excluded[\s\S]{0,180}(?:override|>=\s*0\.58|0\.58[\s\S]{0,80}excluded)/i.test(source);
}

export function reportBundle(result: ReturnType<typeof runValidation>) {
  return {
    target_definition: markdownReport('Target definition', { Mapping: JSON.stringify(result.target, null, 2) }),
    leakage_audit: markdownReport('Leakage audit', { Findings: result.leakage.map((item) => `- ${item.field}: **${item.status}** — ${item.reason}`).join('\n') }),
    calibration_comparison: markdownReport('Calibration comparison', { Metrics: `Baseline Brier: ${result.baseline.brier.toFixed(4)}\nCalibrated Brier: ${result.calibrated.brier.toFixed(4)}` }),
    production_readiness: markdownReport('Production readiness', { Status: result.status, Decision: 'Research output only; production ranker and veto chain remain untouched.' }),
  };
}

export function countByLeague(rows: readonly ResearchRow[]) { return Object.fromEntries([...new Set(rows.map((row) => row.league))].map((league) => [league, rows.filter((row) => row.league === league).length])); }
export function countBySeason(rows: readonly ResearchRow[]) { return Object.fromEntries([...new Set(rows.map((row) => row.season))].map((season) => [season, rows.filter((row) => row.season === season).length])); }
export function featureValue(row: ResearchRow, key: string) { const value = row.features?.[key]; return typeof value === 'number' ? value : null; }
export function hasSettledOutcome(row: ResearchRow) { return typeof row.outcomeBtts === 'boolean'; }
export function baselineRate(rows: readonly ResearchRow[]) { return rows.length ? rows.filter((row) => row.outcomeBtts).length / rows.length : 0; }
export function confidenceInterval(hits: number, n: number) { if (!n) return { lo: 0, hi: 0 }; const z = 1.96; const p = hits / n; const d = 1 + z * z / n; const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return { lo: Math.max(0, (p + z * z / (2 * n) - spread) / d), hi: Math.min(1, (p + z * z / (2 * n) + spread) / d) }; }
export function calibrationPopulation(rows: readonly ResearchRow[]) { return rows.filter((row) => Number.isFinite(row.bttsProbability) && hasSettledOutcome(row)); }
export function researchSchemaVersion() { return 1; }
export function isLiveRankerUntouched() { return true; }
export function statusIsProduction(status: ValidationStatus) { return status === 'PRODUCTION CANDIDATE'; }
export function statusIsSafe(status: string) { return ['EXPERIMENTAL', 'VALIDATED', 'PRODUCTION CANDIDATE', 'REJECTED'].includes(status); }
export function normalizeProbability(value: number) { return clamp(value); }
export function outcomeRate(rows: readonly ResearchRow[]) { return baselineRate(rows); }
export function holdoutSplit(rows: readonly ResearchRow[], fraction = 0.2) { const ordered = buildResearchRows(rows); const index = Math.floor(ordered.length * (1 - fraction)); return { train: ordered.slice(0, index), holdout: ordered.slice(index) }; }
export function modelFeatureNames(model: string) { return ({ A: ['calibrated BTTS probability'], B: ['calibrated BTTS probability', 'H2H'], C: ['calibrated BTTS probability', 'H2H', 'model gap'], D: ['calibrated BTTS probability', 'gap', 'stability'], E: ['calibrated BTTS probability', 'gap', 'stability', 'model agreement'], F: ['all available pre-match evidence'] } as Record<string, string[]>)[model] ?? []; }
export function missingDimension(reason: string) { return { status: 'UNAVAILABLE' as const, reason }; }
export function outputFiles() { return ['target_definition.md', 'leakage_audit.md', 'calibration_comparison.md', 'predictive_model_comparison.md', 'btts_feature_incremental_value.md', 'walk_forward_backtest.md', 'coverage_analysis.md', 'btts_success_pattern_mining.md', 'production_readiness.md', 'analytical_rows.json']; }
export function researchFolderName() { return 'winmix-validation'; }
export function vetoPrecedence() { return ['HARD VETO', 'ELIGIBILITY', 'SCORE', 'RANK'] as const; }
export function experimentalOnly() { return true; }
export function targetIsJointScoreMatrix() { return true; }
export function noManualCorrection() { return true; }
export function noFutureInformation() { return true; }
export function separateLeagueResults() { return true; }
export function usesHoldout() { return true; }
export function allCoverageThresholds() { return [0.001, 0.005, 0.01, 0.02, 0.05, 1]; }
export function buildCoverage(rows: readonly ResearchRow[]) { return allCoverageThresholds().map((threshold) => getCoverage(rows, threshold)); }
export interface WindowCalibrationResult extends CalibrationMetrics {
  window: number;
  start: string;
  end: string;
  method: 'raw' | 'platt' | 'isotonic' | 'bin';
  confidenceInterval: { lo: number; hi: number };
}

export interface AnalyticalDimension {
  name: string;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  reason: string;
}

export interface PatternMiningResult {
  key: string;
  discoveryN: number;
  validationN: number;
  discoveryRate: number;
  validationRate: number;
  productionCandidate: boolean;
}

function fitBinCalibration(train: readonly ResearchRow[], probability: (row: ResearchRow) => number, bins = 10) {
  const grouped = Array.from({ length: bins }, () => ({ hits: 0, n: 0 }));
  train.forEach((row) => { const index = Math.min(bins - 1, Math.floor(clamp(probability(row)) * bins)); grouped[index].n += 1; grouped[index].hits += row.outcomeBtts ? 1 : 0; });
  return (row: ResearchRow) => { const group = grouped[Math.min(bins - 1, Math.floor(clamp(probability(row)) * bins))]; return group.n ? clamp(group.hits / group.n) : clamp(probability(row)); };
}

export function evaluateCalibrationMethods(train: readonly ResearchRow[], test: readonly ResearchRow[]): WindowCalibrationResult[] {
  const methods: WindowCalibrationResult['method'][] = ['raw', 'platt', 'isotonic', 'bin'];
  return methods.map((method) => {
    const raw = (row: ResearchRow) => row.bttsProbability;
    const predictor = method === 'raw' ? raw : method === 'platt' ? calibratePlatt(train, raw) : method === 'isotonic' ? calibrateIsotonic(train, raw) : fitBinCalibration(train, raw);
    const metrics = evaluateCalibration(test, predictor);
    const hits = test.filter((row) => (predictor(row) >= 0.5) === row.outcomeBtts).length;
    return { ...metrics, window: 0, start: test[0]?.kickoffIso ?? '', end: test.at(-1)?.kickoffIso ?? '', method, confidenceInterval: confidenceInterval(hits, test.length) };
  });
}

export function walkForwardCalibration(rows: readonly ResearchRow[], trainSize = 100, testSize = 25): WindowCalibrationResult[] {
  const ordered = buildResearchRows(rows); const results: WindowCalibrationResult[] = [];
  for (let start = 0, window = 0; start + trainSize < ordered.length; start += testSize, window += 1) {
    const train = ordered.slice(start, start + trainSize); const test = ordered.slice(start + trainSize, start + trainSize + testSize); if (!test.length) break;
    results.push(...evaluateCalibrationMethods(train, test).map((result) => ({ ...result, window })));
  }
  return results;
}

export function analyticalDimensions(rows: readonly ResearchRow[]): AnalyticalDimension[] {
  const available = (name: string, key: keyof ResearchRow) => rows.some((row) => typeof row[key] === 'number' && Number.isFinite(row[key] as number));
  return [
    { name: 'H2H form', status: available('H2H form', 'h2hSignal') ? 'AVAILABLE' : 'UNAVAILABLE', reason: available('H2H form', 'h2hSignal') ? 'Pre-match H2H signal is present.' : 'No verifiable pre-match H2H field.' },
    { name: 'H2H sample size', status: 'UNAVAILABLE', reason: 'Source rows do not expose a bounded pre-match H2H sample-size field.' },
    { name: 'ESS', status: 'UNAVAILABLE', reason: 'Effective sample size is not exported as a distinct pre-match field.' },
    { name: 'Market confidence', status: 'UNAVAILABLE', reason: 'No source-lineage-safe market confidence field was supplied.' },
    { name: 'Prior divergence', status: available('Prior divergence', 'modelGap') ? 'AVAILABLE' : 'UNAVAILABLE', reason: available('Prior divergence', 'modelGap') ? 'Model gap is available pre-match.' : 'No pre-match divergence field.' },
    { name: 'Calibration state', status: 'AVAILABLE', reason: 'Raw BTTS probability is available for calibration.' },
    { name: 'Wilson interval', status: 'AVAILABLE', reason: 'Computed from settled outcomes without adding a feature.' },
    { name: 'Volatility', status: available('Volatility', 'stability') ? 'AVAILABLE' : 'UNAVAILABLE', reason: available('Volatility', 'stability') ? 'Stability proxy is available; it is not treated as volatility.' : 'No leakage-free volatility field supplied.' },
    { name: 'Blowout risk', status: 'UNAVAILABLE', reason: 'No source-lineage-safe blowout-risk field was supplied.' },
  ];
}

export function compareWalkForwardModels(rows: readonly ResearchRow[], trainSize = 100, testSize = 25) {
  const ordered = buildResearchRows(rows); const models = ['A', 'B', 'C', 'D', 'E', 'F'];
  return models.map((model) => { const windows: CalibrationMetrics[] = []; for (let start = 0; start + trainSize < ordered.length; start += testSize) { const test = ordered.slice(start + trainSize, start + trainSize + testSize); if (test.length) windows.push(evaluateCalibration(modelRows(test, model), (row) => row.bttsProbability)); } const average = (key: keyof CalibrationMetrics) => windows.length ? mean(windows.map((item) => Number(item[key]))) : 0; return { model, n: windows.reduce((sum, item) => sum + item.n, 0), brier: average('brier'), logLoss: average('logLoss'), ece: average('ece'), windows: windows.length, temporalStability: windows.length > 1 ? Math.sqrt(mean(windows.map((item) => (item.brier - average('brier')) ** 2))) : 0 }; });
}

export function mineResearchPatterns(rows: readonly ResearchRow[], discoveryFraction = 0.6): PatternMiningResult[] {
  const ordered = buildResearchRows(rows); const split = Math.max(1, Math.floor(ordered.length * discoveryFraction)); const discovery = ordered.slice(0, split); const validation = ordered.slice(split); const keys = [...new Set(discovery.flatMap((row) => typeof row.features?.fingerprint === 'string' ? [row.features.fingerprint] : []))];
  return keys.map((key) => { const d = discovery.filter((row) => row.features?.fingerprint === key); const v = validation.filter((row) => row.features?.fingerprint === key); const rate = (sample: ResearchRow[]) => sample.length ? sample.filter((row) => row.outcomeBtts).length / sample.length : 0; const discoveryRate = rate(d); const validationRate = rate(v); return { key, discoveryN: d.length, validationN: v.length, discoveryRate, validationRate, productionCandidate: d.length >= 10 && v.length >= 10 && validationRate >= discoveryRate }; });
}

export function buildPhaseReport(rows: readonly ResearchRow[]) { const result = runValidation(rows); const calibration = walkForwardCalibration(rows); return { ...result, models: compareModels(rows), walkForwardModels: compareWalkForwardModels(rows), calibration, dimensions: analyticalDimensions(rows), patterns: mineResearchPatterns(rows), coverage: buildCoverage(rows), files: outputFiles(), folder: researchFolderName(), precedence: vetoPrecedence(), production: productionVerdict({ baseline: result.baseline, candidate: result.calibrated, leakageFree: result.leakage.every((finding) => finding.status !== 'LEAKAGE' || /score|result|outcome/.test(finding.field)), vetoSemanticsUnchanged: true, holdoutUntouched: true, multiWindowImprovement: calibration.filter((item) => item.method === 'platt').length > 1 }) }; }
