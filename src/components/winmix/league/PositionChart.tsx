import React from 'react';

export type PositionHistoryTeam = {
  key: string;
  displayName: string;
  history: {
    round: number;
    position: number;
  }[];
};

/** Plot area inside the 0..100 viewBox: markers never touch or cross the edge. */
export const CHART_PAD = 5;
const SPAN = 100 - 2 * CHART_PAD;

export const chartX = (round: number, maxRound: number): number =>
  maxRound <= 1 ? 50 : CHART_PAD + ((round - 1) / (maxRound - 1)) * SPAN;

export const chartY = (position: number, maxPos: number): number => {
  const denominator = Math.max(maxPos, 1);
  return denominator === 1 ? 50 : CHART_PAD + ((position - 1) / (denominator - 1)) * SPAN;
};

export function PositionChart({
  a,
  b,
  aLabel,
  bLabel,
}: {
  a: PositionHistoryTeam | null;
  b: PositionHistoryTeam | null;
  aLabel: string;
  bLabel: string;
}) {
  const maxRound = Math.max(a?.history.length ?? 0, b?.history.length ?? 0);

  if (maxRound === 0) {
    return (
      <div className="py-6 text-center text-ui-sm text-muted-foreground">
        Nincs elérhető helyezés-adat.
      </div>
    );
  }

  const maxPos = Math.max(
    ...(a?.history.map((item) => item.position) ?? []),
    ...(b?.history.map((item) => item.position) ?? []),
    1,
  );

  const toPoints = (history: PositionHistoryTeam['history']): string =>
    history
      .map((item) => `${chartX(item.round, maxRound)},${chartY(item.position, maxPos)}`)
      .join(' ');

  const aPoints = a ? toPoints(a.history) : '';
  const bPoints = b ? toPoints(b.history) : '';

  return (
    <div>
      <div className="relative h-48 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-1">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label="Tabellapozíció alakulása fordulónként"
        >
          {aPoints ? (
            <polyline
              points={aPoints}
              fill="none"
              stroke="var(--signal)"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {bPoints ? (
            <polyline
              points={bPoints}
              fill="none"
              stroke="var(--warning)"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>

        {/* HTML markers: percentage-positioned, so they stay circular under preserveAspectRatio="none". */}
        {a?.history.map((item) => (
          <div
            key={`a-${item.round}`}
            data-testid="chart-dot-a"
            aria-hidden="true"
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal"
            style={{
              left: `${chartX(item.round, maxRound)}%`,
              top: `${chartY(item.position, maxPos)}%`,
            }}
          />
        ))}

        {b?.history.map((item) => (
          <div
            key={`b-${item.round}`}
            data-testid="chart-dot-b"
            aria-hidden="true"
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning"
            style={{
              left: `${chartX(item.round, maxRound)}%`,
              top: `${chartY(item.position, maxPos)}%`,
            }}
          />
        ))}

        <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1">
          {a ? (
            <div className="flex items-center gap-1.5 text-ui-xs">
              <span className="h-0.5 w-4 bg-signal" />
              <span className="text-foreground">{aLabel}</span>
            </div>
          ) : null}

          {b ? (
            <div className="flex items-center gap-1.5 text-ui-xs">
              <span className="h-0.5 w-4 bg-warning" />
              <span className="text-foreground">{bLabel}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex justify-between text-ui-xs text-muted-foreground">
        <span>1. forduló</span>
        <span>{maxRound}. forduló</span>
      </div>

      <div className="mt-1 text-ui-xs text-muted-foreground">
        <span className="mr-2">Felül = 1. hely</span>
        <span>Alul = {maxPos}. hely</span>
      </div>
    </div>
  );
}
