begin;
-- Liga Pomocnika: authenticated forum, private images and server-awarded pXP.
create table public.helper_topics (
 id uuid primary key default gen_random_uuid(),author_id uuid not null references auth.users(id),
 subject text not null check(length(subject) between 2 and 50),lesson_date date not null,
 title text not null check(length(title) between 5 and 120),body text not null check(length(body) between 5 and 3000),
 image_path text,created_at timestamptz not null default now(),solved_reply_id uuid
);
create table public.helper_replies (
 id uuid primary key default gen_random_uuid(),topic_id uuid not null references public.helper_topics(id),
 author_id uuid not null references auth.users(id),body text not null check(length(body) between 1 and 3000),
 image_path text,created_at timestamptz not null default now()
);
alter table public.helper_topics add foreign key(solved_reply_id) references public.helper_replies(id);
create table public.helper_points (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 topic_id uuid not null references public.helper_topics(id),kind text not null check(kind in ('reply','helpful')),
 points integer not null check(points in (5,15)),created_at timestamptz not null default now(),unique(user_id,topic_id,kind)
);
create index on public.helper_topics(lesson_date desc,created_at desc);
create index on public.helper_replies(topic_id,created_at);
create index on public.helper_points(user_id,created_at);
alter table public.helper_topics enable row level security;
alter table public.helper_replies enable row level security;
alter table public.helper_points enable row level security;
create policy helper_topics_read on public.helper_topics for select to authenticated using(true);
create policy helper_replies_read on public.helper_replies for select to authenticated using(true);
create policy helper_points_read on public.helper_points for select to authenticated using(true);
grant select on public.helper_topics,public.helper_replies,public.helper_points to authenticated;
revoke insert,update,delete on public.helper_topics,public.helper_replies,public.helper_points from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('helper-images','helper-images',false,6291456,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy helper_images_read on storage.objects for select to authenticated using(bucket_id='helper-images');
create policy helper_images_upload on storage.objects for insert to authenticated with check(bucket_id='helper-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy helper_images_remove on storage.objects for delete to authenticated using(bucket_id='helper-images' and (storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from public.helper_topics t where t.image_path=name) and not exists(select 1 from public.helper_replies r where r.image_path=name));
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
 insert into public.helper_topics(author_id,subject,lesson_date,title,body,image_path) values(me,btrim(p_subject),p_date,btrim(p_title),btrim(p_body),p_image) returning id into result;
 else
 if not exists(select 1 from public.helper_topics where id=p_topic) then raise exception 'Nie znaleziono pytania.';end if;
 insert into public.helper_replies(topic_id,author_id,body,image_path) values(p_topic,me,btrim(p_body),p_image) returning id into result;
 if exists(select 1 from public.helper_topics where id=p_topic and author_id<>me) and (select count(*) from public.helper_points where user_id=me and kind='reply' and created_at>=date_trunc('day',now()))<10 then
 insert into public.helper_points(user_id,topic_id,kind,points) values(me,p_topic,'reply',5) on conflict do nothing;
 end if;
 end if;
 return result;
end;$$;
create or replace function public.helper_accept(p_reply uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.helper_replies; t public.helper_topics;
begin
 select * into r from public.helper_replies where id=p_reply;if not found then raise exception 'Brak odpowiedzi.';end if;
 select * into t from public.helper_topics where id=r.topic_id for update;
 if auth.uid() is null or t.author_id<>auth.uid() or r.author_id=auth.uid() then raise exception 'Tylko autor pytania może podziękować pomocnikowi.';end if;
 if t.solved_reply_id is not null then return;end if;
 update public.helper_topics set solved_reply_id=r.id where id=t.id;
 insert into public.helper_points(user_id,topic_id,kind,points) values(r.author_id,t.id,'helpful',15) on conflict do nothing;
end;$$;
revoke all on function public.helper_post(uuid,text,date,text,text,text),public.helper_accept(uuid) from public,anon;
grant execute on function public.helper_post(uuid,text,date,text,text,text),public.helper_accept(uuid) to authenticated;
create or replace function public.get_helper_board()
returns table(user_id uuid,display_name text,stats jsonb,is_me boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.user_id,p.display_name,jsonb_build_object('points',coalesce(sum(h.points),0),'replies',count(h.id) filter(where h.kind='reply'),'helpful',count(h.id) filter(where h.kind='helpful')),p.user_id=auth.uid()
 from public.student_profiles p left join public.helper_points h on h.user_id=p.user_id where auth.uid() is not null group by p.user_id,p.display_name order by coalesce(sum(h.points),0) desc,p.display_name;
$$;
revoke all on function public.get_helper_board() from public,anon;
grant execute on function public.get_helper_board() to authenticated;
create or replace function public.get_league_roster_v63()
returns table(user_id uuid,display_name text,ortho_xp numeric,english_xp numeric,spanish_xp numeric,helper_xp numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.*,coalesce((h.stats->>'points')::numeric,0) from public.get_league_roster_v50() r left join public.get_helper_board() h on h.user_id=r.user_id;
$$;
revoke all on function public.get_league_roster_v63() from public,anon;
grant execute on function public.get_league_roster_v63() to authenticated;
-- Category-aware invitations retain compatibility with previous clients.
alter table public.english_battle_invitations add column topic text not null default 'part1' check(topic in ('part1','part2','everyday'));
create or replace function public.send_topic_battle_invitation(p_recipient_id uuid,p_league text,p_topic text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if p_topic is null or (p_league='english' and p_topic not in ('part1','part2')) or (p_league='spanish' and p_topic<>'everyday') or (p_league='ortho' and p_topic<>'part1') then raise exception 'Nieprawidłowy dział.';end if;
 result:=public.send_league_battle_invitation(p_recipient_id,p_league);
 update public.english_battle_invitations set topic=p_topic where id=result and sender_id=auth.uid();return result;
end;$$;
create or replace function public.get_topic_battle_invitations()
returns table(id uuid,sender_id uuid,sender_name text,league text,topic text,expires_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select i.id,i.sender_id,p.display_name,i.league,i.topic,i.expires_at from public.english_battle_invitations i join public.student_profiles p on p.user_id=i.sender_id where i.recipient_id=auth.uid() and i.status='pending' and i.expires_at>now() order by i.created_at limit 10;
$$;
revoke all on function public.send_topic_battle_invitation(uuid,text,text),public.get_topic_battle_invitations() from public,anon;
grant execute on function public.send_topic_battle_invitation(uuid,text,text),public.get_topic_battle_invitations() to authenticated;
notify pgrst,'reload schema';

commit;
