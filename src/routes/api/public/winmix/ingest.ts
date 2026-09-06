import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

/**
 * Local ingest endpoint for the optional cloud tier.
 *
 * Replaces the never-deployed `winmix-ingest` edge function: it runs in this
 * app's own server runtime, so the browser calls a same-origin URL (no CORS,
 * no "Failed to fetch") and the service-role key never leaves the server.
 */

interface MatchInput {
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
}

interface SeasonInput {
  id: string;
  league: 'angol' | 'spanyol';
  seasonIndex: number;
  name: string;
  fileName: string;
  createdAt: string;
  contentHash: string | null;
  orderMode?: string;
  matches: MatchInput[];
}

interface IngestPayload {
  seasons: SeasonInput[];
  teamWeights?: Record<string, Record<string, number>>;
  teamAliasMap?: Record<string, Record<string, string>>;
}

const MAX_GOALS = 20;

function canon(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function checkScores(
  homeScore: number,
  awayScore: number,
  htHome: number | null | undefined,
  htAway: number | null | undefined,
): { ok: boolean; htHome: number | null; htAway: number | null } {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return { ok: false, htHome: null, htAway: null };
  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) return { ok: false, htHome: null, htAway: null };
  if (homeScore < 0 || awayScore < 0) return { ok: false, htHome: null, htAway: null };
  if (homeScore > MAX_GOALS || awayScore > MAX_GOALS) return { ok: false, htHome: null, htAway: null };

  const hasH = htHome !== null && htHome !== undefined;
  const hasA = htAway !== null && htAway !== undefined;
  if (!hasH || !hasA) return { ok: true, htHome: null, htAway: null };
  const h = htHome as number;
  const a = htAway as number;
  if (!Number.isFinite(h) || !Number.isFinite(a)) return { ok: true, htHome: null, htAway: null };
  if (h < 0 || a < 0 || h > MAX_GOALS || a > MAX_GOALS) return { ok: true, htHome: null, htAway: null };
  if (h > homeScore || a > awayScore) return { ok: true, htHome: null, htAway: null };
  return { ok: true, htHome: h, htAway: a };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const Route = createFileRoute('/api/public/winmix/ingest')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env['SUPABASE_URL'];
        const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
        if (!url || !serviceKey) {
          return json({ error: 'Hiányzó SUPABASE_URL vagy SUPABASE_SERVICE_ROLE_KEY a szerveren.' }, 500);
        }

        let payload: IngestPayload;
        try {
          payload = (await request.json()) as IngestPayload;
        } catch {
          return json({ error: 'Érvénytelen JSON payload' }, 400);
        }

        if (!payload?.seasons || !Array.isArray(payload.seasons) || payload.seasons.length === 0) {
          return json({ error: 'Nincsenek szezonok a payload-ban' }, 400);
        }

        // Opaque `sb_secret_…` keys are not JWTs — send them only as `apikey`.
        const admin = createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            fetch: (input: RequestInfo | URL, init?: RequestInit) => {
              const h = new Headers(init?.headers);
              if (serviceKey.startsWith('sb_') && h.get('Authorization') === `Bearer ${serviceKey}`) {
                h.delete('Authorization');
              }
              h.set('apikey', serviceKey);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const stats = {
          seasons: 0,
          teams: 0,
          matches: 0,
          rejected: 0,
          repaired: 0,
          errors: [] as string[],
        };

        for (const season of payload.seasons) {
          const league = season.league;
          if (league !== 'angol' && league !== 'spanyol') {
            stats.errors.push(`Szezon "${season.name}": ismeretlen liga "${league}"`);
            continue;
          }

          const { data: seasonRow, error: seasonErr } = await admin
            .from('winmix_seasons')
            .upsert(
              {
                league,
                season_index: season.seasonIndex,
                name: season.name,
                file_name: season.fileName,
                content_hash: season.contentHash ?? null,
                match_count: season.matches.length,
                order_mode: season.orderMode === 'source-order' ? 'source-order' : 'chronological',
              },
              { onConflict: 'league,season_index' },
            )
            .select('id')
            .single();

          if (seasonErr || !seasonRow) {
            stats.errors.push(`Szezon "${season.name}": ${seasonErr?.message ?? 'ismeretlen hiba'}`);
            continue;
          }
          const seasonId = seasonRow.id as string;
          stats.seasons++;

          const teamMap = new Map<string, string>();
          for (const m of season.matches) {
            const hKey = canon(m.home_team);
            const aKey = canon(m.away_team);
            if (hKey && !teamMap.has(hKey)) teamMap.set(hKey, m.home_team);
            if (aKey && !teamMap.has(aKey)) teamMap.set(aKey, m.away_team);
          }

          const weights = payload.teamWeights?.[league] ?? {};
          const teamRows = Array.from(teamMap.entries()).map(([canonicalKey, displayName]) => ({
            league,
            canonical_key: canonicalKey,
            display_name: displayName,
            weight_index: typeof weights[canonicalKey] === 'number' ? weights[canonicalKey] : 5.0,
            weight_source: 'auto',
          }));

          if (teamRows.length > 0) {
            const { error: teamErr } = await admin
              .from('winmix_teams')
              .upsert(teamRows, { onConflict: 'league,canonical_key' });
            if (teamErr) {
              stats.errors.push(`Szezon "${season.name}" csapatok: ${teamErr.message}`);
              continue;
            }
            stats.teams += teamRows.length;
          }

          const { data: teamIdRows, error: teamIdErr } = await admin
            .from('winmix_teams')
            .select('id, canonical_key')
            .eq('league', league);

          if (teamIdErr || !teamIdRows) {
            stats.errors.push(`Szezon "${season.name}" csapat-azonosítók: ${teamIdErr?.message ?? 'ismeretlen'}`);
            continue;
          }

          const teamIdMap = new Map<string, string>();
          for (const r of teamIdRows as Array<{ id: string; canonical_key: string }>) {
            teamIdMap.set(r.canonical_key, r.id);
          }

          const matchRows: Record<string, unknown>[] = [];
          let matchNo = 0;
          for (const m of season.matches) {
            matchNo++;
            const homeId = teamIdMap.get(canon(m.home_team));
            const awayId = teamIdMap.get(canon(m.away_team));
            if (!homeId || !awayId) {
              stats.rejected++;
              continue;
            }
            const check = checkScores(m.home_score, m.away_score, m.ht_home_score, m.ht_away_score);
            if (!check.ok) {
              stats.rejected++;
              continue;
            }
            if (check.htHome === null && m.ht_home_score !== null && m.ht_home_score !== undefined) {
              stats.repaired++;
            }
            matchRows.push({
              season_id: seasonId,
              league,
              match_no: matchNo,
              source_file_id: m.sourceFileId ?? null,
              row_index: m.rowIndex ?? null,
              kickoff_iso: m.kickoffIso ?? null,
              match_date_raw: m.date ?? null,
              home_team_id: homeId,
              away_team_id: awayId,
              ht_home_score: check.htHome,
              ht_away_score: check.htAway,
              home_score: m.home_score,
              away_score: m.away_score,
            });
          }

          // Slice the upsert so a long season never exceeds request limits.
          for (let i = 0; i < matchRows.length; i += 240) {
            const chunk = matchRows.slice(i, i + 240);
            const { error: matchErr } = await admin
              .from('winmix_matches')
              .upsert(chunk, { onConflict: 'season_id,match_no' });
            if (matchErr) {
              stats.errors.push(`Szezon "${season.name}" mérkőzések: ${matchErr.message}`);
              break;
            }
            stats.matches += chunk.length;
          }
        }

        return json({ success: stats.errors.length === 0, ...stats }, stats.errors.length === 0 ? 200 : 207);
      },
    },
  },
});
