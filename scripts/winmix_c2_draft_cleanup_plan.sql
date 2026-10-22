-- =====================================================================
-- WinMix C2 — draft adatverziók törlési terve, 2. változat (2026-10-20)
-- Projekt: supabase-lime-zebra (dpmyxypqcsugycqhifaf)
--
-- STÁTUSZ: TERVEZET. NEM VÉGREHAJTVA. Jóváhagyás nélkül ne futtasd.
-- Ez a változat a 2026-10-20-i felülvizsgálat után készült; felváltja az
-- elsőt, amelyben a "tartalom nem vész el" állítás túl erős volt.
--
-- MIT ELLENŐRIZTEM (írásvédett lekérdezésekkel):
--  * 4 draft verzió, mind is_current=false, status='draft':
--      v1.0-draft                  2 szezon      480 meccs   (0 receipt)
--      ingest-cab43b22-...         1 szezon      240 meccs   (1 receipt)
--      ingest-47bcd4b5-...        99 szezon   23 760 meccs   (1 receipt)
--      ingest-80111ff9-...        98 szezon   23 520 meccs   (1 receipt)
--    Az éles verzió (ingest-33c2a459-..., sealed, current): 103 szezon,
--    24 720 meccs. NEM része a tervnek.
--
--  * SZIGORÚ TARTALMI ÖSSZEVETÉS (a meccssor MINDEN oszlopa, kivéve id,
--    season_id, data_version_id, created_at, source_file_id): minden draft
--    szezonnak (200/200) van azonos párja az éles verzióban. A match_no,
--    a dátum, a kickoff_iso, a row_index, a csapat-ID-k, a nevek, az
--    eredmények és a származtatott mezők mind egyeznek.
--
--  * A drafttal TÉNYLEGESEN ELVESZŐ információ (nem tartalmi, hanem
--    metaadat/eredet):
--      - source_file_id: az éles verzió meccsein "fájl::méret::időbélyeg"
--        szöveg áll; a winmix_ingest_v2 ezt eldobja (csak UUID-t tart meg),
--        ezért a 3 ingest draftban mind NULL. A v1.0-draft meccsein
--        'user-pasted.csv' / 'user-pasted-spanish.csv' szerepel.
--      - season_index / source_season_key / name: eltér a párjától
--        80+75 (47bcd4b5, 80111ff9), 1 (cab43b22) és 2 (v1.0-draft)
--        szezonnál. A file_name a két nagy draftban azonos, a két kicsinél
--        eltér.
--      - szezon content_hash: mindegyiknél eltér (más a payload).
--      - a receiptek (idempotencia-rekordok).
--    Ezeket a 0c. lépés exportja rögzíti, mielőtt bármi törlődik.
--
--  * Triggerek: draft (nem current) verzió, szezonjai és meccsei
--    törölhetők; sealed/superseded/rejected verzió sorai nem
--    (winmix_guard_cloud_version, winmix_guard_sealed_*). A rejectedre
--    állított verzió ezért utána már nem törölhető: vagy törlés, vagy
--    reject, a kettő nem kombinálható.
--  * FK-k: matches -> seasons -> data_versions (NO ACTION/RESTRICT);
--    sorrend: meccsek, szezonok, receiptek, verzió. A motor- és
--    egyéb hivatkozó táblákban nincs draftokhoz kötött sor. Ez csak azt
--    jelenti, hogy nincs törlést akadályozó függőség; NEM jelenti, hogy
--    ezek a táblák feleslegesek, és a terv egyikhez sem nyúl.
--
-- PÁRHUZAMOSSÁG (a winmix_guard_cloud_rows, a winmix_guard_sealed_source
-- és a winmix_ingest_v2 kódja alapján):
--  * Bármely INSERT/UPDATE/DELETE a seasons/matches táblán a triggerben
--    FOR UPDATE (cloud_rows) ill. FOR SHARE (sealed_source) zárat kér a
--    verzió soráról: ez blokkol, amíg a törlő tranzakció tart, majd
--    PT409-cel hibázik, mert a verzió már nincs meg.
--  * A winmix_ingest_v2 meglévő draftra FOR UPDATE-tel zárol, majd a
--    draft teljes tartalmát TÖRLI és újraírja (csere-szemantika).
--  * Az idempotencia-ellenőrzés (receipt-olvasás) nem zárolja a verziót,
--    ezért egy épp futó, azonos request_id-jú ismétlés elméletileg
--    elavult "replayed" nyugtát kaphat. EZÉRT: a futtatás idejére az
--    importokat állítsd le, és a blokkok táblazárat is kérnek.
--  * A triggerek csak rendes úton védenek; trigger-kikapcsolással vagy
--    session_replication_role-lal megkerülhetők (ilyet itt nem használunk).
--
-- EGYÉB:
--  * Nincs hasznos branch-es próba: a branch éles adat nélkül épül, a main
--    migrációs előzménye hiányos (C4). Ellenőrizd a Dashboardon a backup /
--    PITR elérhetőségét.
--  * Verziónként, külön tranzakcióban futtasd. Időtúllépés esetén lásd a
--    darabolt tartalékot a végén.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. ELŐZETES LÉPÉSEK (írásvédett) — mentsd el a kimeneteket
-- ---------------------------------------------------------------------

