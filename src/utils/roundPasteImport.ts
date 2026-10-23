import { canon } from './teams';
import type { League, FixtureRound, Fixture } from '../types/winmix';
import { fixturesOf } from './fixtures';
import type { TeamOption } from './fixtures';

export interface ParsedPair {
  home: string;
  away: string;
}

export interface ImportResult {
  matched: Array<{
    pair: ParsedPair;
    homeKey: string;
    awayKey: string;
    homeDisplay: string;
    awayDisplay: string;
  }>;
  unmatched: Array<{
    line: string;
    reason: string;
  }>;
}

const SEPARATOR_RE = /[-–—]|vs\.?/i;

export function parseFixtureLines(input: string): ParsedPair[] {
  return input
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const parts = line.split(SEPARATOR_RE).map((p) => p.trim());
      if (parts.length < 2 || parts[0].length === 0 || parts[1].length === 0) {
        return null;
      }
      return { home: parts[0], away: parts.slice(1).join(' ') };
    })
    .filter((p): p is ParsedPair => p !== null);
}

export function matchPairsToTeams(
  pairs: ParsedPair[],
  pool: TeamOption[],
  league: League
): ImportResult {
  const byCanon = new Map<string, TeamOption>();
  for (const opt of pool) {
    byCanon.set(opt.key, opt);
    byCanon.set(canon(opt.display), opt);
  }

  const matched: ImportResult['matched'] = [];
  const unmatched: ImportResult['unmatched'] = [];
  const usedKeys = new Set<string>();

  for (const pair of pairs) {
    const homeOpt = byCanon.get(canon(pair.home));
    const awayOpt = byCanon.get(canon(pair.away));

    if (!homeOpt) {
      unmatched.push({
        line: `${pair.home} - ${pair.away}`,
        reason: `Ismeretlen csapat: "${pair.home}" (${league})`,
      });
      continue;
    }
    if (!awayOpt) {
      unmatched.push({
        line: `${pair.home} - ${pair.away}`,
        reason: `Ismeretlen csapat: "${pair.away}" (${league})`,
      });
      continue;
    }
    if (homeOpt.key === awayOpt.key) {
      unmatched.push({
        line: `${pair.home} - ${pair.away}`,
        reason: `A két csapat megegyezik`,
      });
      continue;
    }
    if (usedKeys.has(homeOpt.key) || usedKeys.has(awayOpt.key)) {
      unmatched.push({
        line: `${pair.home} - ${pair.away}`,
        reason: `Csapat már szerepel a fordulóban`,
      });
      continue;
    }
    usedKeys.add(homeOpt.key);
    usedKeys.add(awayOpt.key);
    matched.push({
      pair,
      homeKey: homeOpt.key,
      awayKey: awayOpt.key,
      homeDisplay: homeOpt.display,
      awayDisplay: awayOpt.display,
    });
  }

  return { matched, unmatched };
}

export function applyMatchedToRound(
  round: FixtureRound,
  league: League,
  matched: ImportResult['matched'],
  setFixtureTeam: (fixtureId: string, side: 'home' | 'away', key: string | null) => void
): void {
  const slots = fixturesOf(round, league);
  const toFill = Math.min(matched.length, slots.length);
  for (let i = 0; i < toFill; i++) {
    const fixture = slots[i];
    const m = matched[i];
    setFixtureTeam(fixture.id, 'home', m.homeKey);
    setFixtureTeam(fixture.id, 'away', m.awayKey);
  }
}
