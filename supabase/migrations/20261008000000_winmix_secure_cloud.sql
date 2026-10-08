-- Requires the versioned WinMix Core schema described in docs/DEPLOYMENT.hu.md.
-- Does not guess a target project, repair historical data, or publish a draft.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

do $$
begin
  if to_regclass('public.winmix_data_versions') is null
     or to_regclass('public.winmix_seasons') is null
     or to_regclass('public.winmix_matches') is null
     or to_regclass('public.winmix_teams') is null then
    raise exception 'WinMix versioned Core schema missing. Run the inventory and reconcile schema first.';
  end if;
  -- These references deliberately fail before any changes if this is a different schema.
  perform version_key, status, is_current, source_description, content_fingerprint,
          season_count, match_count, league_coverage, sealed_at, updated_at
    from public.winmix_data_versions limit 0;
  perform data_version_id, league, season_index, content_hash, order_mode from public.winmix_seasons limit 0;
  perform data_version_id, source_file_id, row_index, kickoff_iso, match_date_raw from public.winmix_matches limit 0;
  if exists (select 1 from public.winmix_seasons where data_version_id is null)
     or exists (select 1 from public.winmix_matches m join public.winmix_seasons s on s.id=m.season_id
                where m.data_version_id is distinct from s.data_version_id or m.league<>s.league) then
    raise exception 'Existing version graph is inconsistent. Reconcile it before migration.';
  end if;
end $$;

alter table public.winmix_data_versions add column if not exists ingest_revision integer not null default 0;
alter table public.winmix_seasons add column if not exists source_season_key text;
update public.winmix_seasons set source_season_key = league || '_' || season_index where source_season_key is null;
alter table public.winmix_seasons alter column source_season_key set not null;
alter table public.winmix_matches add column if not exists home_name_snapshot text;
alter table public.winmix_matches add column if not exists away_name_snapshot text;
-- Capture existing names before enabling immutable row guards.
update public.winmix_matches m set home_name_snapshot=t.display_name from public.winmix_teams t
  where t.id=m.home_team_id and m.home_name_snapshot is null;
update public.winmix_matches m set away_name_snapshot=t.display_name from public.winmix_teams t
  where t.id=m.away_team_id and m.away_name_snapshot is null;
alter table public.winmix_matches alter column home_name_snapshot set not null;
alter table public.winmix_matches alter column away_name_snapshot set not null;

-- The old global season key would prevent a second version of the same season.
alter table public.winmix_seasons drop constraint if exists winmix_seasons_league_season_index_key;
create unique index if not exists winmix_cloud_season_source_uq on public.winmix_seasons(data_version_id,league,source_season_key);
create unique index if not exists winmix_cloud_season_index_uq on public.winmix_seasons(data_version_id,league,season_index);
create unique index if not exists winmix_cloud_match_no_uq on public.winmix_matches(data_version_id,season_id,match_no);
create unique index if not exists winmix_cloud_one_current on public.winmix_data_versions((is_current)) where is_current;
alter table public.winmix_seasons add constraint winmix_cloud_season_version_fk
  foreign key(data_version_id) references public.winmix_data_versions(id) on delete restrict;
alter table public.winmix_matches add constraint winmix_cloud_match_version_fk
  foreign key(data_version_id) references public.winmix_data_versions(id) on delete restrict;

create table public.winmix_cloud_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','operator')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.winmix_ingest_receipts (
  request_id uuid primary key,
  actor_id uuid,
  payload_hash text not null,
  data_version_id uuid not null references public.winmix_data_versions(id),
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.winmix_cloud_operators enable row level security;
alter table public.winmix_ingest_receipts enable row level security;
revoke all on public.winmix_cloud_operators, public.winmix_ingest_receipts from public, anon, authenticated;
grant all on public.winmix_cloud_operators, public.winmix_ingest_receipts to service_role;

create function public.winmix_cloud_is_operator(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.winmix_cloud_operators where user_id=p_user and enabled);
$$;
revoke all on function public.winmix_cloud_is_operator(uuid) from public, anon, authenticated;

