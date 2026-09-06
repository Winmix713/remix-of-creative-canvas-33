import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { h2hFormTail } from '../../utils/h2h';
import type { H2HPair } from '../../types/winmix';
import { DataGrid, type GridColumn } from './DataGrid';

interface H2HPairTableProps {
  pairs: H2HPair[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
  empty: React.ReactNode;
}

function MatchList({ pair }: {pair: H2HPair;}) {
  return (
    <ul className="flex flex-col gap-1.5 lg:divide-y lg:divide-border/60">
      {pair.matches.map((m, idx) =>
      <li
        key={`${pair.id}-${idx}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-elevated/40 px-3 py-2 text-ui-xs lg:rounded-none lg:bg-transparent lg:px-3">
        
          <span className="font-mono text-muted-foreground">{m.seasonName}</span>
          <span className="font-medium text-foreground">
            {m.home_team}{' '}
            <b className="font-mono tabular-nums">
              {m.home_score}–{m.away_score}
            </b>{' '}
            {m.away_team}
          </span>
          <span className="font-mono text-muted-foreground">{m.date || '—'}</span>
          <span className="font-mono text-muted-foreground">Σ {m.total_goals}</span>
          <span className={cn('font-mono', m.btts ? 'text-positive' : 'text-muted-foreground')}>
            {m.btts ? 'BTTS ✔' : 'BTTS ✘'}
          </span>
        </li>
      )}
    </ul>);

}

/**
 * The nine-column pair table, extracted from the page and moved onto DataGrid
 * so it collapses to a card list below `lg` instead of demanding a 1080px
 * horizontal scroll on a phone.
 */
export function H2HPairTable({ pairs, expanded, onToggle, empty }: H2HPairTableProps) {
  const columns = useMemo<GridColumn<H2HPair>[]>(
    () => [
    {
      key: 'pair',
      label: 'Csapatpár (Hazai – Vendég)',
      primary: true,
      cell: (p) =>
      <span className="flex min-w-0 items-center gap-1.5 font-sans font-bold text-foreground">
            <span className="truncate">{p.homeDisplay}</span>
            <span className="shrink-0 font-normal text-muted-foreground">(H)</span>
            <span className="shrink-0 text-muted-foreground">–</span>
            <span className="truncate">{p.awayDisplay}</span>
            <span className="shrink-0 font-normal text-muted-foreground">(V)</span>
          </span>

    },
    {
      key: 'played',
      label: 'Lejátszott',
      cardLabel: 'Meccs',
      align: 'center',
      secondary: true,
      cell: (p) => <span className="font-extrabold text-signal">{p.played}</span>
    },
    {
      key: 'form',
      label: 'Forma (hazai, utolsó 5)',
      cardLabel: 'Forma',
      align: 'center',
      cell: (p) =>
      <span className="text-ui-xs">{h2hFormTail(p).join('-') || '—'}</span>

    },
    {
      key: 'wdl',
      label: 'GY / D / V',
      align: 'center',
      cell: (p) => `${p.winsHome} / ${p.draws} / ${p.winsAway}`
    },
    {
      key: 'goals',
      label: 'Gólok (össz.)',
      cardLabel: 'Gólok',
      align: 'center',
      cell: (p) => `${p.goalsHome}–${p.goalsAway} (Σ${p.totalGoals})`
    },
    {
      key: 'avg',
      label: 'Átl. gól/meccs',
      cardLabel: 'Átl. gól',
      align: 'center',
      cell: (p) => p.avgGoals.toFixed(2)
    },
    {
      key: 'btts',
      label: 'BTTS %',
      align: 'center',
      cell: (p) => `${p.bttsPct.toFixed(0)}%`
    },
    {
      key: 'over',
      label: 'Over 2.5 %',
      cardLabel: 'Over 2.5',
      align: 'center',
      cell: (p) => `${p.over25Pct.toFixed(0)}%`
    },
    {
      key: 'last',
      label: 'Utolsó találkozó',
      cardLabel: 'Utolsó',
      align: 'center',
      cell: (p) =>
      <span className="text-ui-xs">
            {p.lastMeeting ?
        `${p.lastMeeting.home_team} ${p.lastMeeting.home_score}–${p.lastMeeting.away_score} ${p.lastMeeting.away_team}` :
        '—'}
          </span>

    }],

    []
  );

  return (
    <DataGrid
      columns={columns}
      rows={pairs}
      rowKey={(p) => p.id}
      empty={empty}
      minWidth={1040}
      collapseBelow="lg"
      scrollClassName="max-h-[640px]"
      expandable={{
        isOpen: (p) => expanded.has(p.id),
        onToggle: (p) => onToggle(p.id),
        label: (p) => `${p.homeDisplay} – ${p.awayDisplay} mérkőzéslista`,
        content: (p) => <MatchList pair={p} />
      }} />);


}