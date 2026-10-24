import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ResultMatrixSection,
  type TeamPoolRow,
} from '../src/components/winmix/league/ResultMatrixSection';

const teamPool: TeamPoolRow[] = [
  { key: 'chelsea', display: 'Chelsea', played: 10 },
  { key: 'london agyuk', display: 'London Ágyúk', played: 10 },
  { key: 'vörös ördögök', display: 'Vörös Ördögök', played: 10 },
];

describe('ResultMatrixSection', () => {
  it('renders team select with pool options', () => {
    render(
      <ResultMatrixSection
        teamPool={teamPool}
        matrixTeamKey={null}
        onMatrixTeamChange={() => {}}
        resultMatrix={null}
      />,
    );
    expect(screen.getByLabelText('Eredménymátrix csapat kiválasztása')).toBeTruthy();
    expect(screen.getByText('Chelsea')).toBeTruthy();
    expect(screen.getByText('London Ágyúk')).toBeTruthy();
  });

  it('renders empty state when no team selected', () => {
    const { container } = render(
      <ResultMatrixSection
        teamPool={teamPool}
        matrixTeamKey={null}
        onMatrixTeamChange={() => {}}
        resultMatrix={null}
      />,
    );
    expect(container.textContent).not.toContain('ellenfél');
  });

  it('renders matrix rows when resultMatrix is provided', () => {
    render(
      <ResultMatrixSection
        teamPool={teamPool}
        matrixTeamKey="chelsea"
        onMatrixTeamChange={() => {}}
        resultMatrix={{
          teamName: 'Chelsea',
          teamKey: 'chelsea',
          rows: [
            {
              opponentKey: 'london agyuk',
              opponentName: 'London Ágyúk',
              home: { homeScore: 2, awayScore: 1, outcome: 'W', date: '2026-01-01' },
              away: { homeScore: 0, awayScore: 3, outcome: 'L', date: '2026-02-01' },
            },
            {
              opponentKey: 'vörös ördögök',
              opponentName: 'Vörös Ördögök',
              home: { homeScore: 1, awayScore: 1, outcome: 'D', date: '2026-01-15' },
              away: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Chelsea — 2 ellenfél')).toBeTruthy();
    expect(screen.getAllByText('London Ágyúk').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 : 1')).toBeTruthy();
    expect(screen.getByText('0 : 3')).toBeTruthy();
    expect(screen.getByText('1 : 1')).toBeTruthy();
  });

  it('renders dash for null cells', () => {
    render(
      <ResultMatrixSection
        teamPool={teamPool}
        matrixTeamKey="chelsea"
        onMatrixTeamChange={() => {}}
        resultMatrix={{
          teamName: 'Chelsea',
          teamKey: 'chelsea',
          rows: [
            {
              opponentKey: 'vörös ördögök',
              opponentName: 'Vörös Ördögök',
              home: null,
              away: null,
            },
          ],
        }}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
