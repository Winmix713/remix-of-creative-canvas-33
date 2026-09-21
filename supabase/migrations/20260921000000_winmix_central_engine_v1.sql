-- WinMix Supabase Core v1
-- Run this ONCE in Supabase SQL Editor against project yvwnchyedxkajtwwkkqd.
-- It is intentionally transactional: an unmet baseline check rolls everything back.

begin;

-- -----------------------------------------------------------------------------
-- 0. Safe pre-flight: this package is for the existing, complete WinMix export.
-- -----------------------------------------------------------------------------
do $$
declare
  v_seasons integer;
  v_matches integer;
begin
  select count(*) into v_seasons from public.winmix_seasons;
  select count(*) into v_matches from public.winmix_matches;

  if v_seasons <> 103 or v_matches <> 24720 then
    raise exception using
      message = format(
        'WinMix Core v1 stopped safely: expected 103 seasons and 24720 matches, found %s and %s.',
        v_seasons, v_matches
      ),
      hint = 'Do not force this migration. Verify that the complete WinMix export is loaded into this project first.';
  end if;

  if exists (
    select 1
    from public.winmix_seasons s
    left join public.winmix_matches m on m.season_id = s.id
    group by s.id, s.match_count
    having count(m.id) <> 240
       or s.match_count not in (0, 240)
  ) then
    raise exception using
      message = 'WinMix Core v1 stopped safely: at least one season does not contain exactly 240 matches.',
      hint = 'Fix the source data before creating an immutable baseline version.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Immutable source-data versions and reproducible parameter snapshots.
-- -----------------------------------------------------------------------------
create table if not exists public.winmix_data_versions (
  id                           uuid primary key default gen_random_uuid(),
  version_key                  text not null unique,
  status                       text not null default 'draft'
                               check (status in ('draft', 'sealed', 'superseded', 'rejected')),
  is_current                   boolean not null default false,
  expected_matches_per_season  integer not null default 240 check (expected_matches_per_season > 0),
  league_coverage              jsonb not null default '{}'::jsonb,
  season_count                 integer not null default 0 check (season_count >= 0),
  match_count                  integer not null default 0 check (match_count >= 0),
  content_fingerprint          text,
  source_description           text,
  sealed_at                    timestamptz,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  constraint winmix_data_versions_sealed_at_check check (
    (status = 'sealed' and sealed_at is not null) or status <> 'sealed'
  )
);

create unique index if not exists winmix_one_current_data_version
  on public.winmix_data_versions ((is_current)) where is_current;

create table if not exists public.winmix_parameter_snapshots (
  id                         uuid primary key default gen_random_uuid(),
  data_version_id            uuid not null references public.winmix_data_versions(id) on delete restrict,
  model_version              text not null,
  feature_schema_version     integer not null check (feature_schema_version > 0),
  pipeline_contract_version  integer not null check (pipeline_contract_version > 0),
  history_scope              text not null check (history_scope in ('season-only', 'league-cumulative')),
  experiments                jsonb not null default '{"dixonColes": false, "glicko2": false}'::jsonb,
  weights                    jsonb not null default '{}'::jsonb,
  manual_weight_overrides    jsonb not null default '{}'::jsonb,
  settings                   jsonb not null default '{}'::jsonb,
  parameters_fingerprint     text generated always as (md5(
                                 model_version || '|' ||
                                 feature_schema_version::text || '|' ||
                                 pipeline_contract_version::text || '|' ||
                                 history_scope || '|' ||
                                 experiments::text || '|' || weights::text || '|' ||
                                 manual_weight_overrides::text || '|' || settings::text
                               )) stored,
  created_at                 timestamptz not null default now(),
  unique (data_version_id, parameters_fingerprint)
);

-- A versioned season/match graph. New imports create NEW seasons, never mutate
-- a sealed version in place.
alter table public.winmix_seasons add column if not exists data_version_id uuid;
alter table public.winmix_matches add column if not exists data_version_id uuid;

insert into public.winmix_data_versions (
  version_key, status, is_current, source_description, sealed_at
)
values (
  'baseline-v1', 'sealed', true,
  'Existing 103-season / 24,720-match WinMix database baseline.', now()
)
on conflict (version_key) do nothing;

