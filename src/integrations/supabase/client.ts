import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readCloudEnv } from '../../utils/cloudConfig';

let client: SupabaseClient | null = null;

/** One Auth session and one explicit project configuration for all cloud operations. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = readCloudEnv();
  if (!env) throw new Error('Hiányzó vagy hibás Supabase URL / nyilvános kulcs.');
  client = createClient(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
        // Some SDK versions use the project key as a default bearer. User JWTs survive.
        if (env.anonKey.startsWith('sb_publishable_') && headers.get('authorization') === `Bearer ${env.anonKey}`) {
          headers.delete('authorization');
        }
        headers.set('apikey', env.anonKey);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return client;
}

export async function sessionToken(required = false): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) throw error;
  if (required && !data.session) throw new Error('A feltöltéshez jelentkezz be operátori fiókkal.');
  return data.session?.access_token ?? null;
}

/** Existing application imports remain valid without crashing an unconfigured local-only app. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target,property) {
    const instance=getSupabase();
    const value=Reflect.get(instance,property);
    return typeof value==='function'?value.bind(instance):value;
  },
});
