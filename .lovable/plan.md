# Rangadó (büntetőpont) — kiemelt párosítások BTTS rangsor-korrekciója

## 0. Előfeltétel: a két Phase 6 utómunka bevezetése

A feltöltött `slip.ts` és `coreTrace_1.ts` pontosan három apró eltérést tartalmaz a mai kódhoz képest — ezeket vezetem be változtatás nélkül:

- `slip.ts`: a Core evidencia-szint összegzése a `excluded` szintet is jelenti (nem csak `conditional`-t).
- `slip.ts`: új jegyzet a Core oldalon, ha cáfolt sávú jelölt is bekerült ("a Phase 6 market gate jelenleg inaktív").
- `coreTrace.ts`: a cáfolt sávú sorok számlálása az evidencia-szintből jön (`evidence === 'excluded'`), nem a `band` kapuhibából — a flag off állapotban ez a helyes populáció.

## 1. Alapelv

A rangadó-címke önmagában NEM büntet. A címke csak azt mondja: ezt a párosítást külön meg kell vizsgálni. Levonás csak akkor keletkezik, ha a **virtuális WinMix H2H adat** maga mutat visszatérő BTTS Nem / tisztalapos / alacsony gólos / egyoldalú mintát.

Csapatneveket sehol nem írok át, nem alias-olok, nem fordítok valós klubokra. A regiszter kizárólag a feltöltött adatból származó kanonikus kulcsokat tárolja.

## 2. A regiszter forrása: a kártyán lévő kapcsoló

A képen látható megoldást követem: a H2H oldal „Összecsapás mérlege" kártyájának alsó sorában, a LEGUTÓBB sorral szemben egy **RANGADÓ (BÜNTETŐPONT)** ON/OFF kapcsoló.

- A kapcsoló a kiválasztott irányított párosítást (`homeKey` → `awayKey`) jelöli meg rangadóként, ligánként tárolva, a meglévő `utils/storage.ts` perzisztencián keresztül.
- Alapértelmezés: OFF. Nincs előre bedrótozott névlista.
- Opcionálisan a fordított irány is megjelölhető ugyanazzal a kapcsolóval a másik nézetben — a tárolás irányonként történik.
- A kapcsoló melletti mikro-szöveg mutatja a kiszámolt kockázati szintet és a hipotetikus levonást, amint az ON.

## 3. Kockázatértékelés (új, elkülönített modul)

Új fájl: `src/utils/marqueePairs.ts`. Nem duplikál kiütés-számítást, a meglévő `H2HGoalProfile` és `bttsRisk` (BTTS blowout profil) adatokat olvassa.

Bemenet: irányított H2H mintája + `goalProfile` + `bttsRisk` + a két csapat súlyindexe (`home_weight_index` / `away_weight_index`) csak kontextusként.

Vizsgált evidenciák:
1. közvetlen H2H mintaméret (minimum küszöb alatt nincs korrekció),
2. BTTS Nem arány (bármelyik fél nem szerez gólt),
3. alacsony gólos BTTS Nem minta (0-0, 1-0, 0-1, 2-0, 0-2),
4. egyoldalú tisztalapos kiütés — a meglévő `shrunkCleanSheetBlowoutRate` és `blowoutScores`,
5. súlykülönbség — csak kontextus, önmagában soha nem indok,
6. történelmi BTTS stabilitás — stabil, jól alátámasztott BTTS profilt nem ír felül evidencia nélkül.

Kimenet: `none | low | medium | high` szint, a hozzá tartozó rangsor-levonás, és a döntést magyarázó, számokkal alátámasztott indoklás-lista.

## 4. Hatás: kizárólag rangsorolás

- A nyers H2H BTTS %, a zsugorított hit rate, a modell valószínűség, ESS, stabilitás, kalibráció és a Phase 6 evidencia **változatlan marad és látható marad**.
- Nem keletkezik új hard gate. A jelölt Core-jogosult marad, hacsak egy meglévő valódi kapu ki nem zárja.
- A levonás csak BTTS Igen jelöltek egymás közötti sorrendjét befolyásolja, a BTTS rangsorolási komparátorban. Más piac (O2.5, 1X2, csapatgól, HT, pontos eredmény), a Joker ág és a „Saját" BTTS mód érintetlen.

## 5. Shadow mód először

Új zászló: `MARQUEE_RANKING_ACTIVE = false`.

- OFF állapotban a rangsor nem mozdul, de a trace és a kártya megmutatja: eredeti pozíció, kockázati szint, hipotetikus levonás, korrigált pozíció.
- Élesítés csak azután, hogy a historikus körökön a mérés nem rontja a BTTS Igen / Top1 / Top3 találati arányt.

## 6. Trace és UI

- A Core Decision Trace BTTS jelölt sora kiegészül: regisztrált rangadó-e, kategória, közvetlen H2H mintaméret, BTTS Nem arány, alacsony gólos BTTS Nem arány, tisztalapos arány, meglévő blowout profil, súlyviszony, végső kockázati szint, levonás, korrigált rangsor-pontszám.
- A jelölt kártyáján a jelzés sárga/narancs rangsorolási figyelmeztetés, nem piros kapuhiba: „Rangadó BTTS-kockázat: Közepes · Rangsorolási levonás: −8", a magyarázó mondattal együtt.

## Technikai részletek

- Új: `src/utils/marqueePairs.ts` (regiszter olvasás/írás + kockázatértékelés), típusok a `src/types/winmix.ts`-be.
- Módosul: `src/components/winmix/MatchupHeader.tsx` (kapcsoló), `src/pages/HeadToHead.tsx` (állapot bekötése), `src/utils/storage.ts` (perzisztencia), `src/utils/slip.ts` (BTTS komparátor + zászló), `src/utils/coreTrace.ts` (trace mezők), a jelölt-tábla és a Core kártya megjelenítése.
- Új regressziós teszt-suite: nincs levonás evidencia nélkül; nincs levonás kis minta esetén; nincs kizárás semmilyen szinten; más piacok pontszáma bitre azonos; shadow OFF állapotban a sorrend változatlan.
- `CORE_SELECTION_RULE_VERSION` emelése, hogy a mentett szelvények auditálhatók maradjanak.
