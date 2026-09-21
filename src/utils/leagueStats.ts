/**
 * Liga Elemző — aggregation functions that DON'T already exist in the codebase.
 *
 * Reuses:
 *   - computeStandings
 *   - computeH2HPairs
 *   - summarizeMatchup
 *   - computeLeagueBaselines
 *   - buildTeamPool
 *   - finalizeMatchOrder
 *
 * The file intentionally keeps aggregation logic here and avoids duplicating
 * functionality that already exists in the project.
 */

import { computeStandings } from './standings';
import { computeH2HPairs } from './h2h';
import { buildTeamPool } from './fixtures';
import { finalizeMatchOrder } from './matchDate';
import { canon } from './teams';

import type {
  H2HPair,
  League,
  MatchRow,
  Season,
  StandingRow,
  AliasMap,
  WeightMap,
} from '../types/winmix';

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A match can be represented as 0-0 in two different situations:
 *
 *   1. A genuinely completed 0-0 match.
 *   2. A fixture that has not been played yet.
 *
 * Therefore:
 *
 *   home_score === 0 && away_score === 0
 *
 * MUST NOT be used as the only definition of "upcoming".
 *
 * The current data model does not expose a single authoritative `status`
 * field, so round-level evidence is used as the safest available fallback.
 *
 * A round is considered played when at least one match in that round contains
 * actual result evidence:
 *
 *   - non-zero final score
 *   - half-time score
 *   - non-zero total goals
 *   - BTTS=true
 *
 * Once a round contains result evidence, all fixtures belonging to that
 * already-started round are treated as played, including a legitimate 0-0.
 *
 * This prevents a completed 0-0 from being incorrectly classified as
 * upcoming merely because its own score is 0-0.
 */
function hasResultEvidence(m: MatchRow): boolean {
  return (
    m.home_score !== 0 ||
    m.away_score !== 0 ||
    m.ht_home_score !== null ||
    m.ht_away_score !== null ||
    m.total_goals !== 0 ||
    m.btts === true
  );
}

/**
 * Builds the set of rounds for which the dataset contains result evidence.
 */
function getPlayedRounds(matches: MatchRow[]): Set<number> {
  const playedRounds = new Set<number>();

  for (const match of matches) {
    if (hasResultEvidence(match)) {
      playedRounds.add(match.match_no);
    }
  }

  return playedRounds;
}

/**
 * Determines whether a match belongs to a round that has already started.
 *
 * This is deliberately round-aware so a 0-0 result in a partially completed
 * round is not mistaken for an upcoming fixture.
 */
function isMatchPlayed(
  match: MatchRow,
  playedRounds: Set<number>,
): boolean {
  if (hasResultEvidence(match)) {
    return true;
  }

  return playedRounds.has(match.match_no);
}

/**
 * Returns all valid round numbers in chronological order.
 */
function getRoundNumbers(matches: MatchRow[]): number[] {
  return Array.from(
    new Set(
      matches
        .map((m) => m.match_no)
        .filter((round) => Number.isFinite(round)),
    ),
  ).sort((a, b) => a - b);
}

/**
 * Small shared percentage helper.
 */
