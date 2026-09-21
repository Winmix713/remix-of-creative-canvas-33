# WinMix Studio — projektállapot és működési audit

**Audit dátuma:** 2026-09-21  
**Vizsgált branch:** `v0/winmixstudio-system-assessment-3409e43c`  
**Projekt:** `Adamnoise/remix-of-creative-canvas-33`

## 1. Vezetői összefoglaló

A WinMix Studio jelenlegi állapotában egy működő, kliensoldali, offline-first futball-előrejelzési stúdió. A frontend build és az automatikus tesztek rendben lefutnak, a hat fő munkafelület elérhető, az adatimport, a pipeline, a H2H elemzés, a prediktor és a tippnapló funkcionálisan össze van kötve.

A legfontosabb jelenlegi korlát: a Supabase cloud tier nincs ténylegesen elérhető állapotban a futó preview-ban. Emiatt az alkalmazás helyi tárolási módra vált, és a cloud cross-check / ingest réteg nem használható. A Supabase séma és az Edge Function kód a repository-ban elkészített állapotban van, de a vizsgált projekten a REST API válaszai alapján a WinMix táblák és nézet nem igazoltan elérhetők.

**Összállapot: FEJLESZTÉSI / INTEGRÁCIÓS KÉSZÜLTSÉG — nem tekinthető még éles cloud-adatbázisos állapotnak.**

## 2. Ellenőrzött képernyők és funkciók

### 2.1 Taktikai Stúdió & Adatbázis

- Liga választás: Angol / Spanyol.
- CSV / JSON adatimport felület.
- Automatikus vagy kényszerített ligafelismerés.
- Szezonok központi tára, deduplikációs és teljességi ellenőrzési szövegezéssel.
- Ligaállapot KPI-k: szezonok, mérkőzések, pontosság, coverage, B1-hez viszonyított skill.
- Tabella és Poisson-erősség felület.
- JSON adatbázis export/import.
- Távoli mérkőzés-CSV-k betöltése és helyi backtest fallback.
- Ellenőrzött üres állapotban az UI helyesen jelzi, hogy nincs betöltött adat.

### 2.2 Pipeline üzemeltetés

- Csapatsúlyozási index 0–10 között.
- Automatikus súlyjavaslat és kézi megerősítésre épített működés.
- Pipeline-beállítások és kalibrációs állapot.
- Felhő tier és keresztellenőrzés panel.
- Üres adat esetén az alkalmazás helyesen tiltja a súlyalkalmazás/mentés műveleteket.

### 2.3 Pipeline v2 Audit & Telemetria

- L4 értékelési és kalibrációs réteg.
- Brier Score, LogLoss, ECE, Skill vs B1 baseline.
- 100 meccses gördülő ablakok.
- Piacspecifikus kalibrációs panelek.
- Reliability diagram és kimenetel-megoszlás helye.
- Core evidencia-életciklus, core-szintezés és kanonikus populáció tesztstátuszok.
- Üres adat esetén helyes „nincs elég adat” állapot.
- Az élő UI-ban látható egy figyelmeztetés: **Core szintezés: 1 hibás eset**, ezt külön javítási feladatként kell kezelni.

### 2.4 H2H — Egymás elleni mérkőzések

- Kanonizált csapatpárok és irányított Hazai → Vendég nézet.
- Kumulatív szezonokon átívelő H2H gyűjtés.
- H2H összesítő KPI-k és párosválasztó.
- Rangadó-nyilvántartás körönként.
- Üres adat esetén a párosválasztók és futtatás gomb helyesen disabled állapotú.

### 2.5 Forduló Prediktor — Top 3+3

- Top hazai és top vendég jelöltekre épülő prediktori felület.
- A működéshez betöltött és feldolgozott mérkőzésállomány szükséges.
- Adat nélküli állapotban a predikciós kimenetek természetesen nem értékelhetők.

### 2.6 Tipp Napló & Visszacsatolás

- Tippnapló és lezárt eredmények visszacsatolása.
- Piaconkénti jelzett átlag, tényleges beválás, gap és Wilson-intervallum helye.
- A pipeline audit képernyő ezt a visszacsatolást diagnosztikai célra használja.

