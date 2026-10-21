import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sessionToken: vi.fn() }));
vi.mock('../src/integrations/supabase/client', () => ({
  sessionToken: mocks.sessionToken,
  getSupabase: vi.fn()
}));

import {
  CLOUD_DOWNLOAD_CONCURRENCY,
  fetchCloudSeasonsConcurrently,
  type CloudSeasonMeta
} from '../src/utils/supabaseTier';
import { seasonStamp } from '../src/utils/pipelineCache';
import type { Season } from '../src/types/winmix';

const VERSION = '95961fbc-1e0c-451e-a825-61e0d07ecaaf';

function meta(index: number): CloudSeasonMeta {
  return {
    id: `season-${index}`,
    dataVersionId: VERSION,
    revision: 1,
    league: 'angol',
    seasonIndex: index,
    sourceSeasonKey: `angol_${index}`,
    name: `Szezon ${index}`,
    fileName: `angol_${index}.csv`,
    contentHash: 'a'.repeat(64),
    matchCount: 1,
    orderMode: 'chronological',
    createdAt: '2026-10-18T08:46:15Z'
  };
}

/** What the `winmix_cloud_season` RPC returns for one single-match season. */
function seasonPayload(id: string) {
  return {
    meta: { id, matchCount: 1, contentHash: 'a'.repeat(64) },
    matches: [{
      match_no: 1, date: '12:00', kickoffIso: null, rowIndex: 1, sourceFileId: 'f',
      home_team: 'Alpha', away_team: 'Beta',
      ht_home_score: 0, ht_away_score: 0, home_score: 1, away_score: 0
    }],
    revision: 1,
    dataVersionId: VERSION
  };
}

function seasonIdFromRequest(init: RequestInit | undefined): string {
  return (JSON.parse(String(init?.body)) as { p_season: string }).p_season;
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  mocks.sessionToken.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('fetchCloudSeasonsConcurrently', () => {
  it('never exceeds the concurrency limit and keeps season order', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Later seasons answer faster, so completion order differs from request order.
      const id = seasonIdFromRequest(init);
      await new Promise((resolve) => setTimeout(resolve, 20 - Number(id.split('-')[1]) % 10));
      inFlight -= 1;
      return Response.json(seasonPayload(id));
    });
    vi.stubGlobal('fetch', fetchMock);

    const metas = Array.from({ length: 30 }, (_, i) => meta(i));
    const progress: number[] = [];
    const result = await fetchCloudSeasonsConcurrently(metas, {
      concurrency: 5,
      onProgress: (done) => progress.push(done)
    });

    expect(fetchMock).toHaveBeenCalledTimes(30);
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
    expect(result.map((r) => r.meta.id)).toEqual(metas.map((m) => m.id));
    expect(progress).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('defaults to the exported concurrency and returns [] for no seasons', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchCloudSeasonsConcurrently([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(CLOUD_DOWNLOAD_CONCURRENCY).toBeGreaterThan(1);
  });

  it('retries a transient 5xx once and then succeeds', async () => {
    const attempts = new Map<string, number>();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const id = seasonIdFromRequest(init);
      const n = (attempts.get(id) ?? 0) + 1;
      attempts.set(id, n);
      if (id === 'season-1' && n === 1) return Response.json({ message: 'boom' }, { status: 503 });
      return Response.json(seasonPayload(id));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCloudSeasonsConcurrently([meta(0), meta(1), meta(2)], { concurrency: 2 });

    expect(result).toHaveLength(3);
    expect(attempts.get('season-1')).toBe(2);
  });

  it('does not retry a deterministic 409 and fails the whole download', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const id = seasonIdFromRequest(init);
      if (id === 'season-2') return Response.json({ message: 'Draft changed; reload season list' }, { status: 409 });
      return Response.json(seasonPayload(id));
    });
    vi.stubGlobal('fetch', fetchMock);

    const metas = Array.from({ length: 40 }, (_, i) => meta(i));
    await expect(fetchCloudSeasonsConcurrently(metas, { concurrency: 3 })).rejects.toMatchObject({ status: 409 });

    const callsForFailed = fetchMock.mock.calls.filter(([, init]) => seasonIdFromRequest(init as RequestInit) === 'season-2');
    expect(callsForFailed).toHaveLength(1);
    // Scheduling stops after the failure: far fewer than all 40 seasons were requested.
    expect(fetchMock.mock.calls.length).toBeLessThan(40);
  });
});

describe('seasonStamp', () => {
  const season = (id: string, withPipeline: boolean): Season => ({
    id, league: 'angol', seasonIndex: 0, name: id, fileName: `${id}.csv`, createdAt: '', contentHash: 'h',
    countWarning: false, actualMatchCount: 2,
    matches: [0, 1].map((n) => ({
      match_no: n + 1, date: '', home_team: 'A', away_team: 'B', ht_home_score: null, ht_away_score: null,
      home_score: 1, away_score: 0, total_goals: 1, btts: false, outcome: 'H',
      ...(withPipeline && n === 0 ? { pipeline: {} as never } : {})
    }))
  } as Season);

  it('is stable for equal input and changes with identity or pipeline coverage', () => {
    expect(seasonStamp([season('a', false)])).toBe(seasonStamp([season('a', false)]));
    expect(seasonStamp([season('a', false)])).not.toBe(seasonStamp([season('b', false)]));
    expect(seasonStamp([season('a', false)])).not.toBe(seasonStamp([season('a', true)]));
    expect(seasonStamp([season('a', false)])).not.toBe(seasonStamp([season('a', false), season('b', false)]));
  });
});