create function public.winmix_cloud_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('contract',2,'canWrite',public.winmix_cloud_is_operator(auth.uid()));
$$;
revoke all on function public.winmix_cloud_access() from public;
grant execute on function public.winmix_cloud_access() to anon, authenticated;

create function public.winmix_cloud_can_read(p_version uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.winmix_data_versions where id=p_version
    and ((is_current and status='sealed') or public.winmix_cloud_is_operator(auth.uid())));
$$;
revoke all on function public.winmix_cloud_can_read(uuid) from public, anon, authenticated;

-- Draft-only writes, also for direct service-role calls. Row locks serialize sealing.
create function public.winmix_guard_cloud_rows() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_status text; v_current boolean;
begin
  if TG_OP='UPDATE' and NEW.data_version_id is distinct from OLD.data_version_id then
    raise sqlstate 'PT409' using message='Moving rows between versions is forbidden';
  end if;
  if TG_OP='DELETE' then v_id:=OLD.data_version_id; else v_id:=NEW.data_version_id; end if;
  select status,is_current into v_status,v_current from public.winmix_data_versions where id=v_id for update;
  if not found or v_status<>'draft' or v_current then
    raise sqlstate 'PT409' using message='Only non-current draft data is writable';
  end if;
  if TG_OP<>'DELETE' and TG_TABLE_NAME='winmix_matches' then
    if not exists(select 1 from public.winmix_seasons s where s.id=NEW.season_id
       and s.data_version_id=NEW.data_version_id and s.league=NEW.league)
       or not exists(select 1 from public.winmix_teams where id=NEW.home_team_id and league=NEW.league)
       or not exists(select 1 from public.winmix_teams where id=NEW.away_team_id and league=NEW.league) then
      raise sqlstate 'PT422' using message='Version/season/team league mismatch';
    end if;
  end if;
  if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function public.winmix_guard_cloud_rows() from public, anon, authenticated;
create trigger winmix_cloud_seasons_guard before insert or update or delete on public.winmix_seasons
  for each row execute function public.winmix_guard_cloud_rows();
create trigger winmix_cloud_matches_guard before insert or update or delete on public.winmix_matches
  for each row execute function public.winmix_guard_cloud_rows();

create function public.winmix_guard_cloud_version() returns trigger
language plpgsql set search_path='' as $$
begin
  if TG_OP='DELETE' then
    if OLD.status<>'draft' or OLD.is_current then raise sqlstate 'PT409' using message='Immutable version'; end if;
    return OLD;
  end if;
  if OLD.status<>'draft' and (
    NEW.status not in ('sealed','superseded','rejected') or
    (to_jsonb(NEW)-'is_current'-'status'-'updated_at') is distinct from (to_jsonb(OLD)-'is_current'-'status'-'updated_at')
  ) then raise sqlstate 'PT409' using message='Immutable version'; end if;
  if NEW.is_current and NEW.status<>'sealed' then raise sqlstate 'PT409' using message='Current version must be sealed'; end if;
  return NEW;
end $$;
revoke all on function public.winmix_guard_cloud_version() from public, anon, authenticated;
create trigger winmix_cloud_version_guard before update or delete on public.winmix_data_versions
  for each row execute function public.winmix_guard_cloud_version();

