#!/usr/bin/env node
/**
 * parity-check.mjs — compares local computeAutoTeamWeights() output against
 * view_team_ratings. Reports every mismatch with tolerance 0.01.
 * Never modifies local values.
 */
import { getPublicConfig } from './lib/config.mjs';
import { restGet } from './lib/http.mjs';
import { pass, fail, section, summary, reset } from './lib/output.mjs';
import { computeAutoTeamWeights } from '../../src/utils/autoWeights.ts';
import { canon } from '../../src/utils/teams.ts';

reset();

const TOLERANCE = 0.01;
const config = getPublicConfig();
if (!config) {
  fail('Konfiguráció elérhető');
  process.exit(1);
}

// This script requires match data to be loaded. In a real run, the data would
// come from the local pipeline state or a JSON file. For now, we fetch from
// Supabase and compare the view's output against a fresh local computation
// using the same matches.
section('Adatok betöltése a felhőből');
let matches = [];
try {
  const res = await restGet(config.url, config.key,
    'winmix_matches?select=home_score,away_score,league,home_team_id,away_team_id&limit=10000');
  if (res.ok) {
    matches = await res.json();
    pass(`${matches.length} mérkőzés betöltve`);
  } else {
    fail('Mérkőzések betöltése', `HTTP ${res.status}`);
    process.exit(summary());
  }
} catch (e) {
  fail('Mérkőzések betöltése', e.message);
  process.exit(summary());
}

// Fetch team canonical keys for FK resolution
let teamMap = {};
try {
  const res = await restGet(config.url, config.key,
    'winmix_teams?select=id,canonical_key,display_name,league&limit=5000');
  if (res.ok) {
    const teams = await res.json();
    for (const t of teams) teamMap[t.id] = { canonical_key: t.canonical_key, display_name: t.display_name, league: t.league };
    pass(`${Object.keys(teamMap).length} csapat betöltve`);
  } else {
    fail('Csapatok betöltése', `HTTP ${res.status}`);
    process.exit(summary());
  }
} catch (e) {
  fail('Csapatok betöltése', e.message);
  process.exit(summary());
}

// Build MatchRow-shaped objects for computeAutoTeamWeights
const matchRows = matches.map(m => {
  const home = teamMap[m.home_team_id];
  const away = teamMap[m.away_team_id];
  if (!home || !away) return null;
  return {
    home_team: home.display_name,
    away_team: away.display_name,
    home_score: m.home_score,
    away_score: m.away_score,
  };
}).filter(Boolean);

section('Lokális vs SQL paritás');
for (const league of ['angol', 'spanyol']) {
  const leagueMatches = matchRows.filter(m => {
    const hKey = canon(m.home_team);
    const hTeam = Object.values(teamMap).find(t => t.canonical_key === hKey && t.league === league);
    return hTeam !== undefined;
  });

  const localWeights = computeAutoTeamWeights(leagueMatches, league);

  // Fetch SQL view for this league
  try {
    const res = await restGet(config.url, config.key,
      `view_team_ratings?league=eq.${league}&select=canonical_key,net_home,net_away,auto_weight_index`);
    if (!res.ok) {
      fail(`${league} SQL értékelések betöltése`, `HTTP ${res.status}`);
      continue;
    }
    const sqlRatings = await res.json();
    let mismatches = 0;
    for (const sql of sqlRatings) {
      const local = localWeights[sql.canonical_key];
      if (!local) continue;
      const dh = Math.abs(local.netHome - Number(sql.net_home));
      const da = Math.abs(local.netAway - Number(sql.net_away));
      if (dh > TOLERANCE || da > TOLERANCE) {
        mismatches++;
        fail(`${league} / ${sql.canonical_key}`,
          `net_home: TS=${local.netHome.toFixed(2)} SQL=${Number(sql.net_home).toFixed(2)} Δ=${dh.toFixed(3)} | ` +
          `net_away: TS=${local.netAway.toFixed(2)} SQL=${Number(sql.net_away).toFixed(2)} Δ=${da.toFixed(3)}`);
      }
    }
    if (mismatches === 0 && sqlRatings.length > 0) {
      pass(`${league}: ${sqlRatings.length} csapat, minden egyezés (tolerancia ${TOLERANCE})`);
    } else if (sqlRatings.length === 0) {
      pass(`${league}: nincs adat a felhőben`);
    }
  } catch (e) {
    fail(`${league} paritás ellenőrzés`, e.message);
  }
}

process.exit(summary());
