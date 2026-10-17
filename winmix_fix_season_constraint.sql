-- WinMix SQL Fix: Drop legacy unversioned unique constraint on winmix_seasons
--
-- Why: The legacy constraint "winmix_ingest_season_identity_uq" enforces UNIQUE(league, season_index)
-- across ALL data versions. When any new draft is ingested with season_index = 1, PostgreSQL fails
-- with unique_violation (error 23505) because season 1 already exists in the sealed version.
-- The secure versioned index "winmix_cloud_season_index_uq" already enforces UNIQUE(data_version_id, league, season_index).

ALTER TABLE public.winmix_seasons DROP CONSTRAINT IF EXISTS winmix_ingest_season_identity_uq;
ALTER TABLE public.winmix_seasons DROP CONSTRAINT IF EXISTS winmix_seasons_league_season_index_key;

-- Ensure versioned unique indexes exist
CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_season_source_uq ON public.winmix_seasons(data_version_id, league, source_season_key);
CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_season_index_uq ON public.winmix_seasons(data_version_id, league, season_index);
CREATE UNIQUE INDEX IF NOT EXISTS winmix_cloud_match_no_uq ON public.winmix_matches(data_version_id, season_id, match_no);
