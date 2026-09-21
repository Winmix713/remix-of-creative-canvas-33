/**
 * WinMixStudio — runtime domain guards
 * ------------------------------------
 *
 * Runtime validation / coherence helpers for values that can cross an
 * untrusted or persistence boundary:
 * - localStorage
 * - imported JSON
 * - checkpoints
 * - persisted slip lines
 * - model feature vectors
 *
 * IMPORTANT:
 * `src/types/winmix.ts` remains the single domain-type file.
 * This module does NOT redefine domain types; it only validates and resolves
 * values already described by that contract.
 *
 * Design principles:
 * 1. TypeScript types describe the compile-time contract.
 * 2. Runtime guards protect that contract when data is loaded from storage,
 *    imported from JSON, or restored from older application versions.
 * 3. Legacy optional fields are not rejected merely because they are absent.
 * 4. Contradictory duplicated state is never silently preferred.
 */

import type {
  BttsBlowoutRiskAssessment,
  CoreEvidenceLevel,
  FeatureVector,
  MarketCalibrationReport,
  PipelineCheckpoint,
  SlipLine,
} from '../types/winmix';

/* -------------------------------------------------------------------------- */
/* Primitive helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Finite-number guard.
 *
 * `Number.isFinite()` is intentionally used instead of a loose numeric check:
 * NaN, Infinity and -Infinity are not valid model inputs.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Non-empty string guard used at persistence / checkpoint boundaries.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Safe own-property check. Useful when validating plain JSON objects without
 * assuming they were created with Object.prototype.
 */
function hasOwn(
  value: unknown,
  key: PropertyKey,
): value is Record<PropertyKey, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

/* -------------------------------------------------------------------------- */
/* FeatureVector                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The exact 20 load-bearing FeatureVector dimensions.
 *
 * Keep this list synchronized with `FeatureVector` in `winmix.ts`.
 * Do NOT rename dimensions here: the names are part of the persisted model
 * contract.
 */
export const FEATURE_VECTOR_KEYS = [
  'home_weight_index',
  'away_weight_index',
  'weight_diff',
  'home_att_home',
  'home_def_home',
  'away_att_away',
  'away_def_away',
  'league_home_gpm',
  'league_away_gpm',
  'home_form_5',
  'away_form_5',
  'home_gd_form_5',
  'away_gd_form_5',
  'h2h_home_ppg',
  'htGoalRate5',
  'htLeadConversionHome',
  'htLeadConversionAway',
  'secondHalfGoalRatio',
  'prevMatchTotalGoalsHome',
  'prevMatchTotalGoalsAway',
] as const;

export type FeatureVectorKey = (typeof FEATURE_VECTOR_KEYS)[number];

/**
 * Runtime sanity check for the 20-dimensional feature contract.
 *
 * This is intentionally NOT a complete semantic/domain validator. It answers
 * one narrower question:
 *
 *   "Can this value safely be treated as a FeatureVector at runtime?"
 *
 * Every load-bearing dimension must exist and contain a finite number.
 */