-- 0a. Aktivitás-ellenőrzés közvetlenül a futtatás előtt. Várt: 0 sor.
-- (Az importokat előtte állítsd le; a feltöltőfelületet ne használd.)
SELECT pid, state, xact_start, wait_event_type, left(query, 120) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid()
  AND (query ILIKE '%winmix_ingest_v2%' OR query ILIKE '%winmix_matches%'
       OR query ILIKE '%winmix_seasons%' OR state LIKE 'idle in transaction%');

-- 0b. A receiptek (törlés előtt mentsd el)
SELECT r.request_id, dv.version_key, dv.status, r.actor_id, r.payload_hash, r.created_at, r.receipt
FROM public.winmix_ingest_receipts r
JOIN public.winmix_data_versions dv ON dv.id = r.data_version_id
WHERE dv.status = 'draft' AND NOT dv.is_current
ORDER BY r.created_at;

-- 0c. Export: a draftokkal elvesző szezon-metaadatok és eredetjelzések, a
-- párjukkal együtt (CSV-ként mentsd el a Dashboardról).
WITH agg AS (
  SELECT s.id AS season_id, s.league, s.season_index, s.source_season_key, s.name, s.file_name,
         s.content_hash, s.order_mode, dv.version_key, dv.is_current, dv.created_at AS version_created,
         (SELECT string_agg(DISTINCT x.source_file_id, ', ') FROM public.winmix_matches x WHERE x.season_id = s.id) AS source_file_ids,
         md5(string_agg((to_jsonb(m) - 'id' - 'season_id' - 'data_version_id' - 'created_at' - 'source_file_id')::text,
                        ';' ORDER BY m.match_no)) AS h
  FROM public.winmix_seasons s
  JOIN public.winmix_data_versions dv ON dv.id = s.data_version_id
  JOIN public.winmix_matches m ON m.season_id = s.id
  GROUP BY s.id, s.league, s.season_index, s.source_season_key, s.name, s.file_name, s.content_hash,
           s.order_mode, dv.version_key, dv.is_current, dv.created_at
)
SELECT d.version_key AS draft_version, d.league,
       d.season_index AS draft_season_index, d.source_season_key AS draft_key, d.name AS draft_name,
       d.file_name AS draft_file, d.content_hash AS draft_content_hash, d.source_file_ids AS draft_source_file_ids,
       c.season_index AS current_season_index, c.source_season_key AS current_key,
       c.name AS current_name, c.file_name AS current_file, c.source_file_ids AS current_source_file_ids
FROM agg d
LEFT JOIN agg c ON c.is_current AND c.league = d.league AND c.h = d.h
WHERE NOT d.is_current
ORDER BY d.version_created, d.league, d.season_index;

