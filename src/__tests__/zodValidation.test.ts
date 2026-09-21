import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { fetchCloudTeamRatings } from '../utils/supabaseTier';

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Zod validation — fetchCloudTeamRatings', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('érvényes payload → típusos objektumok', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk([
      {
        canonical_key: 'arsenal',
        display_name: 'Arsenal',
        total_played: 38,
        net_home: 1.25,
        net_away: 0.5,
        ppg: 2.1,
        auto_weight_index: 1.4,
      },
    ]));
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

  it('string számok → numerikus konverzió', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk([
      {
        canonical_key: 'chelsea',
        display_name: 'Chelsea',
        total_played: '38',
        net_home: '1.25',
        net_away: '0.50',
        ppg: '2.10',
        auto_weight_index: '1.4',
      },
    ]));
    const rows = await fetchCloudTeamRatings('angol');
    expect(rows[0].totalPlayed).toBe(38);
    expect(rows[0].netHome).toBe(1.25);
    expect(rows[0].autoWeightIndex).toBe(1.4);
  });

  it('hiányzó kötelező mező → hiba', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk([
      {
        canonical_key: 'liverpool',
        display_name: 'Liverpool',
        total_played: 38,
        net_home: 1.0,
        net_away: 0.5,
        ppg: 2.0,
      },
    ]));
    await expect(fetchCloudTeamRatings('angol')).rejects.toThrow('nem felel meg');
  });

  it('üres canonical_key → hiba', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk([
      {
        canonical_key: '',
        display_name: 'Empty',
        total_played: 0,
        net_home: 0,
        net_away: 0,
        ppg: 1.35,
        auto_weight_index: 5.0,
      },
    ]));
    await expect(fetchCloudTeamRatings('angol')).rejects.toThrow('nem felel meg');
  });

  it('nem tömb válasz → hiba', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk({ error: 'something' }));
    await expect(fetchCloudTeamRatings('angol')).rejects.toThrow('nem felel meg');
  });

  it('rossz típusú mező (null total_played) → hiba', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk([
      {
        canonical_key: 'test',
        display_name: 'Test',
        total_played: null,
        net_home: 0,
        net_away: 0,
        ppg: 1.35,
        auto_weight_index: 5.0,
      },
    ]));
    await expect(fetchCloudTeamRatings('angol')).rejects.toThrow('nem felel meg');
  });

  it('extra mezők elfogadva (strict passthrough)', async () => {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    f.mockResolvedValue(jsonOk([
      {
        canonical_key: 'test',
        display_name: 'Test',
        total_played: 10,
        net_home: 0.5,
        net_away: 0.3,
        ppg: 1.5,
        auto_weight_index: 5.0,
        extra_field: 'ignored',
      },
    ]));
    const rows = await fetchCloudTeamRatings('angol');
    expect(rows).toHaveLength(1);
    expect(rows[0].canonicalKey).toBe('test');
  });
});
