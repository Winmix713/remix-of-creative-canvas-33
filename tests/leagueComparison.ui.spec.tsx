import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getComparison } from '../src/utils/compareValues';
import { CompareRow } from '../src/components/winmix/league/CompareRow';
import { TeamSelect, type TeamPoolRow } from '../src/components/winmix/league/TeamSelect';
import { ResultMatrixSection } from '../src/components/winmix/league/ResultMatrixSection';
import { PositionChart, chartX, chartY, CHART_PAD } from '../src/components/winmix/league/PositionChart';

const pool: TeamPoolRow[] = [
  { key: 'a', display: 'Alpha', played: 5 },
  { key: 'b', display: 'Beta', played: 5 },
];

describe('getComparison', () => {
  it('returns a / b / tie / null', () => {
    expect(getComparison(3, 1)).toBe('a');
    expect(getComparison(1, 3)).toBe('b');
    expect(getComparison(2, 2)).toBe('tie');
    expect(getComparison(null, 2)).toBeNull();
    expect(getComparison(2, undefined)).toBeNull();
    expect(getComparison(Number.NaN, 2)).toBeNull();
  });

  it('honours lowerIsBetter (rank, goals conceded)', () => {
    expect(getComparison(1, 5, { lowerIsBetter: true })).toBe('a');
    expect(getComparison(5, 1, { lowerIsBetter: true })).toBe('b');
    expect(getComparison(2, 2, { lowerIsBetter: true })).toBe('tie');
  });

  it('treats values equal at the displayed precision as a tie', () => {
    expect(getComparison(1.231, 1.234, { decimals: 2 })).toBe('tie');
    expect(getComparison(1.231, 1.239, { decimals: 2 })).toBe('b');
    expect(getComparison(45.04, 45.01, { decimals: 1 })).toBe('tie');
    expect(getComparison(1.4, 1.6)).toBe('b'); // default 0 decimals: 1 vs 2
  });
});

const cellClasses = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('td')).slice(1).map((td) => td.className);

describe('CompareRow', () => {
  const renderRow = (result: 'a' | 'b' | 'tie' | null) =>
    render(<table><tbody><CompareRow label="x" aVal="1" bVal="2" result={result} /></tbody></table>);

  it('tie and null render both sides neutral', () => {
    for (const r of ['tie', null] as const) {
      const { container, unmount } = renderRow(r);
      for (const c of cellClasses(container)) {
        expect(c).toContain('text-foreground');
        expect(c).not.toContain('text-positive');
        expect(c).not.toContain('text-negative');
      }
      unmount();
    }
  });

  it('winner is positive and loser negative', () => {
    const a = renderRow('a');
    let [left, right] = cellClasses(a.container);
    expect(left).toContain('text-positive');
    expect(right).toContain('text-negative');
    a.unmount();
    const b = renderRow('b');
    [left, right] = cellClasses(b.container);
    expect(left).toContain('text-negative');
    expect(right).toContain('text-positive');
  });
});

describe('TeamSelect label association', () => {
  it('binds the visible label to the select', () => {
    render(<TeamSelect label="Csapat A" value={null} teamPool={pool} excludeKey={null} onChange={() => {}} ariaLabel="Csapat A kiválasztása" />);
    const select = screen.getByLabelText('Csapat A kiválasztása') as HTMLSelectElement;
    const label = screen.getByText('Csapat A') as HTMLLabelElement;
    expect(select.id).not.toBe('');
    expect(label.htmlFor).toBe(select.id);
  });

  it('gives two selects different ids', () => {
    render(<>
      <TeamSelect label="L1" value={null} teamPool={pool} excludeKey={null} onChange={() => {}} ariaLabel="one" />
      <TeamSelect label="L2" value={null} teamPool={pool} excludeKey={null} onChange={() => {}} ariaLabel="two" />
    </>);
    expect((screen.getByLabelText('one') as HTMLSelectElement).id)
      .not.toBe((screen.getByLabelText('two') as HTMLSelectElement).id);
  });

  it('result matrix uses the shared select with a bound label', () => {
    render(<ResultMatrixSection teamPool={pool} matrixTeamKey={null} onMatrixTeamChange={() => {}} resultMatrix={null} />);
    const label = screen.getByText('Csapat kiválasztása') as HTMLLabelElement;
    const select = screen.getByLabelText('Eredménymátrix csapat kiválasztása') as HTMLSelectElement;
    expect(label.htmlFor).toBe(select.id);
  });
});

const team = (key: string, positions: number[]) => ({
  key, displayName: key, history: positions.map((position, i) => ({ round: i + 1, position })),
});

describe('PositionChart', () => {
  it('keeps every marker inside the padded plot area', () => {
    const { container } = render(
      <PositionChart a={team('a', [1, 5, 16])} b={team('b', [16, 8, 1])} aLabel="A" bLabel="B" />,
    );
    const dots = Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="chart-dot"]'));
    expect(dots).toHaveLength(6);
    for (const d of dots) {
      const left = parseFloat(d.style.left);
      const top = parseFloat(d.style.top);
      expect(left).toBeGreaterThanOrEqual(CHART_PAD);
      expect(left).toBeLessThanOrEqual(100 - CHART_PAD);
      expect(top).toBeGreaterThanOrEqual(CHART_PAD);
      expect(top).toBeLessThanOrEqual(100 - CHART_PAD);
      expect(d.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('puts a single round and a single position at the centre', () => {
    expect(chartX(1, 1)).toBe(50);
    expect(chartY(1, 1)).toBe(50);
    const { container } = render(<PositionChart a={team('a', [1])} b={null} aLabel="A" bLabel="B" />);
    const dot = container.querySelector<HTMLElement>('[data-testid="chart-dot-a"]')!;
    expect(dot.style.left).toBe('50%');
    expect(dot.style.top).toBe('50%');
  });

  it('maps first/last round and best/worst position to the padding bounds', () => {
    expect(chartX(1, 10)).toBe(CHART_PAD);
    expect(chartX(10, 10)).toBe(100 - CHART_PAD);
    expect(chartY(1, 16)).toBe(CHART_PAD);
    expect(chartY(16, 16)).toBe(100 - CHART_PAD);
  });

  it('shows plain footer labels and an empty state', () => {
    const { container, rerender } = render(<PositionChart a={team('a', [1, 2, 3])} b={null} aLabel="A" bLabel="B" />);
    expect(container.textContent).toContain('1. forduló');
    expect(container.textContent).toContain('3. forduló');
    rerender(<PositionChart a={null} b={null} aLabel="A" bLabel="B" />);
    expect(container.textContent).toContain('Nincs elérhető helyezés-adat.');
  });
});
