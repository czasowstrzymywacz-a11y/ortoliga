begin;
alter table public.helper_topics add column removed_at timestamptz;
alter table public.helper_topics add column removed_by uuid references auth.users(id);
alter table public.helper_replies add column removed_at timestamptz;
alter table public.helper_replies add column removed_by uuid references auth.users(id);
alter table public.helper_points add column reply_id uuid references public.helper_replies(id);
alter table public.helper_points drop constraint helper_points_user_id_topic_id_kind_key;
create unique index helper_one_thanks on public.helper_points(user_id,topic_id) where kind='helpful';
create unique index helper_one_reply_reward on public.helper_points(reply_id) where kind='reply';
drop policy helper_topics_read on public.helper_topics;
create policy helper_topics_read on public.helper_topics for select to authenticated using(removed_at is null or public.is_chat_admin());
drop policy helper_replies_read on public.helper_replies;
create policy helper_replies_read on public.helper_replies for select to authenticated using(public.is_chat_admin() or (removed_at is null and exists(select 1 from public.helper_topics t where t.id=topic_id and t.removed_at is null)));
drop policy helper_images_read on storage.objects;
create policy helper_images_read on storage.objects for select to authenticated using(bucket_id='helper-images' and (public.is_chat_admin() or exists(select 1 from public.helper_topics t where t.image_path=name and t.removed_at is null) or exists(select 1 from public.helper_replies r join public.helper_topics t on t.id=r.topic_id where r.image_path=name and r.removed_at is null and t.removed_at is null)));
create or replace function public.moderate_helper_entry(p_id uuid,p_kind text,p_restore boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_chat_admin() then raise exception 'Tylko administrator może usuwać wpisy.';end if;
 if p_kind='topic' then update public.helper_topics set removed_at=case when p_restore then null else now() end,removed_by=case when p_restore then null else auth.uid() end where id=p_id;
 elsif p_kind='reply' then update public.helper_replies set removed_at=case when p_restore then null else now() end,removed_by=case when p_restore then null else auth.uid() end where id=p_id;
 else raise exception 'Nieprawidłowy rodzaj wpisu.';end if;
 if not found then raise exception 'Wpis nie istnieje.';end if;
end;$$;
create or replace function public.helper_post(p_topic uuid,p_subject text,p_date date,p_title text,p_body text,p_image text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); result uuid;
begin
 if me is null or not exists(select 1 from public.student_profiles where user_id=me) then raise exception 'Zaloguj się, aby pomagać.';end if;
 perform pg_advisory_xact_lock(hashtext('helper:'||me::text));
 if exists(select 1 from public.helper_topics where author_id=me and created_at>now()-interval '15 seconds') or exists(select 1 from public.helper_replies where author_id=me and created_at>now()-interval '15 seconds') then raise exception 'Odczekaj 15 sekund przed kolejnym wpisem.';end if;
 if p_image is not null and (split_part(p_image,'/',1)<>me::text or not exists(select 1 from storage.objects where bucket_id='helper-images' and name=p_image)) then raise exception 'Zdjęcie nie zostało zapisane.';end if;
 if p_topic is null then
 if p_date is null or p_date<current_date-365 or p_date>current_date+30 then raise exception 'Wybierz datę lekcji.';end if;
 insert into public.helper_topics(author_id,subject,lesson_date,title,body,image_path) values(me,btrim(p_subject),p_date,left(btrim(p_body),100),btrim(p_body),p_image) returning id into result;
 else
 perform 1 from public.helper_topics where id=p_topic and removed_at is null for share;
 if not found then raise exception 'To pytanie jest niedostępne.';end if;
 insert into public.helper_replies(topic_id,author_id,body,image_path) values(p_topic,me,btrim(p_body),p_image) returning id into result;
 if exists(select 1 from public.helper_topics where id=p_topic and author_id<>me) and (select count(*) from public.helper_points where user_id=me and kind='reply' and created_at>=date_trunc('day',now()))<10 then
 insert into public.helper_points(user_id,topic_id,reply_id,kind,points) values(me,p_topic,result,'reply',5) on conflict do nothing;
 end if;
 end if;
 return result;
end;$$;
create or replace function public.helper_accept(p_reply uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.helper_replies; t public.helper_topics;
begin
 select * into r from public.helper_replies where id=p_reply for update;if not found or r.removed_at is not null then raise exception 'Brak odpowiedzi.';end if;
 select * into t from public.helper_topics where id=r.topic_id for update;
 if t.removed_at is not null then raise exception 'Pytanie jest niedostępne.';end if;
 if auth.uid() is null or t.author_id<>auth.uid() or r.author_id=auth.uid() then raise exception 'Tylko autor pytania może podziękować pomocnikowi.';end if;
 if t.solved_reply_id is not null then return;end if;
 update public.helper_topics set solved_reply_id=r.id where id=t.id;
 insert into public.helper_points(user_id,topic_id,reply_id,kind,points) values(r.author_id,t.id,r.id,'helpful',15) on conflict do nothing;
end;$$;
revoke all on function public.moderate_helper_entry(uuid,text,boolean) from public,anon;
grant execute on function public.moderate_helper_entry(uuid,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
