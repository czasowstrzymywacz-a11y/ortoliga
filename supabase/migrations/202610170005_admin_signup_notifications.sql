begin;
-- Durable signup events. Only the existing chat administrators can read them.
create table public.admin_signup_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 display_name text not null,
 created_at timestamptz not null default now(),
 read_by uuid[] not null default '{}'
);
create index admin_signup_notifications_date on public.admin_signup_notifications(created_at desc,id);
alter table public.admin_signup_notifications enable row level security;
revoke all on public.admin_signup_notifications from public,anon,authenticated;
create or replace function public.notify_admin_student_signup()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.admin_signup_notifications(user_id,display_name,created_at)
 values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Nowy użytkownik'),coalesce(new.created_at,now()))
 on conflict(user_id) do nothing;
 return new;
end;$$;
revoke all on function public.notify_admin_student_signup() from public,anon,authenticated;
create trigger eduliga_admin_new_signup after insert on auth.users
for each row execute function public.notify_admin_student_signup();
create or replace function public.get_admin_signup_notifications()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); items jsonb; total bigint;
begin
 if me is null or not public.is_chat_admin() then return jsonb_build_object('admin',false,'unread',0,'items','[]'::jsonb);end if;
 select count(*) into total from public.admin_signup_notifications where not(me=any(read_by));
 select coalesce(jsonb_agg(to_jsonb(n) order by n.is_read,n.created_at desc,n.id),'[]'::jsonb) into items from (
  select id,user_id,display_name,created_at,me=any(read_by) as is_read
  from public.admin_signup_notifications order by me=any(read_by),created_at desc,id limit 100
 ) n;
 return jsonb_build_object('admin',true,'unread',total,'items',items);
end;$$;
create or replace function public.read_admin_signup_notifications(p_ids uuid[])
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); total bigint;
begin
 if me is null or not public.is_chat_admin() then raise exception 'Tylko administrator ma dostęp do nowych kont.';end if;
 if cardinality(p_ids)>100 then raise exception 'Zbyt wiele powiadomień.';end if;
 update public.admin_signup_notifications set read_by=array_append(read_by,me)
 where id=any(p_ids) and not(me=any(read_by));
 select count(*) into total from public.admin_signup_notifications where not(me=any(read_by));
 return total;
end;$$;
revoke all on function public.get_admin_signup_notifications(),public.read_admin_signup_notifications(uuid[]) from public,anon;
grant execute on function public.get_admin_signup_notifications(),public.read_admin_signup_notifications(uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
