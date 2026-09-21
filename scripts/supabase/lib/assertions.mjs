/**
 * Assertion helpers for schema and security checks.
 */

export function assert(condition, msg, detail) {
  if (!condition) throw new Error(detail ? `${msg}: ${detail}` : msg);
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`);
  }
}

export function assertIncludes(arr, item, label) {
  if (!arr.includes(item)) {
    throw new Error(`${label}: "${item}" not found in [${arr.join(', ')}]`);
  }
}