create function public.winmix_ingest_v2(p_request_id uuid, p_actor_id uuid, p_version_id uuid,
  p_expected_revision integer, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' set statement_timeout='50s' as $$
declare
  v_hash text; v_prior public.winmix_ingest_receipts%rowtype; v_version public.winmix_data_versions%rowtype;
  v_id uuid; v_sid uuid; v_home uuid; v_away uuid; s jsonb; m jsonb;
  v_seasons integer; v_matches integer; v_teams integer; v_receipt jsonb;
begin
  -- Defense in depth: even an accidental future grant cannot authorize anon/user RPC calls.
  if coalesce(auth.role(),'')<>'service_role' then raise sqlstate 'PT403' using message='Service RPC only'; end if;
  if p_actor_id is not null then
    -- Hold a lock so an operator revocation is ordered against the commit.
    perform 1 from public.winmix_cloud_operators where user_id=p_actor_id and enabled for share;
    if not found then raise sqlstate 'PT403' using message='Active operator required'; end if;
  end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'seasons') is distinct from 'array' then
    raise sqlstate 'PT422' using message='Invalid request';
  end if;
  if jsonb_array_length(p_payload->'seasons') not between 1 and 200
     or octet_length(p_payload::text)>12582912 then raise sqlstate 'PT422' using message='Payload bounds'; end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('version',p_version_id,'revision',p_expected_revision,'payload',p_payload)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_prior from public.winmix_ingest_receipts where request_id=p_request_id;
  if found then
    if v_prior.actor_id is distinct from p_actor_id or v_prior.payload_hash<>v_hash then
      raise sqlstate 'PT409' using message='Idempotency key reused with a different request';
    end if;
    return v_prior.receipt || jsonb_build_object('replayed',true);
  end if;
  if p_version_id is null then
    if p_expected_revision<>0 then raise sqlstate 'PT409' using message='New version revision must be zero'; end if;
    insert into public.winmix_data_versions(version_key,status,is_current,source_description)
    values ('ingest-'||p_request_id,'draft',false,left(coalesce(p_payload->>'label','WinMix import'),200)) returning id into v_id;
  else v_id:=p_version_id;
  end if;
  select * into v_version from public.winmix_data_versions where id=v_id for update;
  if not found or v_version.status<>'draft' or v_version.is_current or v_version.ingest_revision<>p_expected_revision then
    raise sqlstate 'PT409' using message='Draft revision conflict or immutable version';
  end if;
  -- Replacement is the complete draft snapshot, never an append or partial upsert.
  delete from public.winmix_matches where data_version_id=v_id;
  delete from public.winmix_seasons where data_version_id=v_id;
  for s in select value from jsonb_array_elements(p_payload->'seasons') loop
    if s->>'league' not in ('angol','spanyol') or s->>'league' is null
      or jsonb_typeof(s->'matches') is distinct from 'array' then raise sqlstate 'PT422' using message='Invalid season'; end if;
    if jsonb_array_length(s->'matches')<>240 or length(coalesce(s->>'source_season_key','')) not between 1 and 200
      or length(coalesce(s->>'name','')) not between 1 and 200 or length(coalesce(s->>'file_name','')) not between 1 and 200
      or (s->>'season_index')::integer<0 or s->>'season_index' is null
      or coalesce(s->>'order_mode','') not in ('chronological','source-order') then raise sqlstate 'PT422' using message='Invalid season metadata'; end if;
    if exists(select 1 from jsonb_array_elements(s->'matches') x where
       length(coalesce(x->>'home_key','')) not between 1 and 200 or length(coalesce(x->>'away_key','')) not between 1 and 200
       or length(coalesce(x->>'home_name','')) not between 1 and 200 or length(coalesce(x->>'away_name','')) not between 1 and 200
       or x->>'home_key'=x->>'away_key'
       or (x->>'match_no')::integer not between 1 and 240 or x->>'match_no' is null
       or (x->>'home_score')::integer not between 0 and 20 or x->>'home_score' is null
       or (x->>'away_score')::integer not between 0 and 20 or x->>'away_score' is null
       or ((x->>'ht_home_score' is null)<>(x->>'ht_away_score' is null))
       or (x->>'ht_home_score')::integer not between 0 and (x->>'home_score')::integer
       or (x->>'ht_away_score')::integer not between 0 and (x->>'away_score')::integer
    ) then raise sqlstate 'PT422' using message='Invalid match'; end if;
    if (select count(distinct (x->>'home_key',x->>'away_key')) from jsonb_array_elements(s->'matches') x)<>240
       or (select count(distinct x->>'match_no') from jsonb_array_elements(s->'matches') x)<>240
       or (select count(*) from (select x->>'home_key' from jsonb_array_elements(s->'matches') x union select x->>'away_key' from jsonb_array_elements(s->'matches') x) t)<>16
    then raise sqlstate 'PT422' using message='Incomplete round robin'; end if;
    insert into public.winmix_seasons(data_version_id,league,season_index,source_season_key,name,file_name,content_hash,match_count,order_mode)
      values(v_id,s->>'league',(s->>'season_index')::integer,s->>'source_season_key',s->>'name',s->>'file_name',
        encode(sha256(convert_to((s->'matches')::text,'UTF8')),'hex'),240,s->>'order_mode') returning id into v_sid;
    -- Global team identities only. Never overwrite weights/names of existing published teams.
    insert into public.winmix_teams(league,canonical_key,display_name)
      select s->>'league',key,min(name) from (
        select x->>'home_key' as key,x->>'home_name' as name from jsonb_array_elements(s->'matches') x
        union all select x->>'away_key',x->>'away_name' from jsonb_array_elements(s->'matches') x
      ) n group by key on conflict(league,canonical_key) do nothing;
    for m in select value from jsonb_array_elements(s->'matches') loop
      select id into strict v_home from public.winmix_teams where league=s->>'league' and canonical_key=m->>'home_key';
      select id into strict v_away from public.winmix_teams where league=s->>'league' and canonical_key=m->>'away_key';
      insert into public.winmix_matches(data_version_id,season_id,league,match_no,match_date_raw,kickoff_iso,row_index,source_file_id,
        home_team_id,away_team_id,home_name_snapshot,away_name_snapshot,ht_home_score,ht_away_score,home_score,away_score)
      values(v_id,v_sid,s->>'league',(m->>'match_no')::integer,m->>'date',(m->>'kickoff_iso')::timestamptz,
        (m->>'row_index')::integer,m->>'source_file_id',v_home,v_away,m->>'home_name',m->>'away_name',
        (m->>'ht_home_score')::integer,(m->>'ht_away_score')::integer,(m->>'home_score')::integer,(m->>'away_score')::integer);
    end loop;
  end loop;
  select count(*),coalesce(sum(match_count),0) into v_seasons,v_matches from public.winmix_seasons where data_version_id=v_id;
  select count(*) into v_teams from (
    select home_team_id from public.winmix_matches where data_version_id=v_id
    union select away_team_id from public.winmix_matches where data_version_id=v_id
  ) t;
  update public.winmix_data_versions set season_count=v_seasons,match_count=v_matches,
    ingest_revision=ingest_revision+1,updated_at=now(),content_fingerprint=(
      select md5(coalesce(string_agg(concat_ws('|',s.league,s.season_index,m.match_no,m.kickoff_iso,
        m.home_team_id,m.away_team_id,m.ht_home_score,m.ht_away_score,m.home_score,m.away_score),
        E'\n' order by s.league,s.season_index,m.match_no),''))
      from public.winmix_seasons s join public.winmix_matches m on m.season_id=s.id where s.data_version_id=v_id
    ), league_coverage=(select jsonb_object_agg(league,jsonb_build_object('seasons',n,'matches',c)) from (
      select league,count(*) n,sum(match_count) c from public.winmix_seasons where data_version_id=v_id group by league
    ) q) where id=v_id;
  v_receipt:=jsonb_build_object('success',true,'dataVersionId',v_id,'revision',p_expected_revision+1,
    'status','draft','isCurrent',false,'seasons',v_seasons,'teams',v_teams,'matches',v_matches,
    'rejected',0,'repaired',0,'errors','[]'::jsonb,'manifestErrors','[]'::jsonb,'replayed',false);
  insert into public.winmix_ingest_receipts(request_id,actor_id,payload_hash,data_version_id,receipt)
    values(p_request_id,p_actor_id,v_hash,v_id,v_receipt);
  return v_receipt;
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation
       or invalid_datetime_format or datetime_field_overflow or unique_violation then
    raise sqlstate 'PT422' using message='Invalid or duplicate input rows; transaction rolled back';
