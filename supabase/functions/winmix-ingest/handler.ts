import { InputError, normalizeInput } from './contract.ts';

type Env = (name: string) => string | undefined;
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
const LIMIT = 12 * 1024 * 1024;
async function equalSecret(a: string, b: string) {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0; for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function serverKey(env: Env): string {
  const explicit = env('WINMIX_SUPABASE_SECRET_KEY')?.trim();
  let mapped: string | undefined;
  if (!explicit && env('SUPABASE_SECRET_KEYS')) {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS')!);
    mapped = keys[env('WINMIX_SECRET_KEY_NAME') || 'default'];
  }
  const key = explicit || mapped || env('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!key) throw new Error('server-key-missing');
  if (key.startsWith('sb_secret_')) return key;
  try {
    const body = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    if (JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '='))).role === 'service_role') return key;
  } catch { /* Fail closed. */ }
  throw new Error('server-key-invalid');
}
async function readBody(req: Request) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'CONTENT_TYPE', 'JSON kérés szükséges.');
  if (Number(req.headers.get('content-length')) > LIMIT) throw new HttpError(413, 'TOO_LARGE', 'A feltöltés legfeljebb 12 MiB lehet.');
  if (!req.body) throw new InputError('Hiányzó kérés.');
  const reader = req.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > LIMIT) { await reader.cancel(); throw new HttpError(413, 'TOO_LARGE', 'A feltöltés legfeljebb 12 MiB lehet.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let pos = 0;
  for (const chunk of chunks) { bytes.set(chunk, pos); pos += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InputError('Érvénytelen JSON.'); }
}

export function createHandler(env: Env, fetcher: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Vary': 'Origin', 'X-Request-Id': requestId });
    const reply = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
    try {
      const origins = (env('WINMIX_ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean);
      if (!origins.length || origins.some(o => o === '*' || new URL(o).origin !== o)) throw new Error('cors-config-invalid');
      const origin = req.headers.get('origin');
      if (origin && !origins.includes(origin)) throw new HttpError(403, 'ORIGIN_DENIED', 'Nem engedélyezett webhely.');
      if (origin) headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
      headers.set('Access-Control-Expose-Headers', 'x-request-id');
      if (req.method === 'OPTIONS') {
        const requestedMethod = req.headers.get('access-control-request-method');
        const requestedHeaders = (req.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        if ((requestedMethod && requestedMethod !== 'POST') || requestedHeaders.some(h => !['authorization','apikey','content-type','x-client-info'].includes(h))) throw new HttpError(400, 'PREFLIGHT', 'Nem támogatott preflight.');
        headers.set('Access-Control-Max-Age', '600');
        return reply(null, 204); // No JWT or server key is needed to negotiate CORS.
      }
      if (req.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); throw new HttpError(405, 'METHOD', 'Csak POST támogatott.'); }
      const bearer = /^Bearer (\S+)$/i.exec(req.headers.get('authorization') || '')?.[1];
      if (!bearer) throw new HttpError(401, 'SIGN_IN_REQUIRED', 'Bejelentkezés szükséges.');
      const url = env('SUPABASE_URL')?.replace(/\/+$/, '');
      if (!url) throw new Error('server-url-missing');
      const key = serverKey(env);
      const backendHeaders = { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' };
      let actor: string | null = null;
      const secret = env('WINMIX_INGEST_SECRET');
      if (!origin && secret && /^[a-f0-9]{64}$/i.test(secret) && await equalSecret(bearer, secret)) {
        // Dedicated server-to-server secret; never accepted from a browser origin.
      } else {
        if (bearer.startsWith('sb_') || bearer.split('.').length !== 3) throw new HttpError(401, 'INVALID_SESSION', 'Érvénytelen felhasználói munkamenet.');
        const auth = await fetcher(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(10000) });
        if (!auth.ok) {
          if (auth.status >= 500 || auth.status === 429) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'A bejelentkezés ellenőrzése átmenetileg nem elérhető.');
          throw new HttpError(401, 'INVALID_SESSION', 'Lejárt vagy érvénytelen munkamenet.');
        }
        const user = await auth.json();
        if (!user.id || user.is_anonymous) throw new HttpError(403, 'OPERATOR_REQUIRED', 'Névtelen fiók nem tölthet fel adatot.');
        actor = user.id;
      }
      const input = normalizeInput(await readBody(req));
      // Service-only RPC rechecks the live operator table inside the transaction.
      const rpc = await fetcher(`${url}/rest/v1/rpc/winmix_ingest_v2`, { method: 'POST', headers: backendHeaders,
        body: JSON.stringify({ p_request_id: input.requestId, p_actor_id: actor, p_version_id: input.dataVersionId,
          p_expected_revision: input.expectedRevision, p_payload: input.payload }), signal: AbortSignal.timeout(55000) });
      const result = await rpc.json();
      if (!rpc.ok) {
        const known: Record<string, [number, string]> = {
          PT403: [403, 'A fiók nem aktív admin vagy operátor.'],
          PT409: [409, 'A verzió vagy a kérésazonosító ütközik. Töltsd újra a verziót.'],
          PT422: [422, 'A szezonadatok nem felelnek meg az adatbázis követelményeinek.'],
        };
        const error = known[result.code];
        if (error) throw new HttpError(error[0], result.code, error[1]);
        // Log only code and correlation ID. Never log tokens, request body or SQL detail.
        console.error(JSON.stringify({ requestId, code: result.code ?? 'RPC_ERROR' }));
        throw new HttpError(502, 'DATABASE_ERROR', 'Adatbázishiba. Az import nem adott vissza sikeres nyugtát.');
      }
      return reply({ ...result, requestId: input.requestId, traceId: requestId });
    } catch (error) {
      if (error instanceof InputError) return reply({ success: false, code: 'INVALID_INPUT', error: error.message, traceId: requestId }, 422);
      if (error instanceof HttpError) return reply({ success: false, code: error.code, error: error.message, traceId: requestId }, error.status);
      console.error(JSON.stringify({ requestId, code: error instanceof Error && error.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'SERVER_ERROR' }));
      return reply({ success: false, code: 'SERVER_ERROR', error: 'Szerverhiba vagy időtúllépés. Ugyanazzal a kérésazonosítóval próbáld újra.', traceId: requestId }, 503);
    }
  };
}
