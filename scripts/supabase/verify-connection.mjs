#!/usr/bin/env node
/**
 * verify-connection.mjs — tests REST endpoint, publishable key, view_team_ratings,
 * and verifies that writes are denied (401/403 expected; a successful write is a
 * SECURITY FAILURE).
 */
import { getPublicConfig } from './lib/config.mjs';
import { restGet, restPost } from './lib/http.mjs';
import { pass, fail, section, summary, reset } from './lib/output.mjs';

reset();

const config = getPublicConfig();
if (!config) {
  fail('Konfiguráció elérhető');
  process.exit(1);
}

section('REST endpoint');
try {
  const res = await restGet(config.url, config.key, '');
  if (res.ok) pass('Endpoint elérhető');
  else fail('Endpoint elérhető', `HTTP ${res.status}`);
} catch (e) {
  fail('Endpoint elérhető', e.message);
}

section('view_team_ratings olvasás');
try {
  const res = await restGet(config.url, config.key, 'view_team_ratings?select=canonical_key&limit=1');
  if (res.ok) pass('view_team_ratings olvasható');
  else fail('view_team_ratings olvasható', `HTTP ${res.status}`);
} catch (e) {
  fail('view_team_ratings olvasható', e.message);
}

section('Írás teszt (elutasítás szükséges)');
try {
  const res = await restPost(config.url, config.key, 'winmix_teams', {
    league: 'angol', canonical_key: '__test__', display_name: '__test__', weight_index: 5.0, weight_source: 'auto'
  });
  if (res.status === 401 || res.status === 403) {
    pass(`Írás elutasítva (HTTP ${res.status}) — elvárt viselkedés`);
  } else if (res.ok || res.status === 201) {
    fail('Írás elutasítva', `BIZTONSÁGI HIBA: az írás sikerült (HTTP ${res.status})!`);
  } else {
    pass(`Írás elutasítva (HTTP ${res.status}) — elfogadható`);
  }
} catch (e) {
  fail('Írás teszt', e.message);
}

process.exit(summary());
