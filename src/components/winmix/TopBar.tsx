import React from 'react';
import { DownloadCloud, Loader2, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LEAGUES, LEAGUE_FLAG, LEAGUE_LABEL } from '../../data/leagues';
import { cn } from '../../lib/utils';
import { cloudEndpointSummary, probeCloudTier, type CloudTierHealth } from '../../utils/supabaseTier';
import type { League } from '../../types/winmix';

interface TopBarProps {
  league: League;
  onLeagueChange: (league: League) => void;
  onRunPipeline: () => void;
  /** A rögzített távoli mérkőzés-CSV készlet betöltése. */
  onLoadMatches: () => void;
  onClearAll: () => void;
  busy: boolean;
  loadingMatches: boolean;
}

export function TopBar({
  league,
  onLeagueChange,
  onRunPipeline,
  onLoadMatches,
  onClearAll,
  busy,
  loadingMatches
}: TopBarProps) {
  const endpoint = cloudEndpointSummary();
  const [health, setHealth] = useState<CloudTierHealth>(() => ({
    status: endpoint ? 'probing' : 'unconfigured',
    degraded: false,
    lastError: null,
    checkedAt: null,
  }));

  useEffect(() => {
    let active = true;
    void probeCloudTier().then((nextHealth) => {
      if (active) setHealth(nextHealth);
    });
    return () => {
      active = false;
    };
  }, []);

  const cloudLabel = health.status === 'online'
    ? 'Supabase: connected'
    : health.status === 'degraded'
      ? 'Supabase: error'
      : health.status === 'probing'
        ? 'Supabase: checking'
        : 'Supabase: not configured';

  return (
    <header className="z-30 flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-2 px-4 py-2.5 md:flex-nowrap md:px-6 md:py-0">
      <div className="min-w-0">
        <p className="text-ui-xs text-muted-foreground">winmix · match intelligence</p>
        <h2 className="truncate text-ui-lg font-semibold tracking-tight text-foreground">
          WinMix Studio
        </h2>
      </div>

      <div className="hidden h-8 w-px bg-border-subtle sm:block" aria-hidden="true" />

      <div role="group" aria-label="Liga választó" className="seg">
        {LEAGUES.map((l) => {
          const isActive = league === l;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={isActive}
              onClick={() => onLeagueChange(l)}
              className={cn('seg-tab', isActive && 'is-active')}>
              
              <span aria-hidden="true">{LEAGUE_FLAG[l]}</span>
              {LEAGUE_LABEL[l]}
            </button>);

        })}
      </div>

      <div
        className={cn(
          'hidden max-w-64 truncate rounded-md border px-2 py-1 text-ui-xs sm:block',
          health.status === 'online' && 'border-emerald-500/30 text-emerald-700',
          health.status === 'degraded' && 'border-red-500/30 text-red-700',
          health.status !== 'online' && health.status !== 'degraded' && 'border-border-subtle text-muted-foreground',
        )}
        title={health.lastError ?? endpoint?.url ?? 'Supabase konfiguráció hiányzik'}
        role="status"
      >
        {cloudLabel}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="btn btn--outline btn--sm"
          onClick={onLoadMatches}
          disabled={busy || loadingMatches}
          title="Az angol (19) és spanyol (18) szezon-CSV betöltése a távoli tárolóból">
          
          {loadingMatches ?
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> :

          <DownloadCloud className="h-3.5 w-3.5" aria-hidden="true" />
          }
          <span className="hidden sm:inline">
            {loadingMatches ? 'Betöltés…' : 'Mérkőzések betöltése'}
          </span>
        </button>
        <button
          type="button"
          className="btn btn--signal btn--sm"
          onClick={onRunPipeline}
          disabled={busy}
          title="As-of walk-forward predikciók és prequenciális kalibráció újrafuttatása">
          
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Pipeline futtatás</span>
        </button>
        <button
          type="button"
          className="btn btn--danger btn--sm"
          onClick={onClearAll}
          title="Minden adat törlése"
          aria-label="Minden adat törlése">
          
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </header>);

}
