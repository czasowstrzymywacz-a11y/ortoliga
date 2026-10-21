-- Show corrective awards without exposing account data or private event metadata.
begin;
do $history$ declare source text; begin
source:=pg_get_functiondef('public.get_league_point_history(uuid,text)'::regprocedure);
source:=replace(source,'''battle'',''flash'',''sentence''','''battle'',''flash'',''sentence'',''adjustment''');
execute source;
end $history$;
notify pgrst,'reload schema';
commit;
