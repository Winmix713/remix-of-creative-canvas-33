# Audit – 2026. október 8.

## Bizonyítékok és hatókör

Elolvastam a hivatkozott „Supabase kapcsolat javítása” beszélgetést, és annak két tényleges csatolmányát. Az eredeti `/mnt/data/` hivatkozások Windows alatt a beszélgetés eszköze által visszaadott ideiglenes fájlokként voltak elérhetők.

| Forrás | SHA-256 |
|---|---|
| `osszes.md` | `952e74fb23fc83553bb919b795250fd4147362a10fa632833805f661014c124c` |
| `Beillesztett markdown.md` | `716ad9950c0dc90e0de7b0210b8b013e793306f5e204fbc6cfa346f0fbd6a2bc` |

Az `osszes.md` öt forrásszakaszt tartalmaz: kliens, konfiguráció, `supabaseTier.ts`, funkciókonfiguráció, Edge Function. **Nem tartalmazza az adatbázis migrációit és a React felületet.** Ezekhez kiegészítő, olvasott referencia volt a helyi `2026-09-20/n-z/winmix` checkout `supabase/migrations`, `useCloudTier`, `useOpsActions`, `CloudTierTab`, `cloudSync` és `autoWeights` állománya. Ezt a checkoutot nem módosítottam.

A csatolmány a `dpmyxypqcsugycqhifaf` projektre hivatkozik. A korábbi `yvwnchyedxkajtwwkkqd` projektref eltávolításra került; a konfiguráció egyértelműen a `dpmyxypqcsugycqhifaf` projektet használja.

## Igazolt hibák

| Súly | Bizonyíték az `osszes.md` állományban | Következmény és javítás |
|---|---|---|
| Kritikus | 841–858: az `authorized()` elfogadja az anon/publishable kulcsot | Bárki, aki látja a frontendkulcsot, service-role műveleteket indíthat. Helyette Auth által ellenőrzött felhasználó + élő operátori nyilvántartás; az író RPC kizárólag service role számára végrehajtható. |
| Kritikus | 912 után külön verzió-, szezon-, napló-, csapat- és meccsműveletek | Nincs közös tranzakció. Hibás import után részadat maradhat. Az új RPC mindent együtt commitol vagy rollbackel. |
| Magas | A megadott `dataVersionId` állapotellenőrzés nélkül használható | Lezárt/aktuális adat sérülhet. Draftellenőrzés, sorzár, várható revízió, adatbázis-trigger védi. |
| Magas | 921: `label`; 979: feltételezett szezon-ütközési kulcs; 992: figyelmen kívül hagyott naplóhiba; 1101: régi meccs-ütközési kulcs | A helyi Core-ban `version_key` kötelező; a napló `storage_path` mezőt és más státuszokat vár; a meccs egyediség verzióhoz kötött. A régi kód erre a sémára nem illeszkedik. Az új migráció expliciten ellenőrzi előfeltételeit, külön nyugtatáblát használ. Az éles sémaeltérés még ellenőrzendő. |
| Magas | 958: manifest ellenőrzése, majd 1071 után sorok kihagyása | A validált 240 sorból kevesebb maradhat, miközben a számláló 240 és a válasz akár sikeres. Minden sor kötelező; hibás FT/HT vagy párosítás megszakítja az egész kérést. |
| Magas | 1032: globális csapatadatok és súlyok upsertje | Draft import megváltoztathatja korábbi verziók globális neveit/súlyait. Az új import meglévő csapatot nem módosít; neveket mérkőzésenként pillanatképez. Súly/alias nem része az importnak. |
| Magas | 1 és 110: azonos konfigurációs kód két helyen | A csatolt `client.ts` nem hoz létre Supabase Auth-klienst; nincs feltöltési felhasználói session. Egyetlen konfiguráció és közös SDK Auth-kliens készül. |
| Közepes | 65–85, 174–194: hibás/részleges env esetén másik projektre visszaesés | Rossz backendhez kapcsolódás lehetséges. Nincs beégetett fallback; hibás konfiguráció látható állapot. Secret/service-role kulcsot a frontend elutasít. |
| Közepes | 619: anon kulcsból származó Bearer | Projektazonosítás keveredik felhasználói jogosultsággal. Feltöltésnél a Bearer kizárólag a session JWT-je. |
| Közepes | 539: CSV-mezők puszta vesszővel összefűzése | Vesszős/időnként idézőjeles nevek sérülnek. RFC 4180 szerinti idézés; teljes JSON-csomag megőrzi a dátum-, sorrend- és eredetmezőket. |
| Közepes | Egyetlen REST lekérdezés és csak szezon-ID alapú cache | Sorlimit miatti csonkolás vagy régi draftból származó adat lehetséges. Egy szezon RPC-je JSON-aggregátumban adja vissza a teljes snapshotot, revízió- és darabszámellenőrzéssel; nincs sessionök között élő nyersadat-cache. |
| Közepes | 207 / `res.ok`, opcionális sikermezők alapértelmezései | Részleges vagy hibás választ félreérthet a UI. Csak validált HTTP 200 nyugta számít sikernek; részleges siker megszűnik. |