## 3. Adat- és pipeline-architektúra

### Helyi, működő réteg

- A fő állapot jelenleg a böngésző `localStorage` rétegében él.
- A tárolás séma-verziózott, sérült snapshot esetén quarantine mentéssel.
- A pipeline a betöltött szezonokból újraszámolja a tabellát, team weight-eket, feature-öket, Poisson/M1 ensemble kimeneteket és kalibrációs állapotot.
- A felület offline-first: cloud hiba esetén nem áll le.

### Supabase, elkészült repository-réteg

A migrációk alapján a tervezett cloud schema négy fő táblából és egy nézetből áll:

1. `public.winmix_teams`
   - Kanonikus csapatnév ligánként.
   - `unique (league, canonical_key)`.
   - Automatikus/kézi súlyforrás.

2. `public.winmix_seasons`
   - Szezon metaadatok, fájlnév, content hash, mérkőzésszám, sorrendi mód.
   - `unique (league, season_index)`.

3. `public.winmix_matches`
   - HT/FT eredmények, csapat FK-k, dátum és forrás metaadatok.
   - Generált mezők: `total_goals`, `btts`, `outcome`.
   - HT ≤ FT constraint és `unique (season_id, match_no)`.

4. `public.winmix_pipeline_checkpoints`
   - Liga-szintű pipeline checkpoint, feature schema, prefix/weight signature, kalibráció és fit history.
   - Szerveroldali diagnosztikai archívum.

5. `public.view_team_ratings`
   - SQL-oldali tükör a `computeAutoTeamWeights()` eredményeihez.
   - Hazai/vendég net, PPG és automatikus weight index.

### Supabase biztonsági modell a migrationökben

- Mind a négy tábla RLS-enabled.
- `anon` és `authenticated`: SELECT-only policy.
- Írásra nincs klienspolicy.
- A szerveroldali `service_role` ingest írhat.
- A rating view `security_invoker = true` beállítást használ.
- A böngésző kliens csak publishable/anon kulcsot használhat; service role kulcs nem kerülhet klienskódba.

## 4. Supabase élő ellenőrzés eredménye

A repository-ban lévő diagnosztikai ellenőrzés eredménye:

- Endpoint elérhetőség: **401**.
- `winmix_teams`: **404**.
- `winmix_seasons`: **404**.
- `winmix_matches`: **404**.
- `winmix_pipeline_checkpoints`: **404**.
- `view_team_ratings`: **404**.
- Összesített eredmény: **0 passed / 7 failed**.

A futó alkalmazás ezért ezt jelzi: „A felhő adatbázis nem elérhető — a munkamenet helyi tárolóra váltott.”

### Fontos konfigurációs eltérés

A felhasználó által megadott Supabase URL:

`https://yvwnchyedxkajtwwkkqd.supabase.co`

A futó diagnosztikai környezet más Supabase endpointot használt, és a kliensben még egy korábbi fallback endpoint is szerepel. Emiatt a következőket kell rendezni:

1. A projekt Environment Variables értékei és a repository fallback konfiguráció ugyanarra a Supabase projektre mutassanak.
2. A megfelelő `VITE_SUPABASE_URL` és publishable/anon kulcs legyen együtt beállítva.
3. A WinMix migrációk legyenek azon a projekten alkalmazva.
4. A schema-check és security-audit fusson újra a helyes endpoint ellen.

## 5. Edge Function állapot

A `supabase/functions/winmix-ingest/index.ts` létezik és a cloud ingest alapfolyamatot tartalmazza:

- POST-only endpoint.
- Payload szezonokkal, mérkőzésekkel, team weight és alias adatokkal.
- Szezon upsert.
- Csapat upsert és FK-feloldás.
- Mérkőzés upsert.
- HT/FT score validáció és javíthatatlan sorok elutasítása.
- Idempotens kulcsok a szezonhoz és mérkőzéshez.
- Service-role kulcs csak Edge Function runtime-ban használatos.

A function viszont élő Supabase projekten még nem igazolt, mert az alap REST schema sem volt elérhető.

## 6. Tesztelési eredmény

