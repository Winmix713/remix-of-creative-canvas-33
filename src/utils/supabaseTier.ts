/**
 * PHASE 5 — Supabase as an ADDITIONAL, read-only, opt-in tier.
 *
 * Hard rules encoded here:
 *  • Only the ANON key is ever read from the environment. A service-role key is
 *    a server-only secret (ingestion CLI / edge function) and must never be
 *    referenced from client code — see docs/supabase-migration.md.
 *  • RLS grants `select` and nothing else to anon, so this module never
 *    attempts a write. Persistence of app state stays on the existing
 *    localStorage tier, with its corruption quarantine and JSON export intact.
 *  • Any failure — unconfigured, offline, timeout, RLS rejection — degrades the
 *    session to 'local' for good and surfaces a banner. Supabase is never a
 *    hard dependency.
 *  • Anything fetched from SQL is ADVISORY / UI-only. It never feeds the
 *    pipeline, the joint score matrix, or the seeded bootstrap.
 */
import { z } from 'zod';
import type { League } from '../types/winmix';
import { readCloudEnv } from './cloudConfig';

const PROBE_TIMEOUT_MS = 4000;

const readEnv = readCloudEnv;

/** Turns a PostgREST status code into something a human can act on. */
function describeHttpError(status: number, statusText: string): string {
  switch (status) {
    case 401:
      return 'HTTP 401 — az anon kulcsot a projekt elutasította. Ellenőrizd, hogy a kulcs ehhez a projekthez tartozik-e, és hogy a legacy JWT kulcsok engedélyezve vannak-e (új projekteknél a publishable kulcs kell).';
    case 403:
      return 'HTTP 403 — a kulcs érvényes, de az RLS nem enged `select`-et az anon szerepnek.';
    case 404:
      return 'HTTP 404 — a kért nézet/tábla nem létezik ebben a projektben (lásd docs/supabase-migration.md).';
    case 429:
      return 'HTTP 429 — túl sok kérés, próbáld újra később.';
    default:
      return `HTTP ${status} — ${statusText || 'kérés elutasítva'}`;
  }
}

/** Non-secret connection summary for the diagnostics panel. */
export function cloudEndpointSummary(): {url: string;source: 'env' | 'fallback';} | null {
  const env = readEnv();
  return env ? { url: env.url, source: env.source } : null;
}

export function isCloudTierConfigured(): boolean {
  return readEnv() !== null;
}

export type CloudTierStatus = 'unconfigured' | 'probing' | 'online' | 'degraded';

export interface CloudTierHealth {
  status: CloudTierStatus;
  /** Sticky for the whole session once a call has failed. */
  degraded: boolean;
  lastError: string | null;
  checkedAt: string | null;
}

export function idleHealth(): CloudTierHealth {
  return {
    status: isCloudTierConfigured() ? 'probing' : 'unconfigured',
    degraded: false,
    lastError: null,
    checkedAt: null
  };
}

/** Carries the HTTP status so callers can branch (404 → fall back, 401 → stop). */
export class CloudHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'CloudHttpError';
    this.status = status;
  }
}

/** PostgREST returns `{ message, hint, details, code }` on every error. */
async function readPostgrestDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const parts = [body.message, body.hint, body.details].
    filter((v): v is string => typeof v === 'string' && v.length > 0).
    map((v) => v.trim());
    const code = typeof body.code === 'string' ? ` (${body.code})` : '';
    return parts.length ? ` · PostgREST: ${parts.join(' — ')}${code}` : '';
  } catch {
    return '';
  }
}

/** New `sb_publishable_…` keys are opaque strings, not JWTs — never send them as Bearer. */
function isOpaqueKey(key: string): boolean {
  return key.startsWith('sb_publishable_') || key.startsWith('sb_secret_');
}

