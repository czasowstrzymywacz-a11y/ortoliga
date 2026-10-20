begin;
-- Short-lived game transport; never contains account credentials or chat text.
create table public.battle_room_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 connection_id uuid not null, league text not null, topic text not null,
 display_name text not null, joined_at timestamptz not null default now(),
 last_seen timestamptz not null default now(), phase text not null default 'lobby',
 round_no integer not null default 0
);
create index battle_room_members_scope on public.battle_room_members(league,topic,last_seen);
create table public.battle_room_packets (
 seq bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 connection_id uuid not null, league text not null, topic text not null,
 payload jsonb not null, created_at timestamptz not null default now()
);
create index battle_room_packets_scope on public.battle_room_packets(league,topic,seq);
alter table public.battle_room_members enable row level security;
alter table public.battle_room_packets enable row level security;
revoke all on public.battle_room_members,public.battle_room_packets from anon,authenticated;

create function public.battle_room_sync(p_league text,p_topic text,p_connection_id uuid,p_after bigint default 0,p_claim boolean default false,p_phase text default 'lobby',p_round integer default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); existing public.battle_room_members; roster jsonb; packets jsonb; cursor_no bigint; leader uuid; floor_no bigint;
begin
 if me is null then raise exception 'Zaloguj się, aby wejść do bitwy.'; end if;
 if p_connection_id is null or p_league is null or p_topic is null or not (
  (p_league='english' and p_topic in ('part1','part2','all','tenses','lesson-20261019')) or
  (p_league='spanish' and p_topic='everyday') or (p_league='ortho' and p_topic='part1')) then raise exception 'Nieprawidłowy pokój.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,85));
 select * into existing from public.battle_room_members where user_id=me;
 if not p_claim and (existing.user_id is null or existing.connection_id<>p_connection_id or existing.league<>p_league or existing.topic<>p_topic) then raise exception 'Pokój otwarto w innej karcie. Wejdź ponownie.'; end if;
 insert into public.battle_room_members(user_id,connection_id,league,topic,display_name,joined_at,last_seen,phase,round_no)
 select me,p_connection_id,p_league,p_topic,left(coalesce(nullif(u.raw_user_meta_data->>'display_name',''),'Zawodnik'),80),
 case when existing.connection_id=p_connection_id and existing.last_seen>now()-interval '45 seconds' then existing.joined_at else now() end,now(),
 case when p_phase in ('lobby','question','results') then p_phase else 'lobby' end,greatest(0,least(10,coalesce(p_round,0)))
 from auth.users u where u.id=me
 on conflict(user_id) do update set connection_id=excluded.connection_id,league=excluded.league,topic=excluded.topic,display_name=excluded.display_name,joined_at=excluded.joined_at,last_seen=excluded.last_seen,phase=excluded.phase,round_no=excluded.round_no;
 select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'name',display_name,'joined',extract(epoch from joined_at)*1000) order by joined_at,user_id),'[]'::jsonb)
 into roster from public.battle_room_members where league=p_league and topic=p_topic and last_seen>now()-interval '45 seconds';
 select user_id into leader from public.battle_room_members where league=p_league and topic=p_topic and last_seen>now()-interval '45 seconds' order by joined_at,user_id limit 1;
 floor_no:=greatest(0,coalesce(p_after,0));
 if floor_no=0 then
  select coalesce(max(seq)-1,0) into floor_no from public.battle_room_packets where league=p_league and topic=p_topic and user_id=leader and payload->>'kind'='state' and created_at>now()-interval '3 minutes';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('seq',seq,'payload',payload) order by seq),'[]'::jsonb),coalesce(max(seq),floor_no)
 into packets,cursor_no from (select seq,payload from public.battle_room_packets where league=p_league and topic=p_topic and seq>floor_no and created_at>now()-interval '3 minutes' order by seq limit 150) p;
 -- These are disposable transport packets, not learning results.
 delete from public.battle_room_packets where seq in (select seq from public.battle_room_packets where created_at<now()-interval '5 minutes' order by seq limit 100);
 return jsonb_build_object('players',roster,'packets',packets,'cursor',cursor_no,'serverNow',extract(epoch from clock_timestamp())*1000);
end;$$;

create function public.battle_room_send(p_connection_id uuid,p_payload jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); member public.battle_room_members; leader uuid; result bigint; kind text:=p_payload->>'kind';
begin
 if me is null then raise exception 'Wymagane logowanie.'; end if;
 select * into member from public.battle_room_members where user_id=me and connection_id=p_connection_id and last_seen>now()-interval '45 seconds';
 if member.user_id is null then raise exception 'Najpierw dołącz do pokoju.'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or kind is null or kind not in ('state','answer','state-request','next') or octet_length(p_payload::text)>250000 then raise exception 'Nieprawidłowa wiadomość bitwy.'; end if;
 select user_id into leader from public.battle_room_members where league=member.league and topic=member.topic and last_seen>now()-interval '45 seconds' order by joined_at,user_id limit 1;
 if kind='state' and leader<>me then raise exception 'Stan zapisuje prowadzący pokój.'; end if;
 insert into public.battle_room_packets(user_id,connection_id,league,topic,payload)
 values(me,p_connection_id,member.league,member.topic,p_payload||jsonb_build_object('sender',me)) returning seq into result;
 return result;
end;$$;

create function public.battle_room_leave(p_connection_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.battle_room_members set last_seen=now()-interval '1 hour' where user_id=auth.uid() and connection_id=p_connection_id;
$$;

create function public.list_active_battle_rooms()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Zaloguj się, aby zobaczyć bitwy.'; end if;
 return (select coalesce(jsonb_agg(r order by r->>'league',r->>'topic'),'[]'::jsonb) from (
 select jsonb_build_object('league',league,'topic',topic,'players',jsonb_agg(jsonb_build_object('name',display_name,'id',user_id) order by joined_at,user_id),'count',count(*),
 'phase',(array_agg(phase order by joined_at,user_id))[1],'round',(array_agg(round_no order by joined_at,user_id))[1]) r
 from public.battle_room_members where last_seen>now()-interval '45 seconds' group by league,topic) rooms);
end;$$;
revoke all on function public.battle_room_sync(text,text,uuid,bigint,boolean,text,integer),public.battle_room_send(uuid,jsonb),public.battle_room_leave(uuid),public.list_active_battle_rooms() from public,anon;
grant execute on function public.battle_room_sync(text,text,uuid,bigint,boolean,text,integer),public.battle_room_send(uuid,jsonb),public.battle_room_leave(uuid),public.list_active_battle_rooms() to authenticated;
notify pgrst,'reload schema';
commit;
