begin;
do $math$ declare r record; source text; before_text text; begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('league_stats_v50','get_league_board','get_league_point_history','send_league_battle_invitation','send_topic_battle_invitation','battle_room_sync') loop
 source:=pg_get_functiondef(r.oid);before_text:=source;
 source:=replace(source,'''ortho'',''english'',''spanish''','''ortho'',''english'',''spanish'',''math''');
 if r.proname='league_stats_v50' then
 source:=replace(source,'league in (''ortho'',''spanish'')','league in (''ortho'',''spanish'',''math'')');
 source:=replace(source,'when league=''ortho'' then ''orthoBattle'' else ''spanishLeague''','when league=''ortho'' then ''orthoBattle'' when league=''math'' then ''mathLeague'' else ''spanishLeague''');
 elsif r.proname='get_league_point_history' then
 source:=replace(source,'when ''spanish'' then ''spanishLeague''','when ''spanish'' then ''spanishLeague'' when ''math'' then ''mathLeague''');
 elsif r.proname='battle_room_sync' then
 source:=replace(source,'(p_league=''spanish'' and p_topic=''everyday'')','(p_league=''math'' and p_topic=''divisibility'') or (p_league=''spanish'' and p_topic=''everyday'')');
 elsif r.proname='send_topic_battle_invitation' then
 source:=replace(source,'if p_topic is null or','if p_topic is null or (p_league=''math'' and p_topic<>''divisibility'') or');
 end if;
 if source=before_text then raise exception 'Nie zmieniono funkcji %',r.proname;end if;
 execute source;
 end loop;
 for r in select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.english_battle_invitations'::regclass and contype='c' loop
 if r.definition like '%league%' and r.definition like '%spanish%' then
 execute format('alter table public.english_battle_invitations drop constraint %I',r.conname);
 execute format('alter table public.english_battle_invitations add constraint %I check (league in (''ortho'',''english'',''spanish'',''math''))',r.conname);
 elsif r.definition like '%topic%' and r.definition like '%everyday%' then
 execute format('alter table public.english_battle_invitations drop constraint %I',r.conname);
 execute format('alter table public.english_battle_invitations add constraint %I check (topic in (''part1'',''part2'',''all'',''tenses'',''lesson-20261019'',''everyday'',''divisibility''))',r.conname);
 end if;
 end loop;
end $math$;
notify pgrst,'reload schema';
commit;
select public.league_stats_v50('{"mathLeague":{"events":[{"id":"self-check","delta":10,"kind":"answer","ok":true}]}}'::jsonb,'math')->>'points' as math_check;

begin;
do $tracking$ declare r record; s text; begin
for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_guest_activity','record_member_activity','record_app_diagnostic') loop
s:=pg_get_functiondef(r.oid);s:=replace(s,'''none'',''ortho'',''english'',''spanish'',''helper''','''none'',''ortho'',''english'',''spanish'',''helper'',''math''');execute s;
end loop;
for r in select conrelid::regclass as tbl,conname from pg_constraint where conrelid in ('public.guest_learning_events'::regclass,'public.member_learning_events'::regclass) and contype='c' and pg_get_constraintdef(oid) like '%league%' loop
execute format('alter table %s drop constraint %I',r.tbl,r.conname);
execute format('alter table %s add constraint %I check (league in (''none'',''ortho'',''english'',''spanish'',''helper'',''math''))',r.tbl,r.conname);
end loop;
end $tracking$;
commit;