-- 0d. SZIGORÚ TARTALMI KAPU: kivételt dob (és semmit nem módosít), ha
-- bármelyik draft szezonnak nincs azonos párja az éles verzióban a meccssor
-- minden oszlopa (a fent felsorolt kivételekkel) alapján, vagy ha bármely
-- draft szezon nem pontosan 240 meccses.
DO $$
DECLARE v_missing int; v_bad int;
BEGIN
  WITH agg AS (
    SELECT s.id AS season_id, s.league, dv.is_current, dv.status, count(*) AS n,
      md5(string_agg((to_jsonb(m) - 'id' - 'season_id' - 'data_version_id' - 'created_at' - 'source_file_id')::text,
                     ';' ORDER BY m.match_no)) AS h
    FROM public.winmix_seasons s
    JOIN public.winmix_data_versions dv ON dv.id = s.data_version_id
    JOIN public.winmix_matches m ON m.season_id = s.id
    GROUP BY s.id, s.league, dv.is_current, dv.status
  )
  SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM agg c WHERE c.is_current AND c.league = d.league AND c.h = d.h)),
         count(*) FILTER (WHERE d.n <> 240)
  INTO v_missing, v_bad
  FROM agg d WHERE d.status = 'draft' AND NOT d.is_current;
  IF v_missing > 0 OR v_bad > 0 THEN
    RAISE EXCEPTION 'Megállj: % draft szezonnak nincs azonos párja az éles verzióban, % nem 240 meccses.', v_missing, v_bad;
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 1. TÖRLÉS — verziónként külön futtatva, ebben a sorrendben.
--    Minden blokk: 10 s-os zárkérési határ (ha import fut, hibával leáll
--    és semmi nem változik), táblazár a seasons/matches/receipts írásra,
--    verziózár, állapot- és darabszám-ellenőrzés, törlés, majd annak
--    ellenőrzése, hogy az éles verzió (sorok és ujjlenyomat) érintetlen.
--    Egy hiba az egész blokkot visszagörgeti. A FK-k a végső védőháló.
-- ---------------------------------------------------------------------

-- 1a. v1.0-draft  (2 szezon, 480 meccs, 0 receipt)
--     Megfontolandó: itt vannak a 'user-pasted*' eredetjelzések; döntsd el
--     a 0c export átnézése után, hogy törlöd-e.
DO $$
DECLARE
  v_key       constant text := 'v1.0-draft';
  v_matches   constant int  := 480;
  v_seasons   constant int  := 2;
  v_id uuid; v_status text; v_current boolean; v_n int;
  v_fp_before text; v_cnt_before int;
BEGIN
  PERFORM set_config('lock_timeout', '10s', true);
  LOCK TABLE public.winmix_seasons, public.winmix_matches, public.winmix_ingest_receipts
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, status, is_current INTO v_id, v_status, v_current
  FROM public.winmix_data_versions WHERE version_key = v_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nincs ilyen verzió: %', v_key; END IF;
  IF v_status <> 'draft' OR v_current THEN
    RAISE EXCEPTION 'A(z) % nem törölhető draft (status=%, is_current=%)', v_key, v_status, v_current;
  END IF;
  SELECT count(*) INTO v_n FROM public.winmix_matches WHERE data_version_id = v_id;
  IF v_n <> v_matches THEN RAISE EXCEPTION 'Meccsszám eltér: várt %, valós % (%)', v_matches, v_n, v_key; END IF;
  SELECT count(*) INTO v_n FROM public.winmix_seasons WHERE data_version_id = v_id;
  IF v_n <> v_seasons THEN RAISE EXCEPTION 'Szezonszám eltér: várt %, valós % (%)', v_seasons, v_n, v_key; END IF;

  SELECT content_fingerprint INTO v_fp_before FROM public.winmix_data_versions WHERE is_current AND status = 'sealed';
  SELECT count(*) INTO v_cnt_before FROM public.winmix_matches m
    JOIN public.winmix_data_versions d ON d.id = m.data_version_id WHERE d.is_current AND d.status = 'sealed';

  DELETE FROM public.winmix_matches         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_seasons         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_ingest_receipts WHERE data_version_id = v_id;
  DELETE FROM public.winmix_data_versions   WHERE id = v_id;

  IF (SELECT content_fingerprint FROM public.winmix_data_versions WHERE is_current AND status = 'sealed') IS DISTINCT FROM v_fp_before
     OR (SELECT count(*) FROM public.winmix_matches m JOIN public.winmix_data_versions d ON d.id = m.data_version_id
         WHERE d.is_current AND d.status = 'sealed') <> v_cnt_before THEN
    RAISE EXCEPTION 'Az éles verzió megváltozott, visszagörgetés.';
  END IF;
END $$;

-- 1b. ingest-cab43b22-...  (1 szezon, 240 meccs, 1 receipt)
DO $$
DECLARE
  v_key       constant text := 'ingest-cab43b22-9616-88de-b9af-bc27fb01c16b';
  v_matches   constant int  := 240;
  v_seasons   constant int  := 1;
  v_id uuid; v_status text; v_current boolean; v_n int;
  v_fp_before text; v_cnt_before int;
