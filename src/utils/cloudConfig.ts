export interface CloudEnv { url: string; anonKey: string; source: 'env' }

/** Configuration screening, not JWT signature verification. Never accept a server key. */
export function isPublicKey(key: string, projectRef?: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    if (key.split('.').length !== 3) return false;
    const body = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '=')));
    return claims.role === 'anon' && typeof claims.exp === 'number'
      && claims.exp > Date.now() / 1000
      && (!projectRef || claims.ref === projectRef);
  } catch { return false; }
}

export function resolveCloudEnv(env: Record<string, string | undefined>): CloudEnv | null {
  const rawUrl = env.VITE_SUPABASE_URL?.trim() ?? '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.VITE_SUPABASE_ANON_KEY?.trim() || '';
  try {
    const url = new URL(rawUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) return null;
    const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
    if (!isPublicKey(key, ref)) return null;
    return Object.freeze({ url: url.origin, anonKey: key, source: 'env' });
  } catch { return null; }
}

export function readCloudEnv(): CloudEnv | null {
  return resolveCloudEnv({
    VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY,
  });
}
