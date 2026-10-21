/**
 * IndexedDB-backed cache for the full WinMix domain state INCLUDING per-match
 * pipeline output. The regular localStorage snapshot strips pipeline data
 * (it's large and was assumed ephemeral), which forces a full recompute on
 * every reload — and with ~25k matches the snapshot itself can exceed the
 * localStorage quota, in which case nothing is restored at all. This cache
 * stores the complete seasons array with predictions intact, so a reload that
 * matches the current schema versions restores instantly with zero recompute
 * and zero network traffic.
 *
 * Storage layout (one object store, three records):
 *   - `seasons` — the heavy part: the seasons array with pipeline output.
 *   - `meta`    — everything else (weights, aliases, settings, round, slips…),
 *                 small, rewritten on every save.
 *   - `full-state` — legacy single-record layout; only ever deleted.
 *
 * Splitting the records means an edit that does not touch the seasons (round
 * entry, slips, settings) never re-clones tens of megabytes of match data. A
 * `seasonStamp` is stored in both heavy and light records and must match on
 * load, so a torn write can never pair new metadata with old seasons.
 *
 * The cache is keyed on three version stamps: STORAGE schema, FEATURE schema
 * and PIPELINE contract. Any mismatch discards the blob — exactly like the
 * checkpoint store, never attempting a migration across a dimensionality
 * change.
 */

import {
  FEATURE_SCHEMA_VERSION,
  PIPELINE_CONTRACT_VERSION,
  SCHEMA_VERSION
} from './constants';
import type { CalibrationMap, Season, Slip, FixtureRound, AliasMap, SeasonCounters, WeightMap, WinmixSettings } from '../types/winmix';

const DB_NAME = 'winmix-pipeline-cache';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const SEASONS_KEY = 'seasons';
const META_KEY = 'meta';
const LEGACY_KEY = 'full-state';

export interface CachedPipelineState {
  schemaVersion: number;
  featureSchemaVersion: number;
  pipelineContractVersion: number;
  savedAt: string;
  seasons: Season[];
  teamWeights: WeightMap;
  teamAliasMap: AliasMap;
  seasonCounters: SeasonCounters;
  calibration: CalibrationMap;
  settings: WinmixSettings;
  round: FixtureRound;
  slips: Slip[];
  manualWeightOverrides?: WeightMap;
}

interface VersionStamps {
  schemaVersion: number;
  featureSchemaVersion: number;
  pipelineContractVersion: number;
}

type CachedMeta = Omit<CachedPipelineState, 'seasons'> & { seasonStamp: string };
interface CachedSeasons extends VersionStamps {
  savedAt: string;
  seasonStamp: string;
  seasons: Season[];
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
/** Seasons array reference last written (or being written) to the heavy record. */
let lastWrittenSeasons: Season[] | null = null;
let lastWrittenStamp: string | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Cheap integrity stamp: season identities, match counts and how many matches
 * carry pipeline output. O(matches) but only integer work — a few ms for 25k
 * matches. Two different season sets cannot share a stamp in practice.
 */
export function seasonStamp(seasons: readonly Season[]): string {
  let matches = 0;
  let withPipeline = 0;
  const ids: string[] = [];
  for (const season of seasons) {
    ids.push(`${season.id}:${season.contentHash ?? ''}`);
    for (const match of season.matches) {
      matches += 1;
      if (match.pipeline) withPipeline += 1;
    }
  }
  return `${seasons.length}|${matches}|${withPipeline}|${ids.join(',')}`;
}

function hasCurrentVersions(value: VersionStamps): boolean {
  return (
    value.schemaVersion === SCHEMA_VERSION &&
    value.featureSchemaVersion === FEATURE_SCHEMA_VERSION &&
    value.pipelineContractVersion === PIPELINE_CONTRACT_VERSION
  );
}

function isVersionStamps(value: Record<string, unknown>): value is Record<string, unknown> & VersionStamps {
  return (
    typeof value.schemaVersion === 'number' &&
    typeof value.featureSchemaVersion === 'number' &&
    typeof value.pipelineContractVersion === 'number'
  );
}

function isCachedMeta(value: unknown): value is CachedMeta {
  if (!isRecord(value) || !isVersionStamps(value)) return false;

  return (
    typeof value.savedAt === 'string' &&
    typeof value.seasonStamp === 'string' &&
    isRecord(value.teamWeights) &&
    isRecord(value.teamAliasMap) &&
    isRecord(value.seasonCounters) &&
    isRecord(value.calibration) &&
    isRecord(value.settings) &&
    isRecord(value.round) &&
    Array.isArray(value.slips)
  );
}

function isCachedSeasons(value: unknown): value is CachedSeasons {
  if (!isRecord(value) || !isVersionStamps(value)) return false;

  return (
    typeof value.savedAt === 'string' &&
    typeof value.seasonStamp === 'string' &&
    Array.isArray(value.seasons)
  );
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function deleteAllRecords(db: IDBDatabase): Promise<void> {
  lastWrittenSeasons = null;
  lastWrittenStamp = null;
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(SEASONS_KEY);
    store.delete(META_KEY);
    store.delete(LEGACY_KEY);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Best effort only.
  }
}

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };

        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        // Another tab is holding an old connection. The cache is optional,
        // so do not make application startup depend on IndexedDB progress.
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

