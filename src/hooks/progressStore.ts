import { useSyncExternalStore } from 'react';

export interface ProgressState {
  label: string;
  pct: number;
}

let current: ProgressState | null = null;
const listeners = new Set<() => void>();

export const progressStore = {
  set(next: ProgressState | null): void {
    current = next;
    listeners.forEach((l) => l());
  },
  get: () => current,
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useWinmixProgress(): ProgressState | null {
  return useSyncExternalStore(progressStore.subscribe, progressStore.get);
}
