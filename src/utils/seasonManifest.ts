import { canon } from './teams';
import { checkDirectedFixtureMatrix } from './fixtureMatrix';
import type { MatchRow, Season } from '../types/winmix';

export interface ManifestCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    matchCount: number;
    teamCount: number;
    expectedMatches: number;
    expectedTeams: number;
    homeAwayBalanced: boolean;
    directedPairsComplete: boolean;
  };
}

const EXPECTED_TEAMS = 16;
const EXPECTED_MATCHES = 240;
const EXPECTED_HOME = 15;
const EXPECTED_AWAY = 15;

export function validateSeasonManifest(season: Season): ManifestCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const matches = season.matches;

  const teamSet = new Set<string>();
  const homeCount = new Map<string, number>();
  const awayCount = new Map<string, number>();

  for (const m of matches) {
    const h = canon(m.home_team);
    const a = canon(m.away_team);
    if (!h || !a || h === a) continue;
    teamSet.add(h);
    teamSet.add(a);
    homeCount.set(h, (homeCount.get(h) ?? 0) + 1);
    awayCount.set(a, (awayCount.get(a) ?? 0) + 1);
  }

  const teamCount = teamSet.size;
  const matchCount = matches.length;
  const expectedMatches = teamCount * (teamCount - 1);

  if (matchCount !== EXPECTED_MATCHES) {
    errors.push(
      `Mérkőzésszám: ${matchCount} (várt: ${EXPECTED_MATCHES})`
    );
  }

  if (teamCount !== EXPECTED_TEAMS) {
    errors.push(
      `Csapatszám: ${teamCount} (várt: ${EXPECTED_TEAMS})`
    );
  }

  let homeAwayBalanced = true;
  for (const team of teamSet) {
    const h = homeCount.get(team) ?? 0;
    const a = awayCount.get(team) ?? 0;
    if (h !== EXPECTED_HOME) {
      errors.push(`${team}: ${h} hazai (várt: ${EXPECTED_HOME})`);
      homeAwayBalanced = false;
    }
    if (a !== EXPECTED_AWAY) {
      errors.push(`${team}: ${a} vendég (várt: ${EXPECTED_AWAY})`);
      homeAwayBalanced = false;
    }
  }

  const fixtureReport = checkDirectedFixtureMatrix(matches);
  const directedPairsComplete = fixtureReport.complete;

  if (!directedPairsComplete) {
    if (fixtureReport.missingPairs > 0) {
      errors.push(
        `${fixtureReport.missingPairs} hiányzó irányított párosítás ` +
        `(várt: ${fixtureReport.expectedPairs}, megfigyelt: ${fixtureReport.observedPairs})`
      );
    }
    if (fixtureReport.repeatedPairs > 0) {
      errors.push(
        `${fixtureReport.repeatedPairs} ismétlődő irányított párosítás`
      );
    }
  }

  if (fixtureReport.missingExamples.length > 0 && errors.length > 0) {
    warnings.push(
      `Példa hiányzó párosításokra: ${fixtureReport.missingExamples.slice(0, 5).join(', ')}`
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      matchCount,
      teamCount,
      expectedMatches,
      expectedTeams: EXPECTED_TEAMS,
      homeAwayBalanced,
      directedPairsComplete,
    },
  };
}

export function validateMultiSeasonManifest(seasons: Season[]): ManifestCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalMatches = 0;
  let totalTeams = new Set<string>();
  let allBalanced = true;
  let allComplete = true;

  for (const season of seasons) {
    const result = validateSeasonManifest(season);
    if (!result.ok) {
      errors.push(`[${season.name}] ${result.errors.join('; ')}`);
    }
    warnings.push(...result.warnings.map((w) => `[${season.name}] ${w}`));
    totalMatches += result.stats.matchCount;
    totalTeams = new Set([...totalTeams]);
    allBalanced = allBalanced && result.stats.homeAwayBalanced;
    allComplete = allComplete && result.stats.directedPairsComplete;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      matchCount: totalMatches,
      teamCount: totalTeams.size,
      expectedMatches: seasons.length * EXPECTED_MATCHES,
      expectedTeams: EXPECTED_TEAMS,
      homeAwayBalanced: allBalanced,
      directedPairsComplete: allComplete,
    },
  };
}

export function sourceSeasonKey(league: string, seasonIndex: number): string {
  return `${league}_${seasonIndex}`;
}
