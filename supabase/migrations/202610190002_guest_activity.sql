begin;
create table public.guest_learning_sessions (
 id uuid primary key, started_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 device text not null check(device in ('mobile','desktop')), active_seconds integer not null default 0
);
create index guest_learning_sessions_started on public.guest_learning_sessions(started_at desc);
create table public.guest_learning_events (
 id uuid primary key, session_id uuid not null references public.guest_learning_sessions(id) on delete cascade,
 created_at timestamptz not null default now(), kind text not null check(kind in ('entry','league','section','answer','series','flash')),
 league text not null check(league in ('none','ortho','english','spanish','helper')),
 section text not null check(section in ('none','cards','practice','progress','battle','rankings','pairs','writing','dictionary','sentences','dictation','rules','words','topics')),
 topic text not null default 'none' check(topic in ('none','part1','part2','all','tenses','lesson-20261019','everyday')),
 correct_count integer not null default 0 check(correct_count between 0 and 100), wrong_count integer not null default 0 check(wrong_count between 0 and 100)
);
create index guest_learning_events_session on public.guest_learning_events(session_id,created_at desc);
alter table public.guest_learning_sessions enable row level security;
alter table public.guest_learning_events enable row level security;
revoke all on public.guest_learning_sessions,public.guest_learning_events from public,anon,authenticated;
create or replace function public.record_guest_activity(p_session uuid,p_device text,p_events jsonb default '[]')
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb; stamp timestamptz; event_total integer;
begin
 if auth.uid() is not null then return false;end if;
 if p_session is null or p_device not in ('mobile','desktop') or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>20 then return false;end if;
 perform pg_advisory_xact_lock(hashtext(p_session::text));
 if not exists(select 1 from public.guest_learning_sessions where id=p_session) then
  perform pg_advisory_xact_lock(hashtext('eduliga-guest-daily-limit'));
  if (select count(*) from public.guest_learning_sessions where started_at>now()-interval '1 day')>=2000 then return false;end if;
  insert into public.guest_learning_sessions(id,device) values(p_session,p_device);
 end if;
 select last_seen_at into stamp from public.guest_learning_sessions where id=p_session;
 update public.guest_learning_sessions set active_seconds=active_seconds+greatest(0,least(45,floor(extract(epoch from now()-stamp))::int)), last_seen_at=now() where id=p_session;
 select count(*) into event_total from public.guest_learning_events where session_id=p_session;
 if event_total>=2000 then return true;end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'kind' not in ('entry','league','section','answer','series','flash') or e->>'league' not in ('none','ortho','english','spanish','helper') or e->>'section' not in ('none','cards','practice','progress','battle','rankings','pairs','writing','dictionary','sentences','dictation','rules','words','topics') then continue;end if;
  insert into public.guest_learning_events(id,session_id,kind,league,section,topic,correct_count,wrong_count)
  values((e->>'id')::uuid,p_session,e->>'kind',e->>'league',e->>'section',case when e->>'topic' in ('part1','part2','all','tenses','lesson-20261019','everyday') then e->>'topic' else 'none' end,greatest(0,least(100,coalesce((e->>'correct')::int,0))),greatest(0,least(100,coalesce((e->>'wrong')::int,0)))) on conflict(id) do nothing;
 end loop;
 return true;
end;$$;
create or replace function public.get_admin_guest_activity(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare since timestamptz; summary jsonb; leagues jsonb; sections jsonb; recent jsonb;
begin
 if auth.uid() is null or not public.is_chat_admin() then return jsonb_build_object('admin',false);end if;
 since:=(date_trunc('day',now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw')-make_interval(days=>greatest(1,least(30,coalesce(p_days,7)))-1);
 select jsonb_build_object('sessions',count(*),'active',count(*) filter(where last_seen_at>now()-interval '2 minutes'),'seconds',coalesce(sum(active_seconds),0),'first',min(started_at)) into summary from public.guest_learning_sessions where started_at>=since;
 select summary||jsonb_build_object('correct',coalesce(sum(correct_count),0),'wrong',coalesce(sum(wrong_count),0),'series',count(*) filter(where kind='series')) into summary from public.guest_learning_events where created_at>=since;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into leagues from (select league,count(*) filter(where kind='league') as visits,coalesce(sum(correct_count),0) as correct,coalesce(sum(wrong_count),0) as wrong from public.guest_learning_events where created_at>=since and league<>'none' group by league order by count(*) filter(where kind='league') desc) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into sections from (select league,section,topic,count(*) as visits from public.guest_learning_events where created_at>=since and kind='section' group by league,section,topic order by count(*) desc limit 12) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into recent from (
  select s.id,s.started_at,s.last_seen_at,s.device,s.active_seconds,
  (select coalesce(sum(correct_count),0) from public.guest_learning_events e where e.session_id=s.id) as correct,
  (select coalesce(sum(wrong_count),0) from public.guest_learning_events e where e.session_id=s.id) as wrong,
  (select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select created_at,kind,league,section,topic,correct_count,wrong_count from public.guest_learning_events e where e.session_id=s.id order by created_at desc,id limit 8) t) as trail
  from public.guest_learning_sessions s where started_at>=since order by last_seen_at desc limit 20
 ) x;
 return jsonb_build_object('admin',true,'summary',summary,'leagues',leagues,'sections',sections,'recent',recent,'since',since);
end;$$;
revoke all on function public.record_guest_activity(uuid,text,jsonb),public.get_admin_guest_activity(integer) from public,anon,authenticated;
grant execute on function public.record_guest_activity(uuid,text,jsonb) to anon;
grant execute on function public.get_admin_guest_activity(integer) to authenticated;
notify pgrst,'reload schema';
commit;
