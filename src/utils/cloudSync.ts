import { ingestSeasonsToCloud,prepareIngestRequest,type SeasonInput } from './supabaseTier';

/** Compatibility adapter: weights and aliases remain local / parameter-snapshot inputs. */
export async function syncSeasonsToCloud(seasons:readonly SeasonInput[],_teamWeights?:unknown,_teamAliasMap?:unknown) {
  return ingestSeasonsToCloud(await prepareIngestRequest(seasons));
}
