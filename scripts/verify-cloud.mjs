// Read-only deployment checks. Never prints API key/JWT/response bodies.
import assert from 'node:assert/strict';
const url=process.env.WINMIX_TEST_URL?.replace(/\/+$/,'');
const key=process.env.WINMIX_TEST_PUBLIC_KEY;
const origin=process.env.WINMIX_TEST_ORIGIN;
if(!url||!key||!origin)throw new Error('Set WINMIX_TEST_URL, WINMIX_TEST_PUBLIC_KEY and WINMIX_TEST_ORIGIN.');
if(!key.startsWith('sb_publishable_')){
  let role;try{role=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role;}catch{}
  if(role!=='anon')throw new Error('Only public publishable/anon key may be used.');
}
async function check(name,action){try{await action();console.log(`PASS ${name}`);}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1;}}
const edge=`${url}/functions/v1/winmix-ingest`;
const req=(address,options)=>fetch(address,{...options,signal:AbortSignal.timeout(20000)});
await check('allowed preflight without credentials',async()=>{
  const r=await req(edge,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type'}});
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  for(const header of ['authorization','apikey','content-type'])assert.ok(r.headers.get('access-control-allow-headers')?.toLowerCase().includes(header));
});
await check('disallowed origin is not reflected',async()=>{
  const r=await req(edge,{method:'OPTIONS',headers:{Origin:'https://winmix-denied.invalid','Access-Control-Request-Method':'POST'}});
  assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
});
await check('public apikey alone never authorizes ingest',async()=>{
  const r=await req(edge,{method:'POST',headers:{Origin:origin,apikey:key,'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,401);assert.equal(r.headers.get('access-control-allow-origin'),origin);
});
await check('public key used as bearer never authorizes ingest',async()=>{
  const r=await req(edge,{method:'POST',headers:{Origin:origin,apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,401);
});
const headers={apikey:key,'Content-Type':'application/json',...(key.startsWith('sb_publishable_')?{}:{Authorization:`Bearer ${key}`})};
await check('cloud contract deployed and public caller has no write capability',async()=>{
  const r=await req(`${url}/rest/v1/rpc/winmix_cloud_access`,{method:'POST',headers,body:'{}'});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{contract:2,canWrite:false});
});
await check('public version listing exposes only current sealed version',async()=>{
  const r=await req(`${url}/rest/v1/rpc/winmix_cloud_versions`,{method:'POST',headers,body:'{}'});
  assert.equal(r.status,200);const rows=await r.json();assert.ok(Array.isArray(rows)&&rows.length<=1);
  assert.ok(rows.every(v=>v.isCurrent&&v.status==='sealed'));
});
