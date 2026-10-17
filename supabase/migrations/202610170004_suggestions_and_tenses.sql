begin;
-- Suggestions are visible only to their author and the existing two moderators.
create table public.app_suggestions (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(body) between 5 and 3000),
 image_path text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index app_suggestions_date on public.app_suggestions(created_at desc);
alter table public.app_suggestions enable row level security;
revoke all on public.app_suggestions from anon,authenticated;
grant select on public.app_suggestions to authenticated;
create policy suggestions_read on public.app_suggestions for select to authenticated
 using(author_id=auth.uid() or public.is_chat_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('suggestion-images','suggestion-images',false,6291456,array['image/jpeg']) on conflict(id) do nothing;
create policy suggestion_images_upload on storage.objects for insert to authenticated
 with check(bucket_id='suggestion-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy suggestion_images_read on storage.objects for select to authenticated
 using(bucket_id='suggestion-images' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.app_suggestions s where s.image_path=name and (s.author_id=auth.uid() or public.is_chat_admin()))));
create policy suggestion_images_cleanup on storage.objects for delete to authenticated
 using(bucket_id='suggestion-images' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.app_suggestions s where s.image_path=name));
create or replace function public.post_app_suggestion(p_body text,p_image text default null)
 returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); result uuid;
begin
 if me is null or not exists(select 1 from public.student_profiles where user_id=me) then raise exception 'Zaloguj się, aby wysłać pomysł.';end if;
 perform pg_advisory_xact_lock(hashtext('suggestion:'||me::text));
 if exists(select 1 from public.app_suggestions where author_id=me and created_at>now()-interval '30 seconds') then raise exception 'Odczekaj 30 sekund przed kolejnym zgłoszeniem.';end if;
 if p_body is null or length(btrim(p_body)) not between 5 and 3000 then raise exception 'Napisz od 5 do 3000 znaków.';end if;
 if p_image is not null and (split_part(p_image,'/',1)<>me::text or not exists(select 1 from storage.objects where bucket_id='suggestion-images' and name=p_image)) then raise exception 'Zdjęcie nie zostało zapisane.';end if;
 insert into public.app_suggestions(author_id,body,image_path) values(me,btrim(p_body),p_image) returning id into result;
 return result;
end;$$;
create or replace function public.review_app_suggestion(p_id uuid)
 returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_chat_admin() then raise exception 'Tylko administrator może oznaczać zgłoszenia.';end if;
 update public.app_suggestions set reviewed_at=coalesce(reviewed_at,now()) where id=p_id;
end;$$;
revoke all on function public.post_app_suggestion(text,text),public.review_app_suggestion(uuid) from public,anon;
grant execute on function public.post_app_suggestion(text,text),public.review_app_suggestion(uuid) to authenticated;
alter table public.english_battle_invitations drop constraint english_battle_invitations_topic_check;
alter table public.english_battle_invitations add constraint english_battle_invitations_topic_check check(topic in ('part1','part2','all','tenses','everyday'));
create or replace function public.send_topic_battle_invitation(p_recipient_id uuid,p_league text,p_topic text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if p_topic is null or (p_league='english' and p_topic not in ('part1','part2','all','tenses')) or (p_league='spanish' and p_topic<>'everyday') or (p_league='ortho' and p_topic<>'part1') then raise exception 'Nieprawidłowy dział.';end if;
 result:=public.send_league_battle_invitation(p_recipient_id,p_league);
 update public.english_battle_invitations set topic=p_topic where id=result and sender_id=auth.uid();return result;
end;$$;
notify pgrst,'reload schema';
commit;
