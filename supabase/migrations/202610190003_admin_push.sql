begin;
create table public.admin_push_keys (id boolean primary key default true check(id),public_key text not null,private_key text not null);
create table public.admin_push_subscriptions (id text primary key,user_id uuid not null references auth.users(id) on delete cascade,subscription jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index admin_push_subscriptions_owner on public.admin_push_subscriptions(user_id);
create table public.student_push_activity (user_id uuid primary key references auth.users(id) on delete cascade,last_seen_at timestamptz not null default now(),last_notice_at timestamptz,league text not null default 'none');
alter table public.admin_push_keys enable row level security;
alter table public.admin_push_subscriptions enable row level security;
alter table public.student_push_activity enable row level security;
revoke all on public.admin_push_keys,public.admin_push_subscriptions,public.student_push_activity from public,anon,authenticated;
grant select,insert on public.admin_push_keys to service_role;
grant select,insert,update,delete on public.admin_push_subscriptions to service_role;
grant select,insert,update on public.student_push_activity to service_role;
create or replace function public.claim_student_activity_notice(p_user_id uuid,p_league text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.student_push_activity; student_name text; should_send boolean;
begin
 if p_league not in ('none','ortho','english','spanish','helper') then raise exception 'Nieprawidłowa liga.';end if;
 select display_name into student_name from public.student_profiles where user_id=p_user_id;
 if student_name is null then return jsonb_build_object('notify',false);end if;
 perform pg_advisory_xact_lock(hashtext('push-active:'||p_user_id::text));
 select * into prior from public.student_push_activity where user_id=p_user_id;
 if prior.last_seen_at>now()-interval '30 seconds' then return jsonb_build_object('notify',false);end if;
 should_send:=(prior.user_id is null or prior.last_seen_at<now()-interval '3 minutes') and (prior.last_notice_at is null or prior.last_notice_at<now()-interval '30 minutes');
 insert into public.student_push_activity(user_id,last_seen_at,last_notice_at,league) values(p_user_id,now(),case when should_send then now() else null end,p_league)
 on conflict(user_id) do update set last_seen_at=now(),last_notice_at=case when should_send then now() else student_push_activity.last_notice_at end,league=p_league;
 return jsonb_build_object('notify',should_send,'name',student_name);
end;$$;
revoke all on function public.claim_student_activity_notice(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_student_activity_notice(uuid,text) to service_role;
create or replace function public.get_admin_push_targets(p_exclude uuid)
returns table(id text,subscription jsonb) language sql stable security definer set search_path=public,pg_temp as $$
 select s.id,s.subscription from public.admin_push_subscriptions s join public.class_chat_admins a on a.user_id=s.user_id where s.user_id<>p_exclude order by s.updated_at desc limit 30;
$$;
revoke all on function public.get_admin_push_targets(uuid) from public,anon,authenticated;
grant execute on function public.get_admin_push_targets(uuid) to service_role;
notify pgrst,'reload schema';
commit;
