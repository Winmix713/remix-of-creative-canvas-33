# Telepítés és ellenőrzés

## 1. Azonosítsd a valódi célprojektet

Az aktív projekt `dpmyxypqcsugycqhifaf`. A build URL-je, nyilvános kulcsa, Auth-felhasználói, adatbázisa és Edge Functionje ehhez a projekthez tartozik. Ne másold át automatikusan a régi checkout `.env` állományát.

A csomag nem kapcsolódott egyik távoli projekthez sem. A következő parancsokat a projekt jogosult üzemeltetője futtathatja. Először staging klónon dolgozz, adatbázismentés mellett.

## 2. Sémakapu – ezt ne ugord át

Futtasd a `scripts/schema-inventory.sql` olvasási lekérdezéseit a célprojekt SQL Editorában. Az első lekérdezések akkor is értelmes leltárt adnak, ha a végén szereplő verziótáblák hiányoznak; a hiány nem indok a továbblépésre.

A migráció előfeltétele a **verziózott WinMix Core**, PostgreSQL 15 vagy újabb:

- `winmix_data_versions`: UUID `id`, egyedi, kötelező `version_key`, `status` (`draft/sealed/superseded/rejected`), `is_current`, `source_description`, `content_fingerprint`, `season_count`, `match_count`, `league_coverage`, `sealed_at`, `created_at`, `updated_at`; a jelenlegi verzióra egyedi részindex.
- `winmix_seasons`: UUID `id`, kötelező `data_version_id`, `league`, `season_index`, `name`, `file_name`, `content_hash`, `match_count`, `order_mode`, `created_at`.
- `winmix_matches`: UUID `id`, `data_version_id`, `season_id`, `league`, `match_no`, `source_file_id`, `row_index`, `kickoff_iso`, `match_date_raw`, mindkét csapat-ID és négy eredménymező; a csapat/szezon idegen kulcsok és eredménykorlátok.
- `winmix_teams`: UUID `id`, `league`, `canonical_key`, `display_name`, a súlymezők megfelelő alapértékekkel; egyediség `(league,canonical_key)` szerint.
- Supabase `auth.users`, `auth.uid()`, `auth.role()`, valamint `anon`, `authenticated`, `service_role` szerepek.

A mellékelt migráció **nem** hozza létre vagy tölti fel a régi Core sémát, és nem ad hamis verziót a történeti adatoknak. A helyi régi Core-migráció ráadásul konkrétan 103 szezont / 24 720 meccset és a saját baseline-ját várja: más projekten nem futtatható vakon. Ha a céladatbázis `label`-alapú verziótáblát használ, vagy még nincs verziózás, a leltár alapján külön előkészítő migráció szükséges. A tesztkönyvtár `existing-core-tables.sql` fájlja csak tesztfixture, nem produkciós bootstrap.

Vizsgáld meg az összes korábbi egyedi indexet és triggert. Ismeretlen, nem verzióhoz kötött `(league,season_index)` vagy eltérő `NOT NULL` mező szintén összehangolást igényel. A migráció szándékosan hibával megáll az inkompatibilis sémán.

A migráció a négy alapadat-tábla minden korábbi RLS-policyját lecseréli a dokumentált, aktuális lezárt verzióra szűrt olvasási szerződésre. Ha más alkalmazás speciális policyt használ ugyanezeken a táblákon, stagingben ennek hatását is ellenőrizd. Az operátori draftolvasás az ellenőrzött RPC-ken keresztül működik.

## 3. Vezesd át a frontend fájlokat

Másold át az overlay `src/utils/cloudConfig.ts`, `src/integrations/supabase/client.ts`, `src/utils/supabaseTier.ts`, `src/utils/cloudSync.ts`, `src/utils/cloudComparison.ts`, `src/hooks/useCloudTier.ts`, `src/components/winmix/ops/CloudTierTab.tsx` fájljait. A `src/env.d.ts` deklarációit fésüld össze a meglévő Vite-típusokkal. A `supabase/functions/winmix-ingest/contract.ts` a frontend típusaihoz/validálásához is kell; a kliens nem importálja a szerverhandlert.

A dashboardban add át a helyi szezonokat. A megtalált helyi dashboard `useWinmix()` hívásához vedd fel a `seasons` mezőt, majd a panel legyen:

```tsx
<CloudTierTab league={currentLeague} seasons={seasons} />
```

A `Season`/`MatchRow` struktúra megfelel a panel bemenetének. A kliens explicit mezőkiválasztással elhagyja a `pipeline`, statisztika és egyéb számítási mezőket. Ha csak `leagueSeasons` kerül átadásra, kizárólag az a liga alkotja az új draft teljes állományát. A régi `crossCheck` prop kompatibilitási okból fogadható, de a panel a verzióellenőrzött összevetését használja.

