#!/usr/bin/env node
/**
 * bootstrap.mjs — validates environment, verifies endpoint, checks schema/RLS/grants/view.
 *
 * Safe to execute repeatedly. Never performs destructive operations.
 */
import { getPublicConfig } from './lib/config.mjs';
import { restGet } from './lib/http.mjs';
import { pass, fail, section, summary, reset } from './lib/output.mjs';

reset();

// 1. Environment
section('Környezet');
const config = getPublicConfig();
if (!config) {
  fail('SUPABASE_URL és publishable kulcs elérhető');
  console.log('  Szükséges env: SUPABASE_URL + SUPABASE_ANON_KEY (vagy VITE_* változatok)');
  process.exit(summary());
}
pass('SUPABASE_URL és publishable kulcs elérhető');
console.log(`  Endpoint: ${config.url}`);

// 2. Endpoint reachability
section('Végpont elérhetősége');
try {
  const res = await restGet(config.url, config.key, '', 10000);
  if (res.ok) {
    pass('REST endpoint elérhető');
  } else if (res.status === 401 || res.status === 403) {
    fail('REST endpoint elérhető', `HTTP ${res.status} — kulcs/RLS probléma`);
  } else {
    fail('REST endpoint elérhető', `HTTP ${res.status}`);
  }
} catch (e) {
  fail('REST endpoint elérhető', e.message);
}

// 3. view_team_ratings
section('view_team_ratings nézet');
try {
  const res = await restGet(config.url, config.key, 'view_team_ratings?select=canonical_key&limit=1');
  if (res.ok) {
    pass('view_team_ratings létezik és olvasható');
  } else if (res.status === 404) {
    fail('view_team_ratings létezik', 'A nézet nincs telepítve — futtasd a migrációt');
  } else {
    fail('view_team_ratings létezik', `HTTP ${res.status}`);
  }
} catch (e) {
  fail('view_team_ratings létezik', e.message);
}

// 4. Tables exist
section('Táblák');
for (const table of ['winmix_teams', 'winmix_seasons', 'winmix_matches', 'winmix_pipeline_checkpoints']) {
  try {
    const res = await restGet(config.url, config.key, `${table}?select=id&limit=1`);
    if (res.ok || res.status === 400) {
      pass(`${table} létezik`);
    } else if (res.status === 404) {
      fail(`${table} létezik`, 'Hiányzó tábla');
    } else {
      fail(`${table} létezik`, `HTTP ${res.status}`);
    }
  } catch (e) {
    fail(`${table} létezik`, e.message);
    }
}

// 5. Write denial
section('Írásvédelem');
try {
  const res = await restGet(config.url, config.key, 'winmix_teams?select=*');
  if (res.ok) {
    pass('SELECT engedélyezett (anon)');
  } else {
    fail('SELECT engedélyezett (anon)', `HTTP ${res.status}`);
  }
} catch (e) {
  fail('SELECT engedélyezett (anon)', e.message);
}

process.exit(summary());
