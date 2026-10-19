import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { z } from 'zod';
import { fetchCloudTeamRatings } from '../utils/supabaseTier';

/**
 * Contract note (F05 reconciliation, 2026-10-19).
 *
 * These tests used to feed snake_case rows of the PostgREST `view_team_ratings`
 * view to `fetchCloudTeamRatings` and expect the thrown message to contain the
 * Hungarian fragment 'nem felel meg'. Neither holds any more:
 *
 *  - the data source is the `winmix_cloud_ratings(p_version,p_league)` jsonb RPC
 *    (supabase/migrations/20261008000000_winmix_secure_cloud.sql:355-380), which
 *    emits camelCase keys and JSON numbers; the frontend resolves the version
 *    through `winmix_cloud_versions` first (src/utils/supabaseTier.ts:67-72,109);
 *  - no production code ever produced 'nem felel meg' (grepped repo-wide: the
 *    string exists only in this test file). Invalid payloads surface the zod
 *    issue list, i.e. `ZodError.message` is a JSON blob. That is recorded as a
 *    UX/diagnosability finding (raw internals in `CloudTierHealth.lastError`);
 *    it is NOT fixed here, and these tests now assert the *structured* contract
 *    (error type + issue path + issue code), which is strictly stronger and
 *    stable across message-wording changes.
 *
 * Evaluation order note: the first `fetch` of every call below feeds
 * `winmix_cloud_versions`; only the second feeds the ratings snapshot. The
 * fixtures therefore have to be stubbed in that order — the two "expected
 * SUCCESS" failures this file previously had were caused by exactly that (the
 * ratings fixture was being parsed as the version list), not by the rating
 * schema rejecting a documented-valid payload.
 */

const VERSION_ID = '11111111-1111-4111-8111-111111111111';

const versions = [
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

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** First call: version list. Second call: the ratings snapshot envelope. */
function stubSnapshot(ratings: unknown) {
  const f = fetch as unknown as ReturnType<typeof vi.fn>;
  f.mockResolvedValueOnce(jsonOk(versions)).mockResolvedValueOnce(
    jsonOk({ dataVersionId: VERSION_ID, revision: 3, league: 'angol', ratings, basis: [] }),
  );
  return f;
}

const validRating = {
  canonicalKey: 'arsenal',
  displayName: 'Arsenal',
  totalPlayed: 38,
  netHome: 1.25,
  netAway: 0.5,
  ppg: 2.1,
  autoWeightIndex: 1.4,
};

/** Runs the call and returns the rejection (never throws the test). */
const rejectionOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

const zodErrorOf = async (p: Promise<unknown>) => {
  const err = await rejectionOf(p);
  expect(err).toBeInstanceOf(z.ZodError);
  return err as z.ZodError;
};

const paths = (err: z.ZodError) => err.issues.map((i) => i.path.join('.'));
const codes = (err: z.ZodError) => err.issues.map((i) => i.code);

describe('Zod validation — fetchCloudTeamRatings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('érvényes payload → típusos objektumok', async () => {
    stubSnapshot([validRating]);
    const rows = await fetchCloudTeamRatings('angol');
    expect(rows).toHaveLength(1);
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

  it('string számok → elutasítva (a pillanatkép-RPC JSON-számokat ad)', async () => {
    // A numerikus mezők stringként érkezése a megszűnt PostgREST view-transzport
    // sajátja volt (numeric -> string). A jsonb RPC JSON-számot ad, ezért a
    // séma szigorú: a string alakot nem alakítja át csendben.
    stubSnapshot([
      {
        canonicalKey: 'chelsea',
        displayName: 'Chelsea',
        totalPlayed: '38',
        netHome: '1.25',
        netAway: '0.50',
        ppg: '2.10',
        autoWeightIndex: '1.4',
      },
    ]);
    const err = await zodErrorOf(fetchCloudTeamRatings('angol'));
    expect(paths(err)).toEqual(
      expect.arrayContaining([
        'ratings.0.totalPlayed',
        'ratings.0.netHome',
        'ratings.0.autoWeightIndex',
      ]),
    );
    expect(codes(err).every((c) => c === 'invalid_type')).toBe(true);
  });

  it('hiányzó kötelező mező → hiba', async () => {
    stubSnapshot([
      {
        canonicalKey: 'liverpool',
        displayName: 'Liverpool',
        totalPlayed: 38,
        netHome: 1.0,
        netAway: 0.5,
        ppg: 2.0,
      },
    ]);
    const err = await zodErrorOf(fetchCloudTeamRatings('angol'));
    expect(paths(err)).toContain('ratings.0.autoWeightIndex');
    expect(codes(err)).toContain('invalid_type');
  });

  it('üres canonical_key → hiba', async () => {
    stubSnapshot([{ ...validRating, canonicalKey: '' }]);
    const err = await zodErrorOf(fetchCloudTeamRatings('angol'));
    expect(paths(err)).toContain('ratings.0.canonicalKey');
    expect(codes(err)).toContain('too_small');
  });

  it('nem tömb válasz → hiba', async () => {
    stubSnapshot({ error: 'something' });
    const err = await zodErrorOf(fetchCloudTeamRatings('angol'));
    expect(paths(err)).toContain('ratings');
    expect(codes(err)).toContain('invalid_type');
  });

  it('rossz típusú mező (null total_played) → hiba', async () => {
    stubSnapshot([{ ...validRating, totalPlayed: null }]);
    const err = await zodErrorOf(fetchCloudTeamRatings('angol'));
    expect(paths(err)).toContain('ratings.0.totalPlayed');
    expect(codes(err)).toContain('invalid_type');
  });

  it('extra mezők elfogadva (strict passthrough)', async () => {
    stubSnapshot([{ ...validRating, canonicalKey: 'test', extra_field: 'ignored' }]);
    const rows = await fetchCloudTeamRatings('angol');
    expect(rows).toHaveLength(1);
    expect(rows[0].canonicalKey).toBe('test');
    // A deklarált mezőkön kívül semmi nem szivárog be a típusos objektumba.
    expect(rows[0]).toEqual({
      canonicalKey: 'test',
      displayName: 'Arsenal',
      totalPlayed: 38,
      netHome: 1.25,
      netAway: 0.5,
      ppg: 2.1,
      autoWeightIndex: 1.4,
    });
  });
});
