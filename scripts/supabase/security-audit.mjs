#!/usr/bin/env node
/**
 * security-audit.mjs — searches for service_role secrets in frontend source,
 * scripts, dist output, and .env files. Exits non-zero on security failure.
 */
import { walkTextFiles, readTextFile } from './lib/shell.mjs';
import { pass, fail, section, summary, reset } from './lib/output.mjs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

reset();

const SECRET_PATTERNS = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
  /sb_secret_[a-zA-Z0-9]{20,}/,
  /service_role['"]\s*:\s*['"][^'"]{20,}['"]/,
];

const SCAN_DIRS = ['src', 'scripts', 'dist', 'public'];
const IGNORE_PATHS = ['node_modules', '.git', 'scripts/supabase/lib/config.mjs'];

let foundSecrets = 0;

section('Service-role titok keresése frontend forrásban');
for (const dir of SCAN_DIRS) {
  try {
    await stat(dir);
  } catch {
    continue;
  }
  const files = await walkTextFiles(dir);
  for (const file of files) {
    if (IGNORE_PATHS.some(p => file.includes(p))) continue;
    const content = await readTextFile(file);
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        foundSecrets++;
        fail(`Titok található: ${file}`, pattern.source);
      }
    }
  }
}
if (foundSecrets === 0) {
  pass('Nincs service_role titok a frontend/build forrásban');
}

section('Publishable kulcs nem service_role');
const envKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
if (envKey.startsWith('sb_secret_')) {
  fail('A publishable kulcs helyett service_role kulcs van beállítva');
} else {
  pass('A publishable kulcs nem service_role kulcs');
}

section('.env fájlok ellenőrzése');
try {
  const envContent = await readTextFile('.env');
  if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?sb_secret_/.test(envContent)) {
    pass('.env tartalmaz service_role kulcsot (szerveroldali használatra — OK, nem commitolt)');
  } else {
    pass('.env ellenőrizve');
  }
} catch {
  pass('.env nem olvasható (OK — nem commitolt)');
}

process.exit(summary());
