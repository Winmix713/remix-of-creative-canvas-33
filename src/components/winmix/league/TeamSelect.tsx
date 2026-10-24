import React, { useId, useMemo } from 'react';
import { cn } from '../../../lib/utils';

export type TeamPoolRow = {
  key: string;
  display: string;
  played: number;
};

export interface TeamSelectProps {
  label: string;
  value: string | null;
  teamPool: TeamPoolRow[];
  excludeKey: string | null;
  onChange: (key: string | null) => void;
  ariaLabel: string;
}

/** Single shared team dropdown. The visible <label> is bound to the <select> via useId. */
export function TeamSelect({
  label,
  value,
  teamPool,
  excludeKey,
  onChange,
  ariaLabel,
}: TeamSelectProps) {
  const selectId = useId();

  const availableTeams = useMemo(
    () => teamPool.filter((team) => team.key !== excludeKey),
    [teamPool, excludeKey],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={selectId} className="text-ui-xs text-muted-foreground">
        {label}
      </label>

      <select
        id={selectId}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label={ariaLabel}
        disabled={teamPool.length === 0}
        className={cn(
          'h-9 w-full rounded-lg border border-border bg-surface-1 px-3 text-ui-sm text-foreground outline-none transition-colors',
          'focus:border-signal focus:ring-1 focus:ring-signal/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <option value="">
          {teamPool.length === 0 ? '— Nincs csapat —' : '— Válassz csapatot —'}
        </option>

        {availableTeams.map((team) => (
          <option key={team.key} value={team.key}>
            {team.display}
          </option>
        ))}
      </select>
    </div>
  );
}