export function isValidFeatureVector(value: unknown): value is FeatureVector {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  for (const key of FEATURE_VECTOR_KEYS) {
    if (!hasOwn(value, key) || !isFiniteNumber(value[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the missing / invalid FeatureVector dimensions.
 *
 * Useful for diagnostics and import reports. The boolean guard above should
 * remain the canonical yes/no validator.
 */
export function invalidFeatureVectorKeys(value: unknown): FeatureVectorKey[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [...FEATURE_VECTOR_KEYS];
  }

  return FEATURE_VECTOR_KEYS.filter(
    (key) => !hasOwn(value, key) || !isFiniteNumber(value[key]),
  );
}

/* -------------------------------------------------------------------------- */
/* Core evidence coherence                                                    */
/* -------------------------------------------------------------------------- */

/**
 * CoreEvidenceSnapshot.level is the canonical live evidence state.
 *
 * A coherent snapshot is deliberately conservative:
 * - an absent snapshot is not considered contradictory;
 * - a snapshot without a level is not a valid evidence snapshot;
 * - a level must be one of the domain values.
 *
 * The deeper evidence rules (evaluable / observations / widened / disproved)
 * belong to the core-evidence domain utility. This guard only protects the
 * duplicated `SlipLine.evidenceLevel` representation.
 */
const CORE_EVIDENCE_LEVELS = new Set<CoreEvidenceLevel>([
  'calibrated',
  'conditional',
  'excluded',
]);

function isCoreEvidenceLevel(value: unknown): value is CoreEvidenceLevel {
  return (
    typeof value === 'string' &&
    CORE_EVIDENCE_LEVELS.has(value as CoreEvidenceLevel)
  );
}

/**
 * Resolve the evidence level from a persisted SlipLine.
 *
 * Canonical precedence:
 *   1. `coreEvidence.level` when present and valid
 *   2. denormalized `evidenceLevel` for legacy records
 *   3. null
 *
 * When both fields exist but disagree, the canonical snapshot wins.
 * `isCoherentSlipLine()` can be used when the caller needs to reject the
 * contradictory record instead of merely resolving it.
 */
export function getCoherentEvidenceLevel(
  line: Pick<SlipLine, 'coreEvidence' | 'evidenceLevel'>,
): CoreEvidenceLevel | null {
  const snapshot = line.coreEvidence;

  if (
    snapshot !== null &&
    snapshot !== undefined &&
    isCoreEvidenceLevel(snapshot.level)
  ) {
    return snapshot.level;
  }

  if (isCoreEvidenceLevel(line.evidenceLevel)) {
    return line.evidenceLevel;
  }

  return null;
}

/**
 * Checks the duplicated evidence representation on a SlipLine.
 *
 * Compatibility rule:
 * - only one representation present → coherent;
 * - neither present → coherent legacy record;
 * - both present and equal → coherent;
 * - both present and different → contradictory.
 *
 * This deliberately does not reject a legacy line merely because it has no
 * `coreEvidence` snapshot.
 */
export function isCoherentSlipLine(
  line: Pick<SlipLine, 'coreEvidence' | 'evidenceLevel'>,
): boolean {
  const snapshotLevel =
    line.coreEvidence !== null &&
    line.coreEvidence !== undefined &&
    isCoreEvidenceLevel(line.coreEvidence.level)
      ? line.coreEvidence.level
      : null;

  const denormalizedLevel = isCoreEvidenceLevel(line.evidenceLevel)
    ? line.evidenceLevel
    : null;

  if (snapshotLevel === null || denormalizedLevel === null) {
    return true;
  }

  return snapshotLevel === denormalizedLevel;
}

/* -------------------------------------------------------------------------- */
/* BTTS veto coherence                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The legacy BTTS representation stores two parallel arrays:
 * `reasonCodes` and `vetoReasons`.
 *
 * The producer currently keeps them in lockstep. This guard makes that
 * invariant explicit at the persistence / rendering boundary.
 *
 * `reasonEntries`, when present, is the structured additive representation
 * introduced to eliminate positional coupling for new records.
 */
export function isCoherentBttsRisk(
  risk: Pick<
    BttsBlowoutRiskAssessment,
    'reasonCodes' | 'vetoReasons' | 'reasonEntries'
  >,
): boolean {
  const codes = Array.isArray(risk.reasonCodes) ? risk.reasonCodes : [];
  const messages = Array.isArray(risk.vetoReasons) ? risk.vetoReasons : [];

  if (codes.length !== messages.length) {
    return false;
  }

  if (risk.reasonEntries !== undefined) {
    if (!Array.isArray(risk.reasonEntries)) {
      return false;
    }

    if (risk.reasonEntries.length !== codes.length) {
      return false;
    }

    for (let index = 0; index < codes.length; index += 1) {
      const entry = risk.reasonEntries[index];

      if (
        !entry ||
        entry.code !== codes[index] ||
        entry.message !== messages[index]
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Returns the structured BTTS veto entries.
 *
 * New records use `reasonEntries`; legacy records are upgraded in memory from
 * the two parallel arrays without mutating the source object.
 */
export function getBttsVetoReasonEntries(
  risk: Pick<
    BttsBlowoutRiskAssessment,
    'reasonCodes' | 'vetoReasons' | 'reasonEntries'
  >,
): NonNullable<BttsBlowoutRiskAssessment['reasonEntries']> {
  if (Array.isArray(risk.reasonEntries)) {
    return risk.reasonEntries;
  }

  const codes = Array.isArray(risk.reasonCodes) ? risk.reasonCodes : [];
  const messages = Array.isArray(risk.vetoReasons) ? risk.vetoReasons : [];

  const length = Math.min(codes.length, messages.length);

  return Array.from({ length }, (_, index) => ({
    code: codes[index],
    message: messages[index],
  }));
}

/* -------------------------------------------------------------------------- */
/* Market calibration                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `MarketCalibrationReport.calibrated` is derived state.
 *
 * The canonical semantic source is `verdict`.
 *
 * This helper intentionally does not reimplement the band-level calibration
 * algorithm. Band calibration answers a lower-level question; report verdict
 * is the report-level state consumed by the rest of the application.
 */
export function isMarketCalibrated(
  report: Pick<MarketCalibrationReport, 'verdict'>,
): boolean {
  return report.verdict === 'calibrated';
}

/**
 * Checks whether the denormalized report boolean agrees with its canonical
 * verdict.
 */
export function isCoherentMarketCalibrationReport(
  report: Pick<MarketCalibrationReport, 'calibrated' | 'verdict'>,
): boolean {
  return report.calibrated === isMarketCalibrated(report);
}

/* -------------------------------------------------------------------------- */
/* Pipeline checkpoint                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Options for checkpoint compatibility validation.
 *
 * Expected versions/signatures come from the CURRENT runtime, not from the
 * checkpoint itself. This is what makes the function a real trust-boundary
 * check rather than a self-consistency check.
 */
export interface PipelineCheckpointValidationOptions {
  expectedFeatureSchemaVersion: number;
  expectedPipelineContractVersion?: number;
  expectedPrefixSignature?: string;
  expectedWeightsSignature?: string;
  expectedExperimentsKey?: string;
  expectedHistoryScope?: PipelineCheckpoint['historyScope'];
}

/**
 * Structured validation result.
 *
 * Keeping reasons separate makes the guard useful for diagnostics while the
 * boolean wrapper below stays convenient for call sites.
 */
export interface PipelineCheckpointValidationResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validate checkpoint compatibility with the current runtime.
 *
 * Checks the trust-boundary fields already defined by the WinMix pipeline:
 * - feature schema
 * - pipeline contract
 * - processed-prefix signature
 * - team-weight signature
 * - experiment key
 * - history scope
 *
 * Optional expected values are only checked when the caller supplies them.
 * This permits the same helper to be used by both full restore validation and
 * narrower cache checks.
 */
export function validatePipelineCheckpoint(
  checkpoint: unknown,
  options: PipelineCheckpointValidationOptions,
): PipelineCheckpointValidationResult {
  const reasons: string[] = [];

  if (
    typeof checkpoint !== 'object' ||
    checkpoint === null ||
    Array.isArray(checkpoint)
  ) {
    return {
      valid: false,
      reasons: ['checkpoint_not_object'],
    };
  }

  const candidate = checkpoint as Partial<PipelineCheckpoint>;

  if (!isFiniteNumber(candidate.featureSchemaVersion)) {
    reasons.push('feature_schema_version_missing_or_invalid');
  } else if (
    candidate.featureSchemaVersion !== options.expectedFeatureSchemaVersion
  ) {
    reasons.push('feature_schema_version_mismatch');
  }

  if (options.expectedPipelineContractVersion !== undefined) {
    if (!isFiniteNumber(candidate.pipelineContractVersion)) {
      reasons.push('pipeline_contract_version_missing_or_invalid');
    } else if (
      candidate.pipelineContractVersion !==
      options.expectedPipelineContractVersion
    ) {
      reasons.push('pipeline_contract_version_mismatch');
    }
  }

  if (options.expectedPrefixSignature !== undefined) {
    if (!isNonEmptyString(candidate.prefixSignature)) {
      reasons.push('prefix_signature_missing_or_invalid');
    } else if (candidate.prefixSignature !== options.expectedPrefixSignature) {
      reasons.push('prefix_signature_mismatch');
    }
  }

  if (options.expectedWeightsSignature !== undefined) {
    if (!isNonEmptyString(candidate.weightsSignature)) {
      reasons.push('weights_signature_missing_or_invalid');
    } else if (
      candidate.weightsSignature !== options.expectedWeightsSignature
    ) {
      reasons.push('weights_signature_mismatch');
    }
  }

  if (options.expectedExperimentsKey !== undefined) {
    if (!isNonEmptyString(candidate.experimentsKey)) {
      reasons.push('experiments_key_missing_or_invalid');
    } else if (candidate.experimentsKey !== options.expectedExperimentsKey) {
      reasons.push('experiments_key_mismatch');
    }
  }

  if (options.expectedHistoryScope !== undefined) {
    if (candidate.historyScope !== options.expectedHistoryScope) {
      reasons.push('history_scope_mismatch');
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Boolean checkpoint validator for normal call sites.
 */
export function isValidPipelineCheckpoint(
  checkpoint: unknown,
  options: PipelineCheckpointValidationOptions,
): checkpoint is PipelineCheckpoint {
  return validatePipelineCheckpoint(checkpoint, options).valid;
}

/* -------------------------------------------------------------------------- */
/* Optional convenience validators                                            */
/* -------------------------------------------------------------------------- */

/**
 * Validate only the checkpoint's intrinsic trust-boundary fields when the
 * current runtime signatures are not available.
 *
 * This does NOT establish compatibility with the current application.
 * It only verifies that the persisted values have the expected primitive
 * shapes. Use `validatePipelineCheckpoint()` for compatibility validation.
 */
export function hasValidCheckpointTrustFields(
  checkpoint: unknown,
): checkpoint is PipelineCheckpoint {
  if (
    typeof checkpoint !== 'object' ||
    checkpoint === null ||
    Array.isArray(checkpoint)
  ) {
    return false;
  }

  const candidate = checkpoint as Partial<PipelineCheckpoint>;

  return (
    isFiniteNumber(candidate.featureSchemaVersion) &&
    isFiniteNumber(candidate.processedMatchCount) &&
    candidate.processedMatchCount >= 0 &&
    isNonEmptyString(candidate.prefixSignature) &&
    isNonEmptyString(candidate.weightsSignature) &&
    isNonEmptyString(candidate.experimentsKey) &&
    (candidate.historyScope === 'season-only' ||
      candidate.historyScope === 'league-cumulative') &&
    isFiniteNumber(candidate.T) &&
    isFiniteNumber(candidate.ensembleWM1) &&
    typeof candidate.ensembleTuned === 'boolean' &&
    isNonEmptyString(candidate.savedAt)
  );
}

/* -------------------------------------------------------------------------- */
/* Aggregate diagnostic helpers                                               */
/* -------------------------------------------------------------------------- */

/**
 * Returns all coherence failures that are relevant to the supplied objects.
 *
 * This is intentionally non-throwing: persisted-data validation should report
 * a bad record rather than crash the application.
 */
export interface WinmixCoherenceReport {
  valid: boolean;
  issues: string[];
}

export function inspectWinmixCoherence(input: {
  slipLine?: Pick<SlipLine, 'coreEvidence' | 'evidenceLevel'> | null;
  bttsRisk?: Pick<
    BttsBlowoutRiskAssessment,
    'reasonCodes' | 'vetoReasons' | 'reasonEntries'
  > | null;
  marketCalibration?: Pick<
    MarketCalibrationReport,
    'calibrated' | 'verdict'
  > | null;
}): WinmixCoherenceReport {
  const issues: string[] = [];

  if (input.slipLine && !isCoherentSlipLine(input.slipLine)) {
    issues.push('slip_line_evidence_level_mismatch');
  }

  if (input.bttsRisk && !isCoherentBttsRisk(input.bttsRisk)) {
    issues.push('btts_veto_reason_alignment_mismatch');
  }

  if (
    input.marketCalibration &&
    !isCoherentMarketCalibrationReport(input.marketCalibration)
  ) {
    issues.push('market_calibration_derived_state_mismatch');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
