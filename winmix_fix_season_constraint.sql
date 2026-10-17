-- ============================================================================
-- WinMix — Supabase Szezonkulcs és Egyediségi Kényszer Javítás (Végleges)
-- ============================================================================
-- Miért szükséges?
-- A korábbi táblasémákban globális (data_version_id nélküli) egyediségi kényszerek
-- léteztek a winmix_seasons táblán:
--   1. "winmix_seasons_league_season_index_key" UNIQUE(league, season_index)
--   2. "winmix_ingest_season_identity_uq" UNIQUE(league, season_index)
--   3. "winmix_teams_canonical_key_key" UNIQUE(canonical_key)
-- Amikor egy új piszkozat (draft) feltöltése történik season_index = 1 értékkel,
-- a PostgreSQL unique_violation (23505) hibát dob, mivel a lezárt/korábbi verzióban
-- már szerepel az 1-es index. A winmix_ingest_v2 kivételkezelője ezt PT422-re alakítja.
--
-- Ez a script:
--   1. Törli a globális, verziózatlan kényszereket és indexeket.
--   2. Törli a régi winmix_ingest_season_v1 függvényt.
--   3. Biztosítja a helyes, verziózott (data_version_id alapú) egyedi indexeket.
--   4. Frissíti a winmix_ingest_v2 kivételkezelőjét GET STACKED DIAGNOSTICS-szal,
--      hogy bármilyen adatbázis-szabálysértés esetén a pontos CONSTRAINT név és
--      hibaüzenet megjelenjen a böngészőben!
-- ============================================================================

BEGIN;

-- 1. Globális kényszerek törlése a winmix_seasons tábláról
ALTER TABLE IF EXISTS public.winmix_seasons DROP CONSTRAINT IF EXISTS winmix_ingest_season_identity_uq;
ALTER TABLE IF EXISTS public.winmix_seasons DROP CONSTRAINT IF EXISTS winmix_seasons_league_season_index_key;
ALTER TABLE IF EXISTS public.winmix_seasons DROP CONSTRAINT IF EXISTS winmix_seasons_source_season_key_key;

-- Globális kényszer törlése a csapatokról (liga-független kulcs ütközések ellen)
ALTER TABLE IF EXISTS public.winmix_teams DROP CONSTRAINT IF EXISTS winmix_teams_canonical_key_key;

-- Felesleges/ütköző egyedi indexek törlése, ha léteznek
DROP INDEX IF EXISTS public.winmix_ingest_season_identity_uq;
DROP INDEX IF EXISTS public.winmix_seasons_league_season_index_key;

-- 2. Régi legacy ingest függvény törlése
DROP FUNCTION IF EXISTS public.winmix_ingest_season_v1(text, integer, text, text, jsonb);

-- 3. Verziózott egyedi indexek létrehozása (idempotens)
CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_team_identity_uq
  ON public.winmix_teams(league, canonical_key);

CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_season_source_uq
  ON public.winmix_seasons(data_version_id, league, source_season_key);

CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_season_index_uq
  ON public.winmix_seasons(data_version_id, league, season_index);

CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_match_no_uq
  ON public.winmix_matches(data_version_id, season_id, match_no);

