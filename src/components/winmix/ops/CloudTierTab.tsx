import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabase } from '../../../integrations/supabase/client';
import { cloudAccess, cloudEndpointSummary, fetchCloudVersions, fetchCloudSeasonList, fetchCloudSeasonData,
  fetchCloudRatingSnapshot, ingestSeasonsToCloud, prepareIngestRequest, type CloudVersion, type CloudRatingSnapshot,
  type IngestInput, type League, type SeasonInput, type CloudSeasonDownload } from '../../../utils/supabaseTier';
import { compareCloudRatings } from '../../../utils/cloudComparison';

export function CloudTierTab({league,seasons=[],crossCheck:_legacyCrossCheck,onImport}:{
  league:League; seasons?:readonly SeasonInput[]; crossCheck?:unknown;
  onImport?:(downloads:CloudSeasonDownload[])=>Promise<void>;
}) {
  const [versions,setVersions]=useState<CloudVersion[]>([]),[selected,setSelected]=useState('');
  const [canWrite,setCanWrite]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [signedIn,setSignedIn]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [snapshot,setSnapshot]=useState<CloudRatingSnapshot|null>(null),[downloads,setDownloads]=useState<CloudSeasonDownload[]>([]);
  const [pending,setPending]=useState<IngestInput|null>(null);
  const running=useRef(false),generation=useRef(0);
  const endpoint=cloudEndpointSummary();
  const selectedVersion=versions.find(v=>v.id===selected);
  const comparison=useMemo(()=>snapshot?compareCloudRatings(snapshot,seasons):null,[snapshot,seasons]);

  const run=useCallback(async(label:string,action:()=>Promise<void>)=>{
    if(running.current)return; running.current=true;setBusy(label);setError('');setNotice('');
    try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{running.current=false;setBusy('');}
  },[]);
  const refresh=useCallback(async()=>{
    const [access,list]=await Promise.all([cloudAccess(),fetchCloudVersions()]);
    setCanWrite(access.canWrite);setVersions(list);
    setSelected(old=>list.some(v=>v.id===old)?old:list.find(v=>v.isCurrent)?.id??list[0]?.id??'');
  },[]);
  useEffect(()=>{
    if(!endpoint)return;
    void run('Kapcsolat ellenőrzése',refresh);
    const {data}=getSupabase().auth.onAuthStateChange((_event,session)=>{
      // Do not await other Auth calls while inside this callback.
      setSignedIn(!!session);setCanWrite(false);setSnapshot(null);setDownloads([]);generation.current++;
      setTimeout(()=>{void run('Jogosultság ellenőrzése',refresh);},0);
    });
    return()=>{data.subscription.unsubscribe();generation.current++;};
  },[run,refresh,endpoint?.url]);
  useEffect(()=>{generation.current++;setSnapshot(null);setDownloads([]);},[league,selected]);

  const upload=()=>run('Feltöltés',async()=>{
    const input=pending??await prepareIngestRequest(seasons);
    setPending(input);
    const receipt=await ingestSeasonsToCloud(input);
    setPending(null);
    await refresh();setSelected(receipt.dataVersionId);
    setNotice(`${receipt.replayed?'Korábbi import nyugtája':'Draft mentve'}: ${receipt.seasons} szezon, ${receipt.matches} mérkőzés. A publikált verzió nem változott. A verziólistában látható az aktuális állapot.`);
  });
  const download=()=>run('Szezonok letöltése',async()=>{
    const requestGeneration=generation.current;
    const metas=await fetchCloudSeasonList(league,selected);
    if(!metas.length){setNotice('Ebben a verzióban nincs szezon a kiválasztott ligához.');return;}
    const complete:CloudSeasonDownload[]=[];
    // Sequential bounded downloads; no local import occurs until all succeed.
    for(const meta of metas)complete.push(await fetchCloudSeasonData(meta));
    const latest=await fetchCloudVersions();
    if(latest.find(v=>v.id===selected)?.revision!==metas[0].revision)throw new Error('Letöltés közben változott a verzió. Próbáld újra.');
    if(requestGeneration!==generation.current)return;
    setDownloads(complete);setNotice(`${complete.length} szezon letöltve és ellenőrizve. Az átvétel külön művelet.`);
  });
  const saveBundle=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({version:selectedVersion,seasons:downloads},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`winmix-${selected}-${league}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="rounded-xl border border-border bg-card p-4 space-y-4" aria-labelledby="cloud-title" aria-busy={!!busy}>
    <h3 id="cloud-title" className="font-bold">Felhő tier &amp; keresztellenőrzés</h3>
    <p>{endpoint?`Kapcsolat: ${endpoint.url}`:'Nincs érvényes Supabase-konfiguráció.'}</p>
    <p>Feltöltéskor új draft készül. A publikálás ellenőrzött szerverfolyamat része. Az SQL-értékek tájékoztató adatok.</p>
    {endpoint && !signedIn && <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void run('Bejelentkezés',async()=>{
      const result=await getSupabase().auth.signInWithPassword({email,password});setPassword('');if(result.error)throw result.error;await refresh();
    });}}>
      <label>E-mail <input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label>Jelszó <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>
      <button type="submit" disabled={!!busy}>Bejelentkezés</button>
    </form>}
    {signedIn && <p>{canWrite?'Operátori feltöltés engedélyezve.':'Bejelentkezve; feltöltési jogosultság nincs vagy még ellenőrzés alatt.'}{' '}
      <button disabled={!!busy} onClick={()=>void run('Kijelentkezés',async()=>{const {error}=await getSupabase().auth.signOut();if(error)throw error;setVersions([]);setSelected('');setPending(null);await refresh();})}>Kijelentkezés</button></p>}
    <div className="flex flex-wrap gap-3 items-center">
      <button disabled={!endpoint||!!busy} onClick={()=>void run('Kapcsolat ellenőrzése',async()=>{setSnapshot(null);setDownloads([]);await refresh();})}>Kapcsolat újrapróbálása</button>
      <label>Adatverzió <select disabled={!!busy||!versions.length} value={selected} onChange={e=>setSelected(e.target.value)}>
        {!versions.length&&<option value="">Nincs hozzáférhető verzió</option>}
        {versions.map(v=><option key={v.id} value={v.id}>{v.versionKey} · {v.isCurrent?'publikált':v.status} · r{v.revision}</option>)}
      </select></label>
    </div>
    {selectedVersion&&<p>{selectedVersion.seasonCount} szezon · {selectedVersion.matchCount} mérkőzés · {selectedVersion.id}</p>}
    <div className="flex flex-wrap gap-3">
      <button disabled={!!busy||!canWrite||(!seasons.length&&!pending)} onClick={()=>void upload()}>{pending?'Ugyanazon feltöltés újrapróbálása':'Szezonok feltöltése a felhőbe'}</button>
      <button disabled={!!busy||!selected} onClick={()=>void download()}>Szezonok letöltése a felhőből</button>
      <button disabled={!!busy||!selected} onClick={()=>void run('SQL értékelés betöltése',async()=>{
        const g=generation.current;setSnapshot(null);const result=await fetchCloudRatingSnapshot(league,selected);if(g===generation.current)setSnapshot(result);
      })}>SQL értékelés betöltése</button>
    </div>
    {!seasons.length&&<p>Nincs átadott helyi szezon a feltöltéshez és az összevetéshez.</p>}
    {pending&&<div><p>Függő feltöltés azonosítója: {pending.requestId}. Újrapróbáláskor ugyanazt az adatot küldjük.</p>
      <button disabled={!!busy} onClick={()=>{setPending(null);setNotice('A következő feltöltés az aktuális helyi adatokból készül. A korábbi kérés szerveroldali eredményét a verziólistában ellenőrizd.');}}>Aktuális helyi adatok előkészítése</button></div>}
    {busy&&<p role="status">{busy}…</p>}
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {!!downloads.length&&<div className="flex gap-3">
      <button disabled={!!busy} onClick={saveBundle}>Ellenőrzött adatcsomag mentése</button>
      {onImport&&<button disabled={!!busy} onClick={()=>void run('Helyi átvétel',async()=>{await onImport(downloads);setNotice('A helyi import befejeződött.');setDownloads([]);})}>Letöltött szezonok átvétele</button>}
    </div>}
    {snapshot&&<div>
      <p>SQL pillanatkép: {snapshot.dataVersionId} · r{snapshot.revision} · {snapshot.league}</p>
      {!comparison?.comparable&&<p>Nem összehasonlítható: a helyi szezonok és mérkőzések eltérnek a kiválasztott felhőverziótól, vagy hiányos a válasz.</p>}
      {!snapshot.ratings.length?<p>Nincs SQL értékelés ehhez a ligához.</p>:<div className="overflow-x-auto"><table>
        <thead><tr><th>Csapat</th><th>SQL hazai</th><th>SQL vendég</th><th>PPG</th><th>Súly</th><th>Összevetés</th></tr></thead>
        <tbody>{snapshot.ratings.map(r=><tr key={r.canonicalKey}><td>{r.displayName}</td><td>{r.netHome.toFixed(2)}</td><td>{r.netAway.toFixed(2)}</td><td>{r.ppg.toFixed(2)}</td><td>{r.autoWeightIndex.toFixed(1)}</td><td>{comparison?.comparable?(comparison.rows.find(x=>x.sql.canonicalKey===r.canonicalKey)?.agrees?'Egyezik':'Eltérés'):'Nem összehasonlítható'}</td></tr>)}</tbody>
      </table></div>}
    </div>}
  </section>;
}
