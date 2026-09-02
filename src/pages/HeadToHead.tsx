import React, { useEffect, useMemo, useState } from 'react';
import { Goal, Play, Repeat, Swords, Users } from 'lucide-react';
import { useWinmix } from '../contexts/WinmixContext';
import { computeAutoTeamWeights } from '../utils/autoWeights';
import { buildTeamPool } from '../utils/fixtures';
import { computeH2HPairs, summarizeMatchup } from '../utils/h2h';
import { collectMeetings, computeH2HGoalProfile, computeLeagueBaselines } from '../utils/patterns';
import {
  assessMarqueeRisk,
  ensureMarqueeRound,
  isMarqueePair,
  loadMarqueeStore,
  marqueeRoundRegistry,
  setMarqueePair } from
'../utils/marqueePairs';
import { MarqueeRoundsTable } from '../components/winmix/MarqueeRoundsTable';
import { H2HPairTable } from '../components/winmix/H2HPairTable';
import { MatchupHeader } from '../components/winmix/MatchupHeader';
import { MetricCard, MetricGrid } from '../components/winmix/MetricCard';
import { PageHeader } from '../components/winmix/PageHeader';
import { Panel, PanelHeader, PanelTitle, SectionHeading } from '../components/winmix/Panel';
import { TeamSelect } from '../components/winmix/TeamSelect';

/** The selected pair, once the operator has actually run it. */
interface AppliedPair {
  home: string;
  away: string;
}

const INTRO =
'Minden irányított csapatpár (Hazai → Vendég) összes, eddig betöltött szezonon átívelő találkozója egy helyen, kanonizált csapatnevek szerint csoportosítva. Egy páros futtatása kizárólag a kiválasztott hazai → vendég irányt listázza és összegzi.';

