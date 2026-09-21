/**
 * AI CONDUCTOR — felügyeleti réteg a determinisztikus mag fölé.
 *
 * NEM új előrejelző modell. Ez a modul a meglévő determinisztikus trace
 * számaiból olvas, és three dolgot tesz:
 *   1. Liga-állapot monitor — a legutóbbi meccsek BTTS arányát a liga
 *      bázisvárható értékéhez viszonyítja, és sárga/piros riasztást ad,
 *      ha szignifikáns negatív drift áll be.
 *   2. Dinamikus stratégiai ajánló — ha egy fordulóban 0 core kártya
 *      töltött be, felajánlja a biztonsági trendeket vagy az Over piacot.
 *   3. Természetes nyelvű indoklás — a trace számaiból 1-2 mondatos
 *      magyar összefoglalót generál a kártyákra.
 */

import type { PatternHit } from '../types/winmix';
import type { QuadrantExplain } from './quadrantExplain';

/* -------------------------------------------------------------------------- *
 * 1. LIGA-ÁLLAPOT MONITOR
 * -------------------------------------------------------------------------- */

export type DriftAlertLevel = 'green' | 'yellow' | 'red';

export interface DriftAlert {
  level: DriftAlertLevel;
  bttsRate: number;
  baseline: number;
  drift: number;
  sample: number;
  message: string;
}

/** Liga BTTS bázisvárható érték (shrinkage prior). */
const LEAGUE_BTTS_BASELINE = 0.49;

/** Sárga riasztás küszöbe: a drift eléri a -10 százalékpontot. */
const YELLOW_DRIFT_PP = 0.10;
/** Piros riasztás küszöbe: a drift eléri a -15 százalékpontot. */
const RED_DRIFT_PP = 0.15;
/** Minimum mintaméret a riasztáshoz. */
const DRIFT_MIN_SAMPLE = 12;

export function assessLeagueBttsDrift(
  recentBttsRate: number,
  recentSample: number,
  baseline: number = LEAGUE_BTTS_BASELINE
): DriftAlert {
  const drift = recentBttsRate - baseline;

  if (recentSample < DRIFT_MIN_SAMPLE) {
    return {
      level: 'green',
      bttsRate: recentBttsRate,
      baseline,
      drift,
      sample: recentSample,
      message: `Minta túl kicsi (${recentSample} meccs a ${DRIFT_MIN_SAMPLE} küszöb alatt) — nincs drift-értékelés.`
    };
  }

  if (drift <= -RED_DRIFT_PP) {
    return {
      level: 'red',
      bttsRate: recentBttsRate,
      baseline,
      drift,
      sample: recentSample,
      message:
        `Jelentős negatív BTTS drift: az utóbbi ${recentSample} meccs ` +
        `${(recentBttsRate * 100).toFixed(1)}% BTTS a liga bázis ` +
        `${(baseline * 100).toFixed(1)}% ellenében (${(drift * 100).toFixed(1)} pp). ` +
        'A Core 1 slot fokozott óvatosságot igényel.'
    };
  }

  if (drift <= -YELLOW_DRIFT_PP) {
    return {
      level: 'yellow',
      bttsRate: recentBttsRate,
      baseline,
      drift,
      sample: recentSample,
      message:
        `Mérsékelt negatív BTTS drift: ${recentSample} meccs alapján ` +
        `${(recentBttsRate * 100).toFixed(1)}% a bázis ${(baseline * 100).toFixed(1)}% ` +
        `ellenében (${(drift * 100).toFixed(1)} pp).`
    };
  }

  return {
    level: 'green',
    bttsRate: recentBttsRate,
    baseline,
    drift,
    sample: recentSample,
    message: `BTTS arány stabil: ${(recentBttsRate * 100).toFixed(1)}% a bázis ${(baseline * 100).toFixed(1)}% közelében.`
  };
}