end $$;
revoke all on function public.winmix_ingest_v2(uuid,uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.winmix_ingest_v2(uuid,uuid,uuid,integer,jsonb) to service_role;

-- Lock down table writes explicitly, including TRUNCATE and privileges inherited from PUBLIC.
revoke all on public.winmix_data_versions,public.winmix_seasons,public.winmix_matches,public.winmix_teams from public,anon,authenticated;
grant select on public.winmix_data_versions,public.winmix_seasons,public.winmix_matches,public.winmix_teams to anon,authenticated;
grant select,insert,update,delete on public.winmix_data_versions,public.winmix_seasons,public.winmix_matches,public.winmix_teams to service_role;
revoke truncate on public.winmix_data_versions,public.winmix_seasons,public.winmix_matches,public.winmix_teams from service_role;
alter table public.winmix_data_versions enable row level security;
alter table public.winmix_seasons enable row level security;
alter table public.winmix_matches enable row level security;
alter table public.winmix_teams enable row level security;
-- Policies are ORed. Remove ALL legacy policies on these four tables, then define one contract.
do $$ declare r record; begin
  for r in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('winmix_data_versions','winmix_seasons','winmix_matches','winmix_teams') loop
    execute format('drop policy %I on public.%I',r.policyname,r.tablename);
  end loop;
end $$;
create policy winmix_cloud_versions_public on public.winmix_data_versions for select to anon,authenticated using(is_current and status='sealed');
create policy winmix_cloud_seasons_public on public.winmix_seasons for select to anon,authenticated using(
  exists(select 1 from public.winmix_data_versions v where v.id=data_version_id and v.is_current and v.status='sealed'));
create policy winmix_cloud_matches_public on public.winmix_matches for select to anon,authenticated using(
  exists(select 1 from public.winmix_data_versions v where v.id=data_version_id and v.is_current and v.status='sealed'));
create policy winmix_cloud_teams_public on public.winmix_teams for select to anon,authenticated using(
  exists(select 1 from public.winmix_matches m where m.home_team_id=winmix_teams.id or m.away_team_id=winmix_teams.id));

create function public.winmix_cloud_versions() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'versionKey',version_key,'status',status,
    'isCurrent',is_current,'revision',ingest_revision,'fingerprint',content_fingerprint,
    'seasonCount',season_count,'matchCount',match_count) order by created_at desc,id),'[]'::jsonb)
  from public.winmix_data_versions where public.winmix_cloud_can_read(id);
