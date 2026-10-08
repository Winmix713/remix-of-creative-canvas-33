-- READ ONLY. Run as database owner. All forbidden_* values must be false.
select
  has_function_privilege('anon','public.winmix_ingest_v2(uuid,uuid,uuid,integer,jsonb)','EXECUTE') forbidden_anon_ingest,
  has_function_privilege('authenticated','public.winmix_ingest_v2(uuid,uuid,uuid,integer,jsonb)','EXECUTE') forbidden_user_ingest,
  has_table_privilege('anon','public.winmix_matches','INSERT,UPDATE,DELETE,TRUNCATE') forbidden_anon_write,
  has_table_privilege('authenticated','public.winmix_matches','INSERT,UPDATE,DELETE,TRUNCATE') forbidden_user_write,
  has_table_privilege('anon','public.winmix_cloud_operators','SELECT,INSERT,UPDATE,DELETE') forbidden_operator_access;
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('winmix_data_versions','winmix_seasons','winmix_matches','winmix_teams','winmix_cloud_operators','winmix_ingest_receipts');
select tablename,policyname,cmd,roles from pg_policies where schemaname='public'
and tablename in ('winmix_data_versions','winmix_seasons','winmix_matches','winmix_teams');
select id,version_key,status,is_current,ingest_revision,season_count,match_count from public.winmix_data_versions order by created_at desc;
select request_id,data_version_id,created_at,receipt->>'revision' revision from public.winmix_ingest_receipts order by created_at desc limit 10;
