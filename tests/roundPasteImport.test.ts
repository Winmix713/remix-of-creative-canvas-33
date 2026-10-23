import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFixtureLines,
  matchPairsToTeams,
} from '../src/utils/roundPasteImport';
import type { TeamOption } from '../src/utils/fixtures';

const pool: TeamOption[] = [
  { key: 'london agyuk', display: 'London Ágyúk', played: 10 },
  { key: 'chelsea', display: 'Chelsea', played: 10 },
  { key: 'vörös ördögök', display: 'Vörös Ördögök', played: 10 },
  { key: 'manchester kék', display: 'Manchester Kék', played: 10 },
];

test('parseFixtureLines: hyphen separator', () => {
  const r = parseFixtureLines('Chelsea - London Ágyúk');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: en-dash separator', () => {
  const r = parseFixtureLines('Chelsea – London Ágyúk');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: em-dash separator', () => {
  const r = parseFixtureLines('Chelsea — London Ágyúk');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: vs separator', () => {
  const r = parseFixtureLines('Chelsea vs London Ágyúk');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: vs. separator', () => {
  const r = parseFixtureLines('Chelsea vs. London Ágyúk');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: extra whitespace', () => {
  const r = parseFixtureLines('  Chelsea   -   London Ágyúk  ');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: multiple lines', () => {
  const r = parseFixtureLines('Chelsea - London Ágyúk\nVörös Ördögök - Manchester Kék');
  assert.equal(r.length, 2);
});

test('parseFixtureLines: skips empty lines', () => {
  const r = parseFixtureLines('\nChelsea - London Ágyúk\n\n');
  assert.deepEqual(r, [{ home: 'Chelsea', away: 'London Ágyúk' }]);
});

test('parseFixtureLines: skips lines without separator', () => {
  const r = parseFixtureLines('Chelsea London Ágyúk');
  assert.equal(r.length, 0);
});

test('matchPairsToTeams: matches known teams with accents', () => {
  const pairs = parseFixtureLines('London Ágyúk - Vörös Ördögök');
  const r = matchPairsToTeams(pairs, pool, 'angol');
  assert.equal(r.matched.length, 1);
  assert.equal(r.matched[0].homeKey, 'london agyuk');
  assert.equal(r.matched[0].awayKey, 'vörös ördögök');
});

test('matchPairsToTeams: same team on both sides is unmatched', () => {
  const pairs = parseFixtureLines('chelsea - CHELSEA');
  const r = matchPairsToTeams(pairs, pool, 'angol');
  assert.equal(r.matched.length, 0);
  assert.equal(r.unmatched.length, 1);
  assert.ok(r.unmatched[0].reason.includes('megegyezik'));
});

test('matchPairsToTeams: reports unknown team', () => {
  const pairs = parseFixtureLines('Chelsea - Liverpool');
  const r = matchPairsToTeams(pairs, pool, 'angol');
  assert.equal(r.matched.length, 0);
  assert.equal(r.unmatched.length, 1);
  assert.ok(r.unmatched[0].reason.includes('Liverpool'));
});

test('matchPairsToTeams: reports duplicate team usage', () => {
  const pairs = parseFixtureLines('Chelsea - London Ágyúk\nChelsea - Vörös Ördögök');
  const r = matchPairsToTeams(pairs, pool, 'angol');
  assert.equal(r.matched.length, 1);
  assert.equal(r.unmatched.length, 1);
  assert.ok(r.unmatched[0].reason.includes('már szerepel'));
});

test('matchPairsToTeams: wrong league team is unknown', () => {
  const pairs = parseFixtureLines('Madrid Fehér - Sevilla');
  const r = matchPairsToTeams(pairs, pool, 'angol');
  assert.equal(r.matched.length, 0);
  assert.equal(r.unmatched.length, 1);
  assert.ok(r.unmatched[0].reason.includes('Madrid Fehér'));
});
