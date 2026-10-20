begin;
create table public.helper_topic_supporters (
 topic_id uuid not null references public.helper_topics(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 active boolean not null default true, updated_at timestamptz not null default now(),
 primary key(topic_id,user_id)
);
alter table public.helper_topic_supporters enable row level security;
revoke all on public.helper_topic_supporters from anon,authenticated;

create function public.helper_support(p_topic uuid,p_active boolean default true)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); author uuid;
begin
 if me is null then raise exception 'Zaloguj się, aby dołączyć do pytania.';end if;
 select author_id into author from public.helper_topics where id=p_topic and removed_at is null for share;
 if not found then raise exception 'Pytanie jest niedostępne.';end if;
 if me=author then raise exception 'To Twoje pytanie — Twoja potrzeba jest już uwzględniona.';end if;
 insert into public.helper_topic_supporters(topic_id,user_id,active) values(p_topic,me,coalesce(p_active,true))
 on conflict(topic_id,user_id) do update set active=excluded.active,updated_at=now();
end;$$;

create function public.get_helper_needs()
returns table(topic_id uuid,supporters bigint,mine boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.topic_id,count(*),bool_or(s.user_id=auth.uid()) from public.helper_topic_supporters s join public.helper_topics t on t.id=s.topic_id
 where auth.uid() is not null and s.active and (t.removed_at is null or public.is_chat_admin()) group by s.topic_id;
$$;

create function public.helper_is_need(p_body text,p_image text)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select p_image is null and btrim(regexp_replace(regexp_replace(translate(lower(regexp_replace(btrim(coalesce(p_body,'')),'[[:space:]]+',' ','g')),'ąćęłńóśźż','acelnoszz'),'[^a-z0-9 ]','','g'),' +',' ','g')) ~
 '^(ja tez|mnie tez|ja tez nie bylem|ja tez nie bylam|tez nie bylem|tez nie bylam|nie bylem|nie bylam|nie bylo mnie|mnie nie bylo|tez mnie nie bylo|tez nie bylo mnie|mnie tez nie bylo|i mnie nie bylo|ja tez nie bylem obecny|ja tez nie bylam obecna)( (dzis|dzisiaj|wczoraj|tez|na lekcji|na lekcjach|w szkole|na tej lekcji|na angielskim|na hiszpanskim|na niemieckim|na polskim|na matematyce|na geografii|na historii|na biologii|na fizyce|na chemii|na informatyce|na religii|i potrzebuje notatek|potrzebuje notatek|prosze o notatki|poprosze o lekcje))*$';
$$;
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
 if public.helper_is_need(p_body,p_image) then
 if exists(select 1 from public.helper_topics where id=p_topic and author_id<>me) then perform public.helper_support(p_topic,true); end if;
 return p_topic;
 end if;
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
 if public.helper_is_need(r.body,r.image_path) then raise exception 'To zgłoszenie potrzeby pomocy. Podziękowanie z punktami jest za udzieloną pomoc.';end if;
 select * into t from public.helper_topics where id=r.topic_id for update;
 if t.removed_at is not null then raise exception 'Pytanie jest niedostępne.';end if;
 if auth.uid() is null or t.author_id<>auth.uid() or r.author_id=auth.uid() then raise exception 'Tylko autor pytania może podziękować pomocnikowi.';end if;
 if t.solved_reply_id is not null then return;end if;
 update public.helper_topics set solved_reply_id=r.id where id=t.id;
 insert into public.helper_points(user_id,topic_id,reply_id,kind,points) values(r.author_id,t.id,r.id,'helpful',15) on conflict do nothing;
end;$$;

revoke all on function public.helper_support(uuid,boolean),public.get_helper_needs(),public.helper_is_need(text,text) from public,anon;
grant execute on function public.helper_support(uuid,boolean),public.get_helper_needs() to authenticated;
notify pgrst,'reload schema';
commit;