A helyi felület kiegészítő vizsgálata során a sticky degraded állapot, a ligaváltáskor bent maradó ratingek és a publikált adatok/draft összekeverésének kockázata is látszott. A javított panel külön kezeli a műveleteket, megőrzi a bizonytalan feltöltés kérését, eldobja a régi ligához tartozó aszinkron választ, és helyi import előtt minden szezon letöltését befejezi.

## A konzolhibák helyes értelmezése

**`No API key found in request`:** az üzenet egy adott Supabase-kérés hiányzó `apikey` fejlécére vagy paraméterére utal. A bemásolt `supabaseTier.ts` a REST és az Edge POST kéréséhez is ad ilyen fejlécet. Emiatt a hiba önmagában nem bizonyítja ennek a forrásnak a hibáját: lehet eltérő telepített bundle, másik fetch/SDK-kliens, vagy közvetlenül megnyitott API-URL. A funkció szerverkulcsának hiánya ebből nem vezethető le. A javított kliens minden saját hálózati kérésénél beállítja a fejlécet; teszt igazolja a publikus kulcs és a user JWT külön kezelését.

**CORS/preflight:** a böngésző által jelzett sikertelen OPTIONS igazolt tünet. A kiváltó réteg nem ismert: gateway, hiányzó funkció, rossz route, runtime-hiba, tiltott origin vagy eltérő telepített config is okozhatja. A helyi `verify_jwt=false` nem bizonyítja a telepített beállítást. A korábbi szöveg „biztosan verify_jwt=true okozza” kijelentése nem volt alátámasztva. Az új handler az OPTIONS-t hitelesítés nélkül, pontos origin-engedélyezéssel kezeli. A tényleges beállítás és válasz a telepítési tesztekkel ellenőrizhető. [Supabase CORS](https://supabase.com/docs/guides/functions/cors), [Authorization headers](https://supabase.com/docs/guides/functions/auth-headers).

**Anon kontra publishable:** a kulcsprioritás megfordítása nem hitelesítési javítás. Mindkét kulcs publikus; egyik sem igazolja a feltöltő jogosultságát. Publishable kulcs az `apikey` fejlécbe, felhasználói JWT az `Authorization` fejlécbe kerül. A secret/service-role kulcs kizárólag szerveren marad. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

**500-as hiba:** telepített Function-log nélkül nem állapítható meg. Az eredeti kódban a sémaeltérés és a hiányzó környezeti változó is lehetséges ok. A javítás dokumentált szerverkulcs-feloldást használ: saját `WINMIX_SUPABASE_SECRET_KEY`, a platform `SUPABASE_SECRET_KEYS` név szerinti bejegyzése, majd a legacy `SUPABASE_SERVICE_ROLE_KEY`. Nem találgat más env-neveket. [Supabase environment variables](https://supabase.com/docs/guides/functions/secrets).

**Aszinkron listener / lezárt message channel:** gyakran böngészőbővítmény vagy környezeti üzenetkezelő hibája; ebből a forrásból nem köthető bizonyítottan Supabase-hez. Külön, bővítmények nélküli böngészőben vizsgálandó. Nem helyettesíti a Network- és Function-log elemzését.

## Megmaradó ellenőrzési határok

Nem történt bejelentkezés az éles Supabase-be, sémaexport, titokellenőrzés, migration push, funkciótelepítés vagy éles adatírás. Nem igazolt a frontend éles buildje, a távoli gateway viselkedése, a projekt Auth-beállítása vagy a publikáló motor működése. A csomag helyi tesztjei valódi beágyazott PostgreSQL-motoron futnak, de nem helyettesítik a staging környezet többkapcsolatos és éles méretű próbáját.

A SECURITY DEFINER olvasó RPC-k szándékosan megkerülik a táblák nyilvános RLS-szűrését az operátori draftolvasáshoz, ezért a függvényen belüli verzió-hozzáférésellenőrzés, a rögzített üres search_path és a szűk EXECUTE-grant kötelező része a megoldásnak. [Supabase database functions](https://supabase.com/docs/guides/database/functions).
