/**
 * First-load hydration of an EMPTY browser store from the sealed cloud version.
 *
 * Kept out of App.tsx so the orchestration is unit-testable. The freshness marker is written
 * ONLY when the import really recorded seasons; a busy/failed import never claims "up to date".
 */
import {
  fetchCloudSeasonList,
  fetchCloudSeasonsConcurrently,
  fetchCurrentSealedVersion,
} from './supabaseTier';
import { writeCloudMarker } from './cloudFreshness';
import type { ImportOptions, ImportOutcome } from '../hooks/useWinmixEngine';
import type { LeagueMode } from '../types/winmix';

export type CloudBootstrapStatus = 'no-cloud-data' | 'imported' | 'import-failed';

export interface CloudBootstrapDeps {
  importFiles: (
    files: File[],
    mode: LeagueMode,
    options?: ImportOptions
  ) => Promise<ImportOutcome | void>;
  onStart?: (total: number) => void;
  onProgress?: (done: number, total: number) => void;
  /** Called right before the (blocking) import starts, e.g. to dismiss the progress toast. */
  onDownloaded?: () => void;
}

/** Throws on network/validation errors (caller decides how to report and whether to retry). */
export async function bootstrapFromCloud(deps: CloudBootstrapDeps): Promise<CloudBootstrapStatus> {
  const version = await fetchCurrentSealedVersion();
  if (!version) return 'no-cloud-data';

  const seasons = await fetchCloudSeasonList(undefined, version.id);
  if (seasons.length === 0) return 'no-cloud-data';

  deps.onStart?.(seasons.length);
  // Bounded concurrency; ordered and all-or-nothing.
  const downloads = await fetchCloudSeasonsConcurrently(seasons, { onProgress: deps.onProgress });
  deps.onDownloaded?.();

  const files = downloads.map(
    (download) => new File([download.csvText], download.meta.fileName, { type: 'text/csv' })
  );
  const outcome = await deps.importFiles(files, 'auto', { skipCloudSync: true });

  if (!outcome || !outcome.ok) return 'import-failed';
  writeCloudMarker(version);
  return 'imported';
}
