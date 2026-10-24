import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  fetchCurrentSealedVersion: vi.fn(),
  fetchCloudSeasonList: vi.fn(),
  fetchCloudSeasonsConcurrently: vi.fn(),
  writeCloudMarker: vi.fn(),
}));
vi.mock('../src/utils/supabaseTier', () => ({
  fetchCurrentSealedVersion: mocks.fetchCurrentSealedVersion,
  fetchCloudSeasonList: mocks.fetchCloudSeasonList,
  fetchCloudSeasonsConcurrently: mocks.fetchCloudSeasonsConcurrently,
}));
vi.mock('../src/utils/cloudFreshness', () => ({ writeCloudMarker: mocks.writeCloudMarker }));

import { bootstrapFromCloud } from '../src/utils/cloudBootstrap';
import { ViewErrorBoundary, isChunkLoadError } from '../src/components/winmix/ViewErrorBoundary';

const VERSION = { id: 'v1', revision: 1, fingerprint: 'f' };
const meta = (i: number) => ({ id: `s${i}`, fileName: `s${i}.csv` });

beforeEach(() => {
  mocks.fetchCurrentSealedVersion.mockResolvedValue(VERSION);
  mocks.fetchCloudSeasonList.mockResolvedValue([meta(1), meta(2)]);
  mocks.fetchCloudSeasonsConcurrently.mockImplementation(async (metas: ReturnType<typeof meta>[]) =>
    metas.map((m) => ({ meta: m, csvText: 'date,home_team,away_team' })));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('bootstrapFromCloud', () => {
  it('imports with skipCloudSync and writes the marker only when the import succeeded', async () => {
    const importFiles = vi.fn().mockResolvedValue({ ok: true, added: 2 });
    const onStart = vi.fn();
    const status = await bootstrapFromCloud({ importFiles, onStart });
    expect(status).toBe('imported');
    expect(onStart).toHaveBeenCalledWith(2);
    expect(importFiles).toHaveBeenCalledTimes(1);
    const [files, mode, options] = importFiles.mock.calls[0];
    expect(files).toHaveLength(2);
    expect(mode).toBe('auto');
    expect(options).toEqual({ skipCloudSync: true });
    expect(mocks.writeCloudMarker).toHaveBeenCalledWith(VERSION);
  });

  it.each([
    ['not ok', { ok: false, added: 0 }],
    ['undefined (lock busy)', undefined],
  ])('does NOT write the marker when the import result is %s', async (_n, outcome) => {
    const importFiles = vi.fn().mockResolvedValue(outcome);
    expect(await bootstrapFromCloud({ importFiles })).toBe('import-failed');
    expect(mocks.writeCloudMarker).not.toHaveBeenCalled();
  });

  it('reports no cloud data without importing', async () => {
    const importFiles = vi.fn();
    mocks.fetchCurrentSealedVersion.mockResolvedValueOnce(null);
    expect(await bootstrapFromCloud({ importFiles })).toBe('no-cloud-data');
    mocks.fetchCloudSeasonList.mockResolvedValueOnce([]);
    expect(await bootstrapFromCloud({ importFiles })).toBe('no-cloud-data');
    expect(importFiles).not.toHaveBeenCalled();
    expect(mocks.writeCloudMarker).not.toHaveBeenCalled();
  });

  it('propagates download errors so the caller can offer a retry', async () => {
    mocks.fetchCloudSeasonsConcurrently.mockRejectedValueOnce(new Error('net down'));
    const importFiles = vi.fn();
    await expect(bootstrapFromCloud({ importFiles })).rejects.toThrow('net down');
    expect(importFiles).not.toHaveBeenCalled();
  });
});

describe('isChunkLoadError', () => {
  it('recognises failed dynamic imports', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /a.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    const named = new Error('x'); named.name = 'ChunkLoadError';
    expect(isChunkLoadError(named)).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('nope')).toBe(false);
  });
});

function Boom({ message }: { message: string }): React.ReactElement {
  throw new Error(message);
}

describe('ViewErrorBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => errorSpy.mockRestore());

  it('renders children when nothing fails', () => {
    render(<ViewErrorBoundary resetKey="a"><p>ok</p></ViewErrorBoundary>);
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('shows a retry for a runtime error and clears it', () => {
    let fail = true;
    const Child = () => (fail ? <Boom message="kaboom" /> : <p>recovered</p>);
    render(<ViewErrorBoundary resetKey="a"><Child /></ViewErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('kaboom');
    fail = false;
    fireEvent.click(screen.getByText('Újrapróbálkozás'));
    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('offers a page reload (not a useless retry) for a chunk load error', () => {
    const onReload = vi.fn();
    render(
      <ViewErrorBoundary resetKey="a" onReload={onReload}>
        <Boom message="Failed to fetch dynamically imported module" />
      </ViewErrorBoundary>,
    );
    expect(screen.queryByText('Újrapróbálkozás')).toBeNull();
    fireEvent.click(screen.getByText('Oldal újratöltése'));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('clears the error when the view (resetKey) changes', () => {
    const Child = ({ bad }: { bad: boolean }) => (bad ? <Boom message="bad view" /> : <p>good view</p>);
    const { rerender } = render(<ViewErrorBoundary resetKey="a"><Child bad /></ViewErrorBoundary>);
    expect(screen.getByRole('alert')).toBeTruthy();
    rerender(<ViewErrorBoundary resetKey="b"><Child bad={false} /></ViewErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('good view')).toBeTruthy();
  });
});