A letöltő alapból ellenőrzött JSON-adatcsomagot menthet, a teljes metaadatokkal és a kompatibilis CSV-szöveggel. Ha helyi visszaimportot is szeretnél, az opcionális `onImport(downloads)` callbacket kösd az alkalmazás explicit importfolyamatához. A panel csak az összes szezon sikeres letöltése után mutatja az átvétel gombját. Ne indíts automatikus importot, súlymódosítást vagy pipeline-futtatást az SQL-ratings betöltésére.

Példa a meglévő CSV-importhoz, ha annak parse/dedup/sorrendkezelése a kívánt működés:

```tsx
<CloudTierTab
  league={currentLeague}
  seasons={seasons}
  onImport={async downloads => {
    const files = downloads.map(d => new File([d.csvText], d.meta.fileName, {type: 'text/csv'}));
    await importFiles(files, currentLeague);
  }}
/>
```

A CSV újraparszolása újra képezheti a sorrendet, lokális ID-kat és kickoff-időket. Pontos snapshot-visszaállításhoz a JSON `matches`/`meta` mezőit feldolgozó adapter kell; a JSON-csomag ezeket megőrzi. A CSV nem teljes adatbázis-backup, és nem garantálja a fájl eredeti bájtsorozatának visszaállítását. A CSV mezőidézés nem spreadsheet-formula-semlegesítés; tetszőleges csapatneveket ne nyiss meg automatikusan táblázatkezelőben.

Keresd meg és cseréld a régi közvetlen `fetch(...winmix-ingest)` hívásokat. `ingestSeasonsToCloud` most sikernyugtát ad vagy hibát dob; az új panel mindkettőt kezeli. Régi külső hívónak kötelező `try/catch`. A `cloudSync` adapter azonos felhasználó és azonos normalizált adatok mellett stabil kérésazonosítót készít. Súly- és aliastérképek nem kerülnek a cloud ingestbe; ezeket külön, verziózott paramétersnapshotban kell kezelni.

Állítsd be a buildben a `.env.example` alapján a valódi URL-t és a **publishable** kulcsot, majd indíts új buildet. A Vite env-változtatása nem változtatja meg a már kiadott JavaScript-bundle-t. Legacy anon JWT csak alternatíva. `service_role`, `sb_secret_...`, ingesttitok vagy felhasználói JWT nem kerülhet `VITE_*` változóba. Ellenőrizd a Supabase Auth bejelentkezési módját; a panel e-mail/jelszó bejelentkezést ad, a meglévő közös SDK-sessiont is használja.

## 4. Adatbázis és szerepkör

Kompatibilis staging sémán alkalmazd **csak** a `20261008000000_winmix_secure_cloud.sql` migrációt, a projekt saját migrációs rendjében. SQL Editorban is futtatható teljes egészében; a fájl tranzakciót tartalmaz. Sikertelenség esetén a teljes migráció visszagörgetődik. Ha SQL Editorral alkalmazod, utána egyeztesd a CLI migrációtörténetét, ne futtasd újra ugyanazt a migrációt.

CLI esetén előbb ellenőrizd a kapcsolt projektet és a teljes függő migrációlistát. A `db push` minden függő migrációt alkalmazhat, ezért ne egy másik projekt régi migrációkönyvtárából indítsd. A csomag régi migrációkat szándékosan nem hoz magával.

Hozd létre vagy válaszd ki a tényleges Auth-felhasználót. Tulajdonosi SQL Editorban engedélyezd az UUID-jét:

```sql
insert into public.winmix_cloud_operators(user_id,role,enabled)
values ('REPLACE_WITH_AUTH_USER_UUID'::uuid,'operator',true)
on conflict (user_id) do update set role=excluded.role,enabled=true;
```

Ne `user_metadata`-ból döntsd el a jogosultságot. Az `admin` és az `operator` ebben az importfolyamatban ugyanazt a feltöltési képességet kapja. Visszavonás:

```sql
update public.winmix_cloud_operators set enabled=false
where user_id='REPLACE_WITH_AUTH_USER_UUID'::uuid;
```

A következő import tranzakciója az élő táblát ellenőrzi; egy már megkezdett tranzakció a visszavonással sorzár alapján rendeződik. A kliens `canWrite` jelzője csak UX, nem biztonsági határ.

## 5. Edge konfiguráció és telepítés

A funkció környezetében:

