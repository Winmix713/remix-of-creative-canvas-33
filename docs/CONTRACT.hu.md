# Szerződés és fájltérkép

## Hívási lánc

`CloudTierTab → közös Auth-session + supabaseTier → winmix-ingest → Auth /user → service-only winmix_ingest_v2 → PostgreSQL-tranzakció`

Az olvasások a `winmix_cloud_*` RPC-ken keresztül történnek. Az API-válasz JSON-aggregátum, így a PostgREST táblalekérdezések szokásos sorlimitje nem csonkolja észrevétlenül a szezonlistát/meccslistát. A válaszok típusait a kliens ellenőrzi.

| Fájl | Felelősség |
|---|---|
| `src/utils/cloudConfig.ts` | Egyértelmű URL + publikus kulcs; nincs projektfallback; secret/service-role kizárása |
| `src/integrations/supabase/client.ts` | Egy közös Supabase Auth-kliens, sessionfrissítés, régi `supabase` export kompatibilitása |
| `src/utils/supabaseTier.ts` | Fejlécek, határidők, szigorú válaszvalidálás, verziózott olvasások, idempotens feltöltési kérés |
| `src/utils/cloudSync.ts` | Helyi szezonok átadása; súly/alias paraméterek nem kerülnek globális táblába |
| `src/utils/cloudComparison.ts` | Azonos mérkőzésállomány ellenőrzése és SQL–TS számítási összevetés |
| `src/hooks/useCloudTier.ts` | Meglévő status bar/context kompatibilitás, újrapróbálható állapot |
| `src/components/winmix/ops/CloudTierTab.tsx` | Bejelentkezés, szerep, verzióválasztás, feltöltés, letöltés, összevetés |
| `supabase/functions/winmix-ingest/contract.ts` | Teljes, közös bemenetvalidálás; 16 csapat / 240 egyedi irányított pár |
| `supabase/functions/winmix-ingest/handler.ts` | CORS, Auth-ellenőrzés, dedikált gépi titok, korlátok, egyetlen RPC |
| `supabase/functions/winmix-ingest/index.ts` | Deno belépési pont, nincs `@ts-nocheck` |
| `supabase/migrations/20261008000000_winmix_secure_cloud.sql` | Sémaelőfeltételek, szereptábla, nyugták, drafttranzakció, triggerek, RLS, olvasó RPC-k |

## POST /functions/v1/winmix-ingest

Böngészőből kötelező fejlécek: `apikey: <public key>`, `Authorization: Bearer <user JWT>`, `Content-Type: application/json`. Az `Origin` a böngésző által küldött érték, amelynek szerepelnie kell az engedélylistán. Kizárólag publikus kulcs egyik fejlécben sem ad írási jogot.

```ts
interface IngestInput {
  requestId: string;            // UUID, azonos logikai kérés újrapróbálásakor változatlan
  dataVersionId?: string|null;  // null: új draft; UUID: meglévő draft teljes cseréje
  expectedRevision?: number;   // új draftnál 0; cserénél kötelező aktuális revízió
  draftLabel?: string|null;
  seasons: SeasonInput[];      // 1–200 teljes szezon; a teljes cél-snapshot
}
```

A `SeasonInput` és a `MatchInput` pontos, importálható definíciója a `contract.ts` állományban található. Kizárólag az `angol`/`spanyol` ligák engedélyezettek. A 240 meccs sorszáma 1–240 között egyedi; az input sorrendjétől függetlenül ez marad a sorrend. Az FT egész 0–20; HT vagy mindkettő null, vagy mindkettő egész és az FT-nél nem nagyobb. Nincs automatikus félideieredmény-javítás vagy hibássor-kihagyás. Canonical névütközés esetén a forrást kell egységesíteni. Nincsenek globális súlyfelülírások.

A feltöltött `contentHash` csak forrásmetaadat, nem hiteles adatbizonyíték. Az adatbázis a normalizált meccsekből saját `content_hash`-t képez. Az importnyugta a teljes kérés SHA-256 hash-ét tárolja. A felület kérésazonosítója felhasználóhoz és normalizált tartalomhoz kötött, újratöltés után is reprodukálható. Szándékosan új, azonos tartalmú draft csak explicit új `requestId`-val kérhető programból.

Egy sikeres válasz mintája:

```json
{
  "success": true,
  "dataVersionId": "UUID",
  "revision": 1,
  "status": "draft",
  "isCurrent": false,
  "seasons": 1,
  "teams": 16,
  "matches": 240,
  "rejected": 0,
  "repaired": 0,
  "errors": [],
  "manifestErrors": [],
  "replayed": false,
  "requestId": "UUID",
  "traceId": "UUID"
}
```

A `teams` a verzióban érintett egyedi csapatok száma, nem az újonnan létrehozott csapatsorok száma. `replayed=true` esetén ez a korábbi commit nyugtája: a verzió későbbi állapotát a verziólistából kell olvasni. A nyugta eredeti `draft` státusza nem állítja, hogy a verziót azóta sem zárták le.

| HTTP | Jelentés |
|---|---|
| 204 | Engedélyezett OPTIONS preflight |
| 200 | Teljes commit vagy ugyanannak a kérésnek a nyugtája |
| 401 | Hiányzó, lejárt vagy nem felhasználói munkamenet |
| 403 | Tiltott origin, névtelen Auth-fiók vagy hiányzó operátori jogosultság |
| 409 | Megváltozott/lezárt verzió, régi revízió vagy eltérő kérés ugyanazzal az ID-val |
| 413 / 415 / 422 | Méret / MIME / tartalomhiba; a validált import nem történt meg |
| 429 / 503 | Átmeneti hiba; a response elveszhetett, újrapróbáláskor az ID változatlan |
| 502 | Adatbázishiba; ellenőrizd a nyugtát/logot, azonos kérésazonosítóval próbálj újra |

Nincs HTTP 207 részleges siker. A nyugtát, a verziót és a sorokat egy tranzakció írja. A request-ID zárolása sorba rendezi az azonos kéréseket, a verziósorzár és revízióellenőrzés pedig a konkurens draftcseréket. A szerepvisszavonás a tagsági sorzárral rendeződik. A service role teljesen megbízható szerverhatár; a nyilvános kliens az RPC-t közvetlenül nem futtathatja és nem adhat be saját actor-ID-t.

## Olvasási szerződés

- `winmix_cloud_access()`: szerződésverzió + aktuális felhasználó UX-képessége.
- `winmix_cloud_versions()`: publikus olvasónak aktuális lezárt verzió; operátornak a többi verzió is.
- `winmix_cloud_seasons(p_version,p_league)`: teljes szezonlista, UUID/revízió/hash metaadatokkal.
- `winmix_cloud_season(p_season,p_version,p_revision)`: teljes szezonpillanatkép. Eltérő revízió vagy darabszám hibát ad.
- `winmix_cloud_ratings(p_version,p_league)`: SQL-értékek és az összevetés alapjául szolgáló mérkőzések ugyanabból az SQL-pillanatképből.

A `basis` kizárólag a ratingek szempontjából releváns mezőket tartalmazza: szezonindex, meccssorszám, két kanonikus csapatkulcs, két FT-eredmény. Az időpont és HT nem része ennek a statisztikának; ettől a teljes snapshot letöltése még megőrzi őket. A UI csak egyező basis és teljes csapathalmaz esetén állít összevethetőséget. A SQL-lekérdezés a ténylegesen szereplő csapatokat értékeli; más draftokban létrejött, itt meccs nélküli csapatok nem módosítják az átlagot/szórást.
