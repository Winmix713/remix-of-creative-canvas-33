create table if not exists public.winmix_teams (
  id            uuid primary key default gen_random_uuid(),
  league        text not null check (league in ('angol','spanyol')),
  canonical_key text not null,
  display_name  text not null,
  weight_index  numeric(4,1) not null default 5.0 check (weight_index between 0 and 10),
  weight_source text not null default 'auto' check (weight_source in ('auto','manual')),
  updated_at    timestamptz not null default now(),
  unique (league, canonical_key)
);

create table if not exists public.winmix_seasons (
  id           uuid primary key default gen_random_uuid(),
  league       text not null check (league in ('angol','spanyol')),
  season_index int  not null,
  name         text not null,
  file_name    text not null,
  content_hash text,
  match_count  int  not null default 0,
  order_mode   text not null default 'chronological'
               check (order_mode in ('chronological','source-order')),
  created_at   timestamptz not null default now(),
  unique (league, season_index)
);

create table if not exists public.winmix_matches (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references public.winmix_seasons(id) on delete cascade,
  league         text not null check (league in ('angol','spanyol')),
  match_no       int  not null,
  source_file_id text,
  row_index      int,
  kickoff_iso    timestamptz,
  match_date_raw text,
  home_team_id   uuid not null references public.winmix_teams(id),
  away_team_id   uuid not null references public.winmix_teams(id),
  ht_home_score  int check (ht_home_score >= 0),
  ht_away_score  int check (ht_away_score >= 0),
  home_score     int not null check (home_score >= 0),
  away_score     int not null check (away_score >= 0),
  total_goals    int generated always as (home_score + away_score) stored,
  btts           boolean generated always as (home_score > 0 and away_score > 0) stored,
  outcome        text generated always as (
                   case when home_score > away_score then 'H'
                        when home_score < away_score then 'A'
                        else 'D' end) stored,
  created_at     timestamptz not null default now(),
  constraint ht_le_ft check (
    (ht_home_score is null or ht_home_score <= home_score) and
    (ht_away_score is null or ht_away_score <= away_score)
  ),
  unique (season_id, match_no)
);

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
