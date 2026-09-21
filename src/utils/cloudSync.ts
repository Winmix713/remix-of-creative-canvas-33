import type { AliasMap, Season, WeightMap } from '../types/winmix';
import { ingestSeasonsToCloud, type IngestResult } from './supabaseTier';

/**
 * The sole browser-side cloud-ingest entry point. Keeping the wire mapping here
 * prevents the automatic-import and operator-triggered paths from drifting.
 */
export function syncSeasonsToCloud(
  seasons: readonly Season[],
  teamWeights: WeightMap,
  teamAliasMap: AliasMap
): Promise<IngestResult> {
  return ingestSeasonsToCloud({
    seasons: seasons.map((season) => ({
      id: season.id,
      league: season.league,
      seasonIndex: season.seasonIndex,
      name: season.name,
      fileName: season.fileName,
      createdAt: season.createdAt,
      contentHash: season.contentHash,
      orderMode: season.orderMode ?? 'chronological',
      matches: season.matches.map((match) => ({
        match_no: match.match_no,
        date: match.date,
        kickoffIso: match.kickoffIso ?? null,
        rowIndex: match.rowIndex,
        sourceFileId: match.sourceFileId ?? null,
        home_team: match.home_team,
        away_team: match.away_team,
        ht_home_score: match.ht_home_score,
        ht_away_score: match.ht_away_score,
        home_score: match.home_score,
        away_score: match.away_score
      }))
    })),
    teamWeights,
    teamAliasMap
  });
}
