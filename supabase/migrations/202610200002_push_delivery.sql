begin;
alter table public.student_push_activity add column last_delivery_at timestamptz,add column last_targets integer,add column last_sent integer,add column last_failed integer;
create or replace function public.record_push_delivery(p_user_id uuid,p_targets integer,p_sent integer,p_failed integer)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.student_push_activity set last_delivery_at=now(),last_targets=greatest(0,p_targets),last_sent=greatest(0,p_sent),last_failed=greatest(0,p_failed),last_notice_at=case when p_sent>0 then last_notice_at else null end where user_id=p_user_id;
$$;
revoke all on function public.record_push_delivery(uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.record_push_delivery(uuid,integer,integer,integer) to service_role;
create or replace function public.get_admin_push_report()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare devices jsonb; activity jsonb;
begin
 if auth.uid() is null or not public.is_chat_admin() then return jsonb_build_object('admin',false);end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into devices from (select p.display_name,count(s.id) as devices,max(s.updated_at) as registered_at from public.class_chat_admins a left join public.student_profiles p on p.user_id=a.user_id left join public.admin_push_subscriptions s on s.user_id=a.user_id group by p.display_name) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into activity from (select p.display_name,a.last_seen_at,a.last_notice_at,a.league,a.last_delivery_at,a.last_targets,a.last_sent,a.last_failed from public.student_push_activity a left join public.student_profiles p on p.user_id=a.user_id order by a.last_seen_at desc limit 30) x;
 return jsonb_build_object('admin',true,'devices',devices,'activity',activity);
end;$$;
revoke all on function public.get_admin_push_report() from public,anon;
grant execute on function public.get_admin_push_report() to authenticated;
notify pgrst,'reload schema';
commit;
