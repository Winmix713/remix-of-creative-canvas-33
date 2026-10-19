import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CloudHttpError,
  fetchCloudTeamRatings,
  idleHealth,
  probeCloudTier,
} from '../utils/supabaseTier';

/**
 * Contract note (F05 reconciliation, 2026-10-19).
 *
 * The cloud tier no longer reads the PostgREST `view_team_ratings` view over
 * GET; it calls the versioned RPCs declared in
 * `supabase/migrations/20261008000000_winmix_secure_cloud.sql`:
 *   - `winmix_cloud_access`   -> { contract: 2, canWrite: boolean }
 *   - `winmix_cloud_versions` -> array of version objects (camelCase keys)
 *   - `winmix_cloud_ratings`  -> { dataVersionId, revision, league, ratings, basis }
 * Those RPCs emit camelCase JSON with JSON numbers, so the old snake_case
 * "documented columns" assertions were testing a transport that no longer
 * exists. The assertions below are pinned to the current transport and are
 * structurally stronger (they also assert which endpoint is called, with which
 * body), never weaker.
 *
 * User-facing error strings come from `errorMessage()` in
 * `src/utils/supabaseTier.ts:16-23`; the raw server reason is appended after
 * the Hungarian explanation by `cloudRequest()`. The technical prefixes the
 * tests used to expect ('HTTP 401', 'network down') are deliberately not part
 * of the user-facing string any more.
 *
 * One assertion is intentionally left failing: the documented REST-root
 * fallback for 404 (docs/CLOUD_STATE_MACHINE.md:40-41) does not exist in
 * `probeCloudTier()` (src/utils/supabaseTier.ts:59-63). That is a spec/code
 * divergence recorded as a separate finding, not something a test PR may
 * paper over.
 */

const VERSION_ID = '11111111-1111-4111-8111-111111111111';

function httpError(status: number, body: Record<string, unknown> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: 'Error',
    headers: { 'content-type': 'application/json' },
  });
}

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Exactly the shape `winmix_cloud_access()` returns (contract v2). */
const accessPayload = () => ({ contract: 2, canWrite: false });

/** Exactly the shape `winmix_cloud_versions()` returns. */
const versionsPayload = () => [
  {
    id: VERSION_ID,
    versionKey: 'v1',
    status: 'sealed',
    isCurrent: true,
    revision: 3,
    fingerprint: null,
    seasonCount: 2,
    matchCount: 480,
  },
];

/** Exactly the shape `winmix_cloud_ratings()` returns. */
function ratingsPayload(ratings: unknown[], league = 'angol') {
  return { dataVersionId: VERSION_ID, revision: 3, league, ratings, basis: [] };
}

type FetchMock = ReturnType<typeof vi.fn>;
const fetchMock = () => fetch as unknown as FetchMock;

