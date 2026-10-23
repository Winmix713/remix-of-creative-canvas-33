/**
 * Cloud freshness marker.
 *
 * After the browser downloads the cloud data it remembers WHICH server version it got
 * (id + revision + fingerprint). Later a single cheap `winmix_cloud_versions` call tells
 * whether the cloud moved on. The local content hash is not comparable to the server's
 * sha256, so the version identity is the only valid comparison key.
 *
 * Notification-only: nothing here ever changes local data.
 */
import { fetchCurrentSealedVersion, isCloudTierConfigured, type CloudVersion } from './supabaseTier';

export const CLOUD_MARKER_KEY = 'winmix-cloud-marker-v1';

export interface CloudMarker { versionId: string; revision: number; fingerprint: string | null; seenAt: string }

const toMarker = (v: Pick<CloudVersion, 'id' | 'revision' | 'fingerprint'>): CloudMarker => ({
  versionId: v.id, revision: v.revision, fingerprint: v.fingerprint, seenAt: new Date().toISOString()
});

export function readCloudMarker(): CloudMarker | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOUD_MARKER_KEY) ?? 'null') as Partial<CloudMarker> | null;
    if (!raw || typeof raw.versionId !== 'string' || typeof raw.revision !== 'number') return null;
    return { versionId: raw.versionId, revision: raw.revision, fingerprint: typeof raw.fingerprint === 'string' ? raw.fingerprint : null, seenAt: String(raw.seenAt ?? '') };
  } catch { return null; }
}

export function writeCloudMarker(v: Pick<CloudVersion, 'id' | 'revision' | 'fingerprint'>): void {
  try { localStorage.setItem(CLOUD_MARKER_KEY, JSON.stringify(toMarker(v))); } catch { /* quota / private mode: marker is best-effort */ }
}

export function clearCloudMarker(): void {
  try { localStorage.removeItem(CLOUD_MARKER_KEY); } catch { /* ignore */ }
}

export const isCloudNewer = (marker: CloudMarker, current: Pick<CloudVersion, 'id' | 'revision' | 'fingerprint'>): boolean =>
  marker.versionId !== current.id || marker.revision !== current.revision || marker.fingerprint !== current.fingerprint;

/**
 * Resolves the current cloud version when it differs from what this browser last downloaded.
 * Returns null when: cloud not configured, no marker yet, nothing new, or ANY error (silent).
 */
export async function checkCloudFreshness(): Promise<CloudVersion | null> {
  if (!isCloudTierConfigured()) return null;
  const marker = readCloudMarker();
  if (!marker) return null;
  try {
    const current = await fetchCurrentSealedVersion();
    return current && isCloudNewer(marker, current) ? current : null;
  } catch { return null; }
}