- `SUPABASE_URL`: a célprojekt platform által biztosított URL-je.
- `WINMIX_ALLOWED_ORIGINS`: vesszővel elválasztott teljes originök, például `http://localhost:5173,https://winmix.example`. Nincs útvonal, záró perjel vagy `*`. A tényleges webcontainer preview originjét külön vedd fel; új preview cím új engedélyezést igényel.
- Szerverkulcs: a kód először `WINMIX_SUPABASE_SECRET_KEY`-t, majd `SUPABASE_SECRET_KEYS[WINMIX_SECRET_KEY_NAME || 'default']`-ot olvassa; legacy tartalék a platform `SUPABASE_SERVICE_ROLE_KEY` változója. Ha több kulcs van, a kiválasztott nevet állítsd be. A funkció hibával megáll, ha nincs érvényes szerverkulcs.
- Opcionális `WINMIX_INGEST_SECRET`: pontosan 64 véletlen hexadecimális karakter, 32 bájt entrópiával, kizárólag megbízható szerverről történő híváshoz. Ez nem anon/API/JWT kulcs. Böngésző-Origin mellett nem fogadható el. CORS azonban önmagában nem hitelesít: a titkot védeni kell.

A Supabase titokkezelőjével állítsd be a változókat; ne másold a titkos értékeket verziókövetésbe vagy megosztott terminálnaplóba. A `supabase/config.toml` meglévő tartalmába fésüld be:

```toml
[functions.winmix-ingest]
verify_jwt = false
```

Ez a handler saját Auth-ellenőrzése és a szerverhívó miatt választott beállítás; **nem publikus írási engedély**. A függvény OPTIONS előtt nem kér hitelesítést, minden POST-ot hitelesít, majd a service-only RPC újra ellenőrzi az operátort. Az egész háromfájlos függvénykönyvtárat telepítsd:

```powershell
supabase functions deploy winmix-ingest --project-ref YOUR_CONFIRMED_PROJECT_REF --no-verify-jwt
```

Ellenőrizd a CLI sikerét és a Dashboard telepített konfigurációját. A régi anon-kulcsos handlert ne hagyd másik, írni képes végponton aktívan. A frontend csak a migráció és az új Edge Function után menjen élesbe. Ha leállást el kell kerülni, a váltás idejére tiltsd le a régi feltöltő gombot; olvasás a régi rendszerben tovább működhet.

## 6. Távoli ellenőrzés – elvárt eredmények

### Automatikus, adatot nem módosító ellenőrzés

Állítsd be egy helyi terminálfolyamat környezetében a `WINMIX_TEST_URL`, `WINMIX_TEST_PUBLIC_KEY`, `WINMIX_TEST_ORIGIN` változókat. Ne tegyél ide secret key-t. Futtasd:

```powershell
node scripts/verify-cloud.mjs
```

A hat ellenőrzés: engedélyezett preflight hitelesítés nélkül 204; tiltott origin 403 és nincs reflektált CORS-origin; önmagában nyilvános kulcs 401; nyilvános kulcs Bearerként 401; szerződésverzió 2 és `canWrite=false`; publikus listában legfeljebb egy aktuális lezárt verzió. Üres lista csak azt jelenti, hogy nincs ilyen hozzáférhető verzió.

Futtasd a `scripts/post-deploy.sql` olvasási ellenőrzéseit is. Az összes `forbidden_*` érték false, az érintett táblák RLS-állapota true legyen. Tekintsd át a korábbi SECURITY DEFINER függvények EXECUTE-jogait a leltárból is.

### Staging funkcionális és biztonsági próba

