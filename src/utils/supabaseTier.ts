import { z } from 'zod';
import { readCloudEnv } from './cloudConfig';
import { getSupabase, sessionToken } from '../integrations/supabase/client';
import { normalizeInput, type IngestInput, type League, type MatchInput, type SeasonInput } from '../../supabase/functions/winmix-ingest/contract';
export type { IngestInput, League, MatchInput, SeasonInput };

export class CloudHttpError extends Error {
  constructor(readonly status: number, message: string, readonly code = '', readonly traceId?: string) { super(message); this.name = 'CloudHttpError'; }
}
export const isCloudTierConfigured = () => readCloudEnv() !== null;
export const cloudEndpointSummary = () => { const e = readCloudEnv(); return e ? { url: e.url, source: e.source } : null; };
export type CloudTierStatus = 'unconfigured' | 'probing' | 'online' | 'degraded';
export interface CloudTierHealth { status: CloudTierStatus; degraded: boolean; lastError: string | null; checkedAt: string | null }
export const idleHealth = (): CloudTierHealth => ({ status: isCloudTierConfigured() ? 'probing' : 'unconfigured', degraded: false, lastError: null, checkedAt: null });

function errorMessage(status: number, code: string): string {
  if (status === 401) return 'A kulcs vagy a munkamenet érvénytelen. Ellenőrizd a projektet, majd jelentkezz be újra.';
  if (status === 403) return 'Ehhez a művelethez vagy adatverzióhoz nincs jogosultságod.';
  if (status === 409) return 'A draft megváltozott vagy lezárták. Frissítsd a verziólistát.';
  if (status === 404 || code === 'PGRST202') return 'A szükséges felhőfüggvény nincs telepítve ebben a projektben.';
  if (status === 429) return 'Túl sok kérés. Próbáld újra később.';
  return `Felhőhiba (${status}${code ? `, ${code}` : ''}).`;
}
export async function cloudRequest(path: string, body: unknown, signedIn = false, timeout = 20000): Promise<unknown> {
  const env = readCloudEnv();
  if (!env) throw new Error('Nincs érvényes felhőkonfiguráció.');
  const token = await sessionToken(signedIn);
  const headers: Record<string,string> = { apikey: env.anonKey, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (!env.anonKey.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${env.anonKey}`;
  let res: Response;
  try {
    res = await fetch(`${env.url}/${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    throw new CloudHttpError(0, e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
      ? 'Időtúllépés. Feltöltésnél az eredmény bizonytalan: ugyanazzal a kérésazonosítóval próbáld újra.'
      : 'Hálózati vagy CORS-hiba. Ellenőrizd az OPTIONS kérést és a kapcsolatot.');
  }
  const parsed = await res.json().catch(() => null);
  if (!res.ok) {
    const code = typeof parsed?.code === 'string' ? parsed.code : '';
    const detail = typeof parsed?.error === 'string' ? parsed.error : errorMessage(res.status,code);
    throw new CloudHttpError(res.status,detail,code,parsed?.traceId);
  }
  if (res.status !== 200 || parsed === null) throw new Error('Váratlan vagy részleges szerverválasz.');
  return parsed;
}
const rpc = (name: string, args: unknown = {}) => cloudRequest(`rest/v1/rpc/${name}`,args);
const Access = z.object({ contract: z.literal(2), canWrite: z.boolean() });
export async function cloudAccess() { return Access.parse(await rpc('winmix_cloud_access')); }
export async function probeCloudTier(): Promise<CloudTierHealth> {
  if (!isCloudTierConfigured()) return { ...idleHealth(), checkedAt: new Date().toISOString() };
  try { await cloudAccess(); await fetchCloudVersions(); return { status:'online',degraded:false,lastError:null,checkedAt:new Date().toISOString() }; }
  catch(e) { return {status:'degraded',degraded:true,lastError:e instanceof Error ? e.message : String(e),checkedAt:new Date().toISOString()}; }
}
const Version = z.object({ id:z.string().uuid(),versionKey:z.string(),status:z.enum(['draft','sealed','superseded','rejected']),
  isCurrent:z.boolean(),revision:z.number().int().nonnegative(),fingerprint:z.string().nullable(),seasonCount:z.number().int().nonnegative(),matchCount:z.number().int().nonnegative() });
export type CloudVersion = z.infer<typeof Version>;
export async function fetchCloudVersions() { return z.array(Version).parse(await rpc('winmix_cloud_versions')); }
async function resolveVersion(id?: string) {
  if (id) return id;
  const current = (await fetchCloudVersions()).find(v=>v.isCurrent && v.status==='sealed');
  return current?.id ?? null;
}
const Meta = z.object({ id:z.string().uuid(),dataVersionId:z.string().uuid(),revision:z.number().int().nonnegative(),
  league:z.enum(['angol','spanyol']),seasonIndex:z.number().int().nonnegative(),sourceSeasonKey:z.string(),name:z.string(),fileName:z.string(),
  contentHash:z.string().nullable(),matchCount:z.number().int().nonnegative(),orderMode:z.enum(['chronological','source-order']),createdAt:z.string() });
export type CloudSeasonMeta = z.infer<typeof Meta>;
export async function fetchCloudSeasonList(league?: League, versionId?: string): Promise<CloudSeasonMeta[]> {
  const version = await resolveVersion(versionId); if (!version) return [];
  return z.array(Meta).parse(await rpc('winmix_cloud_seasons',{ p_version:version,p_league:league??null }));
}
const Match = z.object({ match_no:z.number().int().positive(),date:z.string().nullable(),kickoffIso:z.string().nullable(),
  rowIndex:z.number().int().nullable(),sourceFileId:z.string().nullable(),home_team:z.string().min(1),away_team:z.string().min(1),
  ht_home_score:z.number().int().nonnegative().nullable(),ht_away_score:z.number().int().nonnegative().nullable(),home_score:z.number().int().min(0).max(20),away_score:z.number().int().min(0).max(20) });
export interface CloudSeasonDownload { meta:CloudSeasonMeta; csvText:string; matches:MatchInput[] }
/** RFC 4180 quoting, including commas, quotes and embedded newlines. */
export const csvCell = (v: unknown): string => { const s=v==null?'':String(v); return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
export async function fetchCloudSeasonData(meta:CloudSeasonMeta):Promise<CloudSeasonDownload> {
  const data=z.object({meta:z.object({id:z.string().uuid(),matchCount:z.number().int(),contentHash:z.string().nullable()}),
    matches:z.array(Match),revision:z.number().int(),dataVersionId:z.string().uuid()}).parse(await rpc('winmix_cloud_season',{
      p_season:meta.id,p_version:meta.dataVersionId,p_revision:meta.revision }));
  if(data.meta.id!==meta.id || data.dataVersionId!==meta.dataVersionId || data.revision!==meta.revision || data.meta.contentHash!==meta.contentHash || data.matches.length!==meta.matchCount) throw new Error('A felhőadat megváltozott; töltsd újra a szezonlistát.');
  if(new Set(data.matches.map(m=>m.match_no)).size!==meta.matchCount) throw new Error('Ismétlődő mérkőzéssorszám a válaszban.');
  const matches=data.matches.map(m=>({...m,date:m.date??'',rowIndex:m.rowIndex??undefined}));
  const header='date,home_team,away_team,ht_home_score,ht_away_score,home_score,away_score';
  return {meta,matches,csvText:[header,...matches.map(m=>[m.date,m.home_team,m.away_team,m.ht_home_score,m.ht_away_score,m.home_score,m.away_score].map(csvCell).join(','))].join('\r\n')};
}
const Rating=z.object({canonicalKey:z.string().min(1),displayName:z.string(),totalPlayed:z.number().int().nonnegative(),
  netHome:z.number().finite(),netAway:z.number().finite(),ppg:z.number().finite(),autoWeightIndex:z.number().min(0).max(10)});
export type CloudTeamRating=z.infer<typeof Rating>;
const RatingSnapshot=z.object({dataVersionId:z.string().uuid(),revision:z.number().int(),league:z.enum(['angol','spanyol']),ratings:z.array(Rating),
  basis:z.array(z.tuple([z.number().int(),z.number().int(),z.string(),z.string(),z.number().int(),z.number().int()]))});
export type CloudRatingSnapshot=z.infer<typeof RatingSnapshot>;
export async function fetchCloudRatingSnapshot(league:League,versionId:string) {
  const data=RatingSnapshot.parse(await rpc('winmix_cloud_ratings',{p_version:versionId,p_league:league}));
  if(data.dataVersionId!==versionId || data.league!==league) throw new Error('Eltérő verzió / liga a szerver válaszában.');
  return data;
}
export async function fetchCloudTeamRatings(league:League):Promise<CloudTeamRating[]> {
  const version=await resolveVersion(); return version?(await fetchCloudRatingSnapshot(league,version)).ratings:[];
}
const Receipt=z.object({success:z.literal(true),dataVersionId:z.string().uuid(),revision:z.number().int().positive(),status:z.literal('draft'),isCurrent:z.literal(false),
  seasons:z.number().int().positive(),teams:z.number().int().positive(),matches:z.number().int().positive(),rejected:z.literal(0),repaired:z.literal(0),
  errors:z.array(z.string()).length(0),manifestErrors:z.array(z.string()).length(0),replayed:z.boolean(),requestId:z.string().uuid()});
export type IngestResult=z.infer<typeof Receipt>;
/** Stable per-user key survives reloads; equal source snapshots return the same receipt. */
export async function prepareIngestRequest(seasons:readonly SeasonInput[]):Promise<IngestInput> {
  const {data,error}=await getSupabase().auth.getSession();
  if(error || !data.session) throw new Error('A feltöltéshez jelentkezz be.');
  const wireSeasons=seasons.map(s=>({league:s.league,seasonIndex:s.seasonIndex,name:s.name,fileName:s.fileName,
    contentHash:s.contentHash,orderMode:s.orderMode,sourceSeasonKey:s.sourceSeasonKey,
    matches:s.matches.map(m=>({match_no:m.match_no,date:m.date,kickoffIso:m.kickoffIso,rowIndex:m.rowIndex,sourceFileId:m.sourceFileId,
      home_team:m.home_team,away_team:m.away_team,ht_home_score:m.ht_home_score,ht_away_score:m.ht_away_score,home_score:m.home_score,away_score:m.away_score}))}));
  const input:IngestInput={requestId:'00000000-0000-4000-8000-000000000001',seasons:wireSeasons,expectedRevision:0,draftLabel:'WinMix import'};
  const normalized=normalizeInput(input);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([data.session.user.id,normalized.payload]))));
  hash[6]=(hash[6]&15)|128; hash[8]=(hash[8]&63)|128;
  const hex=[...hash.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('');
  input.requestId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return input;
}
/** Caller must retain the SAME input/requestId when the response is lost. No auto-retry. */
export async function ingestSeasonsToCloud(params:IngestInput):Promise<IngestResult> {
  normalizeInput(params); // User-visible validation before network access. Server repeats it.
  const data=Receipt.parse(await cloudRequest('functions/v1/winmix-ingest',params,true,65000));
  if(data.requestId!==params.requestId || data.seasons!==params.seasons.length || data.matches!==params.seasons.length*240) throw new Error('Az importnyugta eltér a kéréstől. Ne hozz létre új kérést; ellenőrizd a meglévő azonosítót.');
  return data;
}
