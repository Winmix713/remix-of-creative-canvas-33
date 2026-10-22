import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sessionToken: vi.fn() }));
vi.mock('../src/integrations/supabase/client', () => ({ sessionToken: mocks.sessionToken, getSupabase: vi.fn() }));

import {
  CLOUD_MARKER_KEY, checkCloudFreshness, clearCloudMarker, isCloudNewer, readCloudMarker, writeCloudMarker
} from '../src/utils/cloudFreshness';

const version = (over: Record<string, unknown> = {}) => ({
  id: 'v1', versionKey: 'k', status: 'sealed', isCurrent: true, revision: 1,
  fingerprint: 'f'.repeat(64), seasonCount: 103, matchCount: 24720, ...over
});

function store() {
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k)
  });
  return m;
}

beforeEach(() => {
  store();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  mocks.sessionToken.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('cloud marker', () => {
  it('round-trips, rejects garbage and clears', () => {
    expect(readCloudMarker()).toBeNull();
    writeCloudMarker({ id: 'v1', revision: 2, fingerprint: 'abc' });
    expect(readCloudMarker()).toMatchObject({ versionId: 'v1', revision: 2, fingerprint: 'abc' });
    localStorage.setItem(CLOUD_MARKER_KEY, '{not json');
    expect(readCloudMarker()).toBeNull();
    localStorage.setItem(CLOUD_MARKER_KEY, JSON.stringify({ versionId: 1 }));
    expect(readCloudMarker()).toBeNull();
    writeCloudMarker({ id: 'v1', revision: 2, fingerprint: null });
    clearCloudMarker();
    expect(readCloudMarker()).toBeNull();
  });

  it('detects id, revision and fingerprint changes only', () => {
    const marker = { versionId: 'v1', revision: 1, fingerprint: 'a', seenAt: '' };
    expect(isCloudNewer(marker, { id: 'v1', revision: 1, fingerprint: 'a' })).toBe(false);
    expect(isCloudNewer(marker, { id: 'v2', revision: 1, fingerprint: 'a' })).toBe(true);
    expect(isCloudNewer(marker, { id: 'v1', revision: 2, fingerprint: 'a' })).toBe(true);
    expect(isCloudNewer(marker, { id: 'v1', revision: 1, fingerprint: 'b' })).toBe(true);
  });
});

describe('checkCloudFreshness', () => {
  const stubVersions = (body: unknown, status = 200) => {
    const fetchMock = vi.fn(async () => Response.json(body, { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('stays silent without a marker and makes no request', async () => {
    const fetchMock = stubVersions([version()]);
    expect(await checkCloudFreshness()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when nothing changed, the version when it did', async () => {
    writeCloudMarker({ id: 'v1', revision: 1, fingerprint: 'f'.repeat(64) });
    stubVersions([version()]);
    expect(await checkCloudFreshness()).toBeNull();
    stubVersions([version({ id: 'v2' }), version({ id: 'v1', isCurrent: false, status: 'superseded' })]);
    expect(await checkCloudFreshness()).toMatchObject({ id: 'v2' });
  });

  it('ignores drafts and swallows network/HTTP errors', async () => {
    writeCloudMarker({ id: 'v1', revision: 1, fingerprint: 'f'.repeat(64) });
    stubVersions([version({ id: 'v9', status: 'draft' })]);
    expect(await checkCloudFreshness()).toBeNull();
    stubVersions({ message: 'boom' }, 500);
    expect(await checkCloudFreshness()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await checkCloudFreshness()).toBeNull();
  });
});
