import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const viteEnv = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
const original = { ...viteEnv };

function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete viteEnv[k];
    else viteEnv[k] = v;
  }
}

/**
 * `readCloudEnv()` caches per module instance, so every case re-imports the
 * module after stubbing the Vite env.
 */
async function freshConfig() {
  vi.resetModules();
  return import('../utils/cloudConfig');
}

describe('cloudConfig — feloldási sorrend', () => {
  beforeEach(() => {
    for (const k of Object.keys(viteEnv)) delete viteEnv[k];
    Object.assign(viteEnv, original);
  });

  afterEach(() => {
    for (const k of Object.keys(viteEnv)) delete viteEnv[k];
    Object.assign(viteEnv, original);
  });

  it('a .env-et részesíti előnyben, ha az URL és a kulcs is érvényes', async () => {
    setEnv({ VITE_SUPABASE_URL: 'https://staging.example.supabase.co/' });
    setEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_staging' });
    const { readCloudEnv } = await freshConfig();
    expect(readCloudEnv()).toEqual({
      url: 'https://staging.example.supabase.co',
      anonKey: 'sb_publishable_staging',
      source: 'env',
    });
  });

  it('elfogadja a történeti VITE_SUPABASE_ANON_KEY nevet is', async () => {
    setEnv({ VITE_SUPABASE_URL: 'https://staging.example.supabase.co' });
    setEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: '' });
    setEnv({ VITE_SUPABASE_ANON_KEY: 'legacy-jwt-key' });
    const { readCloudEnv } = await freshConfig();
    expect(readCloudEnv()?.anonKey).toBe('legacy-jwt-key');
  });

  it('hibás env URL esetén a beépített fallbackre esik vissza', async () => {
    setEnv({ VITE_SUPABASE_URL: 'nem-egy-url' });
    setEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'valami' });
    const { readCloudEnv } = await freshConfig();
    const env = readCloudEnv();
    expect(env?.source).toBe('fallback');
    expect(env?.url).toMatch(/^https:\/\//);
  });

  it('üres kulcs esetén szintén fallback, nem env', async () => {
    setEnv({ VITE_SUPABASE_URL: 'https://staging.example.supabase.co' });
    setEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: '   ' });
    setEnv({ VITE_SUPABASE_ANON_KEY: '' });
    const { readCloudEnv } = await freshConfig();
    expect(readCloudEnv()?.source).toBe('fallback');
  });

  it('a fallback miatt a tier mindig konfiguráltnak számít (nincs unconfigured ág)', async () => {
    vi.resetModules();
    const { isCloudTierConfigured, cloudEndpointSummary } = await import('../utils/supabaseTier');
    expect(isCloudTierConfigured()).toBe(true);
    expect(cloudEndpointSummary()?.url).toMatch(/^https:\/\//);
  });

  it('a feloldott konfiguráció a session alatt nem változik (cache)', async () => {
    setEnv({ VITE_SUPABASE_URL: 'https://a.example.supabase.co' });
    setEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: 'k1' });
    const { readCloudEnv } = await freshConfig();
    const first = readCloudEnv();
    setEnv({ VITE_SUPABASE_URL: 'https://b.example.supabase.co' });
    expect(readCloudEnv()).toBe(first);
  });
});
