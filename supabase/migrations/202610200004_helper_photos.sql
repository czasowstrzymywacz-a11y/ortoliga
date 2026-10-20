begin;
create table public.helper_attachments (
 id uuid primary key default gen_random_uuid(),
 topic_id uuid not null references public.helper_topics(id) on delete cascade,
 reply_id uuid references public.helper_replies(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 image_path text not null unique,
 position integer not null check(position between 1 and 30),
 created_at timestamptz not null default now()
);
create index helper_attachments_thread on public.helper_attachments(topic_id,created_at,id);
alter table public.helper_attachments enable row level security;
revoke all on public.helper_attachments from anon,authenticated;
grant select on public.helper_attachments to authenticated;
create policy helper_attachments_read on public.helper_attachments for select to authenticated using (
 public.is_chat_admin() or (
 exists(select 1 from public.helper_topics t where t.id=topic_id and t.removed_at is null) and
 (reply_id is null or exists(select 1 from public.helper_replies r where r.id=reply_id and r.removed_at is null))
 ));

create function public.helper_add_images(p_entry uuid,p_kind text,p_images text[])
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); t public.helper_topics; r public.helper_replies; parent uuid; reply uuid; legacy text; photos text[]; total integer; result integer; last_position integer;
begin
 if me is null then raise exception 'Zaloguj się, aby dodać zdjęcia.'; end if;
 if p_kind='topic' then
  select * into t from public.helper_topics where id=p_entry for update;
  if not found or t.author_id<>me or t.removed_at is not null then raise exception 'Możesz uzupełniać tylko własne dostępne pytanie.'; end if;
  parent:=t.id;reply:=null;legacy:=t.image_path;
 elsif p_kind='reply' then
  select * into r from public.helper_replies where id=p_entry for update;
  if not found or r.author_id<>me or r.removed_at is not null then raise exception 'Możesz uzupełniać tylko własną dostępną odpowiedź.'; end if;
  perform 1 from public.helper_topics where id=r.topic_id and removed_at is null for share;
  if not found then raise exception 'Pytanie jest niedostępne.'; end if;
  parent:=r.topic_id;reply:=r.id;legacy:=r.image_path;
 else raise exception 'Nieprawidłowy rodzaj wpisu.'; end if;
 if p_images is null or cardinality(p_images)<1 or cardinality(p_images)>10 or array_position(p_images,null) is not null then raise exception 'Dodaj od 1 do 10 zdjęć naraz.'; end if;
 select array_agg(path order by ordinal) into photos from (select path,min(ord) ordinal from unnest(p_images) with ordinality p(path,ord) group by path) q;
 if exists(select 1 from unnest(photos) path where split_part(path,'/',1)<>me::text or not exists(select 1 from storage.objects o where o.bucket_id='helper-images' and o.name=path)) then raise exception 'Nie wszystkie zdjęcia zostały zapisane na Twoim koncie.'; end if;
 select count(*) into total from (
  select image_path from public.helper_attachments where topic_id=parent and reply_id is not distinct from reply
  union select legacy where legacy is not null
  union select unnest(photos)) all_photos;
 if total>30 then raise exception 'Ten wpis ma już komplet zdjęć (maksymalnie 30). Dodaj kolejną odpowiedź.'; end if;
 if exists(select 1 from public.helper_attachments a where a.image_path=any(photos) and (a.topic_id<>parent or a.reply_id is distinct from reply)) then raise exception 'Zdjęcie jest już dołączone do innego wpisu.'; end if;
 select coalesce(max(position),0) into last_position from public.helper_attachments where topic_id=parent and reply_id is not distinct from reply;
 insert into public.helper_attachments(topic_id,reply_id,author_id,image_path,position)
 select parent,reply,me,path,last_position+(row_number() over(order by ord))::integer from unnest(photos) with ordinality p(path,ord) where not exists(select 1 from public.helper_attachments a where a.image_path=path) on conflict(image_path) do nothing;
 get diagnostics result=row_count;
 if p_kind='topic' then update public.helper_topics set image_path=coalesce(image_path,photos[1]) where id=parent;
 else update public.helper_replies set image_path=coalesce(image_path,photos[1]) where id=reply; end if;
 return result;
end;$$;

create function public.helper_post_images(p_topic uuid,p_subject text,p_date date,p_body text,p_images text[] default '{}')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if p_images is null or cardinality(p_images)>10 then raise exception 'Możesz wysłać do 10 zdjęć naraz.'; end if;
 result:=public.helper_post(p_topic,p_subject,p_date,null,p_body,p_images[1]);
 if cardinality(p_images)>0 then perform public.helper_add_images(result,case when p_topic is null then 'topic' else 'reply' end,p_images); end if;
 return result;
end;$$;
revoke all on function public.helper_add_images(uuid,text,text[]),public.helper_post_images(uuid,text,date,text,text[]) from public,anon;
grant execute on function public.helper_add_images(uuid,text,text[]),public.helper_post_images(uuid,text,date,text,text[]) to authenticated;

drop policy helper_images_read on storage.objects;
create policy helper_images_read on storage.objects for select to authenticated using(bucket_id='helper-images' and (
 public.is_chat_admin() or
 exists(select 1 from public.helper_topics t where t.image_path=name and t.removed_at is null) or
 exists(select 1 from public.helper_replies r join public.helper_topics t on t.id=r.topic_id where r.image_path=name and r.removed_at is null and t.removed_at is null) or
 exists(select 1 from public.helper_attachments a join public.helper_topics t on t.id=a.topic_id left join public.helper_replies r on r.id=a.reply_id where a.image_path=name and t.removed_at is null and (a.reply_id is null or r.removed_at is null))
));
drop policy helper_images_remove on storage.objects;
create policy helper_images_remove on storage.objects for delete to authenticated using(bucket_id='helper-images' and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.helper_topics t where t.image_path=name)
 and not exists(select 1 from public.helper_replies r where r.image_path=name)
 and not exists(select 1 from public.helper_attachments a where a.image_path=name));
notify pgrst,'reload schema';
commit;