BEGIN
  PERFORM set_config('lock_timeout', '10s', true);
  LOCK TABLE public.winmix_seasons, public.winmix_matches, public.winmix_ingest_receipts
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, status, is_current INTO v_id, v_status, v_current
  FROM public.winmix_data_versions WHERE version_key = v_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nincs ilyen verzió: %', v_key; END IF;
  IF v_status <> 'draft' OR v_current THEN
    RAISE EXCEPTION 'A(z) % nem törölhető draft (status=%, is_current=%)', v_key, v_status, v_current;
  END IF;
  SELECT count(*) INTO v_n FROM public.winmix_matches WHERE data_version_id = v_id;
  IF v_n <> v_matches THEN RAISE EXCEPTION 'Meccsszám eltér: várt %, valós % (%)', v_matches, v_n, v_key; END IF;
  SELECT count(*) INTO v_n FROM public.winmix_seasons WHERE data_version_id = v_id;
  IF v_n <> v_seasons THEN RAISE EXCEPTION 'Szezonszám eltér: várt %, valós % (%)', v_seasons, v_n, v_key; END IF;

  SELECT content_fingerprint INTO v_fp_before FROM public.winmix_data_versions WHERE is_current AND status = 'sealed';
  SELECT count(*) INTO v_cnt_before FROM public.winmix_matches m
    JOIN public.winmix_data_versions d ON d.id = m.data_version_id WHERE d.is_current AND d.status = 'sealed';

  DELETE FROM public.winmix_matches         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_seasons         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_ingest_receipts WHERE data_version_id = v_id;
  DELETE FROM public.winmix_data_versions   WHERE id = v_id;

  IF (SELECT content_fingerprint FROM public.winmix_data_versions WHERE is_current AND status = 'sealed') IS DISTINCT FROM v_fp_before
     OR (SELECT count(*) FROM public.winmix_matches m JOIN public.winmix_data_versions d ON d.id = m.data_version_id
         WHERE d.is_current AND d.status = 'sealed') <> v_cnt_before THEN
    RAISE EXCEPTION 'Az éles verzió megváltozott, visszagörgetés.';
  END IF;
END $$;

-- 1c. ingest-47bcd4b5-...  (99 szezon, 23 760 meccs, 1 receipt) — nagy
DO $$
DECLARE
  v_key       constant text := 'ingest-47bcd4b5-bee6-8446-9c12-8a64a9acb611';
  v_matches   constant int  := 23760;
  v_seasons   constant int  := 99;
  v_id uuid; v_status text; v_current boolean; v_n int;
  v_fp_before text; v_cnt_before int;
BEGIN
  PERFORM set_config('lock_timeout', '10s', true);
  LOCK TABLE public.winmix_seasons, public.winmix_matches, public.winmix_ingest_receipts
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, status, is_current INTO v_id, v_status, v_current
  FROM public.winmix_data_versions WHERE version_key = v_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nincs ilyen verzió: %', v_key; END IF;
  IF v_status <> 'draft' OR v_current THEN
    RAISE EXCEPTION 'A(z) % nem törölhető draft (status=%, is_current=%)', v_key, v_status, v_current;
  END IF;
  SELECT count(*) INTO v_n FROM public.winmix_matches WHERE data_version_id = v_id;
  IF v_n <> v_matches THEN RAISE EXCEPTION 'Meccsszám eltér: várt %, valós % (%)', v_matches, v_n, v_key; END IF;
  SELECT count(*) INTO v_n FROM public.winmix_seasons WHERE data_version_id = v_id;
  IF v_n <> v_seasons THEN RAISE EXCEPTION 'Szezonszám eltér: várt %, valós % (%)', v_seasons, v_n, v_key; END IF;

  SELECT content_fingerprint INTO v_fp_before FROM public.winmix_data_versions WHERE is_current AND status = 'sealed';
  SELECT count(*) INTO v_cnt_before FROM public.winmix_matches m
    JOIN public.winmix_data_versions d ON d.id = m.data_version_id WHERE d.is_current AND d.status = 'sealed';

  DELETE FROM public.winmix_matches         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_seasons         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_ingest_receipts WHERE data_version_id = v_id;
  DELETE FROM public.winmix_data_versions   WHERE id = v_id;

  IF (SELECT content_fingerprint FROM public.winmix_data_versions WHERE is_current AND status = 'sealed') IS DISTINCT FROM v_fp_before
     OR (SELECT count(*) FROM public.winmix_matches m JOIN public.winmix_data_versions d ON d.id = m.data_version_id
         WHERE d.is_current AND d.status = 'sealed') <> v_cnt_before THEN
    RAISE EXCEPTION 'Az éles verzió megváltozott, visszagörgetés.';
  END IF;