function pct(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/* -------------------------------------------------------------------------- *
 * Over / Under per team
 * -------------------------------------------------------------------------- */

export interface TeamOverUnderRow {
  key: string;
  displayName: string;
  played: number;
  over25Pct: number;
  under25Pct: number;
  over15Pct: number;
  bttsPct: number;
}

export function computeTeamOverUnder(
  matches: MatchRow[],
  aliases: Record<string, string>,
): TeamOverUnderRow[] {
  /*
   * Upcoming fixtures must never contribute to historical team statistics.
   *
   * Use round-aware played detection instead of assuming that 0-0 means
   * upcoming.
   */
  const playedRounds = getPlayedRounds(matches);

  const acc = new Map<
    string,
    {
      played: number;
      over25: number;
      over15: number;
      btts: number;
    }
  >();

  for (const m of matches) {
    if (!isMatchPlayed(m, playedRounds)) continue;

    for (const team of [m.home_team, m.away_team]) {
      const key = canon(team);

      if (!acc.has(key)) {
        acc.set(key, {
          played: 0,
          over25: 0,
          over15: 0,
          btts: 0,
        });
      }

      const a = acc.get(key)!;

      a.played++;

      if (m.total_goals > 2.5) a.over25++;
      if (m.total_goals > 1.5) a.over15++;
      if (m.btts) a.btts++;
    }
  }

  return Array.from(acc.entries())
    .map<TeamOverUnderRow>(([key, a]) => ({
      key,
      displayName: aliases[key] ?? key,
      played: a.played,
      over25Pct: pct(a.over25, a.played),
      under25Pct: pct(a.played - a.over25, a.played),
      over15Pct: pct(a.over15, a.played),
      bttsPct: pct(a.btts, a.played),
    }))
    .sort((a, b) => b.over25Pct - a.over25Pct);
}

/* -------------------------------------------------------------------------- *
 * Form table — last N matches per team
 * -------------------------------------------------------------------------- */

export type FormResult = 'W' | 'D' | 'L';

export interface TeamFormRow {
  key: string;
  displayName: string;
  played: number;
  formPoints: number;
  form: FormResult[];
}

/**
 * Computes the last N (default 5) results for each team across all played
 * matches in the provided list.
 *
 * Matches should be ordered chronologically before being passed here.
 */
export function computeTeamForm(
  matches: MatchRow[],
  aliases: Record<string, string>,
  windowSize = 5,
): TeamFormRow[] {
  const playedRounds = getPlayedRounds(matches);

  const results = new Map<
    string,
    {
      displayName: string;
      results: FormResult[];
      points: number;
    }
  >();

  for (const m of matches) {
    if (!isMatchPlayed(m, playedRounds)) continue;

    const hKey = canon(m.home_team);
    const aKey = canon(m.away_team);

    if (!results.has(hKey)) {
      results.set(hKey, {
        displayName: aliases[hKey] ?? m.home_team,
        results: [],
        points: 0,
      });
    }

    if (!results.has(aKey)) {
      results.set(aKey, {
        displayName: aliases[aKey] ?? m.away_team,
        results: [],
        points: 0,
      });
    }

    const h = results.get(hKey)!;
    const a = results.get(aKey)!;

    if (m.home_score > m.away_score) {
      h.results.push('W');
      h.points += 3;

      a.results.push('L');
    } else if (m.home_score === m.away_score) {
      h.results.push('D');
      h.points += 1;

      a.results.push('D');
      a.points += 1;
    } else {
      h.results.push('L');

      a.results.push('W');
      a.points += 3;
    }
  }

  return Array.from(results.entries())
    .map<TeamFormRow>(([key, r]) => ({
      key,
      displayName: r.displayName,
      played: r.results.length,
      formPoints: r.points,
      form: r.results.slice(-windowSize),
    }))
    .sort((a, b) => {
      if (b.formPoints !== a.formPoints) {
        return b.formPoints - a.formPoints;
      }

      return a.displayName.localeCompare(b.displayName, 'hu');
    });
}

/* -------------------------------------------------------------------------- *
 * Position history — per-round standings position for a team
 * -------------------------------------------------------------------------- */

export interface PositionHistoryEntry {
  round: number;
  position: number;
}

export interface TeamPositionHistory {
  key: string;
  displayName: string;
  history: PositionHistoryEntry[];
}

/**
 * Computes the standings position of each team after every round.
 *
 * The function accepts a single season. The output shape can later be
 * concatenated for multi-season analysis without changing its structure.
 */
export function computePositionHistory(
  season: Season,
  weights: Record<string, number>,
  aliases: Record<string, string>,
): TeamPositionHistory[] {
  const ordered = finalizeMatchOrder(season.matches);
  const matches = ordered.matches;

  if (matches.length === 0) return [];

  const rounds = getRoundNumbers(matches);

  if (rounds.length === 0) return [];

  const result = new Map<string, TeamPositionHistory>();

  for (const round of rounds) {
    const matchesUpToRound = matches.filter(
      (m) => m.match_no <= round,
    );

    const standings = computeStandings(
      matchesUpToRound,
      weights,
      aliases,
    );

    standings.forEach((row, idx) => {
      if (!result.has(row.key)) {
        result.set(row.key, {
          key: row.key,
          displayName: row.displayName,
          history: [],
        });
      }

      result.get(row.key)!.history.push({
        round,
        position: idx + 1,
      });
    });
  }

  return Array.from(result.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'hu'),
  );
}

