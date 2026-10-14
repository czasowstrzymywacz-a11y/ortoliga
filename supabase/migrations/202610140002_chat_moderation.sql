create table if not exists public.class_chat_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.class_chat_admins enable row level security;
revoke all on public.class_chat_admins from public,anon,authenticated;
insert into public.class_chat_admins(user_id) values
 ('10e91715-5313-4149-b36b-e426aba31ab0'),('84daf817-d5a0-43ae-a346-1867e011d79f')
on conflict do nothing;
alter table public.class_chat_messages add column if not exists removed_at timestamptz;
alter table public.class_chat_messages add column if not exists removed_by uuid references auth.users(id);
create table if not exists public.class_chat_removed_text (
 message_id bigint primary key references public.class_chat_messages(id) on delete cascade,
 original_body text not null
);
alter table public.class_chat_removed_text enable row level security;
revoke all on public.class_chat_removed_text from public,anon,authenticated;
create or replace function public.is_chat_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.class_chat_admins where user_id=auth.uid());
$$;
revoke all on function public.is_chat_admin() from public,anon;
grant execute on function public.is_chat_admin() to authenticated;
create or replace function public.moderate_class_chat_message(p_message_id bigint,p_restore boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_message public.class_chat_messages%rowtype; v_body text;
begin
 if not public.is_chat_admin() then raise exception 'Tylko administrator czatu może usuwać wiadomości.';end if;
 select * into v_message from public.class_chat_messages where id=p_message_id for update;
 if not found then raise exception 'Wiadomość nie istnieje.';end if;
 if p_restore then
  if v_message.removed_at is null then return;end if;
  select original_body into v_body from public.class_chat_removed_text where message_id=p_message_id;
  if v_body is null then raise exception 'Nie można przywrócić tej wiadomości.';end if;
  update public.class_chat_messages set body=v_body,removed_at=null,removed_by=null where id=p_message_id;
 else
  if v_message.removed_at is not null then return;end if;
  insert into public.class_chat_removed_text(message_id,original_body) values(p_message_id,v_message.body)
  on conflict(message_id) do update set original_body=excluded.original_body;
  update public.class_chat_messages set body='[Wiadomość usunięta]',removed_at=now(),removed_by=auth.uid() where id=p_message_id;
 end if;
end;$$;
revoke all on function public.moderate_class_chat_message(bigint,boolean) from public,anon;
grant execute on function public.moderate_class_chat_message(bigint,boolean) to authenticated;
notify pgrst,'reload schema';