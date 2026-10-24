import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockSyncSlipsToCloud = vi.fn();

vi.mock('../src/utils/slipCloudSync', () => ({
  SLIP_CLOUD_SYNC_ENABLED: true,
  syncSlipsToCloud: (...args: unknown[]) => mockSyncSlipsToCloud(...args),
}));

import { LedgerSyncStatus } from '../src/components/winmix/LedgerSyncStatus';
import type { Slip } from '../src/types/winmix';

const sampleSlips: Slip[] = [
  {
    id: 's1',
    createdAt: '2026-01-01T00:00:00Z',
    roundName: 'R1',
    combinedProb: 0.5,
    lines: [],
  },
];

describe('LedgerSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders status chip and sync button when flag is on', () => {
    render(<LedgerSyncStatus slips={sampleSlips} />);
    expect(screen.getByText('1 függő')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Szinkronizálás/ })
    ).toBeTruthy();
  });

  it('calls syncSlipsToCloud once when button clicked', async () => {
    mockSyncSlipsToCloud.mockResolvedValue({ synced: 1, errors: [] });
    render(<LedgerSyncStatus slips={sampleSlips} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Szinkronizálás/ })
    );
    await waitFor(() => {
      expect(mockSyncSlipsToCloud).toHaveBeenCalledTimes(1);
      expect(mockSyncSlipsToCloud).toHaveBeenCalledWith(sampleSlips);
    });
  });

  it('shows error state when sync returns errors', async () => {
    mockSyncSlipsToCloud.mockResolvedValue({
      synced: 0,
      errors: ['network error'],
    });
    render(<LedgerSyncStatus slips={sampleSlips} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Szinkronizálás/ })
    );
    await waitFor(() => {
      expect(screen.getByText('1 hiba')).toBeTruthy();
    });
  });

  it('shows synced state when sync succeeds', async () => {
    mockSyncSlipsToCloud.mockResolvedValue({ synced: 1, errors: [] });
    render(<LedgerSyncStatus slips={sampleSlips} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Szinkronizálás/ })
    );
    await waitFor(() => {
      expect(screen.getByText('1 szinkronizálva')).toBeTruthy();
    });
  });

  it('disables button when no slips', () => {
    render(<LedgerSyncStatus slips={[]} />);
    const btn = screen.getByRole('button', { name: /Szinkronizálás/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