1. Kijelentkezve: a publikált adatok olvashatók; feltöltés tiltott. A Network panelen minden REST POST `apikey` fejlécet kap.
2. Közönséges, nem operátori felhasználó JWT-jével küldj egy egyébként valid 16 csapatos / 240 meccses kérést: 403; nincs új draft, meccs vagy nyugta.
3. Operátorként tölts fel egy teljes szezoncsomagot: 200, `success=true`, `status=draft`, `isCurrent=false`, pontos darabszámok és UUID. A nyilvános current mutató változatlan.
4. Válaszd ki a létrejött draftot operátorként: a szezonok és SQL-adatok olvashatók; kijelentkezve ugyanaz a draft nem olvasható. A publikált nézet továbbra is a korábbi adatot mutatja.
5. Ugyanazt a teljes kérés-JSON-t, ugyanazzal a `requestId`-val küldd be újra, majd két párhuzamos HTTP-kérésként is: azonos `dataVersionId`, egyetlen nyugta, nincs duplikált adat; a második válasz `replayed=true`. Eltérő tartalom ugyanezzel az ID-val 409.
6. Meglévő draft cseréjéhez új `requestId`, a cél `dataVersionId` és a legutóbb olvasott `expectedRevision` kell. Két eltérő kérés ugyanazzal a várható revízióval: egy siker, egy 409. A régi revíziós letöltés 409.
7. A több szezont tartalmazó kérés utolsó szezonjába tegyél hibás eredményt vagy ismételt párosítást: 422; nincs részleges írás. Ellenőrizd a verzió-, szezon-, meccs- és nyugtaszámokat előtte/utána. RPC-szinten is próbáld kontrollált staging admin környezetben; a helyi adatbázisteszt ezt már lefedi.
8. Lezárt/aktuális/superseded verzió módosítása 409 legyen. Egyszerű UPDATE a lezárt szezonra/meccsre service role alatt is sikertelen. A tulajdonos technikailag képes a védelem megkerülésére; annak kulcsa privilegizált adminhatár.
9. Operátori szerep visszavonása után a következő feltöltés 403 legyen a még élő sessionnel is.
10. Szimulálj elveszett választ / hálózatmegszakadást. A panel ugyanazzal a kérésazonosítóval próbáljon újra; timeout nem jelent rollbackbizonyítékot. Az importnyugta tisztázza, commitolt-e a művelet.
11. Félbeszakadt szezonletöltés esetén ne induljon részleges helyi import. Ligaváltáskor a korábbi liga későn érkező SQL-válasza ne jelenjen meg. Vesszőt/idézőjelet tartalmazó csapatnév a letöltésben maradjon ép.
12. SQL-paritás: azonos helyi adatállománynál mind a net H/V, PPG, meccsszám és súly egyezzen; eltérő helyi állománynál „Nem összehasonlítható” legyen. SQL-betöltés ne módosítson helyi súlyt vagy pipeline-t.

Az éles méretű, legfeljebb 200 szezonos próbán mérd meg a teljes kérés méretét és idejét is. A handler 12 MiB-ot enged, az upstream RPC-időkorlát 55 másodperc, a kliens 65 másodperc; az adatbázis/PostgREST projektben beállított korlátjai ennél alacsonyabbak is lehetnek. Nagyobb állományhoz külön staging/commit protokoll szükséges; ne darabold részleges „sikeres” importokra ezt a tranzakciót.

## 7. Draftból publikált adat

Ez a csomag **nem publikál automatikusan**. A helyi Core architektúrában lezárt adatverzió, ellenőrzött paramétersnapshot, sikeres motorfutás és `winmix_promote_engine_run` része a publikálásnak. Ezt a projekt meglévő szerverfolyamatával kell végrehajtani, a teljes adatkészlet, fingerprint és eredmények ellenőrzése után. Pusztán az `is_current=true` beállításával ne kerüld meg a motorfutást vagy a predikciók konzisztenciáját.

A javítás a Core meglévő MD5-tartalom-fingerprint formátumát tartja meg az engine-kompatibilitásért; ez nem hitelesítési mechanizmus. Az importnyugta SHA-256 hash alapján külön ellenőrzi a teljes normalizált kérésazonosságot.

Ha a célprojektben nincs publikáló/lezáró workflow, az éles publikálás külön hiányzó integráció. A draft feltöltés és operátori visszaolvasás ettől tesztelhető; a felület ezt nem állítja be publikált sikernek.

## 8. Hibaelhárítás és visszaállítás

Az OPTIONS Network-bejegyzésnél rögzítsd a státuszt és a CORS-fejléceket, majd vesd össze a Function invokációs logjával. Invokáció hiánya esetén előbb route/gateway/telepítés vizsgálandó. A javított függvény hibaválaszai `traceId`-t adnak; váratlan RPC-/szerverhibánál ugyanaz az azonosító a strukturált hibanaplóba is bekerül. A szándékos 401/403/422 elutasítás nem ír külön console-hibanaplót. Tokeneket, kulcsokat és teljes feltöltési törzset ne naplózz.

Olvasási 200 + `[]` nem bizonyít RLS-hibát: ellenőrizd, van-e aktuális lezárt verzió. 403 lehet GRANT/EXECUTE/alkalmazásszerep vagy verzió-hozzáférés; önmagában nem jelenti, hogy az RLS az egyetlen ok. 404/PGRST202 a célprojektből hiányzó RPC vagy elavult sémacache jele is lehet.

Sikertelen migráció magától rollbackel. Sikeres migráció után probléma esetén először kapcsold ki a feltöltést, őrizd meg a nyugtákat és a draftokat, és javíts előrefelé. Ne állítsd vissza az anon-kulccsal író régi handlert, ne töröld a biztonsági triggereket gyors workaroundként, és ne állíts minden RLS-policyt `true`-ra. A teljes sémavisszaállítás csak ellenőrzött mentésből és a projekt többi fogyasztójának figyelembevételével végezhető.
