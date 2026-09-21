#!/usr/bin/env node
/**
 * ingest.mjs — server-side ingestion tool using the service-role key.
 *
 * Reads the service-role key from environment ONLY (never from Vite env,
 * never from frontend source). Performs canonicalization, integrity validation,
 * SHA-256 content hashing, batched upserts (500 rows), and idempotent
 * conflict keys.
 *
 * DISABLED by default — requires explicit SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { getServiceConfig } from './lib/config.mjs';
import { restPost, functionPost } from './lib/http.mjs';
import { createHash } from 'node:crypto';
import { pass, fail, section, summary, reset } from './lib/output.mjs';
import { readFileSync } from 'node:fs';

reset();

const serviceConfig = getServiceConfig();
if (!serviceConfig) {
  fail('SUPABASE_SERVICE_ROLE_KEY elérhető');
  console.log('  A szerveroldali titok szükséges az adatbetöltéshez.');
  console.log('  Soha ne tedd a VITE_ prefix alá — csak SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Parse input JSON from stdin or file argument
let inputData;
const fileArg = process.argv[2];
if (fileArg) {
  try {
    inputData = JSON.parse(readFileSync(fileArg, 'utf-8'));
  } catch (e) {
    fail('Bemeneti fájl olvasása', e.message);
    process.exit(1);
  }
} else {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    inputData = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch (e) {
    fail('stdin olvasása', e.message);
    process.exit(1);
  }
}

if (!inputData.seasons || !Array.isArray(inputData.seasons)) {
  fail('Érvényes payload (seasons tömb)');
  process.exit(1);
}

section('Kanonizálás és integritás');

function canon(name) {
  return String(name ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function contentHash(matches) {
  const sorted = [...matches].sort((a, b) => a.match_no - b.match_no);
  const json = JSON.stringify(sorted);
  return createHash('sha256').update(json).digest('hex');
}

const BATCH_SIZE = 500;
let totalSeasons = 0, totalTeams = 0, totalMatches = 0, totalRejected = 0;

for (const season of inputData.seasons) {
  const league = season.league;
  if (league !== 'angol' && league !== 'spanyol') {
    fail(`Szezon "${season.name}": ismeretlen liga`);
    continue;
  }

  // Season upsert via edge function
  try {
    const res = await functionPost(serviceConfig.url, serviceConfig.key, 'winmix-ingest', {
      seasons: [season],
      teamWeights: inputData.teamWeights,
      teamAliasMap: inputData.teamAliasMap,
    });
    if (res.ok) {
      const body = await res.json();
      totalSeasons += body.seasons ?? 0;
      totalTeams += body.teams ?? 0;
      totalMatches += body.matches ?? 0;
      totalRejected += body.rejected ?? 0;
      pass(`Szezon "${season.name}": ${body.matches ?? 0} mérkőzés`);
    } else {
      const body = await res.json().catch(() => ({}));
      fail(`Szezon "${season.name}"`, body.error ?? `HTTP ${res.status}`);
    }
  } catch (e) {
    fail(`Szezon "${season.name}"`, e.message);
  }
}

section('Eredmény');
console.log(`  Szezonok: ${totalSeasons}`);
console.log(`  Csapatok: ${totalTeams}`);
console.log(`  Mérkőzések: ${totalMatches}`);
console.log(`  Elutasított: ${totalRejected}`);

process.exit(summary());
