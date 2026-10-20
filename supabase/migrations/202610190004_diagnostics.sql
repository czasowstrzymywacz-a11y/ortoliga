begin;
create table public.app_diagnostics (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
 user_id uuid references auth.users(id) on delete set null, session_id uuid not null,
 code text not null, app_version text not null, league text not null, device text not null
);
create index app_diagnostics_recent on public.app_diagnostics(created_at desc);
create index app_diagnostics_session on public.app_diagnostics(session_id,created_at desc);
alter table public.app_diagnostics enable row level security;
revoke all on public.app_diagnostics from public,anon,authenticated;
create or replace function public.record_app_diagnostic(p_session uuid,p_code text,p_version text,p_league text,p_device text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_session is null or p_code is null or p_code not in ('login_credentials','login_confirmation','login_rate_limit','auth_network','auth_other','recovery_sent','recovery_failed','confirmation_failed','recovery_link_invalid','save_failed','load_failed','battle_disconnected','battle_reconnected','battle_send_failed','battle_resumed','local_storage_failed') then return false;end if;
 if p_version is null or p_version !~ '^\d{1,3}\.\d{1,4}$' or p_league not in ('none','ortho','english','spanish','helper') or p_device not in ('mobile','desktop') then return false;end if;
 perform pg_advisory_xact_lock(hashtext('diagnostic:'||p_session::text));
 if (select count(*) from public.app_diagnostics where session_id=p_session and created_at>now()-interval '1 hour')>=30 then return false;end if;
 if exists(select 1 from public.app_diagnostics where session_id=p_session and code=p_code and created_at>now()-interval '1 minute') then return false;end if;
 if (select count(*) from public.app_diagnostics where created_at>now()-interval '1 day')>=10000 then return false;end if;
 insert into public.app_diagnostics(user_id,session_id,code,app_version,league,device) values(auth.uid(),p_session,p_code,p_version,p_league,p_device);
 return true;
end;$$;
create or replace function public.get_admin_diagnostics(p_days integer default 7,p_code text default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare items jsonb; totals jsonb; since_at timestamptz;
begin
 if auth.uid() is null or not public.is_chat_admin() then return jsonb_build_object('admin',false,'items','[]'::jsonb,'totals','[]'::jsonb);end if;
 since_at:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,7),30)));
 select coalesce(jsonb_agg(to_jsonb(t) order by t.count desc),'[]'::jsonb) into totals from (select code,count(*) as count from public.app_diagnostics where created_at>=since_at group by code) t;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into items from (
 select d.id,d.created_at,d.code,d.app_version,d.league,d.device,case when d.user_id is null then 'Niezalogowana sesja' else coalesce(p.display_name,'Użytkownik') end as display_name
 from public.app_diagnostics d left join public.student_profiles p on p.user_id=d.user_id
 where d.created_at>=since_at and (p_code is null or d.code=p_code) order by d.created_at desc limit 150
 ) t;
 return jsonb_build_object('admin',true,'items',items,'totals',totals,'since',since_at);
end;$$;
revoke all on function public.record_app_diagnostic(uuid,text,text,text,text),public.get_admin_diagnostics(integer,text) from public,anon,authenticated;
grant execute on function public.record_app_diagnostic(uuid,text,text,text,text) to anon,authenticated;
grant execute on function public.get_admin_diagnostics(integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
