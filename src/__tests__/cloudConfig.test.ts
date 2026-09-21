import { describe, expect, it } from 'vitest';
import { resolveCloudEnv, readCloudEnv } from '../utils/cloudConfig';
import { isCloudTierConfigured } from '../utils/supabaseTier';

const VALID_URL = 'https://yvwnchyedxkajtwwkkqd.supabase.co';
const VALID_KEY = 'sb_publishable_test_key_12345';
const SERVICE_ROLE_KEY = 'sb_secret_test_key_67890';

describe('cloudConfig — feloldási sorrend (F7 fixált)', () => {
  it('érvényes URL + publishable kulcs → env', () => {
    expect(
      resolveCloudEnv({
        VITE_SUPABASE_URL: ` ${VALID_URL}/ `,
        VITE_SUPABASE_PUBLISHABLE_KEY: VALID_KEY,
      }),
    ).toEqual({
      url: VALID_URL,
      anonKey: VALID_KEY,
      source: 'env',
    });
  });

  it('elfogadja a történeti VITE_SUPABASE_ANON_KEY nevet is', () => {
    const env = resolveCloudEnv(
      {
        VITE_SUPABASE_URL: VALID_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: '',
        VITE_SUPABASE_ANON_KEY: 'legacy-jwt-key',
      },
    );
    expect(env).toMatchObject({ anonKey: 'legacy-jwt-key', source: 'env' });
  });

  it.each([
    ['hiányzó séma', 'staging.example.supabase.co'],
    ['üres URL', ''],
    ['szemét', 'nem-egy-url'],
    ['nem http protokoll', 'ftp://staging.example.supabase.co'],
  ])('érvénytelen vagy idegen env URL (%s) → null (nincs fallback)', (_label, url) => {
    expect(
      resolveCloudEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'valami' }),
    ).toBeNull();
  });

  it('csak whitespace kulcs → null (nincs fallback)', () => {
    expect(
      resolveCloudEnv(
        {
          VITE_SUPABASE_URL: VALID_URL,
          VITE_SUPABASE_PUBLISHABLE_KEY: '   ',
          VITE_SUPABASE_ANON_KEY: '',
        },
      ),
    ).toBeNull();
  });

  it('service-role kulcs (sb_secret_) → null (sosem a browserben)', () => {
    expect(
      resolveCloudEnv({
        VITE_SUPABASE_URL: VALID_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: SERVICE_ROLE_KEY,
      }),
    ).toBeNull();
  });

  it('null ha az env üres', () => {
    expect(resolveCloudEnv({})).toBeNull();
  });

  it('a feloldott konfiguráció a session alatt stabil és fagyasztott (cache)', () => {
    const first = readCloudEnv();
    if (first) {
      expect(readCloudEnv()).toBe(first);
      expect(Object.isFrozen(first)).toBe(true);
    }
  });

  it('isCloudTierConfigured konzisztens a readCloudEnv eredménnyel', () => {
    expect(isCloudTierConfigured()).toBe(readCloudEnv() !== null);
  });
});