END $$;

-- 1d. ingest-80111ff9-...  (98 szezon, 23 520 meccs, 1 receipt) — nagy
DO $$
DECLARE
  v_key       constant text := 'ingest-80111ff9-05cd-89cb-8175-9ec3aac0e6e8';
  v_matches   constant int  := 23520;
  v_seasons   constant int  := 98;
  v_id uuid; v_status text; v_current boolean; v_n int;
  v_fp_before text; v_cnt_before int;
BEGIN
  PERFORM set_config('lock_timeout', '10s', true);
  LOCK TABLE public.winmix_seasons, public.winmix_matches, public.winmix_ingest_receipts
    IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, status, is_current INTO v_id, v_status, v_current
  FROM public.winmix_data_versions WHERE version_key = v_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nincs ilyen verzió: %', v_key; END IF;
  IF v_status <> 'draft' OR v_current THEN
    RAISE EXCEPTION 'A(z) % nem törölhető draft (status=%, is_current=%)', v_key, v_status, v_current;
  END IF;
  SELECT count(*) INTO v_n FROM public.winmix_matches WHERE data_version_id = v_id;
  IF v_n <> v_matches THEN RAISE EXCEPTION 'Meccsszám eltér: várt %, valós % (%)', v_matches, v_n, v_key; END IF;
  SELECT count(*) INTO v_n FROM public.winmix_seasons WHERE data_version_id = v_id;
  IF v_n <> v_seasons THEN RAISE EXCEPTION 'Szezonszám eltér: várt %, valós % (%)', v_seasons, v_n, v_key; END IF;

  SELECT content_fingerprint INTO v_fp_before FROM public.winmix_data_versions WHERE is_current AND status = 'sealed';
  SELECT count(*) INTO v_cnt_before FROM public.winmix_matches m
    JOIN public.winmix_data_versions d ON d.id = m.data_version_id WHERE d.is_current AND d.status = 'sealed';

  DELETE FROM public.winmix_matches         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_seasons         WHERE data_version_id = v_id;
  DELETE FROM public.winmix_ingest_receipts WHERE data_version_id = v_id;
  DELETE FROM public.winmix_data_versions   WHERE id = v_id;

  IF (SELECT content_fingerprint FROM public.winmix_data_versions WHERE is_current AND status = 'sealed') IS DISTINCT FROM v_fp_before
     OR (SELECT count(*) FROM public.winmix_matches m JOIN public.winmix_data_versions d ON d.id = m.data_version_id
         WHERE d.is_current AND d.status = 'sealed') <> v_cnt_before THEN
    RAISE EXCEPTION 'Az éles verzió megváltozott, visszagörgetés.';
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- 2. UTÓELLENŐRZÉS (írásvédett)
-- ---------------------------------------------------------------------
-- Ha mind a négy verziót töröltük, a várt eredmény: 1 verzió, 103 szezon,
-- 24 720 meccs, 1 receipt (az éles verzióé). Részleges törlésnél a
-- megtartott draftok számai maradnak meg.
SELECT
  (SELECT count(*) FROM public.winmix_data_versions)   AS versions,
  (SELECT count(*) FROM public.winmix_seasons)         AS seasons,
  (SELECT count(*) FROM public.winmix_matches)         AS matches,
  (SELECT count(*) FROM public.winmix_ingest_receipts) AS receipts;

-- Tranzakción kívül, a törlés után (a tábla méretét nem csökkenti, de a
-- tervező statisztikáit frissíti és a holt sorokat felszabadítja):
--   VACUUM (ANALYZE) public.winmix_matches;
--   VACUUM (ANALYZE) public.winmix_seasons;


-- ---------------------------------------------------------------------
-- 3. TARTALÉK: darabolt törlés, ha egy blokk időtúllépésbe fut
-- ---------------------------------------------------------------------
-- Csak ugyanazon draft verzióra, többször futtatva, amíg 0 sor törlődik.
-- Részleges állapotot hagyhat két futás között; a végén az 1. szakasz
-- megfelelő blokkját is le kell futtatni úgy, hogy v_matches = 0 és
-- v_seasons a megmaradt szezonok száma.
--
--   DELETE FROM public.winmix_matches
--   WHERE id IN (
--     SELECT m.id FROM public.winmix_matches m
--     JOIN public.winmix_data_versions d ON d.id = m.data_version_id
--     WHERE d.version_key = '<version_key>' AND d.status = 'draft' AND NOT d.is_current
--     LIMIT 5000);
