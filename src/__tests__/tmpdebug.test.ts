import { it, expect, vi } from 'vitest';
it('env', async () => {
  const e = (import.meta as any).env;
  console.log('URL', e.VITE_SUPABASE_URL, 'KEY?', !!e.VITE_SUPABASE_PUBLISHABLE_KEY);
  vi.stubEnv('VITE_SUPABASE_URL', 'nope');
  console.log('after stub', (import.meta as any).env.VITE_SUPABASE_URL);
  const m = await import('/dev-server/src/utils/cloudConfig');
  console.log('resolved', m.readCloudEnv());
  expect(1).toBe(1);
});
