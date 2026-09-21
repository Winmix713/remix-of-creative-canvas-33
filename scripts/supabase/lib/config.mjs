/**
 * Shared configuration for Supabase CLI tooling.
 *
 * Reads from environment variables — never from Vite's import.meta.env.
 * The publishable key is public; the service-role key is server-only and
 * must never appear in frontend source or build output.
 */

export function readEnv(name) {
  const v = process.env[name];
  return v ? v.trim() : '';
}

export function getPublicConfig() {
  const url = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
  const key = readEnv('SUPABASE_ANON_KEY') || readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export function getServiceConfig() {
  const url = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export function isOpaqueKey(key) {
  return key.startsWith('sb_publishable_') || key.startsWith('sb_secret_');
}