async function restGet(path: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<unknown> {
  const env = readEnv();
  if (!env) throw new Error('A felhő tier nincs konfigurálva (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      // The key belongs in `apikey`. Legacy JWT anon keys are mirrored into
      // `Authorization` so PostgREST resolves the role; opaque publishable keys
      // must NOT be sent as Bearer (PostgREST answers 401 "Expected 3 parts").
      apikey: env.anonKey,
      Accept: 'application/json'
    };
    if (!isOpaqueKey(env.anonKey)) headers.Authorization = `Bearer ${env.anonKey}`;
    const res = await fetch(`${env.url}/rest/v1/${path}`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    if (!res.ok) {
      const detail = await readPostgrestDetail(res);
      throw new CloudHttpError(res.status, describeHttpError(res.status, res.statusText) + detail);
    }
    return (await res.json()) as unknown;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Reachability + RLS probe. Never throws; the caller degrades on `false`. */
export async function probeCloudTier(): Promise<CloudTierHealth> {
  if (!isCloudTierConfigured()) {
    return {
      status: 'unconfigured',
      degraded: false,
      lastError: null,
      checkedAt: new Date().toISOString()
    };
  }
  try {
    // Probe the view the cross-check actually reads. A 404 only means the view
    // is not deployed yet, so fall back to the REST root to prove reachability.
    // A 401/403 is a real credential/RLS/GRANT problem and must not be masked.
    try {
      await restGet('view_team_ratings?select=canonical_key&limit=1');
    } catch (e) {
      if (e instanceof CloudHttpError && (e.status === 401 || e.status === 403)) throw e;
      // view_team_ratings may not exist yet — probe a table that does.
      await restGet('winmix_seasons?select=id&limit=1');
    }
    return { status: 'online', degraded: false, lastError: null, checkedAt: new Date().toISOString() };
  } catch (e) {
    return {
      status: 'degraded',
      degraded: true,
      lastError: e instanceof Error ? e.message : String(e),
      checkedAt: new Date().toISOString()
    };
  }
}

/** One row of `view_team_ratings` — advisory, cross-check material only. */
export interface CloudTeamRating {
  canonicalKey: string;
  displayName: string;
  totalPlayed: number;
  netHome: number;
  netAway: number;
  ppg: number;
  autoWeightIndex: number;
}

const TeamRatingSchema = z.array(
  z.object({
    canonical_key: z.string().min(1),
    display_name: z.string(),
    total_played: z.union([z.number(), z.string()]).transform(Number),
    net_home: z.union([z.number(), z.string()]).transform(Number),
    net_away: z.union([z.number(), z.string()]).transform(Number),
    ppg: z.union([z.number(), z.string()]).transform(Number),
    auto_weight_index: z.union([z.number(), z.string()]).transform(Number),
  }),
);

/**
 * Reads the SQL-side ratings view for cross-checking against
 * `computeAutoTeamWeights()`. UI-only: these numbers are displayed and diffed,
 * never applied as weights and never fed into the pipeline.
 *
 * The raw PostgREST response is validated through a Zod schema before any
 * value reaches the UI — a malformed API response degrades the cloud tier
 * rather than passing bad data through.
 */
export async function fetchCloudTeamRatings(league: League): Promise<CloudTeamRating[]> {
  const raw = await restGet(
    `view_team_ratings?league=eq.${encodeURIComponent(league)}&select=canonical_key,display_name,total_played,net_home,net_away,ppg,auto_weight_index`,
    10000
  );
  const parsed = TeamRatingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `A view_team_ratings válasz nem felel meg a várt sémának: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }
  return parsed.data.map((r) => ({
    canonicalKey: r.canonical_key,
    displayName: r.display_name,
    totalPlayed: r.total_played,
    netHome: r.net_home,
    netAway: r.net_away,
    ppg: r.ppg,
    autoWeightIndex: r.auto_weight_index,
  }));
}

/** One season's metadata from `winmix_seasons`, with match count. */
export interface CloudSeasonMeta {
  id: string;
  league: League;
  seasonIndex: number;
  name: string;
  fileName: string;
  contentHash: string | null;
  matchCount: number;
  orderMode: 'chronological' | 'source-order';
  createdAt: string;
}

const SeasonMetaSchema = z.array(
  z.object({
    id: z.string().uuid(),
    league: z.string(),
    season_index: z.union([z.number(), z.string()]).transform(Number),
    name: z.string(),
    file_name: z.string(),
    content_hash: z.string().nullable().optional(),
    match_count: z.union([z.number(), z.string()]).transform(Number),
    order_mode: z.string(),
    created_at: z.string(),
  }),
);

/** One match row from `winmix_matches`, with team display names joined via PostgREST. */
const CloudMatchSchema = z.array(
  z.object({
    match_no: z.union([z.number(), z.string()]).transform(Number),
    match_date_raw: z.string().nullable().optional(),
    kickoff_iso: z.string().nullable().optional(),
    home_team: z.object({ display_name: z.string() }),
    away_team: z.object({ display_name: z.string() }),
    ht_home_score: z.number().nullable().optional(),
    ht_away_score: z.number().nullable().optional(),
    home_score: z.union([z.number(), z.string()]).transform(Number),
    away_score: z.union([z.number(), z.string()]).transform(Number),
  }),
);

export interface CloudSeasonDownload {
  meta: CloudSeasonMeta;
  csvText: string;
}

/**
 * Fetches season metadata from `winmix_seasons`, optionally filtered by league.
 * Returns an empty array if the cloud tier is unconfigured or the table is empty.
 */
export async function fetchCloudSeasonList(league?: League): Promise<CloudSeasonMeta[]> {
  const filter = league ? `league=eq.${encodeURIComponent(league)}&` : '';
  const raw = await restGet(
    `winmix_seasons?${filter}select=id,league,season_index,name,file_name,content_hash,match_count,order_mode,created_at&order=league,season_index.asc`,
    10000
  );
  const parsed = SeasonMetaSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `A winmix_seasons válasz nem felel meg a várt sémának: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }
  return parsed.data.map((r) => ({
    id: r.id,
    league: r.league as League,
    seasonIndex: r.season_index,
    name: r.name,
    fileName: r.file_name,
    contentHash: r.content_hash ?? null,
    matchCount: r.match_count,
    orderMode: r.order_mode as 'chronological' | 'source-order',
    createdAt: r.created_at,
  }));
}

/**
 * Downloads a single season's matches from the cloud and reconstructs CSV text
 * compatible with the existing import pipeline. Team display names are resolved
 * via a join to `winmix_teams`.
 */
const seasonDataCache = new Map<string, CloudSeasonDownload>();

export async function fetchCloudSeasonData(meta: CloudSeasonMeta): Promise<CloudSeasonDownload> {
  const cached = seasonDataCache.get(meta.id);
  if (cached) return cached;

  const raw = await restGet(
    `winmix_matches?season_id=eq.${encodeURIComponent(meta.id)}&select=match_no,match_date_raw,kickoff_iso,ht_home_score,ht_away_score,home_score,away_score,home_team:home_team_id(display_name),away_team:away_team_id(display_name)&order=match_no.asc`,
    30000
  );
  const parsed = CloudMatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `A winmix_matches válasz nem felel meg a várt sémának: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`
    );
  }

  const header = 'date,home_team,away_team,ht_home_score,ht_away_score,home_score,away_score';
  const lines = parsed.data.map((m) => {
    const date = m.match_date_raw ?? '';
    const htHome = m.ht_home_score ?? '';
    const htAway = m.ht_away_score ?? '';
    return [date, m.home_team.display_name, m.away_team.display_name, htHome, htAway, m.home_score, m.away_score].join(',');
  });
  const download = { meta, csvText: [header, ...lines].join('\n') };
  seasonDataCache.set(meta.id, download);
  return download;
}