update public.winmix_seasons
set data_version_id = (select id from public.winmix_data_versions where version_key = 'baseline-v1')
where data_version_id is null;

update public.winmix_matches m
set data_version_id = s.data_version_id
from public.winmix_seasons s
where s.id = m.season_id and m.data_version_id is null;

update public.winmix_seasons s
set match_count = x.actual_match_count
from (
  select season_id, count(*)::integer as actual_match_count
  from public.winmix_matches
  group by season_id
) x
where x.season_id = s.id and s.match_count is distinct from x.actual_match_count;

alter table public.winmix_seasons alter column data_version_id set not null;
alter table public.winmix_matches alter column data_version_id set not null;

-- Retire the old global season uniqueness; it prevented holding a second data version.
alter table public.winmix_seasons drop constraint if exists winmix_seasons_league_season_index_key;
alter table public.winmix_matches drop constraint if exists winmix_matches_season_id_match_no_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'winmix_seasons_version_league_index_key') then
    alter table public.winmix_seasons
      add constraint winmix_seasons_version_league_index_key
      unique (data_version_id, league, season_index);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_seasons_id_version_league_key') then
    alter table public.winmix_seasons
      add constraint winmix_seasons_id_version_league_key
      unique (id, data_version_id, league);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_teams_id_league_key') then
    alter table public.winmix_teams
      add constraint winmix_teams_id_league_key unique (id, league);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_version_season_match_no_key') then
    alter table public.winmix_matches
      add constraint winmix_matches_version_season_match_no_key
      unique (data_version_id, season_id, match_no);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_match_no_positive') then
    alter table public.winmix_matches
      add constraint winmix_matches_match_no_positive check (match_no > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_distinct_teams') then
    alter table public.winmix_matches
      add constraint winmix_matches_distinct_teams check (home_team_id <> away_team_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_reasonable_scores') then
    alter table public.winmix_matches
      add constraint winmix_matches_reasonable_scores check (
        home_score <= 20 and away_score <= 20 and
        (ht_home_score is null or ht_home_score <= 20) and
        (ht_away_score is null or ht_away_score <= 20)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_season_version_league_fkey') then
    alter table public.winmix_matches
      add constraint winmix_matches_season_version_league_fkey
      foreign key (season_id, data_version_id, league)
      references public.winmix_seasons (id, data_version_id, league)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_home_team_league_fkey') then
    alter table public.winmix_matches
      add constraint winmix_matches_home_team_league_fkey
      foreign key (home_team_id, league)
      references public.winmix_teams (id, league)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'winmix_matches_away_team_league_fkey') then
    alter table public.winmix_matches
      add constraint winmix_matches_away_team_league_fkey
      foreign key (away_team_id, league)
      references public.winmix_teams (id, league)
      on delete restrict;
  end if;
end $$;

create index if not exists winmix_seasons_version_league_idx
  on public.winmix_seasons (data_version_id, league, season_index);
create index if not exists winmix_matches_version_league_order_idx
  on public.winmix_matches (data_version_id, league, season_id, match_no);
create index if not exists winmix_matches_version_kickoff_idx
  on public.winmix_matches (data_version_id, league, kickoff_iso, match_no);

update public.winmix_data_versions dv
set
  season_count = q.season_count,
  match_count = q.match_count,
  league_coverage = q.league_coverage,
  content_fingerprint = q.content_fingerprint
from (
  with by_league as (
    select
      s.data_version_id,
      s.league,
      count(distinct s.id)::integer as seasons,
      count(m.id)::integer as matches
    from public.winmix_seasons s
    left join public.winmix_matches m on m.season_id = s.id
    group by s.data_version_id, s.league
  ), all_rows as (
    select
      s.data_version_id,
      count(distinct s.id)::integer as season_count,
      count(m.id)::integer as match_count,
      md5(coalesce(string_agg(
        concat_ws('|', s.league, s.season_index, m.match_no, m.kickoff_iso,
          m.home_team_id, m.away_team_id, m.ht_home_score, m.ht_away_score,
          m.home_score, m.away_score),
        E'\\n' order by s.league, s.season_index, m.match_no
      ), '')) as content_fingerprint
    from public.winmix_seasons s
    join public.winmix_matches m on m.season_id = s.id
    group by s.data_version_id
  )
  select
    a.data_version_id,
    a.season_count,
    a.match_count,
    a.content_fingerprint,
    jsonb_object_agg(b.league, jsonb_build_object('seasons', b.seasons, 'matches', b.matches)) as league_coverage
  from all_rows a
  join by_league b on b.data_version_id = a.data_version_id
  group by a.data_version_id, a.season_count, a.match_count, a.content_fingerprint
) q
where dv.id = q.data_version_id;

-- Snapshot the exact baseline inputs. Defaults mirror the current WinMix setup;
-- later Edge Function runs create a new snapshot instead of changing this row.
insert into public.winmix_parameter_snapshots (
  data_version_id, model_version, feature_schema_version, pipeline_contract_version,
  history_scope, experiments, weights, manual_weight_overrides, settings
)
select
  dv.id,
  'winmix-forecast-3.1.1', 2, 5,
  'season-only',
  '{"dixonColes": false, "glicko2": false}'::jsonb,
  coalesce((
    select jsonb_object_agg(w.league, w.weights)
    from (
      select league, jsonb_object_agg(canonical_key, weight_index order by canonical_key) as weights
      from public.winmix_teams group by league
    ) w
  ), '{}'::jsonb),
  coalesce((
    select jsonb_object_agg(w.league, w.weights)
    from (
      select league, jsonb_object_agg(canonical_key, weight_index order by canonical_key) as weights
      from public.winmix_teams where weight_source = 'manual' group by league
    ) w
  ), '{}'::jsonb),
  jsonb_build_object('debugInSampleT', false, 'allowDuplicateImport', false)
from public.winmix_data_versions dv
where dv.version_key = 'baseline-v1'
  and not exists (
    select 1 from public.winmix_parameter_snapshots ps where ps.data_version_id = dv.id
  );

-- -----------------------------------------------------------------------------
-- 2. File-import ledger, job queue, atomic engine runs and result storage.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('winmix-incoming', 'winmix-incoming', false, 52428800, array['text/csv', 'application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.winmix_import_batches (
  id                  uuid primary key default gen_random_uuid(),
  storage_bucket      text not null default 'winmix-incoming',
  storage_path        text not null,
  source_sha256       text,
  status              text not null default 'uploaded'
                      check (status in ('uploaded', 'validating', 'rejected', 'sealed', 'processed')),
  validation_report   jsonb not null default '{}'::jsonb,
  data_version_id     uuid references public.winmix_data_versions(id) on delete restrict,
  error_code          text,
  error_message       text,
  created_at          timestamptz not null default now(),
  processed_at        timestamptz,
  unique (storage_bucket, storage_path),
  unique (source_sha256)
);

create table if not exists public.winmix_engine_jobs (
  id                    uuid primary key default gen_random_uuid(),
  data_version_id       uuid not null references public.winmix_data_versions(id) on delete restrict,
  parameter_snapshot_id uuid not null references public.winmix_parameter_snapshots(id) on delete restrict,
  status                text not null default 'queued'
                        check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempt_count         integer not null default 0 check (attempt_count >= 0),
  claimed_at            timestamptz,
  claimed_by            text,
  last_error_code       text,
  last_error_message    text,
  created_at            timestamptz not null default now(),
  started_at            timestamptz,
  finished_at           timestamptz
);

create unique index if not exists winmix_one_active_job_per_input
  on public.winmix_engine_jobs (data_version_id, parameter_snapshot_id)
  where status in ('queued', 'running');

create table if not exists public.winmix_engine_runs (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid unique references public.winmix_engine_jobs(id) on delete set null,
  data_version_id       uuid not null references public.winmix_data_versions(id) on delete restrict,
  parameter_snapshot_id uuid not null references public.winmix_parameter_snapshots(id) on delete restrict,
  engine_version        text not null,
  status                text not null default 'running'
                        check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  is_current            boolean not null default false,
  input_fingerprint     text not null,
  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  duration_ms           bigint check (duration_ms is null or duration_ms >= 0),
  result_summary        jsonb not null default '{}'::jsonb,
  error_code            text,
  error_message         text,
  constraint winmix_current_run_must_succeed check (not is_current or status = 'succeeded')
);

create unique index if not exists winmix_one_current_engine_run
  on public.winmix_engine_runs ((is_current)) where is_current;
create index if not exists winmix_engine_runs_input_idx
  on public.winmix_engine_runs (data_version_id, parameter_snapshot_id, started_at desc);

create table if not exists public.winmix_match_features (
  run_id                    uuid not null references public.winmix_engine_runs(id) on delete cascade,
  match_id                  uuid not null references public.winmix_matches(id) on delete cascade,
  sequence_no               integer not null check (sequence_no > 0),
  feature_schema_version    integer not null check (feature_schema_version > 0),
  features                  jsonb not null,
  created_at                timestamptz not null default now(),
  primary key (run_id, match_id),
  unique (run_id, sequence_no)
);

create table if not exists public.winmix_team_state_snapshots (
  run_id                    uuid not null references public.winmix_engine_runs(id) on delete cascade,
  team_id                   uuid not null references public.winmix_teams(id) on delete restrict,
  league                    text not null check (league in ('angol', 'spanyol')),
  as_of_match_id            uuid references public.winmix_matches(id) on delete restrict,
  sequence_no               integer not null check (sequence_no >= 0),
  state                     jsonb not null,
  created_at                timestamptz not null default now(),
  primary key (run_id, team_id, sequence_no),
  constraint winmix_snapshot_team_league_fkey
    foreign key (team_id, league) references public.winmix_teams (id, league)
);

create table if not exists public.winmix_predictions (
  run_id                    uuid not null references public.winmix_engine_runs(id) on delete cascade,
  match_id                  uuid not null references public.winmix_matches(id) on delete cascade,
  outcome_home              numeric(12,10) not null check (outcome_home between 0 and 1),
  outcome_draw              numeric(12,10) not null check (outcome_draw between 0 and 1),
  outcome_away              numeric(12,10) not null check (outcome_away between 0 and 1),
  lambda_home               numeric(12,8),
  lambda_away               numeric(12,8),
  confidence                numeric(12,10) check (confidence between 0 and 1),
  recommendation            jsonb not null default '{}'::jsonb,
  markets                   jsonb not null default '{}'::jsonb,
  model_output              jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  primary key (run_id, match_id),
  constraint winmix_prediction_probability_sum check (
    abs((outcome_home + outcome_draw + outcome_away) - 1.0) <= 0.000001
  )
);

create table if not exists public.winmix_calibration_results (
  run_id                    uuid not null references public.winmix_engine_runs(id) on delete cascade,
  league                    text not null check (league in ('angol', 'spanyol')),
  market_code               text not null,
  sample_count              integer not null check (sample_count >= 0),
  brier                     numeric(16,12),
  log_loss                  numeric(16,12),
  ece                       numeric(16,12),
  metrics                   jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  primary key (run_id, league, market_code)
);

create index if not exists winmix_match_features_run_idx on public.winmix_match_features (run_id, sequence_no);
create index if not exists winmix_team_snapshots_run_idx on public.winmix_team_state_snapshots (run_id, league, sequence_no);
create index if not exists winmix_predictions_run_idx on public.winmix_predictions (run_id, match_id);
create index if not exists winmix_calibration_run_idx on public.winmix_calibration_results (run_id, league);

-- Service-only queue claim: concurrency-safe and idempotent for Edge Function workers.
create or replace function public.winmix_claim_next_engine_job(p_worker text)
returns public.winmix_engine_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.winmix_engine_jobs;
begin
  with candidate as (
    select j.id
    from public.winmix_engine_jobs j
    join public.winmix_data_versions dv on dv.id = j.data_version_id
    where j.status = 'queued' and dv.status = 'sealed'
    order by j.created_at
    for update of j skip locked
    limit 1
  )
  update public.winmix_engine_jobs j
  set status = 'running', claimed_at = now(), claimed_by = p_worker,
      started_at = coalesce(j.started_at, now()), attempt_count = j.attempt_count + 1
  from candidate c
  where j.id = c.id
  returning j.* into claimed;

  return claimed;
end;
$$;

-- Promotion is the only point at which the public site sees a new dataset/run.
create or replace function public.winmix_promote_engine_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.winmix_engine_runs;
begin
  select * into v_run
  from public.winmix_engine_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'Unknown WinMix engine run: %', p_run_id;
  end if;
  if v_run.status <> 'succeeded' then
    raise exception 'Only a succeeded WinMix engine run can be promoted.';
  end if;
  if not exists (select 1 from public.winmix_predictions p where p.run_id = p_run_id) then
    raise exception 'A successful run needs at least one persisted prediction before promotion.';
  end if;

  update public.winmix_engine_runs set is_current = false where is_current;
  update public.winmix_data_versions set is_current = false where is_current;
  update public.winmix_engine_runs set is_current = true, finished_at = coalesce(finished_at, now()) where id = p_run_id;
  update public.winmix_data_versions set is_current = true where id = v_run.data_version_id;
  update public.winmix_engine_jobs set status = 'succeeded', finished_at = now()
  where id = v_run.job_id and status = 'running';
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Public reads: only the current, successfully completed run is visible.
--    Jobs, failures, checkpoints and uploaded source files remain server-only.
-- -----------------------------------------------------------------------------
alter table public.winmix_data_versions enable row level security;
alter table public.winmix_parameter_snapshots enable row level security;
alter table public.winmix_import_batches enable row level security;
alter table public.winmix_engine_jobs enable row level security;
alter table public.winmix_engine_runs enable row level security;
alter table public.winmix_match_features enable row level security;
alter table public.winmix_team_state_snapshots enable row level security;
alter table public.winmix_predictions enable row level security;
alter table public.winmix_calibration_results enable row level security;

-- Checkpoints contain implementation internals and must never be browser-readable.
drop policy if exists winmix_checkpoints_read_all on public.winmix_pipeline_checkpoints;
revoke all on public.winmix_pipeline_checkpoints from anon, authenticated;

revoke all on public.winmix_data_versions, public.winmix_parameter_snapshots,
  public.winmix_import_batches, public.winmix_engine_jobs, public.winmix_engine_runs,
  public.winmix_match_features, public.winmix_team_state_snapshots,
  public.winmix_predictions, public.winmix_calibration_results
from anon, authenticated;

grant select on public.winmix_data_versions, public.winmix_engine_runs,
  public.winmix_match_features, public.winmix_team_state_snapshots,
  public.winmix_predictions, public.winmix_calibration_results
to anon, authenticated;

drop policy if exists winmix_current_version_read on public.winmix_data_versions;
create policy winmix_current_version_read on public.winmix_data_versions
  for select to anon, authenticated using (is_current and status = 'sealed');

-- The original cloud tables remain readable for backwards compatibility, but
-- never leak rows from a superseded data version once a later import exists.
drop policy if exists winmix_seasons_read_all on public.winmix_seasons;
create policy winmix_seasons_current_version_read on public.winmix_seasons
  for select to anon, authenticated using (
    exists (
      select 1 from public.winmix_data_versions dv
      where dv.id = data_version_id and dv.is_current and dv.status = 'sealed'
    )
  );

drop policy if exists winmix_matches_read_all on public.winmix_matches;
create policy winmix_matches_current_version_read on public.winmix_matches
  for select to anon, authenticated using (
    exists (
      select 1 from public.winmix_data_versions dv
      where dv.id = data_version_id and dv.is_current and dv.status = 'sealed'
    )
  );

drop policy if exists winmix_current_run_read on public.winmix_engine_runs;
create policy winmix_current_run_read on public.winmix_engine_runs
  for select to anon, authenticated using (is_current and status = 'succeeded');

drop policy if exists winmix_current_features_read on public.winmix_match_features;
create policy winmix_current_features_read on public.winmix_match_features
  for select to anon, authenticated using (
    exists (select 1 from public.winmix_engine_runs r where r.id = run_id and r.is_current and r.status = 'succeeded')
  );

drop policy if exists winmix_current_team_states_read on public.winmix_team_state_snapshots;
create policy winmix_current_team_states_read on public.winmix_team_state_snapshots
  for select to anon, authenticated using (
    exists (select 1 from public.winmix_engine_runs r where r.id = run_id and r.is_current and r.status = 'succeeded')
  );

drop policy if exists winmix_current_predictions_read on public.winmix_predictions;
create policy winmix_current_predictions_read on public.winmix_predictions
  for select to anon, authenticated using (
    exists (select 1 from public.winmix_engine_runs r where r.id = run_id and r.is_current and r.status = 'succeeded')
  );

drop policy if exists winmix_current_calibration_read on public.winmix_calibration_results;
create policy winmix_current_calibration_read on public.winmix_calibration_results
  for select to anon, authenticated using (
    exists (select 1 from public.winmix_engine_runs r where r.id = run_id and r.is_current and r.status = 'succeeded')
  );

revoke all on function public.winmix_claim_next_engine_job(text) from public;
revoke all on function public.winmix_promote_engine_run(uuid) from public;
grant execute on function public.winmix_claim_next_engine_job(text) to service_role;
grant execute on function public.winmix_promote_engine_run(uuid) to service_role;

-- A lightweight, safe browser boot endpoint. No SQL errors, job details or secrets.
create or replace view public.winmix_current_engine_status
with (security_invoker = true) as
select
  dv.id as data_version_id,
  dv.version_key,
  dv.content_fingerprint,
  dv.league_coverage,
  dv.season_count,
  dv.match_count,
  dv.sealed_at,
  r.id as run_id,
  r.engine_version,
  r.result_summary,
  r.finished_at as computed_at
from public.winmix_data_versions dv
join public.winmix_engine_runs r on r.data_version_id = dv.id
where dv.is_current and r.is_current and r.status = 'succeeded';

grant select on public.winmix_current_engine_status to anon, authenticated;
revoke insert, update, delete on public.winmix_current_engine_status from anon, authenticated;

-- Keep the existing SQL rating mirror scoped to the one active version.
create or replace view public.view_team_ratings
with (security_invoker = true) as
with per_team as (
  select
    t.league, t.canonical_key, t.display_name,
    count(*) filter (where m.home_team_id = t.id) as home_games,
    count(*) filter (where m.away_team_id = t.id) as away_games,
    coalesce(sum(m.home_score) filter (where m.home_team_id = t.id), 0) as home_gf,
    coalesce(sum(m.away_score) filter (where m.home_team_id = t.id), 0) as home_ga,
    coalesce(sum(m.away_score) filter (where m.away_team_id = t.id), 0) as away_gf,
    coalesce(sum(m.home_score) filter (where m.away_team_id = t.id), 0) as away_ga,
    coalesce(sum(case
      when m.home_team_id = t.id and m.outcome = 'H' then 3
      when m.away_team_id = t.id and m.outcome = 'A' then 3
      when m.outcome = 'D' then 1 else 0 end), 0) as pts
  from public.winmix_teams t
  left join public.winmix_matches m on (m.home_team_id = t.id or m.away_team_id = t.id)
    and m.league = t.league
    and m.data_version_id = (select id from public.winmix_data_versions where is_current)
  group by t.league, t.canonical_key, t.display_name, t.id
), scored as (
  select league, canonical_key, display_name, (home_games + away_games) as total_played,
    case when home_games > 0 then (home_gf - home_ga)::numeric / home_games else 0 end as net_home,
    case when away_games > 0 then (away_gf - away_ga)::numeric / away_games else 0 end as net_away,
    case when (home_games + away_games) > 0 then pts::numeric / (home_games + away_games) else 1.35 end as ppg
  from per_team
), raw as (
  select *, 0.55 * net_home + 0.45 * net_away + 0.33 * ppg as raw_score from scored
), standardized as (
  select *, avg(raw_score) over (partition by league) as mu,
    coalesce(nullif(stddev_pop(raw_score) over (partition by league), 0), 1) as sigma
  from raw
)
select league, canonical_key, display_name, total_played,
  round(net_home, 2) as net_home, round(net_away, 2) as net_away, round(ppg, 2) as ppg,
  greatest(0, least(10, round((5.0 + ((raw_score - mu) / sigma) * 1.75)::numeric, 1))) as auto_weight_index
from standardized;

notify pgrst, 'reload schema';
commit;

-- After a successful run, SQL Editor displays this one-row verification result.
select
  dv.version_key,
  dv.status,
  dv.season_count,
  dv.match_count,
  dv.league_coverage,
  dv.content_fingerprint,
  (select count(*) from public.winmix_parameter_snapshots ps where ps.data_version_id = dv.id) as parameter_snapshots
from public.winmix_data_versions dv
where dv.version_key = 'baseline-v1';