/* -------------------------------------------------------------------------- *
 * Result matrix — one team vs all opponents, home and away
 * -------------------------------------------------------------------------- */

export interface ResultMatrixCell {
  homeScore: number;
  awayScore: number;
  outcome: 'W' | 'D' | 'L';
  date: string;
}

export interface ResultMatrixRow {
  opponentKey: string;
  opponentName: string;
  home: ResultMatrixCell | null;
  away: ResultMatrixCell | null;
}

export interface TeamResultMatrix {
  teamKey: string;
  teamName: string;
  rows: ResultMatrixRow[];
}

/**
 * Builds a cross-table from the perspective of one team.
 *
 * For every opponent:
 *   - home = selected team at home
 *   - away = selected team away
 *
 * In a double round-robin the most recent meeting is retained for each
 * venue orientation.
 */
export function computeResultMatrix(
  matches: MatchRow[],
  teamKey: string,
  aliases: Record<string, string>,
): TeamResultMatrix {
  const playedRounds = getPlayedRounds(matches);

  const homeByOpp = new Map<string, ResultMatrixCell>();
  const awayByOpp = new Map<string, ResultMatrixCell>();

  for (const m of matches) {
    if (!isMatchPlayed(m, playedRounds)) continue;

    const hKey = canon(m.home_team);
    const aKey = canon(m.away_team);

    if (hKey === teamKey) {
      const opp = aKey;

      const cell: ResultMatrixCell = {
        homeScore: m.home_score,
        awayScore: m.away_score,
        outcome:
          m.home_score > m.away_score
            ? 'W'
            : m.home_score === m.away_score
              ? 'D'
              : 'L',
        date: m.date,
      };

      const existing = homeByOpp.get(opp);

      if (!existing || m.date > existing.date) {
        homeByOpp.set(opp, cell);
      }
    } else if (aKey === teamKey) {
      const opp = hKey;

      const cell: ResultMatrixCell = {
        homeScore: m.home_score,
        awayScore: m.away_score,
        outcome:
          m.away_score > m.home_score
            ? 'W'
            : m.away_score === m.home_score
              ? 'D'
              : 'L',
        date: m.date,
      };

      const existing = awayByOpp.get(opp);

      if (!existing || m.date > existing.date) {
        awayByOpp.set(opp, cell);
      }
    }
  }

  const allOpps = new Set<string>([
    ...homeByOpp.keys(),
    ...awayByOpp.keys(),
  ]);

  const rows: ResultMatrixRow[] = Array.from(allOpps)
    .map((oppKey) => ({
      opponentKey: oppKey,
      opponentName: aliases[oppKey] ?? oppKey,
      home: homeByOpp.get(oppKey) ?? null,
      away: awayByOpp.get(oppKey) ?? null,
    }))
    .sort((a, b) =>
      a.opponentName.localeCompare(b.opponentName, 'hu'),
    );

  return {
    teamKey,
    teamName: aliases[teamKey] ?? teamKey,
    rows,
  };
}

/* -------------------------------------------------------------------------- *
 * Team recent and upcoming matches
 * -------------------------------------------------------------------------- */

export interface TeamMatchEntry {
  date: string;
  opponent: string;
  opponentKey: string;
  isHome: boolean;
  htHome: number | null;
  htAway: number | null;
  homeScore: number;
  awayScore: number;
  totalGoals: number;
  btts: boolean;
  /** True only when the fixture belongs to an upcoming round. */
  isUpcoming: boolean;
}

