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
    try{await action();}catch(e){
      if (e && typeof e === 'object' && 'issues' in e && Array.isArray((e as { issues: unknown[] }).issues)) {
        setError(`Adatérvényesítési hiba: ${(e as { issues: { path?: string[]; message: string }[] }).issues.map(i => `${i.path?.join('.') || 'mező'}: ${i.message}`).join(', ')}`);
      } else {
        setError(e instanceof Error?e.message:String(e));
      }
    }
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
  return <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm" aria-labelledby="cloud-title" aria-busy={!!busy}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
      <div>
        <h3 id="cloud-title" className="text-base font-semibold text-foreground">Felhő tier &amp; keresztellenőrzés</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {endpoint ? (
            <span className="inline-flex items-center gap-1.5 text-positive font-medium">
              <span className="size-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Kapcsolat: {endpoint.url}
            </span>
          ) : (
            <span className="text-destructive font-medium">Nincs érvényes Supabase-konfiguráció.</span>
          )}
        </p>
      </div>
      {selectedVersion && (
        <span className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground border border-border">
          {selectedVersion.seasonCount} szezon · {selectedVersion.matchCount} mérkőzés
        </span>
      )}
    </div>

    <p className="text-xs text-muted-foreground">
      Feltöltéskor új draft készül. A publikálás ellenőrzött szerverfolyamat része. Az SQL-értékek tájékoztató adatok.
    </p>

    {endpoint && !signedIn && (
      <form
        className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border bg-surface-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run('Bejelentkezés', async () => {
            const result = await getSupabase().auth.signInWithPassword({ email, password });
            setPassword('');
            if (result.error) throw result.error;
            await refresh();
          });
        }}
      >
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          E-mail
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
            placeholder="operator@winmix.hu"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          Jelszó
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground text-xs focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!!busy}
          className="px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition disabled:opacity-50"
        >
          Bejelentkezés
        </button>
      </form>
    )}

    {signedIn && (
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-border bg-surface-1">
        <p className="text-xs font-medium text-foreground">
          {canWrite ? (
            <span className="text-positive font-semibold">Operátori feltöltés engedélyezve.</span>
          ) : (
            <span className="text-warning">Bejelentkezve; feltöltési jogosultság nincs vagy még ellenőrzés alatt.</span>
          )}
        </p>
        <button
          disabled={!!busy}
          className="px-2.5 py-1 rounded-md bg-secondary hover:bg-muted text-foreground border border-border text-xs transition disabled:opacity-50"
          onClick={() => void run('Kijelentkezés', async () => {
            const { error } = await getSupabase().auth.signOut();
            if (error) throw error;
            setVersions([]);
            setSelected('');
            setPending(null);
            await refresh();
          })}
        >
          Kijelentkezés
        </button>
      </div>
    )}

    <div className="flex flex-wrap gap-3 items-center">
      <button
        disabled={!endpoint || !!busy}
        className="px-3 py-1.5 rounded-md bg-secondary hover:bg-muted text-foreground border border-border text-xs font-medium transition disabled:opacity-50"
        onClick={() => void run('Kapcsolat ellenőrzése', async () => {
          setSnapshot(null);
          setDownloads([]);
          await refresh();
        })}
      >
        Kapcsolat újrapróbálása
      </button>

      <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
        Adatverzió
        <select
          disabled={!!busy || !versions.length}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {!versions.length && <option value="">Nincs hozzáférhető verzió</option>}
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.versionKey} · {v.isCurrent ? 'publikált' : v.status} · r{v.revision}
            </option>
          ))}
        </select>
      </label>
    </div>

    <div className="flex flex-wrap gap-2.5 pt-1">
      <button
        disabled={!!busy || !canWrite || (!seasons.length && !pending)}
        className="px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition disabled:opacity-50"
        onClick={() => void upload()}
      >
        {pending ? 'Ugyanazon feltöltés újrapróbálása' : 'Szezonok feltöltése a felhőbe'}
      </button>

      <button
        disabled={!!busy || !selected}
        className="px-3.5 py-1.5 rounded-md bg-secondary hover:bg-muted text-foreground border border-border text-xs font-medium transition disabled:opacity-50"
        onClick={() => void download()}
      >
        Szezonok letöltése a felhőből
      </button>

      <button
        disabled={!!busy || !selected}
        className="px-3.5 py-1.5 rounded-md bg-secondary hover:bg-muted text-foreground border border-border text-xs font-medium transition disabled:opacity-50"
        onClick={() => void run('SQL értékelés betöltése', async () => {
          const g = generation.current;
          setSnapshot(null);
          const result = await fetchCloudRatingSnapshot(league, selected);
          if (g === generation.current) setSnapshot(result);
        })}
      >
        SQL értékelés betöltése
      </button>
    </div>

    {!seasons.length && (
      <p className="text-xs text-muted-foreground italic">Nincs átadott helyi szezon a feltöltéshez és az összevetéshez.</p>
    )}

    {pending && (
      <div className="p-3 rounded-lg border border-warning/30 bg-warning/10 text-xs space-y-2">
        <p>Függő feltöltés azonosítója: <code className="font-mono">{pending.requestId}</code>. Újrapróbáláskor ugyanazt az adatot küldjük.</p>
        <button
          disabled={!!busy}
          className="px-2.5 py-1 rounded-md bg-secondary text-foreground border border-border hover:bg-muted transition"
          onClick={() => {
            setPending(null);
            setNotice('A következő feltöltés az aktuális helyi adatokból készül. A korábbi kérés szerveroldali eredményét a verziólistában ellenőrizd.');
          }}
        >
          Aktuális helyi adatok előkészítése
        </button>
      </div>
    )}

    {busy && <p role="status" className="text-xs text-signal animate-pulse font-medium">{busy}…</p>}
    {error && <p role="alert" className="text-xs text-destructive p-2.5 rounded-md bg-destructive/10 border border-destructive/20 font-medium">{error}</p>}
    {notice && <p role="status" className="text-xs text-positive p-2.5 rounded-md bg-positive/10 border border-positive/20 font-medium">{notice}</p>}

    {!!downloads.length && (
      <div className="flex gap-2.5 pt-2">
        <button
          disabled={!!busy}
          className="px-3 py-1.5 rounded-md bg-secondary text-foreground border border-border text-xs hover:bg-muted transition"
          onClick={saveBundle}
        >
          Ellenőrzött adatcsomag mentése
        </button>
        {onImport && (
          <button
            disabled={!!busy}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition"
            onClick={() => void run('Helyi átvétel', async () => {
              await onImport(downloads);
              setNotice('A helyi import befejeződött.');
              setDownloads([]);
            })}
          >
            Letöltött szezonok átvétele
          </button>
        )}
      </div>
    )}

    {snapshot && (
      <div className="space-y-2 pt-2 border-t border-border">
        <p className="text-xs font-medium text-foreground">
          SQL pillanatkép: <span className="font-mono text-muted-foreground">{snapshot.dataVersionId}</span> · r{snapshot.revision} · {snapshot.league}
        </p>
        {!comparison?.comparable && (
          <p className="text-xs text-warning">
            Nem összehasonlítható: a helyi szezonok és mérkőzések eltérnek a kiválasztott felhőverziótól, vagy hiányos a válasz.
          </p>
        )}
        {!snapshot.ratings.length ? (
          <p className="text-xs text-muted-foreground">Nincs SQL értékelés ehhez a ligához.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-1 border-b border-border text-muted-foreground">
                <tr>
                  <th className="text-left p-2 font-medium">Csapat</th>
                  <th className="text-right p-2 font-medium">SQL hazai</th>
                  <th className="text-right p-2 font-medium">SQL vendég</th>
                  <th className="text-right p-2 font-medium">PPG</th>
                  <th className="text-right p-2 font-medium">Súly</th>
                  <th className="text-center p-2 font-medium">Összevetés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {snapshot.ratings.map((r) => {
                  const agrees = comparison?.comparable && comparison.rows.find((x) => x.sql.canonicalKey === r.canonicalKey)?.agrees;
                  return (
                    <tr key={r.canonicalKey} className="hover:bg-muted/40 transition">
                      <td className="p-2 font-medium text-foreground">{r.displayName}</td>
                      <td className="p-2 text-right font-mono">{r.netHome.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">{r.netAway.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">{r.ppg.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono">{r.autoWeightIndex.toFixed(1)}</td>
                      <td className="p-2 text-center">
                        {comparison?.comparable ? (
                          agrees ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Egyezik</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Eltérés</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">Nem összehasonlítható</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}
  </section>;
}