$$;
create function public.winmix_cloud_seasons(p_version uuid,p_league text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.winmix_cloud_can_read(p_version) then raise sqlstate 'PT403' using message='Version not readable'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'dataVersionId',s.data_version_id,
    'revision',v.ingest_revision,'league',s.league,'seasonIndex',s.season_index,'sourceSeasonKey',s.source_season_key,
    'name',s.name,'fileName',s.file_name,'contentHash',s.content_hash,'matchCount',s.match_count,
    'orderMode',s.order_mode,'createdAt',s.created_at) order by s.league,s.season_index,s.id),'[]'::jsonb)
    from public.winmix_seasons s join public.winmix_data_versions v on v.id=s.data_version_id
    where s.data_version_id=p_version and (p_league is null or s.league=p_league));
end $$;
create function public.winmix_cloud_season(p_season uuid,p_version uuid,p_revision integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_meta jsonb; v_rows jsonb;
begin
  if not public.winmix_cloud_can_read(p_version) then raise sqlstate 'PT403' using message='Version not readable'; end if;
  if not exists(select 1 from public.winmix_data_versions where id=p_version and ingest_revision=p_revision) then
    raise sqlstate 'PT409' using message='Draft changed; reload season list'; end if;
  select jsonb_build_object('id',id,'matchCount',match_count,'contentHash',content_hash) into v_meta
    from public.winmix_seasons where id=p_season and data_version_id=p_version;
  if v_meta is null then raise sqlstate 'PT409' using message='Season changed'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('match_no',m.match_no,'date',m.match_date_raw,'kickoffIso',m.kickoff_iso,
    'rowIndex',m.row_index,'sourceFileId',m.source_file_id,'home_team',m.home_name_snapshot,'away_team',m.away_name_snapshot,
    'ht_home_score',m.ht_home_score,'ht_away_score',m.ht_away_score,'home_score',m.home_score,'away_score',m.away_score)
    order by m.match_no),'[]'::jsonb) into v_rows from public.winmix_matches m where m.season_id=p_season and m.data_version_id=p_version;
  if jsonb_array_length(v_rows)<>(v_meta->>'matchCount')::integer then raise sqlstate 'PT409' using message='Stored match count mismatch'; end if;
  return jsonb_build_object('meta',v_meta,'matches',v_rows,'revision',p_revision,'dataVersionId',p_version);