export function HeadToHead() {
  const { leagueSeasons, leagueMatches, teamAliasMap, currentLeague, round } = useWinmix();
  const [homeKey, setHomeKey] = useState<string | null>(null);
  const [awayKey, setAwayKey] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedPair | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /* KÖRÖNKÉNTI NYILVÁNTARTÁS — a jelölés az aktuális körhöz kerül, a tábla
   * viszont az összes nyilvántartott kör jelölését mutatja. */
  const [marqueeStore, setMarqueeStore] = useState(() => loadMarqueeStore());
  useEffect(() => {
    setMarqueeStore(ensureMarqueeRound({ name: round.name, createdAt: round.createdAt }));
  }, [round.name, round.createdAt]);
  const marqueeRegistry = useMemo(() => marqueeRoundRegistry(marqueeStore), [marqueeStore]);

  const allPairs = useMemo(
    () => computeH2HPairs(leagueSeasons, teamAliasMap[currentLeague] ?? {}),
    [leagueSeasons, teamAliasMap, currentLeague]
  );

  const recommendedWeights = useMemo(
    () => computeAutoTeamWeights(leagueMatches, currentLeague),
    [leagueMatches, currentLeague]
  );

  const teamPool = useMemo(
    () => buildTeamPool(leagueSeasons, currentLeague, teamAliasMap[currentLeague] ?? {}),
    [leagueSeasons, currentLeague, teamAliasMap]
  );

  // One team can never be both sides of the same fixture, so each dropdown
  // excludes the other's selection outright rather than validating afterwards.
  const excludedFromHome = useMemo(() => new Set(awayKey ? [awayKey] : []), [awayKey]);
  const excludedFromAway = useMemo(() => new Set(homeKey ? [homeKey] : []), [homeKey]);

  const displayOf = (key: string): string =>
  teamPool.find((t) => t.key === key)?.display ?? key;

  /** The selected fixture orientation is the complete H2H scope. */
  const pairs = useMemo(() => {
    if (!applied) return allPairs;
    return allPairs.filter(
      (p) => p.homeKey === applied.home && p.awayKey === applied.away
    );
  }, [allPairs, applied]);

  const summary = useMemo(
    () => applied ? summarizeMatchup(allPairs, applied.home, applied.away, displayOf) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPairs, applied, teamPool]
  );

  /* RANGADÓ — a megjelölés a kártyáról jön, a kockázat a párosítás SAJÁT,
   * már meglévő H2H profiljából. Új számítás nincs: ugyanaz a
   * `computeH2HGoalProfile` / `assessBttsPairRisk` pár fut, mint az elemzésben. */
  const marqueeOn =
  applied ? isMarqueePair(marqueeRegistry, currentLeague, applied.home, applied.away) : false;

  const marqueeVerdict = useMemo(() => {
    if (!applied) return null;
    const pairIndex = new Map(allPairs.map((p) => [p.id, p]));
    const { meetings, usedReverse } = collectMeetings(pairIndex, applied.home, applied.away);
    if (meetings.length === 0) {
      return assessMarqueeRisk({ registered: marqueeOn, profile: null, risk: null });
    }
    const profile = computeH2HGoalProfile(
      meetings,
      computeLeagueBaselines(allPairs),
      usedReverse
    );
    /* A modell-oldali kiütés-becslés a forduló-elemzésből jön; a H2H oldalon
     * csak a történeti profil áll rendelkezésre, ezért `risk` itt nincs. */
    return assessMarqueeRisk({ registered: marqueeOn, profile, risk: null });
  }, [allPairs, applied, marqueeOn]);

  const toggleMarquee = (next: boolean) => {
    if (!applied) return;
    setMarqueePair(currentLeague, applied.home, applied.away, next);
    setMarqueeStore(loadMarqueeStore());
  };

  const run = () => {
    if (!homeKey || !awayKey) return;
    setApplied({ home: homeKey, away: awayKey });
    setExpanded(new Set([`${homeKey}___${awayKey}`]));
  };

  const reset = () => {
    setApplied(null);
    setHomeKey(null);
    setAwayKey(null);
    setExpanded(new Set());
  };

  const totals = useMemo(() => {
    const totalMatches = allPairs.reduce((a, p) => a + p.played, 0);
    const totalGoals = allPairs.reduce((a, p) => a + p.totalGoals, 0);
    return {
      totalMatches,
      avgGoals: totalMatches > 0 ? totalGoals / totalMatches : null,
      top: allPairs[0] ?? null
    };
  }, [allPairs]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else
      next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader icon={Swords} title="H2H — egymás elleni mérkőzések" intro={INTRO} />

      <MetricGrid>
        <MetricCard
          icon={Users}
          label="Egyedi csapatpárok"
          value={allPairs.length}
          sub="Az aktív ligában" />
        
        <MetricCard
          icon={Repeat}
          label="Legtöbbször játszott pár"
          value={totals.top ? `${totals.top.homeDisplay} – ${totals.top.awayDisplay}` : '—'}
          valueClassName="text-ui-lg font-medium leading-snug"
          tone="signal"
          sub={`${totals.top ? totals.top.played : 0} mérkőzés`} />
        
        <MetricCard
          icon={Swords}
          label="Összes H2H mérkőzés"
          value={totals.totalMatches}
          sub="Betöltött szezonok összesen" />
        
        <MetricCard
          icon={Goal}
          label="Átlagos gólszám / meccs"
          value={totals.avgGoals !== null ? totals.avgGoals.toFixed(2) : '—'}
          tone="signal"
          sub="Az összes H2H párra vetítve" />
        
      </MetricGrid>

      {/* --- Selection ------------------------------------------------------ */}
      <Panel>
        <PanelHeader>
          <PanelTitle>Csapatpár kiválasztása</PanelTitle>
          {applied ?
          <button type="button" className="btn btn--ghost btn--sm tap" onClick={reset}>
              Szűrő törlése
            </button> :
          null}
        </PanelHeader>

        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
          <p className="max-w-prose text-ui-xs leading-relaxed text-muted-foreground">
            A kiválasztott csapat automatikusan kikerül a másik listából — ugyanaz a csapat nem
            lehet egyszerre hazai és vendég.
          </p>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-ui-xs text-muted-foreground">Hazai</span>
              <TeamSelect
                value={homeKey}
                options={teamPool}
                excluded={excludedFromHome}
                placeholder="Hazai csapat kiválasztása"
                disabled={teamPool.length === 0}
                onChange={setHomeKey} />
              
            </label>

            <span
              className="hidden shrink-0 pb-2.5 text-ui-xs text-muted-foreground lg:block"
              aria-hidden="true">
              
              vs
            </span>

            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-ui-xs text-muted-foreground">Vendég</span>
              <TeamSelect
                value={awayKey}
                options={teamPool}
                excluded={excludedFromAway}
                placeholder="Vendég csapat kiválasztása"
                disabled={teamPool.length === 0}
                onChange={setAwayKey} />
              
            </label>

            <button
              type="button"
              className="btn btn--signal btn--sm tap w-full shrink-0 gap-1.5 lg:w-auto"
              disabled={!homeKey || !awayKey}
              onClick={run}>
              
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Futtatás
            </button>
          </div>

          <p
            className={`text-ui-xs ${applied ? 'text-signal' : 'text-muted-foreground'}`}
            role="status">
            
            {applied ?
            `${displayOf(applied.home)} (H) – ${displayOf(applied.away)} (V) · 1 irány, összesen ${pairs.reduce(
              (acc, p) => acc + p.played,
              0
            )} találkozó` :
            teamPool.length === 0 ?
            'Nincs betöltött csapat az aktív ligában — töltsd fel a CSV-t a Taktikai Stúdióban.' :
            `${teamPool.length} csapat közül választhatsz · futtatás nélkül az összes csapatpár látszik`}
          </p>
        </div>
      </Panel>

      {/* --- The verdict --------------------------------------------------- */}
      {summary && summary.played > 0 && applied ?
      <>
          <SectionHeading hint="Kizárólag a kiválasztott hazai → vendég irány">
            Összecsapás mérlege
          </SectionHeading>
          <MatchupHeader
          summary={summary}
          homeRecommendedWeight={recommendedWeights[applied.home]?.recommendedWeight ?? null}
          awayRecommendedWeight={recommendedWeights[applied.away]?.recommendedWeight ?? null}
          marqueeOn={marqueeOn}
          onToggleMarquee={toggleMarquee}
          marqueeVerdict={marqueeVerdict} />
        
        </> :
      null}

      {/* --- Rangadók körönként ------------------------------------------- */}
      <SectionHeading hint="Az aktuális és a korábbi körök jelölései">
        Rangadó nyilvántartás
      </SectionHeading>
      <MarqueeRoundsTable
        store={marqueeStore}
        league={currentLeague}
        displayOf={displayOf} />

      {/* --- The detail ---------------------------------------------------- */}
      <SectionHeading hint="Egyirányú bontás">Csapatpárok — kumulatív statisztika</SectionHeading>
      <Panel>
        <PanelHeader>
          <PanelTitle as="h3">Csapatpárok</PanelTitle>
          <span className="text-ui-xs text-muted-foreground">
            Nyisd le egy sort a részletes mérkőzés-listáért
          </span>
        </PanelHeader>

        <H2HPairTable
          pairs={pairs}
          expanded={expanded}
          onToggle={toggle}
          empty={
          allPairs.length === 0 ?
          'Nincs betöltött mérkőzés az aktív ligában.' :
          'A kiválasztott hazai → vendég irányban nincs betöltött találkozó.'
          } />
        
      </Panel>
    </div>);

}