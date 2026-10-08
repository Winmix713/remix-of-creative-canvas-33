import { canon } from '../../supabase/functions/winmix-ingest/contract';
import type { CloudRatingSnapshot, SeasonInput } from './supabaseTier';

export function compareCloudRatings(snapshot:CloudRatingSnapshot,seasons:readonly SeasonInput[]) {
  const selected=seasons.filter(s=>s.league===snapshot.league).slice().sort((a,b)=>a.seasonIndex-b.seasonIndex);
  const basis=selected.flatMap(s=>s.matches.slice().sort((a,b)=>a.match_no-b.match_no).map(m=>[s.seasonIndex,m.match_no,canon(m.home_team),canon(m.away_team),m.home_score,m.away_score]));
  if(!basis.length || JSON.stringify(basis)!==JSON.stringify(snapshot.basis)) return {comparable:false,rows:[]};
  const stats=new Map<string,{hg:number;ag:number;hd:number;ad:number;pts:number}>();
  for(const s of selected) for(const m of s.matches) {
    const hk=canon(m.home_team),ak=canon(m.away_team);
    const h=stats.get(hk)??{hg:0,ag:0,hd:0,ad:0,pts:0},a=stats.get(ak)??{hg:0,ag:0,hd:0,ad:0,pts:0};
    h.hg++;a.ag++;h.hd+=m.home_score-m.away_score;a.ad+=m.away_score-m.home_score;
    h.pts+=m.home_score>m.away_score?3:m.home_score===m.away_score?1:0;
    a.pts+=m.away_score>m.home_score?3:m.home_score===m.away_score?1:0;
    stats.set(hk,h);stats.set(ak,a);
  }
  const values=[...stats.entries()].map(([key,s])=>({key,totalPlayed:s.hg+s.ag,netHome:s.hd/s.hg,netAway:s.ad/s.ag,ppg:s.pts/(s.hg+s.ag)}));
  const raws=values.map(v=>0.55*v.netHome+0.45*v.netAway+0.33*v.ppg);
  const mean=raws.reduce((a,b)=>a+b,0)/raws.length;
  const sd=Math.sqrt(raws.reduce((a,b)=>a+(b-mean)**2,0)/raws.length)||1;
  const locals=new Map(values.map((v,i)=>[v.key,{...v,autoWeightIndex:Math.min(10,Math.max(0,Math.round((5+(raws[i]-mean)/sd*1.75)*10)/10))}]));
  const rows=snapshot.ratings.map(sql=>{
    const local=locals.get(sql.canonicalKey);
    const agrees=!!local && local.totalPlayed===sql.totalPlayed && Math.abs(local.netHome-sql.netHome)<=0.005001
      && Math.abs(local.netAway-sql.netAway)<=0.005001 && Math.abs(local.ppg-sql.ppg)<=0.005001 && Math.abs(local.autoWeightIndex-sql.autoWeightIndex)<0.00001;
    return {sql,local,agrees};
  });
  return {comparable:rows.length===locals.size && new Set(rows.map(r=>r.sql.canonicalKey)).size===locals.size,rows};
}
