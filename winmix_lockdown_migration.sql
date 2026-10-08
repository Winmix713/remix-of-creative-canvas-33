/*
# WinMix — legacy táblák és canonical táblák biztonsági lezárása

## Overview
Eltávolítja a legacy (aláhúzás nélküli `winmix*`) táblákon az anon/authenticated
policy-ket és táblajogosultságokat, valamint a canonical `winmix_matches` és
`winmix_seasons` táblákon a két széles anon SELECT policy-t, amelyek
megkerülik a verziószűrt olvasási policy-kat. A `winmix_markets` táblán
visszavonja az összes anon/authenticated jogosultságot, majd visszaadja a
SELECT-et, hogy a meglévő `active`-szűrő policy működjön.

## Módosítások

### 1. Legacy táblák (aláhúzás nélküli `winmix*`)
- Összes anon/authenticated policy eltávolítása (DROP POLICY).
- Összes anon/authenticated táblajogosultság visszavonása (REVOKE ALL).
- A service_role és owner jogosultságok érintetlenül maradnak.

### 2. Canonical `winmix_matches` és `winmix_seasons`
- A két széles anon SELECT policy eltávolítása (`Anon select matches`,
  `Anon select seasons`), amelyek `USING (true)` feltétellel megkerülik
  a verziószűrt policy-kat.
- A verziószűrt `winmix_current_version_read` policy-k érintetlenül maradnak.

### 3. `winmix_markets`
- Összes anon/authenticated jogosultság visszavonása (REVOKE ALL).
- SELECT jogosultság visszaadása (GRANT SELECT), hogy a meglévő
  `active`-szűrő SELECT policy működjön.

## Security
- A legacy táblák anon/authenticated API-hozzáférése megszűnik.
- A canonical táblákon a verziószűrt olvasás marad az egyetlen út.
- A service_role teljes hozzáférése változatlan.
- Nincs adatveszteség: nem történik DROP TABLE, DELETE, vagy oszlop-módosítás.

## Important Notes
1. Ez a migration csak akkor futtatható, ha az alkalmazás már nem használja
   a legacy `winmix*` táblákat — a kódaudit megerősíti, hogy ez a helyzet.
2. Idempotent: minden DROP POLICY IF EXISTS és REVOKE biztonságosan újrafuttatható.
3. A futtatás után az adatbázis-állapotot újra ellenőrizni kell.
*/

-- ============================================================
-- 1. Legacy táblák: anon/authenticated policy-k és grantek eltávolítása
-- ============================================================

DO $migration$
DECLARE
  tbl record;
  pol record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname LIKE 'winmix%'
      AND left(c.relname, 7) <> 'winmix_'
  LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl.table_name
        AND (
          'anon' = ANY (roles)
          OR 'authenticated' = ANY (roles)
        )
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        pol.policyname,
        tbl.table_name
      );
    END LOOP;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      tbl.table_name
    );
  END LOOP;
END
$migration$;

-- ============================================================
-- 2. Canonical táblák: széles anon policy-k eltávolítása
-- ============================================================

DROP POLICY IF EXISTS "Anon select matches" ON public.winmix_matches;
DROP POLICY IF EXISTS "Anon select seasons" ON public.winmix_seasons;

-- ============================================================
-- 3. winmix_markets: felesleges írási jogosultságok visszavonása
-- ============================================================

REVOKE ALL PRIVILEGES ON TABLE public.winmix_markets
  FROM anon, authenticated;

GRANT SELECT ON TABLE public.winmix_markets
  TO anon, authenticated;

-- PostgREST séma-cache frissítése
NOTIFY pgrst, 'reload schema';
