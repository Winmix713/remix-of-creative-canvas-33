/**
 * PASS/FAIL reporter for CLI tooling.
 */

let passed = 0;
let failed = 0;
const failures = [];

export function pass(msg) {
  passed++;
  console.log(`  [PASS] ${msg}`);
}

export function fail(msg, detail) {
  failed++;
  failures.push({ msg, detail });
  console.log(`  [FAIL] ${msg}`);
  if (detail) console.log(`        ${detail}`);
}

export function section(title) {
  console.log(`\n── ${title} ──`);
}

export function summary() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  • ${f.msg}`);
      if (f.detail) console.log(`    ${f.detail}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

export function reset() {
  passed = 0;
  failed = 0;
  failures.length = 0;
}