/**
 * Computes previous and upcoming fixtures for one team.
 *
 * IMPORTANT:
 * A 0-0 score is NOT sufficient to classify a fixture as upcoming.
 *
 * Round-level result evidence is used so that:
 *
 *   Round 12:
 *     A-B 0-0
 *     C-D 2-1
 *
 * correctly classifies A-B as a played 0-0 match.
 */
export function computeTeamMatches(
  matches: MatchRow[],
  teamKey: string,
  aliases: Record<string, string>,
): {
  previous: TeamMatchEntry[];
  upcoming: TeamMatchEntry[];
} {
  const ordered = finalizeMatchOrder(matches);
  const all = ordered.matches;

  if (all.length === 0) {
    return {
      previous: [],
      upcoming: [],
    };
  }

  const playedRounds = getPlayedRounds(all);

  const entries: TeamMatchEntry[] = [];

  for (const m of all) {
    const hKey = canon(m.home_team);
    const aKey = canon(m.away_team);

    if (hKey !== teamKey && aKey !== teamKey) continue;

    const isHome = hKey === teamKey;
    const oppKey = isHome ? aKey : hKey;

    const played = isMatchPlayed(m, playedRounds);
    const isUpcoming = !played;

    entries.push({
      date: m.date,
      opponent: aliases[oppKey] ?? oppKey,
      opponentKey: oppKey,
      isHome,
      htHome: m.ht_home_score,
      htAway: m.ht_away_score,
      homeScore: m.home_score,
      awayScore: m.away_score,
      totalGoals: m.total_goals,
      btts: m.btts,
      over25: m.total_goals > 2.5,
      isUpcoming,
    });
  }

  /*
   * `finalizeMatchOrder` provides chronological ordering.
   *
   * Previous:
   *   - played only
   *   - latest first
   *   - max 10
   *
   * Upcoming:
   *   - not played
   *   - chronological
   *   - max 10
   */
  const previous = entries
    .filter((entry) => !entry.isUpcoming)
    .reverse()
    .slice(0, 10);

  const upcoming = entries
    .filter((entry) => entry.isUpcoming)
    .slice(0, 10);

  return {
    previous,
    upcoming,
  };
}

/* -------------------------------------------------------------------------- *
 * League benchmark
 * -------------------------------------------------------------------------- */

export interface LeagueBenchmark {
  totalMatches: number;
  goalsPerMatch: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  over25Pct: number;
  bttsPct: number;
}

/**
 * The benchmark represents the primary WinMix league universe:
 *
 *   English + Spanish
 *
 * It deliberately ignores unrelated leagues that may also be loaded into
 * the application.
 *
 * The optional `benchmarkLeagues` parameter keeps the function reusable
 * without allowing unrelated imported leagues to silently contaminate the
 * default benchmark.
 */
export function computeLeagueBenchmark(
  seasons: Season[],
  benchmarkLeagues: League[] = ['english', 'spanish'] as League[],
): LeagueBenchmark {
  const allowedLeagues = new Set<League>(benchmarkLeagues);

  let n = 0;
  let goals = 0;
  let home = 0;
  let draw = 0;
  let away = 0;
  let over25 = 0;
  let btts = 0;

  for (const season of seasons) {
    if (!allowedLeagues.has(season.league)) continue;

    const playedRounds = getPlayedRounds(season.matches);

    for (const m of season.matches) {
      if (!isMatchPlayed(m, playedRounds)) continue;

      n++;
      goals += m.total_goals;

      if (m.home_score > m.away_score) {
        home++;
      } else if (m.home_score === m.away_score) {
        draw++;
      } else {
        away++;
      }

      if (m.total_goals > 2.5) {
        over25++;
      }

      if (m.btts) {
        btts++;
      }
    }
  }

  return {
    totalMatches: n,
    goalsPerMatch: n > 0 ? goals / n : 0,
    homeWinPct: pct(home, n),
    drawPct: pct(draw, n),
    awayWinPct: pct(away, n),
    over25Pct: pct(over25, n),
    bttsPct: pct(btts, n),
  };
}

/* -------------------------------------------------------------------------- *
 * League overview metrics
 * -------------------------------------------------------------------------- */

export interface LeagueOverviewMetrics {
  totalMatches: number;
  goalsPerMatch: number;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  over25Pct: number;
  bttsPct: number;
}

