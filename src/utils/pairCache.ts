/**
 * Persistent cache for head-to-head team-pair results.
 *
 * Sealed cloud versions are immutable, so a pair's results never change while
 * the version and its fingerprint stay the same. Entries therefore never expire
 * by time; they are dropped only when a different cloud version is seen.
 *
 * The key includes the version identity so a stale entry can never be served,
 * even if clearing it were skipped.
 */
import type { League } from '../types/winmix';

const DB_NAME = 'winmix-pair-cache';
const DB_VERSION = 1;
const STORE_NAME = 'pairs';
const VERSION_KEY = '__cache_version__';

export interface PairCacheScope {
  versionId: string;
  fingerprint: string | null;
  league: League;
}

export interface TeamPair {
  teamA: string;
  teamB: string;
}

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

export function canonicalTeamPairKey(teamA: string, teamB: string): string {
  return JSON.stringify([teamA, teamB].sort());
}

export function pairCacheKey(scope: PairCacheScope, pair: TeamPair): string {
  return JSON.stringify([
    scope.versionId,
    scope.fingerprint,
    scope.league,
    canonicalTeamPairKey(pair.teamA, pair.teamB)
  ]);
}

function versionMarker(scope: PairCacheScope): string {
  return JSON.stringify([scope.versionId, scope.fingerprint]);
}

export async function ensurePairCacheVersion(store: KeyValueStore, scope: PairCacheScope): Promise<void> {
  const marker = versionMarker(scope);
  if ((await store.get(VERSION_KEY)) === marker) return;
  await store.clear();
  await store.set(VERSION_KEY, marker);
}

/**
 * Returns the cached result for the pair, or runs `fetchPair` and stores its
 * result. A rejected fetch is propagated and nothing is written.
 */
export async function getOrFetchTeamPair<T>(
  store: KeyValueStore,
  scope: PairCacheScope,
  pair: TeamPair,
  fetchPair: () => Promise<T>
): Promise<T> {
  await ensurePairCacheVersion(store, scope);
  const key = pairCacheKey(scope, pair);
  const cached = await store.get(key);
  if (cached !== undefined) return cached as T;
  const fresh = await fetchPair();
  await store.set(key, fresh);
  return fresh;
}

/**
 * IndexedDB-backed store. Failures are treated as cache misses: the cache is
 * best-effort and must never block the page.
 */
export function createIndexedDbStore(): KeyValueStore {
  let dbPromise: Promise<IDBDatabase | null> | null = null;

  const openDb = (): Promise<IDBDatabase | null> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    });
    return dbPromise;
  };

  const runTransaction = async (
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest
  ): Promise<unknown> => {
    const db = await openDb();
    if (!db) return undefined;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      let result: unknown = undefined;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    });
  };

  return {
    get: (key) => runTransaction('readonly', (store) => store.get(key)),
    set: async (key, value) => {
      await runTransaction('readwrite', (store) => store.put(value, key));
    },
    clear: async () => {
      await runTransaction('readwrite', (store) => store.clear());
    }
  };
}