export function isPipelineCacheAvailable(): Promise<boolean> {
  return openDB().then((db) => db !== null);
}

/**
 * Persists the state. The heavy seasons record is only rewritten when the
 * seasons array (by reference, confirmed by the integrity stamp) changed since
 * the previous write; the small metadata record is always rewritten.
 */
export async function savePipelineCache(state: CachedPipelineState): Promise<void> {
  const db = await openDB();
  if (!db) return;

  const { seasons, ...rest } = state;
  const stamp = seasonStamp(seasons);
  const writeSeasons = seasons !== lastWrittenSeasons || stamp !== lastWrittenStamp;

  // Optimistic: concurrent saves queue behind this transaction. A failure
  // resets the marker so the next save rewrites the heavy record.
  const previousSeasons = lastWrittenSeasons;
  const previousStamp = lastWrittenStamp;
  lastWrittenSeasons = seasons;
  lastWrittenStamp = stamp;

  try {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (writeSeasons) {
      const record: CachedSeasons = {
        schemaVersion: state.schemaVersion,
        featureSchemaVersion: state.featureSchemaVersion,
        pipelineContractVersion: state.pipelineContractVersion,
        savedAt: state.savedAt,
        seasonStamp: stamp,
        seasons
      };
      store.put(record, SEASONS_KEY);
      store.delete(LEGACY_KEY);
    }
    const meta: CachedMeta = { ...rest, seasonStamp: stamp };
    store.put(meta, META_KEY);
    await transactionDone(tx);
  } catch {
    // Cache is best-effort; a failed write must never break the app.
    lastWrittenSeasons = writeSeasons ? null : previousSeasons;
    lastWrittenStamp = writeSeasons ? null : previousStamp;
  }
}

export async function loadPipelineCache(): Promise<CachedPipelineState | null> {
  const db = await openDB();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const seasonsReq = store.get(SEASONS_KEY);
    const metaReq = store.get(META_KEY);
    const [seasonsRecord, metaRecord] = await new Promise<[unknown, unknown]>((resolve) => {
      tx.oncomplete = () => resolve([seasonsReq.result ?? null, metaReq.result ?? null]);
      tx.onerror = () => resolve([null, null]);
      tx.onabort = () => resolve([null, null]);
    });

    // Nothing cached yet (or only the legacy layout): not an error, and not
    // worth deleting anything for.
    if (seasonsRecord === null && metaRecord === null) return null;

    if (
      !isCachedSeasons(seasonsRecord) ||
      !isCachedMeta(metaRecord) ||
      !hasCurrentVersions(seasonsRecord) ||
      !hasCurrentVersions(metaRecord) ||
      seasonsRecord.seasonStamp !== metaRecord.seasonStamp ||
      seasonStamp(seasonsRecord.seasons) !== seasonsRecord.seasonStamp
    ) {
      await deleteAllRecords(db);
      return null;
    }

    const { seasonStamp: _stamp, ...meta } = metaRecord;
    lastWrittenSeasons = seasonsRecord.seasons;
    lastWrittenStamp = seasonsRecord.seasonStamp;
    return { ...meta, seasons: seasonsRecord.seasons };
  } catch {
    return null;
  }
}

export async function clearPipelineCache(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  await deleteAllRecords(db);
}

/**
 * Returns the cache timestamp without exposing the IndexedDB record itself.
 * Useful for UI diagnostics where the application wants to tell the user
 * whether a restored pipeline is recent.
 */
export async function getPipelineCacheSavedAt(): Promise<string | null> {
  const state = await loadPipelineCache();
  return state?.savedAt ?? null;
}