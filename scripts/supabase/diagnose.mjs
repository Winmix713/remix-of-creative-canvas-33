#!/usr/bin/env node
/**
 * diagnose.mjs — combines endpoint, schema, RLS, and view checks into one
 * diagnostic pass.
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

console.log(`Endpoint: ${config.url}`);
console.log(`Kulcs: ${config.key.substring(0, 20)}...`);

section('1. Endpoint');
try {
  const res = await restGet(config.url, config.key, '');
  if (res.ok) pass('Elérhető');
  else fail('Elérhető', `HTTP ${res.status}`);
} catch (e) {
  fail('Elérhető', e.message);
}

section('2. Táblák');
for (const t of ['winmix_teams', 'winmix_seasons', 'winmix_matches', 'winmix_pipeline_checkpoints']) {
  try {
    const res = await restGet(config.url, config.key, `${t}?select=id&limit=1`);
    if (res.ok || res.status === 400) pass(t);
    else fail(t, `HTTP ${res.status}`);
  } catch (e) {
    fail(t, e.message);
  }
}

section('3. view_team_ratings');
try {
  const res = await restGet(config.url, config.key, 'view_team_ratings?select=canonical_key&limit=1');
  if (res.ok) pass('Létezik és olvasható');
  else fail('Létezik és olvasható', `HTTP ${res.status}`);
} catch (e) {
  fail('Létezik és olvasható', e.message);
}

section('4. RLS/GRANT');
try {
  const res = await restGet(config.url, config.key, 'winmix_teams?select=*&limit=1');
  if (res.ok) pass('SELECT engedélyezett');
  else fail('SELECT engedélyezett', `HTTP ${res.status}`);
} catch (e) {
  fail('SELECT engedélyezett', e.message);
}

process.exit(summary());
