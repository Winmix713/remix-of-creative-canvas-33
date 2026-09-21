Ez az audit elég konkrét ahhoz, hogy új prioritást szabjon. A legfontosabb következtetés:
a winmix-engine jelenlegi formájában nem telepíthető.
Korábban a telepítését javasoltam következő lépésnek; ezt az audit fényében visszavonom. Előbb a szerveroldali jogosultságot és a futási szerződést kell rendbe tenni.
A helyes sorrend most:
1. P0 – Edge Function védelem: a winmix-engine és winmix-ingest csak valódi szerveroldali/scheduler-hívást fogadhasson el. Publishable/anon kulccsal ne legyen indítható írás vagy motorfutás.
2. Konfiguráció: a régi Lovable fallback teljes eltávolítása, a kliens csak a yvwnchyedxkajtwwkkqd projektet fogadhassa el, secret/service-role kulcsot pedig explicit utasítson el.
3. Adatbázis-szerződés rögzítése a repóban: a már élő verziózott séma, RPC-k, RLS és futási szabályok migrációként is legyenek benne.
4. Motor-futási szerződés: teljes, típusos output kell — predikciók, feature-ök, paraméterek, kalibráció, csapatállapot és verzióazonosság. A mostani null lambda- és hiányzó team-state probléma valós.
5. Bizonyított integritási hibák javítása: jövőadatból számolt automata súlyok, bajnokság-összefésülési hiba, félidei eredményt nem tartalmazó fingerprint, eltérő sorrend/scope.
6. Első hitelesített baseline motorfutás, csak ezután a weboldal átállítása „kész futás olvasása” módra.
A legkomolyabb modellhelyességi hiba nem infrastruktúra: az automatikus súlyok teljes történeti állományból képződnek, majd visszahatnak régebbi predikciókra. Ez tényleg leakage, ezt külön verziózott korrekcióként kell kezelni, nem elrejteni paritásteszttel.
A jó hír: az adat nem hiányzik. A 103 szezon és 24 720 mérkőzés él és olvasható; a hiányzó láncszem a biztonságosan publikált, teljes motorfutás és annak böngészős olvasója.