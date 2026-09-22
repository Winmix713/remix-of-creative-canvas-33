/**
 * Public, read-only connection details for the central WinMix cloud tier.
 *
 * The publishable key is a PUBLIC key: it is safe in client source because every
 * table it can reach sits behind RLS that grants `select` only. The service-role
 * key is a server-only secret and must never appear anywhere in client code.
 *
 * A missing or invalid configuration is deliberately visible as `null`: this
 * app must never silently connect to an old project or a different backend.
 */

export interface CloudEnv {
  url: string;
  anonKey: string;
  /** Configuration is always explicitly supplied by the deployment environment. */
  source: 'env';
}

function fromEnv(key: string): string {
  const env =
  (import.meta as unknown as {env?: Record<string, string | undefined>;}).env ?? {};
  return (env[key] ?? '').trim();
}

function isNonEmptyKey(value: string): boolean {
  if (!value.trim() || value.startsWith('sb_secret_')) return false;
  try {
    const payload = value.split('.')[1];
    if (!payload) return true; // Opaque publishable key.
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.role !== 'service_role';
  } catch {
    return true;
  }
}

/**
 * Pure resolution over an arbitrary env bag — the single source of truth for
 * the documented order, and the unit-testable seam (`import.meta.env` is
 * frozen at build time, so it cannot be stubbed in tests).
 */
export function resolveCloudEnv(env: Record<string, string | undefined>): CloudEnv | null {
  const envUrl = (env['VITE_SUPABASE_URL'] ?? '').trim().replace(/\/+$/, '');
  const envKey =
    (env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? '').trim() ||
    (env['VITE_SUPABASE_ANON_KEY'] ?? '').trim();

  if (envUrl && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(envUrl) && isNonEmptyKey(envKey)) {
    return Object.freeze({
      url: envUrl,
      anonKey: envKey,
      source: 'env' as const
    });
  }

  return null;
}

// `.env` is baked in at build time by Vite, so the resolved config can never
// change within a running session — compute it once and reuse it.
let cachedEnv: CloudEnv | null | undefined;

export function readCloudEnv(): CloudEnv | null {
  if (cachedEnv !== undefined) return cachedEnv;
  cachedEnv = resolveCloudEnv({
    VITE_SUPABASE_URL: fromEnv('VITE_SUPABASE_URL'),
    VITE_SUPABASE_PUBLISHABLE_KEY: fromEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
    VITE_SUPABASE_ANON_KEY: fromEnv('VITE_SUPABASE_ANON_KEY')
  });
  return cachedEnv;
}