/**
 * Computes overview metrics ONLY for the requested league.
 *
 * This is intentionally separate from `computeLeagueBenchmark`.
 *
 * overview:
 *   selected league only
 *
 * benchmark:
 *   English + Spanish WinMix benchmark universe
 */
export function computeLeagueOverview(
  seasons: Season[],
  league: League,
): LeagueOverviewMetrics {
  const leagueSeasons = seasons.filter(
    (season) => season.league === league,
  );

  let n = 0;
  let goals = 0;
  let home = 0;
  let draw = 0;
  let away = 0;
  let over25 = 0;
  let btts = 0;

  for (const season of leagueSeasons) {
    const playedRounds = getPlayedRounds(season.matches);

    for (const m of season.matches) {
      if (!isMatchPlayed(m, playedRounds)) continue;

      n++;
      goals += m.total_goals;

      if (m.home_score > m.away_score) {
        home++;
      } else if (m.home_score === m.away_score) {
        draw++;
      } else {
        away++;
      }

      if (m.total_goals > 2.5) {
        over25++;
      }

      if (m.btts) {
        btts++;
      }
    }
  }

  return {
    totalMatches: n,
    goalsPerMatch: n > 0 ? goals / n : 0,
    homeWinPct: pct(home, n),
    drawPct: pct(draw, n),
    awayWinPct: pct(away, n),
    over25Pct: pct(over25, n),
    bttsPct: pct(btts, n),
  };
}

/* -------------------------------------------------------------------------- *
 * Current and next fixtures
 * -------------------------------------------------------------------------- */

export interface FixtureEntry {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  isUpcoming: boolean;
}

/**
 * Computes the current and next round for a season.
 *
 * Rules:
 *
 * 1. Find the latest round containing actual result evidence.
 * 2. `current` = that round, including 0-0 fixtures inside the round.
 * 3. `next` = the first available round after current.
 * 4. If no round has been played yet:
 *      current = []
 *      next = first available round.
 *
 * This fixes the previous behaviour where:
 *
 *   lastPlayedRound === 0
 *
 * caused `next` to point to round 1 without correctly accounting for
 * sparse/non-contiguous round data.
 */
export function computeCurrentAndNextFixtures(
  season: Season,
  aliases: Record<string, string>,
): {
  current: FixtureEntry[];
  next: FixtureEntry[];
} {
  const ordered = finalizeMatchOrder(season.matches);
  const matches = ordered.matches;

  if (matches.length === 0) {
    return {
      current: [],
      next: [],
    };
  }

  const rounds = getRoundNumbers(matches);

  if (rounds.length === 0) {
    return {
      current: [],
      next: [],
    };
  }

  const playedRounds = getPlayedRounds(matches);

  /*
   * Latest round containing result evidence.
   *
   * We iterate the known round list rather than assuming rounds are
   * continuously numbered from 1.
   */
  let lastPlayedRound: number | null = null;

  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];

    if (playedRounds.has(round)) {
      lastPlayedRound = round;
      break;
    }
  }

  /**
   * No played round:
   *
   * The season is still before its first result.
   *
   * Therefore:
   *   current = []
   *   next = first available round
   */
  if (lastPlayedRound === null) {
    const firstRound = rounds[0];

    const next = matches
      .filter((m) => m.match_no === firstRound)
      .map((m): FixtureEntry => ({
        date: m.date,
        homeTeam:
          aliases[canon(m.home_team)] ?? m.home_team,
        awayTeam:
          aliases[canon(m.away_team)] ?? m.away_team,
        homeScore: null,
        awayScore: null,
        isUpcoming: true,
      }));

    return {
      current: [],
      next,
    };
  }

  const current = matches
    .filter((m) => m.match_no === lastPlayedRound)
    .map((m): FixtureEntry => {
      const played = isMatchPlayed(m, playedRounds);

      return {
        date: m.date,
        homeTeam:
          aliases[canon(m.home_team)] ?? m.home_team,
        awayTeam:
          aliases[canon(m.away_team)] ?? m.away_team,
        homeScore: played ? m.home_score : null,
        awayScore: played ? m.away_score : null,
        isUpcoming: !played,
      };
    });

  /*
   * Find the first known round after the current one.
   *
   * Do not simply use `lastPlayedRound + 1`, because imported historical
   * datasets may contain missing round numbers.
   */
  const nextRound = rounds.find(
    (round) => round > lastPlayedRound!,
  );

  if (nextRound === undefined) {
    return {
      current,
      next: [],
    };
  }

  const next = matches
    .filter((m) => m.match_no === nextRound)
    .map((m): FixtureEntry => ({
      date: m.date,
      homeTeam:
        aliases[canon(m.home_team)] ?? m.home_team,
      awayTeam:
        aliases[canon(m.away_team)] ?? m.away_team,
      homeScore: null,
      awayScore: null,
      isUpcoming: true,
    }));

  return {
    current,
    next,
  };
}