-- 4. winmix_ingest_v2 frissítése részletes diagnosztikai kivételkezeléssel
CREATE OR REPLACE FUNCTION public.winmix_ingest_v2(
  p_request_id uuid,
  p_actor_id uuid,
  p_version_id uuid,
  p_expected_revision integer,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
SET statement_timeout = '50s'
AS $$
DECLARE
  v_hash text;
  v_prior public.winmix_ingest_receipts%rowtype;
  v_version public.winmix_data_versions%rowtype;
  v_id uuid;
  v_sid uuid;
  v_home uuid;
  v_away uuid;
  s jsonb;
  m jsonb;
  v_seasons integer;
  v_matches integer;
  v_teams integer;
  v_receipt jsonb;
  -- Diagnosztikai változók részletes hibaüzenethez:
  v_diag_msg text;
  v_diag_constraint text;
  v_diag_detail text;
BEGIN
  -- Jogosultság ellenőrzése: service_role vagy aktív operátor
  IF coalesce(auth.role(),'') = 'service_role' THEN
    IF p_actor_id IS NOT NULL THEN
      PERFORM 1 FROM public.winmix_cloud_operators WHERE user_id = p_actor_id AND enabled FOR SHARE;
      IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Active operator required'; END IF;
    END IF;
  ELSIF coalesce(auth.role(),'') = 'authenticated' THEN
    IF p_actor_id IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id THEN
      RAISE SQLSTATE 'PT403' USING MESSAGE = 'Operator identity mismatch';
    END IF;
    PERFORM 1 FROM public.winmix_cloud_operators WHERE user_id = p_actor_id AND enabled FOR SHARE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Active operator required'; END IF;
  ELSE
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'Active operator required';
  END IF;

  -- Kérés alaki validációja
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_payload->'seasons') IS DISTINCT FROM 'array' THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid request payload';
  END IF;

  IF jsonb_array_length(p_payload->'seasons') NOT BETWEEN 1 AND 200
     OR octet_length(p_payload::text) > 12582912 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Payload bounds exceeded (1-200 seasons, max 12MB)';
  END IF;

  v_hash := encode(sha256(convert_to(jsonb_build_object('version', p_version_id, 'revision', p_expected_revision, 'payload', p_payload)::text, 'UTF8')), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  -- Idempotens ismétlés ellenőrzése
  SELECT * INTO v_prior FROM public.winmix_ingest_receipts WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.actor_id IS DISTINCT FROM p_actor_id OR v_prior.payload_hash <> v_hash THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'Idempotency key reused with a different request';
    END IF;
    RETURN v_prior.receipt || jsonb_build_object('replayed', true);
  END IF;

  -- Verzió azonosítása vagy új piszkozat létrehozása
  IF p_version_id IS NULL THEN
    IF p_expected_revision <> 0 THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'New version revision must be zero'; END IF;
    INSERT INTO public.winmix_data_versions(version_key, status, is_current, source_description)
    VALUES ('ingest-' || p_request_id, 'draft', false, left(coalesce(p_payload->>'label', 'WinMix import'), 200))
    RETURNING id INTO v_id;
  ELSE
    v_id := p_version_id;
  END IF;

  SELECT * INTO v_version FROM public.winmix_data_versions WHERE id = v_id FOR UPDATE;
  IF NOT FOUND OR v_version.status <> 'draft' OR v_version.is_current OR v_version.ingest_revision <> p_expected_revision THEN
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Draft revision conflict or immutable version';
  END IF;

  -- Korábbi mérkőzések és szezonok törlése a piszkozatból
  DELETE FROM public.winmix_matches WHERE data_version_id = v_id;
  DELETE FROM public.winmix_seasons WHERE data_version_id = v_id;

  -- Szezonok feldolgozása
  FOR s IN SELECT value FROM jsonb_array_elements(p_payload->'seasons') LOOP
    IF s->>'league' NOT IN ('angol', 'spanyol') OR s->>'league' IS NULL
       OR jsonb_typeof(s->'matches') IS DISTINCT FROM 'array' THEN
      RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid season league or matches array';
    END IF;

    IF jsonb_array_length(s->'matches') <> 240
       OR length(coalesce(s->>'source_season_key','')) NOT BETWEEN 1 AND 200
       OR length(coalesce(s->>'name','')) NOT BETWEEN 1 AND 200
       OR length(coalesce(s->>'file_name','')) NOT BETWEEN 1 AND 200
       OR (s->>'season_index')::integer < 0 OR s->>'season_index' IS NULL
       OR coalesce(s->>'order_mode','') NOT IN ('chronological', 'source-order') THEN
      RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid season metadata';
    END IF;

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(s->'matches') x
      WHERE length(coalesce(x->>'home_key','')) NOT BETWEEN 1 AND 200
         OR length(coalesce(x->>'away_key','')) NOT BETWEEN 1 AND 200
         OR length(coalesce(x->>'home_name','')) NOT BETWEEN 1 AND 200
         OR length(coalesce(x->>'away_name','')) NOT BETWEEN 1 AND 200
         OR x->>'home_key' = x->>'away_key'
         OR (x->>'match_no')::integer NOT BETWEEN 1 AND 240 OR x->>'match_no' IS NULL
         OR (x->>'home_score')::integer NOT BETWEEN 0 AND 20 OR x->>'home_score' IS NULL
         OR (x->>'away_score')::integer NOT BETWEEN 0 AND 20 OR x->>'away_score' IS NULL
         OR ((x->>'ht_home_score' IS NULL) <> (x->>'ht_away_score' IS NULL))
         OR (x->>'ht_home_score')::integer NOT BETWEEN 0 AND (x->>'home_score')::integer
         OR (x->>'ht_away_score')::integer NOT BETWEEN 0 AND (x->>'away_score')::integer
    ) THEN
      RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid match in season: ' || coalesce(s->>'name', 'unnamed');
    END IF;

    IF (SELECT count(DISTINCT (x->>'home_key', x->>'away_key')) FROM jsonb_array_elements(s->'matches') x) <> 240
       OR (SELECT count(DISTINCT x->>'match_no') FROM jsonb_array_elements(s->'matches') x) <> 240
       OR (SELECT count(*) FROM (
            SELECT x->>'home_key' FROM jsonb_array_elements(s->'matches') x
            UNION
            SELECT x->>'away_key' FROM jsonb_array_elements(s->'matches') x
          ) t) <> 16 THEN
      RAISE SQLSTATE 'PT422' USING MESSAGE = 'Incomplete round robin in season: ' || coalesce(s->>'name', 'unnamed');
    END IF;

    INSERT INTO public.winmix_seasons(data_version_id, league, season_index, source_season_key, name, file_name, content_hash, match_count, order_mode)
    VALUES (
      v_id,
      s->>'league',
      (s->>'season_index')::integer,
      s->>'source_season_key',
      s->>'name',
      s->>'file_name',
      encode(sha256(convert_to((s->'matches')::text, 'UTF8')), 'hex'),
      240,
      s->>'order_mode'
    ) RETURNING id INTO v_sid;

    -- Csapatok felvétele
    INSERT INTO public.winmix_teams(league, canonical_key, display_name)
    SELECT s->>'league', key, min(name) FROM (
      SELECT x->>'home_key' AS key, x->>'home_name' AS name FROM jsonb_array_elements(s->'matches') x
      UNION ALL
      SELECT x->>'away_key', x->>'away_name' FROM jsonb_array_elements(s->'matches') x
    ) n GROUP BY key
    ON CONFLICT (league, canonical_key) DO NOTHING;

    -- Mérkőzések beszúrása
    FOR m IN SELECT value FROM jsonb_array_elements(s->'matches') LOOP
      SELECT id INTO STRICT v_home FROM public.winmix_teams WHERE league = s->>'league' AND canonical_key = m->>'home_key';
      SELECT id INTO STRICT v_away FROM public.winmix_teams WHERE league = s->>'league' AND canonical_key = m->>'away_key';

      INSERT INTO public.winmix_matches(
        data_version_id, season_id, league, match_no, match_date_raw, kickoff_iso, row_index, source_file_id,
        home_team_id, away_team_id, home_name_snapshot, away_name_snapshot,
        ht_home_score, ht_away_score, home_score, away_score
      ) VALUES (
        v_id,
        v_sid,
        s->>'league',
        (m->>'match_no')::integer,
        m->>'date',
        nullif(m->>'kickoff_iso', '')::timestamptz,
        nullif(m->>'row_index', '')::integer,
        CASE
          WHEN m->>'source_file_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (m->>'source_file_id')::uuid
          ELSE NULL
        END,
        v_home,
        v_away,
        m->>'home_name',
        m->>'away_name',
        nullif(m->>'ht_home_score', '')::integer,
        nullif(m->>'ht_away_score', '')::integer,
        (m->>'home_score')::integer,
        (m->>'away_score')::integer
      );
    END LOOP;
  END LOOP;

  SELECT count(*), coalesce(sum(match_count), 0) INTO v_seasons, v_matches FROM public.winmix_seasons WHERE data_version_id = v_id;
  SELECT count(*) INTO v_teams FROM (
    SELECT home_team_id FROM public.winmix_matches WHERE data_version_id = v_id
    UNION
    SELECT away_team_id FROM public.winmix_matches WHERE data_version_id = v_id
  ) t;

  UPDATE public.winmix_data_versions SET
    season_count = v_seasons,
    match_count = v_matches,
    ingest_revision = ingest_revision + 1,
    updated_at = now(),
    content_fingerprint = (
      SELECT encode(sha256(convert_to(coalesce(string_agg(concat_ws('|', s.league, s.season_index, m.match_no, m.kickoff_iso,
        m.home_team_id, m.away_team_id, m.ht_home_score, m.ht_away_score, m.home_score, m.away_score),
        E'\n' ORDER BY s.league, s.season_index, m.match_no), ''), 'UTF8')), 'hex')
      FROM public.winmix_seasons s JOIN public.winmix_matches m ON m.season_id = s.id WHERE s.data_version_id = v_id
    ),
    league_coverage = (
      SELECT jsonb_object_agg(league, jsonb_build_object('seasons', n, 'matches', c)) FROM (
        SELECT league, count(*) n, sum(match_count) c FROM public.winmix_seasons WHERE data_version_id = v_id GROUP BY league
      ) q
    )
  WHERE id = v_id;

  v_receipt := jsonb_build_object(
    'success', true,
    'dataVersionId', v_id,
    'revision', p_expected_revision + 1,
    'status', 'draft',
    'isCurrent', false,
    'seasons', v_seasons,
    'teams', v_teams,
    'matches', v_matches,
    'rejected', 0,
    'repaired', 0,
    'errors', '[]'::jsonb,
    'manifestErrors', '[]'::jsonb,
    'replayed', false
  );

  INSERT INTO public.winmix_ingest_receipts(request_id, actor_id, payload_hash, data_version_id, receipt)
  VALUES (p_request_id, p_actor_id, v_hash, v_id, v_receipt);

  RETURN v_receipt;

EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation
       OR invalid_datetime_format OR datetime_field_overflow OR unique_violation THEN
    GET STACKED DIAGNOSTICS
      v_diag_msg = MESSAGE_TEXT,
      v_diag_constraint = CONSTRAINT_NAME,
      v_diag_detail = PG_EXCEPTION_DETAIL;
    RAISE SQLSTATE 'PT422' USING MESSAGE =
      'Adatbázis-kényszer megsértése: ' || coalesce(v_diag_msg, 'Ismeretlen hiba') ||
      coalesce(' [Kényszer/Constraint: ' || nullif(v_diag_constraint, '') || ']', '') ||
      coalesce(' (Részlet: ' || nullif(v_diag_detail, '') || ')', '');
END $$;

REVOKE ALL ON FUNCTION public.winmix_ingest_v2(uuid,uuid,uuid,integer,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.winmix_ingest_v2(uuid,uuid,uuid,integer,jsonb) TO authenticated, service_role;

COMMIT;
