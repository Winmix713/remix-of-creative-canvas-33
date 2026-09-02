/**
 * Public, read-only connection details for the optional cloud tier.
 *
 * The publishable key is a PUBLIC key: it is safe in client source because every
 * table it can reach sits behind RLS that grants `select` only. The service-role
 * key is a server-only secret and must never appear anywhere in client code.
 *
 * Resolution order:
 *  1. Vite environment (`.env` → VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY,
 *     or the historical VITE_SUPABASE_ANON_KEY name)
 *  2. The baked-in fallback below (the Lovable Cloud project of this app), so
 *     the tier also works in builds where a `.env` file is not injected.
 *  3. `null` — genuinely unconfigured. Reachable only if BOTH the env and the
 *     fallback fail validation (e.g. someone blanks out the constants below
 *     for a stripped build). See docs/supabase-migration.md §1.3.
 */

const FALLBACK_URL = 'https://oaadhaapbgzyibyadgdh.supabase.co';
/** Publishable key (Lovable Cloud project oaadhaapbgzyibyadgdh) — browser-safe behind RLS. */
const FALLBACK_ANON_KEY = 'sb_publishable_juS6O5xPz0l61tz7c4nAyw_9cFO5bnx';

export interface CloudEnv {
  url: string;
  anonKey: string;
  /** Where the credentials came from — surfaced in diagnostics. */
  source: 'env' | 'fallback';
}

function fromEnv(key: string): string {
  const env =
  (import.meta as unknown as {env?: Record<string, string | undefined>;}).env ?? {};
  return (env[key] ?? '').trim();
}

/**
 * Only a well-formed `http(s)://…` URL counts as "present". A blank or
 * malformed `.env` value (missing scheme, stray whitespace, a pasted
 * dashboard URL) must fail validation here rather than surface as a
 * confusing CORS/network error three layers down in `supabaseTier.ts`.
 */
function isValidHttpUrl(value: string): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isNonEmptyKey(value: string): boolean {
  return value.trim().length > 0;
}

// `.env` is baked in at build time by Vite, so the resolved config can never
// change within a running session — compute it once and reuse it.
let cachedEnv: CloudEnv | null | undefined;

export function readCloudEnv(): CloudEnv | null {
  if (cachedEnv !== undefined) return cachedEnv;

  const envUrl = fromEnv('VITE_SUPABASE_URL');
  const envKey = fromEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || fromEnv('VITE_SUPABASE_ANON_KEY');
  if (isValidHttpUrl(envUrl) && isNonEmptyKey(envKey)) {
    cachedEnv = Object.freeze({
      url: envUrl.replace(/\/+$/, ''),
      anonKey: envKey,
      source: 'env' as const
    });
    return cachedEnv;
  }

  if (isValidHttpUrl(FALLBACK_URL) && isNonEmptyKey(FALLBACK_ANON_KEY)) {
    cachedEnv = Object.freeze({
      url: FALLBACK_URL.replace(/\/+$/, ''),
      anonKey: FALLBACK_ANON_KEY,
      source: 'fallback' as const
    });
    return cachedEnv;
  }

  cachedEnv = null;
  return cachedEnv;
}
