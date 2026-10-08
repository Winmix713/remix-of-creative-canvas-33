import {useCallback,useEffect,useRef,useState} from 'react';
import {fetchCloudTeamRatings,idleHealth,isCloudTierConfigured,probeCloudTier,type CloudTeamRating,type CloudTierHealth,type League} from '../utils/supabaseTier';
export interface CloudTierState {
  health:CloudTierHealth;configured:boolean;ratings:CloudTeamRating[];loadingRatings:boolean;
  refresh:()=>Promise<void>;retry:()=>Promise<void>;loadRatings:(league:League)=>Promise<void>;
}
/** Compatibility context for the existing status bar. Transient errors are retryable. */
export function useCloudTier():CloudTierState {
  const [health,setHealth]=useState(idleHealth),[ratings,setRatings]=useState<CloudTeamRating[]>([]),[loadingRatings,setLoading]=useState(false);
  const active=useRef(true),healthRequest=useRef(0),ratingRequest=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++healthRequest.current;setHealth(idleHealth());const next=await probeCloudTier();
    if(active.current&&request===healthRequest.current)setHealth(next);
  },[]);
  const loadRatings=useCallback(async(league:League)=>{
    const request=++ratingRequest.current;setRatings([]);setLoading(true);
    try{const rows=await fetchCloudTeamRatings(league);if(active.current&&request===ratingRequest.current)setRatings(rows);}
    catch(e){if(active.current&&request===ratingRequest.current)setHealth({status:'degraded',degraded:true,lastError:e instanceof Error?e.message:String(e),checkedAt:new Date().toISOString()});}
    finally{if(active.current&&request===ratingRequest.current)setLoading(false);}
  },[]);
  useEffect(()=>{active.current=true;void refresh();return()=>{active.current=false;healthRequest.current++;ratingRequest.current++;};},[refresh]);
  return {health,configured:isCloudTierConfigured(),ratings,loadingRatings,refresh,retry:refresh,loadRatings};
}
