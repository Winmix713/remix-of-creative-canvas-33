import type { IngestInput } from '../supabase/functions/winmix-ingest/contract';
export const operatorId='10000000-0000-4000-8000-000000000001';
export function fixture():IngestInput {
  const matches=[];
  for(let home=0;home<16;home++)for(let away=0;away<16;away++)if(home!==away)matches.push({match_no:matches.length+1,
    date:'2026-01-01',kickoffIso:'2026-01-01T12:00:00Z',rowIndex:matches.length+1,sourceFileId:'fixture.csv',
    home_team:`Team ${home}`,away_team:`Team ${away}`,ht_home_score:0,ht_away_score:0,home_score:home%5,away_score:away%4});
  return {requestId:crypto.randomUUID(),expectedRevision:0,seasons:[{league:'angol',seasonIndex:1,name:'Fixture',fileName:'fixture.csv',
    contentHash:null,orderMode:'chronological',matches}]};
}
