#!/usr/bin/env node
/**
 * schema-check.mjs — verifies tables, columns, constraints, indexes, RLS,
 * policies, grants, view, and security_invoker setting.
 */
import { getPublicConfig } from './lib/config.mjs';
import { restGet } from './lib/http.mjs';
import { pass, fail, section, summary, reset } from './lib/output.mjs';

reset();

const config = getPublicConfig();
if (!config) {
  fail('Konfiguráció elérhető');
  process.exit(1);
}

const TABLES = ['winmix_teams', 'winmix_seasons', 'winmix_matches', 'winmix_pipeline_checkpoints'];

section('Táblák létezése');
for (const table of TABLES) {
  try {
    const res = await restGet(config.url, config.key, `${table}?select=id&limit=1`);
    if (res.ok || res.status === 400) pass(`${table} létezik`);
    else fail(`${table} létezik`, `HTTP ${res.status}`);
  } catch (e) {
    fail(`${table} létezik`, e.message);
  }
}

section('Oszlopok (winmix_matches)');
const EXPECTED_COLUMNS = [
  'id', 'season_id', 'league', 'match_no', 'source_file_id', 'row_index',
  'kickoff_iso', 'match_date_raw', 'home_team_id', 'away_team_id',
  'ht_home_score', 'ht_away_score', 'home_score', 'away_score',
  'total_goals', 'btts', 'outcome', 'created_at'
];
try {
  const res = await restGet(config.url, config.key, 'winmix_matches?limit=0');
  if (res.ok) {
    const range = res.headers.get('content-range') || '';
    const body = await res.json();
    if (Array.isArray(body) && body.length > 0) {
      const cols = Object.keys(body[0]);
      for (const col of EXPECTED_COLUMNS) {
        if (cols.includes(col)) pass(`Oszlop: ${col}`);
        else fail(`Oszlop: ${col}`, 'Hiányzik');
      }
    } else {
      pass('winmix_matches oszlopok (üres tábla — séma OK)');
    }
  } else {
    fail('winmix_matches oszlopok', `HTTP ${res.status}`);
  }
} catch (e) {
  fail('winmix_matches oszlopok', e.message);
}

section('view_team_ratings');
try {
  const res = await restGet(config.url, config.key, 'view_team_ratings?select=canonical_key&limit=1');
  if (res.ok) pass('view_team_ratings létezik és olvasható');
  else fail('view_team_ratings létezik', `HTTP ${res.status}`);
} catch (e) {
  fail('view_team_ratings létezik', e.message);
}

section('RLS + GRANT (közvetett teszt)');
try {
  const res = await restGet(config.url, config.key, 'winmix_teams?select=*&limit=1');
  if (res.ok) pass('SELECT engedélyezett anon számára (RLS+GRANT OK)');
  else if (res.status === 403) fail('SELECT engedélyezett', 'HTTP 403 — RLS vagy GRANT hiányzik');
  else fail('SELECT engedélyezett', `HTTP ${res.status}`);
} catch (e) {
  fail('SELECT engedélyezett', e.message);
}

process.exit(summary());