/* -------------------------------------------------------------------------- *
 * Convenience: league-scoped data bundle for the page
 * -------------------------------------------------------------------------- */

export interface LeagueAnalyzerData {
  standings: StandingRow[];
  overview: LeagueOverviewMetrics;
  benchmark: LeagueBenchmark;
  overUnder: TeamOverUnderRow[];
  form: TeamFormRow[];
  teamPool: {
    key: string;
    display: string;
    played: number;
  }[];
  h2hPairs: H2HPair[];
}

/**
 * Builds the complete league-scoped data bundle used by the League Analyzer.
 *
 * Important separation:
 *
 *   leagueSeasons
 *       = only seasons belonging to selected league
 *
 *   leagueMatches
 *       = only matches belonging to selected league
 *
 *   overview
 *       = selected league only
 *
 *   benchmark
 *       = English + Spanish benchmark only
 *
 *   standings
 *       = selected season when it belongs to selected league,
 *         otherwise all selected-league matches
 */
export function buildLeagueAnalyzerData(
  seasons: Season[],
  league: League,
  weights: WeightMap,
  aliases: AliasMap,
  selectedSeason: Season | null,
): LeagueAnalyzerData {
  /*
   * FIRST AND MOST IMPORTANT SCOPE:
   * everything league-specific is derived from this filtered collection.
   */
  const leagueSeasons = seasons.filter(
    (season) => season.league === league,
  );

  const leagueMatches = leagueSeasons.flatMap(
    (season) => season.matches,
  );

  const leagueWeights = weights[league] ?? {};
  const leagueAliases = aliases[league] ?? {};

  /*
   * Never allow a selected season from another league to leak into the
   * selected league's standings.
   */
  const scopedSelectedSeason =
    selectedSeason?.league === league
      ? selectedSeason
      : null;

  const standings = scopedSelectedSeason
    ? computeStandings(
        scopedSelectedSeason.matches,
        leagueWeights,
        leagueAliases,
      )
    : computeStandings(
        leagueMatches,
        leagueWeights,
        leagueAliases,
      );

  /*
   * OVERVIEW:
   * strictly selected league.
   */
  const overview = computeLeagueOverview(
    leagueSeasons,
    league,
  );

  /*
   * BENCHMARK:
   * intentionally English + Spanish only.
   *
   * Passing the full `seasons` array is safe because
   * `computeLeagueBenchmark` itself applies the benchmark league filter.
   */
  const benchmark = computeLeagueBenchmark(seasons);

  /*
   * Historical team statistics must not be contaminated by upcoming
   * fixtures.
   */
  const overUnder = computeTeamOverUnder(
    leagueMatches,
    leagueAliases,
  );

  const orderedMatches =
    finalizeMatchOrder(leagueMatches).matches;

  const form = computeTeamForm(
    orderedMatches,
    leagueAliases,
  );

  const teamPool = buildTeamPool(
    leagueSeasons,
    league,
    leagueAliases,
  );

  const h2hPairs = computeH2HPairs(
    leagueSeasons,
    leagueAliases,
  );

  return {
    standings,
    overview,
    benchmark,
    overUnder,
    form,
    teamPool,
    h2hPairs,
  };
}