/* -------------------------------------------------------------------------- *
 * 2. DINAMIKUS STRATÉGIAI AJÁNLÓ
 * -------------------------------------------------------------------------- */

export interface StrategyFallback {
  active: boolean;
  recommendation: string;
  alternativeCodes: string[];
}

/**
 * Ha egy fordulóban 0 core kártya töltött be, felajánl alternatív piacokat.
 */
export function recommendFallback(
  coreFilled: number,
  coreSlots: number,
  availablePatterns: PatternHit[]
): StrategyFallback {
  if (coreFilled > 0) {
    return { active: false, recommendation: '', alternativeCodes: [] };
  }

  const safetyTrends = availablePatterns.filter((p) => p.type === 'safety_trend');
  const overMarkets = availablePatterns.filter(
    (p) => p.code === 'O1.5' || p.code === 'O2.5'
  );

  if (safetyTrends.length > 0) {
    return {
      active: true,
      recommendation:
        'Nincs tiszta BTTS jelölt ebben a fordulóban. Biztonsági trend (1X / 12) ' +
        'elérhető — ezek alacsonyabb hozamú, de stabilabb piacok.',
      alternativeCodes: ['1X', '12']
    };
  }

  if (overMarkets.length > 0) {
    return {
      active: true,
      recommendation:
        'Nincs tiszta BTTS jelölt. Over 1.5 / Over 2.5 piac elérhető — ' +
        'a gólszám-alapú alternatíva alacsonyabb kockázatú, mint a BLTS.',
      alternativeCodes: ['O1.5', 'O2.5']
    };
  }

  return {
    active: true,
    recommendation:
      'Ebben a fordulóban sem BTTS, sem trend, sem Over piac nem éri el a küszöböt. ' +
      'A szelvény üresen marad — ez a helyes döntés, nem a hármas szám kedvéért kell sort erőltetni.',
    alternativeCodes: []
  };
}

/* -------------------------------------------------------------------------- *
 * 3. TERMÉSZETES NYELVŰ INDOKLÁS
 * -------------------------------------------------------------------------- */

/**
 * 1-2 mondatos magyar összefoglaló egy kártyára, a trace számaiból.
 */
export function explainCard(pattern: PatternHit, explain: QuadrantExplain | null): string {
  const parts: string[] = [];

  const h2hPct = Math.round(pattern.hitRate * 100);
  const ess = pattern.effectiveSampleSize.toFixed(1);
  const band = pattern.band ?? '—';

  if (pattern.coreEvidence?.level === 'calibrated') {
    parts.push(
      `A H2H arány ${h2hPct}%, a saját sáv visszamérve és kalibrált ` +
      `(ESS ${ess}, sáv ${band}).`
    );
  } else if (pattern.coreEvidence?.level === 'conditional') {
    parts.push(
      `A H2H arány ${h2hPct}%, de a sáv még nincs visszamérve ` +
      `(feltételes evidencia, ESS ${ess}).`
    );
  } else if (pattern.coreEvidence?.level === 'excluded') {
    parts.push(
      `A H2H arány ${h2hPct}%, de a saját sáv CÁFOLT (ESS ${ess}) — ` +
      'a Phase 6 kapu inaktív, ezért csak figyelmeztetés.'
    );
  } else {
    parts.push(`A H2H arány ${h2hPct}% (ESS ${ess}, sáv ${band}).`);
  }

  if (explain && explain.terms) {
    const t = explain.terms;
    if (t.sharpness < 0.15) {
      parts.push('Az élesség alacsony — a H2H arány közel van az 50%-hoz.');
    } else if (t.sharpness > 0.4) {
      parts.push('Az élesség erős — a H2H arány jelentősen eltér az 50%-tól.');
    }
    if (t.agreement < 0.3) {
      parts.push('A modell és a H2H eltér — a jelzés bizonytalan.');
    }
  }

  if (pattern.bttsRisk?.wouldVeto) {
    parts.push('A kiütés-profil riasztást ad.');
  }

  return parts.join(' ');
}
