export type League = 'angol' | 'spanyol';
export interface MatchInput {
  match_no: number; date: string; kickoffIso?: string | null; rowIndex?: number;
  sourceFileId?: string | null; home_team: string; away_team: string;
  ht_home_score: number | null; ht_away_score: number | null; home_score: number; away_score: number;
}
export interface SeasonInput {
  id?: string; league: League; seasonIndex: number; name: string; fileName: string;
  createdAt?: string; contentHash: string | null; orderMode?: string;
  sourceSeasonKey?: string | null; matches: MatchInput[];
}
export interface IngestInput {
  requestId: string; dataVersionId?: string | null; expectedRevision?: number;
  draftLabel?: string | null; seasons: SeasonInput[];
}
export class InputError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const canon = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new InputError('Objektum szükséges.');
  return v as Record<string, unknown>;
}
function str(v: unknown, max = 200, empty = false): string {
  if (typeof v !== 'string' || (!empty && !v.trim()) || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new InputError('Érvénytelen szöveges mező.');
  return v;
}
function integer(v: unknown, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new InputError('Érvénytelen egész szám.');
  return v;
}
function id(v: unknown): string { if (typeof v !== 'string' || !uuid.test(v)) throw new InputError('Érvénytelen UUID.'); return v; }
function optionalText(v: unknown, max = 200) { return v == null ? null : str(v, max, true); }

/** Entire request is validated before RPC. Scores are never silently repaired or discarded. */
export function normalizeInput(value: unknown) {
  const p = object(value);
  if (p.teamWeights !== undefined || p.teamAliasMap !== undefined) throw new InputError('A súlyok és aliasok külön, verziózott paraméterfolyamathoz tartoznak.');
  const requestId = id(p.requestId);
  const dataVersionId = p.dataVersionId == null ? null : id(p.dataVersionId);
  const expectedRevision = integer(p.expectedRevision ?? (dataVersionId ? undefined : 0), 0, 2147483646);
  if (!Array.isArray(p.seasons) || p.seasons.length < 1 || p.seasons.length > 200) throw new InputError('1–200 teljes szezon szükséges.');
  const seasonKeys = new Set<string>();
  const indexes = new Set<string>();
  const names = new Map<string, string>();
  const seasons = p.seasons.map((value) => {
    const s = object(value);
    if (s.league !== 'angol' && s.league !== 'spanyol') throw new InputError('Ismeretlen liga.');
    const league = s.league;
    const seasonIndex = integer(s.seasonIndex, 0, 2147483646);
    const sourceKey = str(s.sourceSeasonKey ?? `${league}_${seasonIndex}`);
    if (seasonKeys.has(`${league}:${sourceKey}`) || indexes.has(`${league}:${seasonIndex}`)) throw new InputError('Ismétlődő szezonkulcs / sorszám.');
    seasonKeys.add(`${league}:${sourceKey}`); indexes.add(`${league}:${seasonIndex}`);
    const orderMode = s.orderMode ?? 'chronological';
    if (!['chronological', 'source-order'].includes(String(orderMode))) throw new InputError('Ismeretlen sorrendmód.');
    if (!Array.isArray(s.matches) || s.matches.length !== 240) throw new InputError('Minden szezonhoz pontosan 240 mérkőzés szükséges.');
    const pairs = new Set<string>(), teams = new Set<string>(), numbers = new Set<number>();
    const matches = s.matches.map((value) => {
      const m = object(value);
      const home = str(m.home_team).trim(), away = str(m.away_team).trim();
      const hk = canon(home), ak = canon(away);
      if (!hk || !ak || hk === ak) throw new InputError('Érvénytelen csapatpár.');
      for (const [k, n] of [[hk, home], [ak, away]]) {
        const key = `${league}:${k}`;
        if (names.has(key) && names.get(key) !== n) throw new InputError(`Ütköző csapatnév: ${n}. Egységesítsd a neveket feltöltés előtt.`);
        names.set(key, n); teams.add(k);
      }
      const pair = JSON.stringify([hk, ak]);
      const no = integer(m.match_no, 1, 240);
      if (pairs.has(pair) || numbers.has(no)) throw new InputError('Ismétlődő párosítás / meccssorszám.');
      pairs.add(pair); numbers.add(no);
      const hs = integer(m.home_score, 0, 20), as = integer(m.away_score, 0, 20);
      const hh = m.ht_home_score == null ? null : integer(m.ht_home_score, 0, hs);
      const ha = m.ht_away_score == null ? null : integer(m.ht_away_score, 0, as);
      if ((hh === null) !== (ha === null)) throw new InputError('Mindkét félidei eredmény szükséges, vagy mindkettő legyen üres.');
      const kickoff = optionalText(m.kickoffIso, 40);
      if (kickoff && (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(kickoff) || !Number.isFinite(Date.parse(kickoff)))) throw new InputError('A kickoffIso időzónás ISO dátum legyen.');
      return { match_no: no, date: str(m.date ?? '', 200, true), kickoff_iso: kickoff,
        row_index: m.rowIndex == null ? null : integer(m.rowIndex, 0, 2147483646), source_file_id: optionalText(m.sourceFileId),
        home_key: hk, away_key: ak, home_name: home, away_name: away,
        ht_home_score: hh, ht_away_score: ha, home_score: hs, away_score: as };
    }).sort((a, b) => a.match_no - b.match_no);
    // 16 distinct teams + 240 unique directed non-self pairs is a complete double round robin.
    if (teams.size !== 16 || pairs.size !== 240) throw new InputError('16 csapatos, teljes oda-vissza párosítás szükséges.');
    return { league, season_index: seasonIndex, source_season_key: sourceKey,
      name: str(s.name), file_name: str(s.fileName), source_content_hash: optionalText(s.contentHash),
      order_mode: orderMode as string, matches };
  }).sort((a, b) => a.league.localeCompare(b.league) || a.season_index - b.season_index);
  return { requestId, dataVersionId, expectedRevision, payload: { label: str(p.draftLabel ?? 'WinMix import'), seasons } };
}