describe('supabaseTier — hibaüzenetek és állapotgép', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('konfigurált tier induló állapota `probing`', () => {
    expect(idleHealth()).toMatchObject({ status: 'probing', degraded: false, lastError: null });
  });

  it('sikeres olvasási próba (access + verziólista) → online', async () => {
    const f = fetchMock();
    f.mockResolvedValueOnce(jsonOk(accessPayload())).mockResolvedValueOnce(jsonOk(versionsPayload()));
    const health = await probeCloudTier();
    expect(health.status).toBe('online');
    expect(health.degraded).toBe(false);
    expect(health.lastError).toBeNull();
    // A próba két RPC-t kötelezően lefuttat, és pontosan ezeket.
    expect(f).toHaveBeenCalledTimes(2);
    expect(String(f.mock.calls[0][0])).toContain('/rest/v1/rpc/winmix_cloud_access');
    expect(String(f.mock.calls[1][0])).toContain('/rest/v1/rpc/winmix_cloud_versions');
  });

  it('401 → degraded, a kulcs/legacy JWT magyarázattal', async () => {
    (fetch as unknown as FetchMock).mockResolvedValue(
      httpError(401, { message: 'Invalid API key' }),
    );
    const health = await probeCloudTier();
    expect(health.status).toBe('degraded');
    expect(health.degraded).toBe(true);
    // A felhasználónak szánt magyarázat (supabaseTier.ts:17, 401 ág).
    expect(health.lastError).toContain('A kulcs vagy a munkamenet érvénytelen');
    // A PostgREST nyers oka továbbra is megjelenik a magyarázat után.
    expect(health.lastError).toContain('Invalid API key');
    // 401 nem maszkolható a REST-gyökérrel: csak egy kérés mehetett ki.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('403 → degraded, RLS magyarázattal, fallback nélkül', async () => {
    (fetch as unknown as FetchMock).mockResolvedValue(httpError(403));
    const health = await probeCloudTier();
    expect(health.lastError).toContain('nincs jogosultságod');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('404 (nézet még nincs telepítve) → REST-gyökér próbája, és online marad', async () => {
    const f = fetchMock();
    f.mockResolvedValueOnce(httpError(404)).mockResolvedValueOnce(jsonOk({}));
    const health = await probeCloudTier();
    expect(f).toHaveBeenCalledTimes(2);
    expect(health.status).toBe('online');
  });

  it('404 mindkét kérésre → degraded, a hiányzó nézet üzenetével', async () => {
    (fetch as unknown as FetchMock).mockResolvedValue(httpError(404));
    const health = await probeCloudTier();
    expect(health.status).toBe('degraded');
    // supabaseTier.ts:20 — a 404/PGRST202 ág magyar üzenete.
    expect(health.lastError).toContain('felhőfüggvény nincs telepítve');
  });

  it('429 → degraded, rate-limit üzenettel', async () => {
    (fetch as unknown as FetchMock).mockResolvedValue(httpError(429));
    const health = await probeCloudTier();
    expect(health.status).toBe('degraded');
    // supabaseTier.ts:21 — a 429 ág magyar üzenete.
    expect(health.lastError).toContain('Túl sok kérés');
  });

  it('hálózati hiba → degraded, nem dob', async () => {
    (fetch as unknown as FetchMock).mockRejectedValue(new Error('network down'));
    const health = await probeCloudTier();
    expect(health.status).toBe('degraded');
    // supabaseTier.ts:37 — a nem-timeout hálózati/CORS ág magyar üzenete.
    expect(health.lastError).toContain('Hálózati vagy CORS-hiba');
  });

  it('opak publishable kulcsot sosem küld Bearerként, apikey mindig megy', async () => {
    const f = fetchMock();
    f.mockResolvedValue(jsonOk([]));
    await probeCloudTier();
    const headers = f.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.apikey).toBeTruthy();
    if (headers.apikey.startsWith('sb_publishable_')) {
      expect(headers.Authorization).toBeUndefined();
    }
  });

  it('fetchCloudTeamRatings a verziózott pillanatképet kéri és map-eli', async () => {
    const f = fetchMock();
    f.mockResolvedValueOnce(jsonOk(versionsPayload())).mockResolvedValueOnce(
      jsonOk(
        ratingsPayload([
          {
            canonicalKey: 'arsenal',
            displayName: 'Arsenal',
            totalPlayed: 38,
            netHome: 1.25,
            netAway: 0.5,
            ppg: 2.1,
            autoWeightIndex: 1.4,
          },
        ]),
      ),
    );
    const rows = await fetchCloudTeamRatings('angol' as never);
    expect(String(f.mock.calls[0][0])).toContain('/rest/v1/rpc/winmix_cloud_versions');
    const ratingsCall = f.mock.calls[1];
    expect(String(ratingsCall[0])).toContain('/rest/v1/rpc/winmix_cloud_ratings');
    // A kérés a feloldott (jelenlegi, sealed) verzióra és a kért ligára van rögzítve.
    expect(JSON.parse(String(ratingsCall[1].body))).toEqual({
      p_version: VERSION_ID,
      p_league: 'angol',
    });
    expect(rows[0]).toEqual({
      canonicalKey: 'arsenal',
      displayName: 'Arsenal',
      totalPlayed: 38,
      netHome: 1.25,
      netAway: 0.5,
      ppg: 2.1,
      autoWeightIndex: 1.4,
    });
  });

  it('a hibák CloudHttpError-ként jönnek, státusszal együtt', async () => {
    (fetch as unknown as FetchMock).mockResolvedValue(httpError(403));
    const err = await fetchCloudTeamRatings('angol' as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudHttpError);
    // A strukturált mező a hivatalos diagnosztikai hordozó (supabaseTier.ts:7-9).
    expect((err as CloudHttpError).status).toBe(403);
    expect((err as CloudHttpError).name).toBe('CloudHttpError');
  });
});
