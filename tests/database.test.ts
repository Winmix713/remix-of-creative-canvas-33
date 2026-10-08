import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeInput } from '../supabase/functions/winmix-ingest/contract';
import { compareCloudRatings } from '../src/utils/cloudComparison';
import type { CloudRatingSnapshot } from '../src/utils/supabaseTier';
import { fixture,operatorId } from './fixtures';

test('PostgreSQL integration: migration, permissions, atomic ingest and snapshots',async(t)=>{
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
  `);
  await db.exec(`create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
    grant usage on schema auth to anon,authenticated,service_role;
    insert into auth.users values ('${operatorId}');`);
  await db.exec(await readFile(new URL('./existing-core-tables.sql',import.meta.url),'utf8'));
  await db.exec(`alter table public.winmix_seasons add column data_version_id uuid not null references public.winmix_data_versions(id);
    alter table public.winmix_matches add column data_version_id uuid not null references public.winmix_data_versions(id);
    create unique index winmix_one_current_data_version on public.winmix_data_versions((is_current)) where is_current;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261008000000_winmix_secure_cloud.sql',import.meta.url),'utf8'));
  await db.exec(`insert into public.winmix_cloud_operators(user_id,role) values('${operatorId}','operator');`);
  const asRole=async(role:string,userId?:string)=>{
    await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,...(userId?{sub:userId}:{})})]);
    await db.exec(`set role ${role}`);
  };
  const ingest=async(p:ReturnType<typeof fixture>,actor:string|null=operatorId)=>{
    const n=normalizeInput(p);
    const r=await db.query<{result:any}>('select public.winmix_ingest_v2($1,$2,$3,$4,$5::jsonb) result',[n.requestId,actor,n.dataVersionId,n.expectedRevision,JSON.stringify(n.payload)]);
    return r.rows[0].result;
  };
  const count=async(table:string)=>Number((await db.query<{n:number}>(`select count(*) n from public.${table}`)).rows[0].n);
  const p=fixture();let receipt:any;
  await t.test('valid full snapshot commits once and keeps published pointer unchanged',async()=>{
    await asRole('service_role');receipt=await ingest(p);
    assert.equal(receipt.matches,240);assert.equal(receipt.status,'draft');assert.equal(await count('winmix_matches'),240);
    assert.equal((await db.query('select id from public.winmix_data_versions where is_current')).rows.length,0);
  });
  await t.test('idempotent replay has no duplicate seasons/teams/receipts',async()=>{
    const r=await ingest(p);assert.equal(r.replayed,true);assert.equal(r.dataVersionId,receipt.dataVersionId);
    assert.equal(await count('winmix_matches'),240);assert.equal(await count('winmix_teams'),16);assert.equal(await count('winmix_ingest_receipts'),1);
    const changed=structuredClone(p);changed.seasons[0].name='changed';await assert.rejects(()=>ingest(changed),{code:'PT409'});
  });
  await t.test('invalid last season rolls back earlier successful writes and version creation',async()=>{
    const bad=normalizeInput(fixture());const extra=structuredClone(bad.payload.seasons[0]);extra.season_index=2;extra.source_season_key='angol_2';
    extra.matches[239].home_score=-1;bad.payload.seasons.push(extra);
    await assert.rejects(()=>db.query('select public.winmix_ingest_v2($1,$2,null,0,$3::jsonb)',[bad.requestId,operatorId,JSON.stringify(bad.payload)]),{code:'PT422'});
    assert.equal(await count('winmix_data_versions'),1);assert.equal(await count('winmix_matches'),240);assert.equal(await count('winmix_ingest_receipts'),1);
  });
  await t.test('anon and ordinary authenticated callers cannot invoke ingest, write, truncate or read drafts',async()=>{
    for(const role of ['anon','authenticated']){
      await asRole(role,'20000000-0000-4000-8000-000000000002');
      await assert.rejects(()=>ingest(p),{code:'42501'});
      await assert.rejects(()=>db.exec("insert into public.winmix_data_versions(version_key) values('attack')"),{code:'42501'});
      await assert.rejects(()=>db.exec('truncate public.winmix_matches'),{code:'42501'});
      assert.equal(await count('winmix_matches'),0);
      assert.deepEqual((await db.query<{result:unknown}>('select public.winmix_cloud_versions() result')).rows[0].result,[]);
      await assert.rejects(()=>db.query('select public.winmix_cloud_ratings($1,$2)',[receipt.dataVersionId,'angol']),{code:'PT403'});
    }
    await asRole('service_role');
  });
  await t.test('live role revocation blocks even an old valid identity',async()=>{
    await db.exec(`update public.winmix_cloud_operators set enabled=false where user_id='${operatorId}'`);
    await assert.rejects(()=>ingest(p),{code:'PT403'});
    await db.exec(`update public.winmix_cloud_operators set enabled=true where user_id='${operatorId}'`);
  });
  await t.test('operator sees draft and exact SQL/TypeScript comparison agrees',async()=>{
    await asRole('authenticated',operatorId);
    const snapshot=(await db.query<{result:CloudRatingSnapshot}>('select public.winmix_cloud_ratings($1,$2) result',[receipt.dataVersionId,'angol'])).rows[0].result;
    assert.equal(snapshot.ratings.length,16);const comparison=compareCloudRatings(snapshot,p.seasons);
    assert.equal(comparison.comparable,true);assert.ok(comparison.rows.every(r=>r.agrees));
    const wrong=structuredClone(p);wrong.seasons[0].matches[0].home_score=3;assert.equal(compareCloudRatings(snapshot,wrong.seasons).comparable,false);
    await asRole('service_role');
  });
  let oldSeason:string;
  await t.test('replacement increments revision; stale writer and stale download fail',async()=>{
    oldSeason=(await db.query<{id:string}>('select id from public.winmix_seasons')).rows[0].id;
    const update=fixture();update.dataVersionId=receipt.dataVersionId;update.expectedRevision=1;update.seasons[0].name='replacement';
    const r=await ingest(update);assert.equal(r.revision,2);assert.equal(await count('winmix_matches'),240);
    update.requestId=crypto.randomUUID();await assert.rejects(()=>ingest(update),{code:'PT409'});
    await asRole('authenticated',operatorId);
    await assert.rejects(()=>db.query('select public.winmix_cloud_season($1,$2,1)',[oldSeason,receipt.dataVersionId]),{code:'PT409'});
    await asRole('service_role');
  });
  await t.test('failed draft replacement restores previous season IDs, rows and revision',async()=>{
    const before=await db.query('select id,content_hash from public.winmix_seasons');
    const n=normalizeInput(fixture());n.payload.seasons[0].matches[239].home_score=-1;
    await assert.rejects(()=>db.query('select public.winmix_ingest_v2($1,$2,$3,2,$4::jsonb)',[n.requestId,operatorId,receipt.dataVersionId,JSON.stringify(n.payload)]),{code:'PT422'});
    assert.deepEqual((await db.query('select id,content_hash from public.winmix_seasons')).rows,before.rows);
    assert.equal((await db.query<{r:number}>('select ingest_revision r from public.winmix_data_versions')).rows[0].r,2);
  });
  await t.test('sealed/current version blocks ingest and direct row edits; public reads then work',async()=>{
    await db.query("update public.winmix_data_versions set status='sealed',sealed_at=now(),is_current=true where id=$1",[receipt.dataVersionId]);
    const update=fixture();update.dataVersionId=receipt.dataVersionId;update.expectedRevision=2;
    await assert.rejects(()=>ingest(update),{code:'PT409'});
    await assert.rejects(()=>db.exec('update public.winmix_matches set home_score=home_score'),{code:'PT409'});
    await assert.rejects(()=>db.exec("update public.winmix_data_versions set status='draft',is_current=false"),{code:'PT409'});
    await asRole('anon');assert.equal(await count('winmix_matches'),240);assert.equal(await count('winmix_teams'),16);
    const metas=(await db.query<{result:any[]}>('select public.winmix_cloud_seasons($1,null) result',[receipt.dataVersionId])).rows[0].result;
    const download=(await db.query<{result:any}>('select public.winmix_cloud_season($1,$2,2) result',[metas[0].id,receipt.dataVersionId])).rows[0].result;
    assert.equal(download.matches.length,240);assert.equal(download.matches[0].match_no,1);
  });
  await db.close();
});
