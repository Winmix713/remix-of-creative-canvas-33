import { describe, it, expect } from 'vitest';
import {
  canonicalTeamPairKey,
  getOrFetchTeamPair,
  pairCacheKey,
  type KeyValueStore,
  type PairCacheScope
} from '../utils/pairCache';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();
  async get(key: string) { return this.data.get(key); }
  async set(key: string, value: unknown) { this.data.set(key, value); }
  async clear() { this.data.clear(); }
}

const scope: PairCacheScope = { versionId: 'v1', fingerprint: 'fp1', league: 'angol' };
const pair = { teamA: 'Arsenal', teamB: 'Chelsea' };

describe('canonicalTeamPairKey', () => {
  it('is the same regardless of home/away order', () => {
    expect(canonicalTeamPairKey('Arsenal', 'Chelsea')).toBe(canonicalTeamPairKey('Chelsea', 'Arsenal'));
  });
});

describe('pairCacheKey', () => {
  it('changes with version, fingerprint and league', () => {
    const base = pairCacheKey(scope, pair);
    expect(pairCacheKey({ ...scope, versionId: 'v2' }, pair)).not.toBe(base);
    expect(pairCacheKey({ ...scope, fingerprint: 'fp2' }, pair)).not.toBe(base);
    expect(pairCacheKey({ ...scope, league: 'spanyol' }, pair)).not.toBe(base);
  });

  it('ignores team order and does not collide on separator characters', () => {
    expect(pairCacheKey(scope, { teamA: 'A|B', teamB: 'C' })).not.toBe(pairCacheKey(scope, { teamA: 'A', teamB: 'B|C' }));
    expect(pairCacheKey(scope, pair)).toBe(pairCacheKey(scope, { teamA: 'Chelsea', teamB: 'Arsenal' }));
  });
});

describe('getOrFetchTeamPair', () => {
  it('fetches on a miss and serves the second call from the cache', async () => {
    const store = new MemoryStore();
    let calls = 0;
    const fetchPair = async () => { calls += 1; return [{ score: '2-1' }]; };

    const first = await getOrFetchTeamPair(store, scope, pair, fetchPair);
    const second = await getOrFetchTeamPair(store, scope, { teamA: 'Chelsea', teamB: 'Arsenal' }, fetchPair);

    expect(first).toEqual([{ score: '2-1' }]);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  it('does not cache a failed fetch', async () => {
    const store = new MemoryStore();
    await expect(
      getOrFetchTeamPair(store, scope, pair, async () => { throw new Error('network'); })
    ).rejects.toThrow('network');

    let calls = 0;
    await getOrFetchTeamPair(store, scope, pair, async () => { calls += 1; return []; });
    expect(calls).toBe(1);
  });

  it('keeps entries while the version stays the same', async () => {
    const store = new MemoryStore();
    await getOrFetchTeamPair(store, scope, pair, async () => ['kept']);
    await getOrFetchTeamPair(store, scope, { teamA: 'Spurs', teamB: 'Everton' }, async () => ['other']);

    let calls = 0;
    const result = await getOrFetchTeamPair(store, scope, pair, async () => { calls += 1; return ['refetched']; });
    expect(result).toEqual(['kept']);
    expect(calls).toBe(0);
  });

  it('drops every entry when a new cloud version appears', async () => {
    const store = new MemoryStore();
    await getOrFetchTeamPair(store, scope, pair, async () => ['old']);

    const newScope = { ...scope, versionId: 'v2', fingerprint: 'fp2' };
    let calls = 0;
    const result = await getOrFetchTeamPair(store, newScope, pair, async () => { calls += 1; return ['new']; });

    expect(result).toEqual(['new']);
    expect(calls).toBe(1);
    expect([...store.data.keys()].some((key) => key.includes('"v1"'))).toBe(false);
  });
});