end $$;

create function public.winmix_cloud_ratings(p_version uuid,p_league text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb; v_basis jsonb; v_revision integer;
begin
  if not public.winmix_cloud_can_read(p_version) then raise sqlstate 'PT403' using message='Version not readable'; end if;
  if p_league not in ('angol','spanyol') or p_league is null then raise sqlstate 'PT422' using message='League required'; end if;
  select ingest_revision into v_revision from public.winmix_data_versions where id=p_version;
  with appearances as (
    select h.canonical_key,m.home_name_snapshot display_name,1 hg,0 ag,m.home_score-m.away_score hd,0 ad,
      case when m.home_score>m.away_score then 3 when m.home_score=m.away_score then 1 else 0 end pts
      from public.winmix_matches m join public.winmix_teams h on h.id=m.home_team_id where m.data_version_id=p_version and m.league=p_league
    union all
    select a.canonical_key,m.away_name_snapshot,0,1,0,m.away_score-m.home_score,
      case when m.away_score>m.home_score then 3 when m.home_score=m.away_score then 1 else 0 end
      from public.winmix_matches m join public.winmix_teams a on a.id=m.away_team_id where m.data_version_id=p_version and m.league=p_league
  ), scored as (
    select canonical_key,min(display_name) display_name,count(*) total_played,
      sum(hd)::numeric/nullif(sum(hg),0) net_home,sum(ad)::numeric/nullif(sum(ag),0) net_away,
      sum(pts)::numeric/count(*) ppg from appearances group by canonical_key
  ), raw as (
    select *,0.55*coalesce(net_home,0)+0.45*coalesce(net_away,0)+0.33*ppg raw_score from scored
  ), standardized as (
    select *,avg(raw_score) over() mu,coalesce(nullif(stddev_pop(raw_score) over(),0),1) sigma from raw
  ) select coalesce(jsonb_agg(jsonb_build_object('canonicalKey',canonical_key,'displayName',display_name,
    'totalPlayed',total_played,'netHome',round(coalesce(net_home,0),2),'netAway',round(coalesce(net_away,0),2),
    'ppg',round(ppg,2),'autoWeightIndex',greatest(0,least(10,round(5+(raw_score-mu)/sigma*1.75,1)))) order by canonical_key),'[]'::jsonb)
    into v_rows from standardized;
  -- Explicit comparison basis prevents green parity against a different local dataset.
  select coalesce(jsonb_agg(jsonb_build_array(s.season_index,m.match_no,h.canonical_key,a.canonical_key,m.home_score,m.away_score)
    order by s.season_index,m.match_no),'[]'::jsonb) into v_basis from public.winmix_matches m
    join public.winmix_seasons s on s.id=m.season_id join public.winmix_teams h on h.id=m.home_team_id
    join public.winmix_teams a on a.id=m.away_team_id where m.data_version_id=p_version and m.league=p_league;
  return jsonb_build_object('dataVersionId',p_version,'revision',v_revision,'league',p_league,'ratings',v_rows,'basis',v_basis);
end $$;

revoke all on function public.winmix_cloud_versions(),public.winmix_cloud_seasons(uuid,text),
  public.winmix_cloud_season(uuid,uuid,integer),public.winmix_cloud_ratings(uuid,text) from public;
grant execute on function public.winmix_cloud_versions(),public.winmix_cloud_seasons(uuid,text),
  public.winmix_cloud_season(uuid,uuid,integer),public.winmix_cloud_ratings(uuid,text) to anon,authenticated;

-- Keep the legacy view for callers outside this panel. Prevent owner/RLS bypass.
do $$ begin
  if to_regclass('public.view_team_ratings') is not null then
    alter view public.view_team_ratings set (security_invoker=true);
    revoke all on public.view_team_ratings from public,anon,authenticated;
    grant select on public.view_team_ratings to anon,authenticated;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