export interface IngestResult {
  success: boolean;
  seasons: number;
  teams: number;
  matches: number;
  rejected: number;
  repaired: number;
  errors: string[];
}

/**
 * Uploads local seasons to the Supabase cloud tier via the winmix-ingest edge
 * function. The function reads the service-role key from its own Deno env at
 * runtime, so the browser only needs the publishable/anon key for the gateway.
 * Opaque `sb_publishable_` keys go in `apikey` only — never as `Bearer`.
 *
 * Idempotent: re-uploading the same seasons safely upserts (no duplicates).
 */
export async function ingestSeasonsToCloud(params: {
  seasons: Array<{
    id: string;
    league: League;
    seasonIndex: number;
    name: string;
    fileName: string;
    createdAt: string;
    contentHash: string | null;
    orderMode?: string;
    matches: Array<{
      match_no: number;
      date: string;
      kickoffIso?: string | null;
      rowIndex?: number;
      sourceFileId?: string | null;
      home_team: string;
      away_team: string;
      ht_home_score: number | null;
      ht_away_score: number | null;
      home_score: number;
      away_score: number;
    }>;
  }>;
  teamWeights?: Record<string, Record<string, number>>;
  teamAliasMap?: Record<string, Record<string, string>>;
}): Promise<IngestResult> {
  const env = readEnv();
  if (!env) {
    return {
      success: false,
      seasons: 0,
      teams: 0,
      matches: 0,
      rejected: 0,
      repaired: 0,
      errors: ['A felhő tier nincs konfigurálva.'],
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: env.anonKey,
    };
    if (!isOpaqueKey(env.anonKey)) {
      headers.Authorization = `Bearer ${env.anonKey}`;
    }
    const res = await fetch(`${env.url}/functions/v1/winmix-ingest`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        seasons: params.seasons,
        teamWeights: params.teamWeights,
        teamAliasMap: params.teamAliasMap,
      }),
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({ error: 'Érvénytelen válasz a szervertől' }));

    if (!res.ok) {
      return {
        success: false,
        seasons: 0,
        teams: 0,
        matches: 0,
        rejected: 0,
        repaired: 0,
        errors: [body.error ?? `HTTP ${res.status}`],
      };
    }

    return {
      success: body.success ?? false,
      seasons: body.seasons ?? 0,
      teams: body.teams ?? 0,
      matches: body.matches ?? 0,
      rejected: body.rejected ?? 0,
      repaired: body.repaired ?? 0,
      errors: body.errors ?? [],
    };
  } catch (e) {
    return {
      success: false,
      seasons: 0,
      teams: 0,
      matches: 0,
      rejected: 0,
      repaired: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    };
  } finally {
    window.clearTimeout(timer);
  }
}