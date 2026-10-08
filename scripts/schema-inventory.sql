-- READ ONLY: run on the intended staging/production project before choosing a migration.
select current_database(),version();
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('winmix_data_versions','winmix_seasons','winmix_matches','winmix_teams','winmix_import_batches')
order by table_name,ordinal_position;
select c.relname,con.conname,pg_get_constraintdef(con.oid) definition
from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'winmix_%' order by c.relname,con.conname;
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename like 'winmix_%';
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename like 'winmix_%';
select grantee,table_name,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name like 'winmix_%' and grantee in ('PUBLIC','anon','authenticated','service_role')
order by table_name,grantee,privilege_type;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'winmix_%' order by p.proname;
select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='view_team_ratings';
select tgrelid::regclass table_name,tgname,pg_get_triggerdef(oid) definition from pg_trigger
where not tgisinternal and tgrelid in (to_regclass('public.winmix_seasons'),to_regclass('public.winmix_matches'),to_regclass('public.winmix_data_versions'));
-- Only if the versioned tables/columns exist:
select id,version_key,status,is_current,season_count,match_count from public.winmix_data_versions;
select s.id,s.data_version_id,s.league,s.season_index,s.match_count,count(m.id) actual_count
from public.winmix_seasons s left join public.winmix_matches m on m.season_id=s.id
group by s.id,s.data_version_id,s.league,s.season_index,s.match_count having count(m.id)<>s.match_count;
