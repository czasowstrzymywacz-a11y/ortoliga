-- Only point awards, never answers, emails or the full progress document.
create or replace function public.get_league_point_history(p_user_id uuid, p_league text)
returns table(points numeric, kind text, occurred_at text, earned_date text)
language sql stable security definer set search_path=public,pg_temp as $$
 with source as (
 select coalesce(pr.data,'{}'::jsonb) as progress
 from public.student_profiles p left join public.student_progress pr on pr.user_id=p.user_id
 where p.user_id=p_user_id and auth.uid() is not null
 and p_league in ('ortho','english','spanish')
 ), entries as (
 select public.league_number_v50(e,'delta') as points,
 case when e->>'kind' in ('battle','flash','sentence') then e->>'kind' else 'answer' end as kind,
 nullif(e->>'at','') as occurred_at, null::text as earned_date
 from source cross join lateral jsonb_array_elements(
 case when jsonb_typeof(progress->(case p_league when 'english' then 'englishLeague' when 'spanish' then 'spanishLeague' else 'orthoBattle' end)->(case when p_league='english' then 'scoreEvents' else 'events' end))='array'
 then progress->(case p_league when 'english' then 'englishLeague' when 'spanish' then 'spanishLeague' else 'orthoBattle' end)->(case when p_league='english' then 'scoreEvents' else 'events' end)
 else '[]'::jsonb end) x(e)
 union all
 select greatest(0,least(100,round(public.league_number_v50(e,'score')))),
 'dictation',nullif(e->>'createdAt',''),nullif(e->>'date','')
 from source cross join lateral jsonb_array_elements(
 case when p_league='ortho' and jsonb_typeof(progress->'sessions')='array' then progress->'sessions' else '[]'::jsonb end) x(e)
 )
 select points,kind,occurred_at,earned_date from entries where points>0
 order by coalesce(occurred_at,earned_date) desc nulls last limit 30;
$$;
revoke all on function public.get_league_point_history(uuid,text) from public,anon;
grant execute on function public.get_league_point_history(uuid,text) to authenticated;
notify pgrst,'reload schema';