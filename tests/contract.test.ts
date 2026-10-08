import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput } from '../supabase/functions/winmix-ingest/contract';
import { resolveCloudEnv } from '../src/utils/cloudConfig';
import { csvCell } from '../src/utils/supabaseTier';
import { fixture } from './fixtures';

test('complete round-robin accepts preserved match numbers and no repairs',()=>{
  const p=fixture();p.seasons[0].matches.reverse();const n=normalizeInput(p);
  assert.equal(n.payload.seasons[0].matches.length,240);assert.equal(n.payload.seasons[0].matches[0].match_no,1);
});
for(const [name,mutate] of Object.entries({
  fractionalHT:(p:ReturnType<typeof fixture>)=>{p.seasons[0].matches[0].ht_home_score=0.5;},
  partialHT:(p:ReturnType<typeof fixture>)=>{p.seasons[0].matches[0].ht_home_score=null;},
  invalidFT:(p:ReturnType<typeof fixture>)=>{p.seasons[0].matches[0].home_score=-1;},
  duplicatePair:(p:ReturnType<typeof fixture>)=>{p.seasons[0].matches[1]={...p.seasons[0].matches[0],match_no:2};},
  missingMatch:(p:ReturnType<typeof fixture>)=>{p.seasons[0].matches.pop();},
  duplicateSeason:(p:ReturnType<typeof fixture>)=>{p.seasons.push(structuredClone(p.seasons[0]));},
  arbitraryRevision:(p:ReturnType<typeof fixture>)=>{p.dataVersionId=crypto.randomUUID();delete p.expectedRevision;},
}))test(`rejects ${name}`,()=>{const p=fixture();mutate(p);assert.throws(()=>normalizeInput(p));});

test('configuration rejects secrets, partial configs, paths and cross-project legacy keys',()=>{
  const env={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
  assert.equal(resolveCloudEnv(env)?.anonKey,'sb_publishable_test');
  assert.equal(resolveCloudEnv({...env,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'}),null);
  assert.equal(resolveCloudEnv({...env,VITE_SUPABASE_URL:'https://example.supabase.co/rest/v1'}),null);
  assert.equal(resolveCloudEnv({VITE_SUPABASE_URL:env.VITE_SUPABASE_URL}),null);
  const jwt=(role:string,ref:string)=>`e30.${btoa(JSON.stringify({role,ref,exp:4102444800}))}.signature`;
  assert.equal(resolveCloudEnv({...env,VITE_SUPABASE_PUBLISHABLE_KEY:jwt('service_role','example')}),null);
  assert.equal(resolveCloudEnv({...env,VITE_SUPABASE_PUBLISHABLE_KEY:jwt('anon','wrong')}),null);
  assert.ok(resolveCloudEnv({...env,VITE_SUPABASE_PUBLISHABLE_KEY:jwt('anon','example')}));
});
test('CSV quotes commas, quotes and newlines without corrupting numeric scores',()=>{
  assert.equal(csvCell('A,"B"\nC'),'"A,""B""\nC"');assert.equal(csvCell(0),'0');assert.equal(csvCell(null),'');
});