- Vitest: **10 test file passed, 56 tests passed**.
- Vite production build: **sikeres**.
- Build output: kb. **1.33 MB minified JS**, kb. **387 kB gzip**.
- Vite/Tailwind figyelmeztetések vannak, de build-blocking hiba nincs.
- A böngészős preview betöltődött, a fő navigáció mind a hat képernyője renderelt.
- A cloud-degraded állapot vizuálisan és funkcionálisan kezelt.

## 7. Ismert kockázatok és hiányok

### Magas prioritás

1. **Supabase projekt- és endpoint-eltérés** — jelenleg nincs igazolt élő WinMix schema.
2. **Migrációk futtatásának igazolása hiányzik** — a repository SQL nem bizonyítja, hogy az élő adatbázison végrehajtódott.
3. **Core szintezés tesztben 1 hibás eset** — az audit UI ezt jelzi, a kiválasztási szerződést meg kell vizsgálni.

### Közepes prioritás

1. A production bundle nagy, kb. 1.33 MB minified. Route/screen lazy loading javasolt.
2. A build `@custom-variant` és Vite rolldown/esbuild deprecation warningokat jelez.
3. A cloud tier jelenleg csak olvasási/keresztellenőrzési réteg; a teljes adatállapot továbbra is helyi tárolóban marad.
4. A régebbi dokumentáció több korábbi route-ot és auth rendszert említ, amelyek a jelenlegi TanStack Router/Vite WinMix Studio felülettel nem egyeznek. Ezeket történeti dokumentumként kell kezelni, nem aktuális állapotként.

### Alacsony prioritás

1. A kalibrációs, H2H, prediktor és visszacsatolási panelek adat nélkül üres állapotot mutatnak; ez helyes működés, de teljes adatfixture-rel end-to-end tesztelendő.
2. A Supabase view és a TypeScript `computeAutoTeamWeights()` numerikus egyezését élő adaton még nem sikerült validálni.

## 8. Következő javasolt munkasorrend

1. A `yvwnchyedxkajtwwkkqd` Supabase projekt URL/key párosának egységesítése a projekt Environment Variables-ben és a kliens konfigurációban.
2. A WinMix schema migrációk alkalmazása a megfelelő Supabase projekten.
3. A `schema-check`, `security-audit` és `diagnose` újrafuttatása.
4. Egy kis, reprodukálható angol és spanyol CSV fixture ingestje az Edge Functionön keresztül.
5. Teljes böngészős ellenőrzés fixture adattal: import → pipeline → H2H → predictor → ledger → audit.
6. A core-szintezés 1 hibás tesztesetének javítása.
7. Route/screen code-splitting a bundle méretének csökkentésére.

## 9. Végső státusz

**Frontend:** működő és tesztelt fejlesztési állapot.  
**Pipeline:** implementált, adat nélkül cold-start/üres állapotban.  
**H2H/prediktor/ledger:** UI és logika jelen van, valódi eredmény validálásához adat kell.  
**Supabase séma:** repository-ban részletesen definiált, RLS-sel és read-only kliensmodellel.  
**Supabase élő kapcsolat:** jelenleg nem igazolt; 401/404 hibák miatt integrációs blocker.  
**Éles készültség:** még nem kész, amíg az endpoint-eltérés, migration deployment és fixture-alapú end-to-end cloud teszt nincs lezárva.

## Források a repository-ban

- `src/App.tsx`
- `src/components/winmix/NavRail.tsx`
- `src/utils/cloudConfig.ts`
- `src/utils/supabaseTier.ts`
- `supabase/migrations/20260902143548_501e0710-2c54-4370-b2f9-5ceb1f565e65.sql`
- `supabase/migrations/20260904154245_winmix_cloud_tier_schema.sql`
- `supabase/functions/winmix-ingest/index.ts`
- `docs/SUPABASE_ERD.md`
- `docs/WINMIX_PHASE1_AUDIT.md`
- `public/newdocs/SYSTEM_AUDIT_2025-11.md`

*Megjegyzés: ez az audit a repository kódját, a futó preview-t, az automatikus teszteket és az elérhető Supabase REST ellenőrzést vizsgálta. A 401/404 miatt az élő Supabase Dashboard belső állapotát nem lehetett megbízhatóan igazolni.*
