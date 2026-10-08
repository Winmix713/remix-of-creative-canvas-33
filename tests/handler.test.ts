import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/winmix-ingest/handler';
import { fixture,operatorId } from './fixtures';
const origin='https://app.example';
const env:Record<string,string>={WINMIX_ALLOWED_ORIGINS:origin,SUPABASE_URL:'https://project.supabase.co',WINMIX_SUPABASE_SECRET_KEY:'sb_secret_test',WINMIX_INGEST_SECRET:'a'.repeat(64)};
const request=(token?:string,body:unknown=fixture(),includeOrigin=true)=>new Request('https://edge.example',{method:'POST',headers:{'content-type':'application/json',apikey:'sb_publishable_public',...(includeOrigin?{origin}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
test('preflight works without API key, session or server key and uses exact CORS',async()=>{
  const h=createHandler(n=>n==='WINMIX_ALLOWED_ORIGINS'?origin:undefined);
  const r=await h(new Request('https://edge.example',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,apikey,content-type'}}));
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
});
test('publishable/anon project credentials never grant write access',async()=>{
  let calls=0;const h=createHandler(n=>env[n],async()=>{calls++;return new Response('{}',{status:401});});
  assert.equal((await h(request())).status,401);
  assert.equal((await h(request('sb_publishable_public'))).status,401);
  assert.equal((await h(request('header.anon.signature'))).status,401);
  assert.equal(calls,1);
});
test('disallowed origin cannot negotiate CORS',async()=>{
  const h=createHandler(n=>env[n]);const r=await h(new Request('https://edge.example',{method:'OPTIONS',headers:{origin:'https://evil.example'}}));
  assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('verified user ID reaches service-only RPC; non-operator is denied with CORS',async()=>{
  const calls:{url:string;init?:RequestInit}[]=[];
  const h=createHandler(n=>env[n],async(input,init)=>{
    calls.push({url:String(input),init});return String(input).endsWith('/user')?Response.json({id:operatorId,is_anonymous:false}):Response.json({code:'PT403'},{status:403});
  });
  const r=await h(request('header.user.signature'));
  assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),origin);
  assert.equal(JSON.parse(String(calls[1].init?.body)).p_actor_id,operatorId);
  assert.equal(new Headers(calls[1].init?.headers).get('apikey'),'sb_secret_test');
  assert.equal(new Headers(calls[1].init?.headers).has('authorization'),false);
});
test('machine secret only works without a browser Origin',async()=>{
  let calls=0;const h=createHandler(n=>env[n],async()=>{calls++;return Response.json({success:true});});
  assert.equal((await h(request(env.WINMIX_INGEST_SECRET,fixture(),false))).status,200);
  assert.equal((await h(request(env.WINMIX_INGEST_SECRET))).status,401);assert.equal(calls,1);
});
test('malformed body returns no RPC and method/size errors retain CORS',async()=>{
  const h=createHandler(n=>env[n],async()=>{throw new Error('must not fetch');});
  const r=await h(request(env.WINMIX_INGEST_SECRET,{seasons:[]},false));assert.equal(r.status,422);
  const method=await h(new Request('https://edge.example',{headers:{origin}}));assert.equal(method.status,405);
  assert.equal(method.headers.get('access-control-allow-origin'),origin);
});
