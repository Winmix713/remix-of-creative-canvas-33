# WinMix Data Version Contract

## Decisions

1. **`current` version = full historical snapshot.** A published `current`
   version contains all supported English and Spanish seasons — not just the
   last-uploaded CSV. One published version does not depend on earlier
   versions' data.

2. **One CSV = one season, 240 matches.** Each CSV file contains exactly one
   season's data. Multiple CSVs are imported separately into a shared draft
   version.

3. **`winmix_validate_data_version_seal()` is server-side only.** It is a
   trigger function (`RETURNS trigger`), not a frontend API. Only
   `service_role` can fire it (via a status transition to `sealed`).
   `EXECUTE` is revoked from `anon` and `authenticated`.

## Version lifecycle

```
draft → sealed → (published as current)
         ↘ rejected
```

- **draft**: Data is being imported. Not visible to the frontend (RLS filters
  to `is_current = true` only). Multiple CSV imports can append to the same
  draft.
- **sealed**: The seal trigger validates the full season manifest. If
  validation fails, the transition is rejected and the version stays in its
  previous state. If it succeeds, `sealed_at` is set.
- **current**: A sealed version is promoted to `is_current = true` via
  `winmix_publish_data_version()`. The previous current version is demoted
  to `superseded`.
- **rejected**: A version that failed validation or was discarded.
- **superseded**: A former current version that has been replaced.

## Seal validation checklist

Before a version can be sealed, the trigger checks:

1. **240 matches per season** (16-team double round-robin).
2. **16 teams** present in the version.
3. **15 home + 15 away** appearances per team.
4. **240 directed pairs** — every (A→B) appears exactly once, no repeats,
   no missing pairs.

## Source season key

Each season has a `source_season_key` (format: `{league}_{seasonIndex}`).
This key is **unique within a version** but **can repeat across versions**.
This allows the same season to appear in multiple data versions without
conflict.

## Import batches

Every CSV upload creates a `winmix_import_batches` record tied to the draft
version. This records the file name, content hash, row counts, and status.
Import batches are administrative — no anon/authenticated access.

## Frontend data access

The frontend reads only from the **current** version:

| Table | Access | Filter |
|-------|--------|--------|
| `winmix_data_versions` | SELECT | `is_current = true` |
| `winmix_seasons` | SELECT | `data_version_id IN (current)` |
| `winmix_matches` | SELECT | `data_version_id IN (current)` |
| `winmix_teams` | SELECT | all (canonical, not versioned) |
| `view_team_ratings` | SELECT | inherits base-table RLS |
| `winmix_pipeline_checkpoints` | SELECT | all (diagnostic) |
| `winmix_import_batches` | none | service_role only |

The frontend never calls `winmix_validate_data_version_seal()` or
`winmix_publish_data_version()`. These are administrative operations
performed by the server-side ingestion tooling.

## Migration registry

| Migration | Status |
|-----------|--------|
| `20260902143548_501e0710...` | Applied — initial cloud tier schema |
| `20260904154245_winmix_cloud_tier_schema` | Applied — RLS, view, grants |
| `20260904154306_revoke_view_write_privileges` | Applied — view write lockdown |
| `winmix_lockdown_migration.sql` | Prepared, not tracked — legacy table lockdown |
| `winmix_data_versioning` | **Pending** — versioning, import batches, seal |

The `winmix_data_versioning` migration adds:
- `winmix_data_versions` table
- `winmix_import_batches` table
- `data_version_id` + `source_season_key` on `winmix_seasons`
- `data_version_id` on `winmix_matches`
- Version-filtered RLS policies (replacing broad SELECT)
- `winmix_validate_data_version_seal()` trigger function
- `winmix_publish_data_version()` RPC
- Back-fill of existing rows into a `v1.0-legacy` current version
