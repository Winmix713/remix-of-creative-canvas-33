import React, { useMemo } from 'react';
import { cn } from '../../../lib/utils';
import {
  Table,
  TableScroll,
  Td,
  TdLabel,
  TeamBadge,
  Th,
  Tr,
} from '../DataTable';
import {
  Panel,
  PanelHeader,
} from '../Panel';
import {
  computeResultMatrix,
  type ResultMatrixCell,
} from '../../../utils/leagueStats';

export type TeamPoolRow = {
  key: string;
  display: string;
  played: number;
};

function TeamSelect({
  label,
  value,
  teamPool,
  excludeKey,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string | null;
  teamPool: TeamPoolRow[];
  excludeKey: string | null;
  onChange: (key: string | null) => void;
  ariaLabel: string;
}) {
  const availableTeams = useMemo(
    () =>
      teamPool.filter(
        (team) => team.key !== excludeKey,
      ),
    [teamPool, excludeKey],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label className="text-ui-xs text-muted-foreground">
        {label}
      </label>

      <select
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value || null)
        }
        aria-label={ariaLabel}
        disabled={teamPool.length === 0}
        className={cn(
          'h-9 w-full rounded-lg border border-border bg-surface-1 px-3 text-ui-sm text-foreground outline-none transition-colors',
          'focus:border-signal focus:ring-1 focus:ring-signal/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <option value="">
          {teamPool.length === 0
            ? '— Nincs csapat —'
            : '— Válassz csapatot —'}
        </option>

        {availableTeams.map((team) => (
          <option
            key={team.key}
            value={team.key}
          >
            {team.display}
          </option>
        ))}
      </select>
    </div>
  );
}

function cellBg(outcome: 'W' | 'D' | 'L'): string {
  if (outcome === 'W') return 'bg-positive-soft';
  if (outcome === 'D') return 'bg-white/[0.06]';
  return 'bg-negative-soft';
}

function outcomeColor(outcome: 'W' | 'D' | 'L'): string {
  if (outcome === 'W') return 'text-positive';
  if (outcome === 'D') return 'text-muted-foreground';
  return 'text-negative';
}

function MatrixCell({
  cell,
}: {
  cell: ResultMatrixCell | null;
}) {
  if (!cell) {
    return (
      <span className="text-ui-xs text-muted-foreground">
        —
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-ui-xs font-medium tabular-nums',
        cellBg(cell.outcome),
        outcomeColor(cell.outcome),
      )}
    >
      {cell.homeScore} : {cell.awayScore}
    </span>
  );
}

export function ResultMatrixSection({
  teamPool,
  matrixTeamKey,
  onMatrixTeamChange,
  resultMatrix,
}: {
  teamPool: TeamPoolRow[];
  matrixTeamKey: string | null;
  onMatrixTeamChange: (key: string | null) => void;
  resultMatrix: ReturnType<
    typeof computeResultMatrix
  > | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <TeamSelect
              label="Csapat kiválasztása"
              value={matrixTeamKey}
              teamPool={teamPool}
              excludeKey={null}
              onChange={onMatrixTeamChange}
              ariaLabel="Eredménymátrix csapat kiválasztása"
            />

            {resultMatrix ? (
              <span className="text-ui-xs text-muted-foreground">
                {resultMatrix.teamName} —{' '}
                {resultMatrix.rows.length} ellenfél
              </span>
            ) : null}
          </div>
        </PanelHeader>
      </Panel>

      {resultMatrix &&
      resultMatrix.rows.length > 0 ? (
        <Panel>
          <TableScroll>
            <Table minWidth={480}>
              <thead>
                <tr>
                  <Th className="pl-4">
                    Ellenfél
                  </Th>

                  <Th align="center">
                    Hazai eredmény
                  </Th>

                  <Th align="center">
                    Idegenbeli eredmény
                  </Th>
                </tr>
              </thead>

              <tbody>
                {resultMatrix.rows.map((row) => (
                  <Tr key={row.opponentKey}>
                    <TdLabel className="pl-4">
                      <span className="flex items-center gap-2">
                        <TeamBadge
                          name={row.opponentName}
                        />

                        <span className="truncate">
                          {row.opponentName}
                        </span>
                      </span>
                    </TdLabel>

                    <Td align="center">
                      <MatrixCell cell={row.home} />
                    </Td>

                    <Td align="center">
                      <MatrixCell cell={row.away} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </Panel>
      ) : null}
    </div>
  );
}
