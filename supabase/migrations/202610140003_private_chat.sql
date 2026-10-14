create table if not exists public.private_chat_messages(
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 240),
 created_at timestamptz not null default now(), read_at timestamptz,
 check(sender_id<>recipient_id)
);
create index if not exists private_chat_recipient_idx on public.private_chat_messages(recipient_id,created_at desc);
create index if not exists private_chat_sender_idx on public.private_chat_messages(sender_id,created_at desc);
alter table public.private_chat_messages enable row level security;
revoke all on public.private_chat_messages from public,anon,authenticated;
grant select on public.private_chat_messages to authenticated;
create policy private_chat_participant_read on public.private_chat_messages for select to authenticated
 using(auth.uid()=sender_id or auth.uid()=recipient_id);
create or replace function public.send_private_chat_message(p_recipient_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_body text:=trim(coalesce(p_body,''));v_id uuid;
begin
 if auth.uid() is null then raise exception 'Zaloguj się, aby napisać wiadomość.';end if;
 if p_recipient_id is null or p_recipient_id=auth.uid() or not exists(select 1 from public.student_profiles where user_id=p_recipient_id) then raise exception 'Wybierz innego użytkownika.';end if;
 if length(v_body) not between 1 and 240 then raise exception 'Wiadomość musi mieć od 1 do 240 znaków.';end if;
 perform pg_advisory_xact_lock(hashtext('private-chat:'||auth.uid()::text));
 if exists(select 1 from public.private_chat_messages where sender_id=auth.uid() and created_at>now()-interval '2 seconds') then raise exception 'Odczekaj chwilę przed kolejną wiadomością.';end if;
 insert into public.private_chat_messages(sender_id,recipient_id,body) values(auth.uid(),p_recipient_id,v_body) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.send_private_chat_message(uuid,text) from public,anon;
grant execute on function public.send_private_chat_message(uuid,text) to authenticated;
create or replace function public.read_private_chat(p_other_id uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
 update public.private_chat_messages set read_at=now()
 where recipient_id=auth.uid() and sender_id=p_other_id and read_at is null;
$$;
revoke all on function public.read_private_chat(uuid) from public,anon;
grant execute on function public.read_private_chat(uuid) to authenticated;
create or replace function public.get_private_chat_inbox()
returns table(user_id uuid,unread bigint,last_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select case when sender_id=auth.uid() then recipient_id else sender_id end,
 count(*) filter(where recipient_id=auth.uid() and read_at is null),max(created_at)
 from public.private_chat_messages where sender_id=auth.uid() or recipient_id=auth.uid()
 group by 1 order by 3 desc;
$$;
revoke all on function public.get_private_chat_inbox() from public,anon;
grant execute on function public.get_private_chat_inbox() to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='private_chat_messages') then
 alter publication supabase_realtime add table public.private_chat_messages;
 end if;
end;$$;
notify pgrst,'reload schema';