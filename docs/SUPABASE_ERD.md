# WinMix Supabase ERD

```mermaid
classDiagram
    class winmix_teams {
        uuid id PK
        string league
        string canonical_key
        string display_name
        numeric weight_index
        string weight_source
        timestamptz updated_at
    }

    class winmix_seasons {
        uuid id PK
        string league
        int season_index
        string name
        string file_name
        string content_hash
        int match_count
        string order_mode
        timestamptz created_at
    }

    class winmix_matches {
        uuid id PK
        uuid season_id FK
        uuid home_team_id FK
        uuid away_team_id FK
        string league
        int match_no
        string source_file_id
        int row_index
        timestamptz kickoff_iso
        string match_date_raw
        int ht_home_score
        int ht_away_score
        int home_score
        int away_score
        int total_goals
        boolean btts
        string outcome
        timestamptz created_at
    }

    class winmix_pipeline_checkpoints {
        string league PK
        int feature_schema_version
        int processed_match_count
        string prefix_signature
        string weights_signature
        string experiments_key
        string history_scope
        numeric calibration_t
        numeric ensemble_w_m1
        boolean ensemble_tuned
        jsonb m1_fit
        jsonb calib_history
        jsonb fit_history
        timestamptz saved_at
    }

    winmix_seasons "1" --> "N" winmix_matches : season_id (ON DELETE CASCADE)
    winmix_teams "1" --> "N" winmix_matches : home_team_id
    winmix_teams "1" --> "N" winmix_matches : away_team_id
```

## Constraints

- `winmix_teams`: UNIQUE(league, canonical_key), league IN ('angol','spanyol'), weight_index 0–10
- `winmix_seasons`: UNIQUE(league, season_index), order_mode IN ('chronological','source-order')
- `winmix_matches`: UNIQUE(season_id, match_no), HT ≤ FT check, generated columns for total_goals/btts/outcome
- `winmix_pipeline_checkpoints`: league is PK, history_scope IN ('season-only','league-cumulative')

## Security

- RLS enabled on all four tables
- SELECT-only policies for anon + authenticated (no INSERT/UPDATE/DELETE policies)
- GRANT SELECT to anon, authenticated; REVOKE write from anon, authenticated
- `view_team_ratings` uses `security_invoker = true`
- Only `service_role` (server-side) can write, bypassing RLS
