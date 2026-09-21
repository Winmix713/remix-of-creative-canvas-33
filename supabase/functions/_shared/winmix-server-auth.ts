/**
 * Extra authorization for privileged WinMix functions.
 *
 * `verify_jwt` only proves that a caller has a valid Supabase API token. An
 * anon/publishable token must never be sufficient to start a service-role
 * ingestion or engine run. The scheduler supplies this secret in a separate
 * header; browser code never receives it.
 */
const SECRET_HEADER = 'x-winmix-server-secret';

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function requireWinmixServerAuthorization(request: Request): Promise<Response | null> {
  const expected = Deno.env.get('WINMIX_SERVER_SECRET');
  if (!expected) return Response.json({ error: 'Server authorization is not configured.' }, { status: 500 });

  const supplied = request.headers.get(SECRET_HEADER) ?? '';
  if (!supplied || !equal(await digest(supplied), await digest(expected))) {
    return Response.json({ error: 'Unauthorized server caller.' }, { status: 401 });
  }
  return null;
}
