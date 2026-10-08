# WinMix Supabase javítócsomag

**Állapot: javított források és helyi tesztek. Éles telepítés nem történt.**

A csomag a két csatolt Markdown alapján javítja a klienskonfigurációt, az autentikációt, a `winmix-ingest` függvényt, a verziózott adatbetöltést és a felhőpanelt. A migráció a megtalált helyi, verziózott WinMix Core sémára készült; az éles projekt sémáját nem tudtam lekérdezni. Az eltérések és a telepítési előfeltételek dokumentáltak.

- [Audit és bizonyítékok](docs/AUDIT.hu.md)
- [Telepítési és ellenőrzési útmutató](docs/DEPLOYMENT.hu.md)
- [API-szerződés és fájltérkép](docs/CONTRACT.hu.md)
- [Ellenőrzési eredmények](docs/VERIFICATION.hu.md)

A böngésző nyilvános kulcsa az `apikey` fejlécbe kerül. Feltöltéshez a felhasználó JWT-je és az adatbázisban engedélyezett admin/operátor szerepköre szükséges. A gépi hívó külön, kizárólag szerveren tárolt titkot használhat. Egyetlen import-RPC egyetlen tranzakcióban kezeli a teljes draftot, az ellenőrzéseket és az importnyugtát.

A felület feltöltéskor **draftot** hoz létre. Az olvasó választhat a hozzáférhető verziók közül; a nyilvános felhasználó kizárólag az aktuális lezárt verziót látja. A helyi és SQL értékelések csak azonos mérkőzésállományon kapnak „Egyezik” jelzést.

Ez forrás-overlay, nem a teljes WinMix alkalmazás. A saját alkalmazásban a `src/` fájlokat és a `supabase/functions/winmix-ingest/` teljes könyvtárát kell átvezetni; a `supabase/config.toml` funkciószakaszát össze kell fésülni. Az itt szereplő `package.json` önálló tesztharnesshez tartozik, **nem cseréli le** az alkalmazás csomagleíróját. A migrációt csak a sémaellenőrzés után alkalmazd.

Helyi ellenőrzés Node 22 környezetben:

```sh
npm ci
npm run typecheck
npm test
```

A javítás nem tartalmaz projektkulcsot, jelszót, felhasználói JWT-t vagy gépi titkot.
