#!/usr/bin/env node
/**
 * Test discovery manifest (F05).
 *
 * ONE intentional discovery contract: every maintained test file belongs to
 * exactly one test command. This script prints the discovered-file manifest and
 * exits non-zero when
 *   1. a maintained test file is not covered by any command (the defect F05
 *      fixed: it fails CI instead of silently skipping the file), or
 *   2. vitest.config.ts `include` patterns drift from the contract declared
 *      here (the runner reads them; if they diverge, discovery lies).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.output', '.vinxi', 'coverage']);
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts)$/;

const CONTRACTS = [
  {
    name: 'core (node:test)',
    command: 'npm run test:core',
    patterns: ['tests/*.test.ts'],
  },
  {
    name: 'unit + UI (vitest)',
    command: 'npm run test:ui',
    patterns: [
      'tests/*.ui.spec.ts',
      'tests/*.ui.spec.tsx',
      'src/__tests__/*.test.ts',
    ],
  },
];

// Deliberate non-test: none. Helpers such as tests/fixtures.ts are imported by
// tests, and src/utils/*Tests.ts are runtime regression helpers used by app
// panels, so neither is a discovered test file.

const escape = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
const globToRegExp = (glob) =>
  new RegExp(
    '^' +
      escape(glob)
        .replace(/\*\*\//g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '(?:.*/)?') +
      '$',
  );

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), out);
    } else if (TEST_FILE.test(entry.name)) {
      out.push(relative(ROOT, join(dir, entry.name)));
    }
  }
  return out;
}

const problems = [];
const files = (await walk(ROOT)).sort();
const owners = new Map();

for (const contract of CONTRACTS) {
  const regexps = contract.patterns.map(globToRegExp);
  const matched = files.filter((f) => regexps.some((r) => r.test(f)));
  for (const f of matched) {
    const list = owners.get(f) ?? [];
    list.push(contract.owner ?? `${contract.name} -> ${contract.command}`);
    owners.set(f, list);
  }
  if (matched.length === 0) {
    problems.push(`contract "${contract.name}" matched no file — the pattern is stale`);
  }
}

// Drift guard: the runner's own include list must equal this contract.
const vitestConfig = await readFile(join(ROOT, 'vitest.config.ts'), 'utf8');
const includeMatch = vitestConfig.match(/include\s*:\s*\[([^\]]*)\]/);
if (!includeMatch) {
  problems.push('vitest.config.ts: no explicit `include` array found');
} else {
  const declared = [...includeMatch[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  const expected = CONTRACTS[1].patterns;
  const missing = expected.filter((p) => !declared.includes(p));
  const extra = declared.filter((p) => !expected.includes(p));
  if (missing.length || extra.length) {
    problems.push(
      `vitest.config.ts include patterns drift from the contract ` +
        `(missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`,
    );
  }
}
if (!/setupFiles\s*:\s*\[/.test(vitestConfig)) {
  problems.push('vitest.config.ts does not declare setupFiles — setup-dependent tests would not run');
}

console.log('============================================================');
console.log(` Test discovery manifest — node ${process.versions.node}`);
console.log('============================================================');
for (const contract of CONTRACTS) {
  console.log(`\n[${contract.name}]  ${contract.command}`);
  console.log(`  patterns: ${contract.patterns.join(', ')}`);
  const matched = files.filter((f) => (owners.get(f) ?? []).includes(`${contract.name} -> ${contract.command}`));
  for (const f of matched) console.log(`  - ${f}`);
  console.log(`  discovered: ${matched.length}`);
}

const uncovered = files.filter((f) => !owners.has(f));
const doubled = [...owners.entries()].filter(([, list]) => list.length > 1);
console.log(`\nmaintained test files on disk: ${files.length}`);
if (uncovered.length) {
  problems.push(`uncovered test file(s): ${uncovered.join(', ')}`);
  for (const f of uncovered) console.log(`  [UNCOVERED] ${f}`);
}
for (const [f, list] of doubled) {
  problems.push(`test file is claimed by more than one command: ${f} (${list.join(' | ')})`);
}

if (problems.length) {
  console.log('\nMANIFEST FAILED:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('manifest OK — every maintained test file belongs to exactly one command');
