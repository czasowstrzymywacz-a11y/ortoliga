-- Iskierka: konta uczniów z nazwą + PIN, prywatne postępy i bezpieczny odczyt rankingów.
-- Uruchom raz w Supabase: SQL Editor > New query > Run.

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  login_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_pin_attempt_limits (
  rate_key text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  blocked_until timestamptz
);

alter table public.student_profiles enable row level security;
alter table public.student_progress enable row level security;
alter table public.student_pin_attempt_limits enable row level security;

revoke all on public.student_profiles from public, anon, authenticated;
revoke all on public.student_progress from public, anon;
revoke all on public.student_pin_attempt_limits from public, anon, authenticated;
grant select, insert, update on public.student_progress to authenticated;

create or replace function public.ensure_student_profile(p_display_name text, p_login_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Zaloguj się, aby utworzyć profil.';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 2 and 24
     or p_display_name !~ '^[[:alnum:] _-]+$' then
    raise exception 'Imię lub pseudonim musi mieć 2–24 znaki.';
  end if;
  if p_login_key is null or length(p_login_key) > 254 then
    raise exception 'Nieprawidłowy adres konta.';
  end if;

  insert into public.student_profiles(user_id, display_name, login_key)
  values (auth.uid(), btrim(p_display_name), lower(p_login_key))
  on conflict (user_id) do update set display_name = excluded.display_name;
exception when unique_violation then
  raise exception 'Ten profil jest już zarejestrowany.';
end;
$$;

revoke all on function public.ensure_student_profile(text, text) from public, anon;
grant execute on function public.ensure_student_profile(text, text) to authenticated;

drop policy if exists "Students can read their own progress" on public.student_progress;
create policy "Students can read their own progress"
  on public.student_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Students can create their own progress" on public.student_progress;
create policy "Students can create their own progress"
  on public.student_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Students can update their own progress" on public.student_progress;
create policy "Students can update their own progress"
  on public.student_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.consume_student_pin_attempt(p_rate_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit public.student_pin_attempt_limits%rowtype;
begin
  insert into public.student_pin_attempt_limits(rate_key)
  values (p_rate_key)
  on conflict (rate_key) do nothing;

  select * into v_limit
  from public.student_pin_attempt_limits
  where rate_key = p_rate_key
  for update;

  if v_limit.blocked_until is not null and v_limit.blocked_until > now() then
    return false;
  end if;

  if v_limit.window_started_at < now() - interval '15 minutes' then
    update public.student_pin_attempt_limits
    set window_started_at = now(), attempt_count = 1, blocked_until = null
    where rate_key = p_rate_key;
    return true;
  end if;

  if v_limit.attempt_count >= 5 then
    update public.student_pin_attempt_limits
    set blocked_until = now() + interval '15 minutes'
    where rate_key = p_rate_key;
    return false;
  end if;

  update public.student_pin_attempt_limits
  set attempt_count = attempt_count + 1
  where rate_key = p_rate_key;
  return true;
end;
$$;

create or replace function public.reset_student_pin_attempt(p_rate_key text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.student_pin_attempt_limits where rate_key = p_rate_key;
$$;

revoke all on function public.consume_student_pin_attempt(text) from public, anon, authenticated;
revoke all on function public.reset_student_pin_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_student_pin_attempt(text) to service_role;
grant execute on function public.reset_student_pin_attempt(text) to service_role;

create or replace function public.get_leaderboard(p_category text)
returns table(display_name text, metric numeric, session_count bigint, is_me boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with stats as (
    select
      p.user_id,
      p.display_name,
      (select count(*)
       from jsonb_array_elements(coalesce(pr.data->'sessions', '[]'::jsonb)) as elem(item)) as session_count,
      coalesce((select avg((item->>'score')::numeric)
       from jsonb_array_elements(coalesce(pr.data->'sessions', '[]'::jsonb)) as elem(item)), 0) as average_score,
      (select count(*)
       from jsonb_array_elements(coalesce(pr.data->'sessions', '[]'::jsonb)) as elem(item)
       where (item->>'date')::date >= current_date - (extract(isodow from current_date)::int - 1)) as weekly_count,
      (select count(*)
       from jsonb_array_elements(coalesce(pr.data->'sessions', '[]'::jsonb)) as elem(item)
       where (item->>'score')::numeric >= 90) as excellent_count,
      (select count(*)
       from jsonb_each(coalesce(pr.data->'words', '{}'::jsonb)) w
       where coalesce((w.value->>'correct')::int, 0) >= 2) as mastered_count,
      case
        when coalesce((pr.data->>'lastDay')::date, current_date - 2) >= current_date - 1
          then coalesce((pr.data->>'streak')::int, 0)
        else 0
      end as current_streak
    from public.student_profiles p
    left join public.student_progress pr on pr.user_id = p.user_id
  ), ranked as (
    select
      s.display_name,
      s.session_count,
      s.user_id,
      case p_category
        when 'weekly' then s.weekly_count::numeric
        when 'sessions' then s.session_count::numeric
        when 'average' then round(s.average_score, 0)
        when 'mastered' then s.mastered_count::numeric
        when 'streak' then s.current_streak::numeric
        when 'excellent' then s.excellent_count::numeric
        else 0::numeric
      end as metric
    from stats s
    where case when p_category = 'average' then s.session_count >= 3 else s.session_count > 0 end
  )
  select r.display_name, r.metric, r.session_count, (r.user_id = auth.uid()) as is_me
  from ranked r
  where p_category in ('weekly', 'sessions', 'average', 'mastered', 'streak', 'excellent')
  order by r.metric desc, r.session_count desc, r.display_name asc
  limit 10;
$$;

revoke all on function public.get_leaderboard(text) from public, anon;
grant execute on function public.get_leaderboard(text) to authenticated;


-- Pseudonym-only account roster for the authenticated rankings view.
create or replace function public.get_student_roster()
returns table(user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.display_name
  from public.student_profiles as p
  order by p.display_name asc;
$$;

revoke all on function public.get_student_roster() from public, anon;
grant execute on function public.get_student_roster() to authenticated;


-- Shared class chat migration: see supabase/migrations/202610070001_class_chat.sql
-- Shared classroom chat. Messages are pseudonymous and visible to signed-in pupils only.
create table if not exists public.class_chat_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 240),
  created_at timestamptz not null default now()
);

create index if not exists class_chat_messages_created_idx
  on public.class_chat_messages (created_at desc);

alter table public.class_chat_messages enable row level security;
revoke all on public.class_chat_messages from public, anon;
grant select, insert on public.class_chat_messages to authenticated;
grant usage, select on sequence public.class_chat_messages_id_seq to authenticated;

drop policy if exists class_chat_read_signed_in on public.class_chat_messages;
create policy class_chat_read_signed_in on public.class_chat_messages
  for select to authenticated using (true);

drop policy if exists class_chat_insert_own on public.class_chat_messages;
create policy class_chat_insert_own on public.class_chat_messages
  for insert to authenticated with check (sender_id = auth.uid());

create or replace function public.prepare_class_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  if auth.uid() is null or new.sender_id <> auth.uid() then
    raise exception 'Zaloguj się, aby wysłać wiadomość.';
  end if;
  new.body := left(trim(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g')), 240);
  if new.body = '' then raise exception 'Wiadomość nie może być pusta.'; end if;
  if new.body ~* '([[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}|https?://|www\.|[0-9][0-9 ()+-]{7,}[0-9])' then
    raise exception 'Nie wpisuj danych kontaktowych ani odnośników na czacie.';
  end if;
  if exists (
    select 1 from public.class_chat_messages m
    where m.sender_id = auth.uid() and m.created_at > now() - interval '2 seconds'
  ) then raise exception 'Odczekaj chwilę przed kolejną wiadomością.'; end if;

  select p.display_name into v_name
  from public.student_profiles p where p.user_id = auth.uid();
  new.sender_name := coalesce(nullif(trim(v_name), ''), 'Uczeń');
  new.created_at := now();
  return new;
end;
$$;

revoke all on function public.prepare_class_chat_message() from public, anon, authenticated;
drop trigger if exists prepare_class_chat_message on public.class_chat_messages;
create trigger prepare_class_chat_message
  before insert on public.class_chat_messages
  for each row execute function public.prepare_class_chat_message();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'class_chat_messages'
  ) then
    alter publication supabase_realtime add table public.class_chat_messages;
  end if;
end;
$$;

-- Shared English XP and private, expiring invitations for the existing open room.
create or replace function public.get_english_student_roster()
returns table(user_id uuid, display_name text, english_xp bigint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.user_id, p.display_name,
    case when (pr.data #>> '{englishLeague,xp}') ~ '^[0-9]+(\.[0-9]+)?$'
      then least(2147483647, greatest(0, (pr.data #>> '{englishLeague,xp}')::numeric))::bigint
      else 0::bigint end
  from public.student_profiles p
  left join public.student_progress pr on pr.user_id = p.user_id
  where auth.uid() is not null
  order by p.display_name;
$$;
revoke all on function public.get_english_student_roster() from public, anon;
grant execute on function public.get_english_student_roster() to authenticated;

create table if not exists public.english_battle_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  room_name text not null default 'liga-angielska-open-room'
    check (room_name = 'liga-angielska-open-room'),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists english_invites_recipient_pending
  on public.english_battle_invitations(recipient_id, expires_at) where status = 'pending';
create index if not exists english_invites_sender_recent
  on public.english_battle_invitations(sender_id, created_at);
alter table public.english_battle_invitations enable row level security;
revoke all on public.english_battle_invitations from public, anon, authenticated;
grant select on public.english_battle_invitations to authenticated;
drop policy if exists english_invites_participant_read on public.english_battle_invitations;
create policy english_invites_participant_read on public.english_battle_invitations
  for select to authenticated using (auth.uid() in (sender_id,recipient_id));

create or replace function public.send_english_battle_invitation(p_recipient_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_sender uuid := auth.uid(); v_existing uuid; v_id uuid;
begin
  if v_sender is null then raise exception 'Zaloguj się, aby zaprosić do bitwy.'; end if;
  if p_recipient_id is null or p_recipient_id = v_sender then
    raise exception 'Wybierz innego użytkownika.';
  end if;
  if not exists(select 1 from public.student_profiles where user_id = v_sender)
    or not exists(select 1 from public.student_profiles where user_id = p_recipient_id) then
    raise exception 'Nie znaleziono konta użytkownika.';
  end if;
  perform pg_advisory_xact_lock(hashtext('english-invite:' || v_sender::text));
  select id into v_existing from public.english_battle_invitations
    where sender_id = v_sender and recipient_id = p_recipient_id
      and status = 'pending' and expires_at > now()
    order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;
  if exists(select 1 from public.english_battle_invitations
    where sender_id = v_sender and recipient_id = p_recipient_id
      and created_at > now() - interval '20 seconds')
    or (select count(*) from public.english_battle_invitations
      where sender_id = v_sender and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Odczekaj chwilę przed kolejnym zaproszeniem.';
  end if;
  insert into public.english_battle_invitations(sender_id,recipient_id)
    values(v_sender,p_recipient_id) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.send_english_battle_invitation(uuid) from public, anon;
grant execute on function public.send_english_battle_invitation(uuid) to authenticated;

create or replace function public.get_english_battle_invitations()
returns table(id uuid,sender_id uuid,sender_name text,room_name text,expires_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select i.id,i.sender_id,p.display_name,i.room_name,i.expires_at
  from public.english_battle_invitations i
  join public.student_profiles p on p.user_id = i.sender_id
  where i.recipient_id = auth.uid() and i.status = 'pending' and i.expires_at > now()
  order by i.created_at limit 5;
$$;
revoke all on function public.get_english_battle_invitations() from public, anon;
grant execute on function public.get_english_battle_invitations() to authenticated;

create or replace function public.respond_english_battle_invitation(p_invitation_id uuid,p_accept boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Zaloguj się, aby odpowiedzieć.'; end if;
  if p_accept is null then raise exception 'Wybierz odpowiedź na zaproszenie.'; end if;
  update public.english_battle_invitations
    set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
    where id = p_invitation_id and recipient_id = auth.uid()
      and status = 'pending' and expires_at > now();
  if not found then raise exception 'Zaproszenie wygasło lub zostało już rozpatrzone.'; end if;
end;
$$;
revoke all on function public.respond_english_battle_invitation(uuid,boolean) from public, anon;
grant execute on function public.respond_english_battle_invitation(uuid,boolean) to authenticated;

do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'english_battle_invitations') then
    alter publication supabase_realtime add table public.english_battle_invitations;
  end if;
end;
$$;
notify pgrst, 'reload schema';

-- Only aggregate learning statistics and pseudonyms are shared between accounts.
create or replace function public.get_league_rankings(p_league text)
returns table(display_name text, stats jsonb, is_me boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with profiles as (
    select p.user_id, p.display_name, coalesce(pr.data, '{}'::jsonb) as progress
    from public.student_profiles p
    left join public.student_progress pr on pr.user_id = p.user_id
    where auth.uid() is not null and p_league in ('ortho', 'english')
  ), prepared as (
    select p.*, coalesce(progress->'englishLeague', '{}'::jsonb) as english,
      case when jsonb_typeof(progress->'sessions') = 'array' then progress->'sessions' else '[]'::jsonb end as sessions,
      case when jsonb_typeof(progress->'words') = 'object' then progress->'words' else '{}'::jsonb end as ortho_words
    from profiles p
  ), aggregates as (
    select p.*,
      (select jsonb_build_object(
        'points', coalesce(sum(round(score)), 0), 'sessions', count(*),
        'average', coalesce(round(avg(score)), 0),
        'weekly', count(*) filter (where item->>'date' >= (current_date - (extract(isodow from current_date)::int - 1))::text and item->>'date' <= current_date::text),
        'excellent', count(*) filter (where score >= 90))
       from (select item, case when item->>'score' ~ '^[0-9]+(\.[0-9]+)?$'
         then greatest(0, least(100, (item->>'score')::numeric)) else 0 end as score
         from jsonb_array_elements(p.sessions) as s(item)) scored) as ortho_stats,
      (select coalesce(jsonb_object_agg(key, greatest(0, least(2147483647, case when english->>key ~ '^[0-9]+(\.[0-9]+)?$' then (english->>key)::numeric else 0 end))), '{}'::jsonb)
       from unnest(array['xp','correct','wrong','rounds','bestStreak','battles','battleWins']) as keys(key)) as english_counts,
      (select count(*) from jsonb_each(p.ortho_words) w where case when w.value->>'correct' ~ '^[0-9]+$' then (w.value->>'correct')::numeric >= 2 else false end) as ortho_mastered,
      (select count(*) from jsonb_each(case when jsonb_typeof(english->'words')='object' then english->'words' else '{}'::jsonb end) w
       where case when w.value->>'correct' ~ '^[0-9]+$' and coalesce(w.value->>'wrong','0') ~ '^[0-9]+$'
         then (w.value->>'correct')::numeric >= 3 and round(100 * (w.value->>'correct')::numeric / greatest(1, (w.value->>'correct')::numeric + coalesce(w.value->>'wrong','0')::numeric)) >= 80 else false end) as english_mastered
    from prepared p
  ), result as (
    select a.user_id, a.display_name,
      case when p_league='ortho' then ortho_stats || jsonb_build_object(
        'mastered', ortho_mastered,
        'streak', case when progress->>'lastDay' >= (current_date-1)::text and progress->>'streak' ~ '^[0-9]+$' then least(2147483647, (progress->>'streak')::numeric) else 0 end)
      else jsonb_build_object(
        'points', english_counts->'xp', 'correct', english_counts->'correct',
        'accuracy', round(100 * (english_counts->>'correct')::numeric / greatest(1, (english_counts->>'correct')::numeric + (english_counts->>'wrong')::numeric)),
        'attempts', (english_counts->>'correct')::numeric + (english_counts->>'wrong')::numeric,
        'rounds', english_counts->'rounds', 'mastered', english_mastered,
        'bestStreak', english_counts->'bestStreak', 'battles', english_counts->'battles', 'wins', english_counts->'battleWins',
        'awards', jsonb_array_length(case when jsonb_typeof(english->'awards')='array' then english->'awards' else '[]'::jsonb end)) end as stats
    from aggregates a
  )
  select r.display_name, r.stats, r.user_id = auth.uid()
  from result r order by (r.stats->>'points')::numeric desc, r.display_name, r.user_id;
$$;
revoke all on function public.get_league_rankings(text) from public, anon;
grant execute on function public.get_league_rankings(text) to authenticated;
notify pgrst, 'reload schema';

create or replace function public.league_number_v50(value jsonb, key text)
returns numeric language sql immutable set search_path=public,pg_temp as $$
 select case when value->>key ~ '^-?[0-9]+(\.[0-9]+)?$' then (value->>key)::numeric else 0 end;
$$;
revoke all on function public.league_number_v50(jsonb,text) from public,anon,authenticated;
create or replace function public.league_stats_v50(progress jsonb, league text)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare payload jsonb; item jsonb; events jsonb; words jsonb; n numeric:=0; correct_n numeric:=0; wrong_n numeric:=0;
 sessions_n integer:=0; weekly_n integer:=0; excellent_n integer:=0; score_sum numeric:=0; rounds_n integer:=0;
 battles_n integer:=0; wins_n integer:=0; mastered_n integer:=0; score_n numeric; streak_n numeric:=0;
begin
 if league='english' then
 payload:=coalesce(progress->'englishLeague','{}');n:=greatest(0,public.league_number_v50(payload,'xp'));
 correct_n:=greatest(0,public.league_number_v50(payload,'correct'));wrong_n:=greatest(0,public.league_number_v50(payload,'wrong'));
 rounds_n:=public.league_number_v50(payload,'rounds');battles_n:=public.league_number_v50(payload,'battles');wins_n:=public.league_number_v50(payload,'battleWins');
 elsif league in ('ortho','spanish') then
 payload:=coalesce(progress->(case when league='ortho' then 'orthoBattle' else 'spanishLeague' end),'{}');
 events:=case when jsonb_typeof(payload->'events')='array' then payload->'events' else '[]'::jsonb end;
 for item in select distinct on (e->>'id') e from jsonb_array_elements(events) x(e) where e->>'id' is not null loop
 n:=n+public.league_number_v50(item,'delta');
 if item->>'kind' in ('answer','battle') then if item->>'ok'='true' then correct_n:=correct_n+1;else wrong_n:=wrong_n+1;end if;end if;
 if item->>'kind'='series' then rounds_n:=rounds_n+1;end if;
 if item->>'kind'='match' then battles_n:=battles_n+1;if item->>'win'='true' then wins_n:=wins_n+1;end if;end if;
 end loop;
 else return '{}'::jsonb;end if;
 if league='ortho' then
 for item in select e from jsonb_array_elements(case when jsonb_typeof(progress->'sessions')='array' then progress->'sessions' else '[]'::jsonb end) x(e) loop
 score_n:=greatest(0,least(100,public.league_number_v50(item,'score')));n:=n+round(score_n);score_sum:=score_sum+score_n;sessions_n:=sessions_n+1;
 if score_n>=90 then excellent_n:=excellent_n+1;end if;
 if item->>'date'>=(current_date-(extract(isodow from current_date)::int-1))::text and item->>'date'<=current_date::text then weekly_n:=weekly_n+1;end if;
 end loop;
 if progress->>'lastDay'>=(current_date-1)::text then streak_n:=greatest(0,public.league_number_v50(progress,'streak'));end if;
 words:=case when jsonb_typeof(progress->'words')='object' then progress->'words' else '{}'::jsonb end;
 else words:=case when jsonb_typeof(payload->'words')='object' then payload->'words' else '{}'::jsonb end;end if;
 for item in select value from jsonb_each(words) loop
 if league='ortho' then if public.league_number_v50(item,'correct')>=2 then mastered_n:=mastered_n+1;end if;
 elsif public.league_number_v50(item,'correct')>=3 and round(100*public.league_number_v50(item,'correct')/greatest(1,public.league_number_v50(item,'correct')+public.league_number_v50(item,'wrong')))>=80 then mastered_n:=mastered_n+1;end if;
 end loop;
 return jsonb_build_object('points',greatest(0,n),'correct',correct_n,'attempts',correct_n+wrong_n,'accuracy',round(100*correct_n/greatest(1,correct_n+wrong_n)),
 'rounds',rounds_n,'battles',battles_n,'wins',wins_n,'mastered',mastered_n,'sessions',sessions_n,'weekly',weekly_n,'average',round(score_sum/greatest(1,sessions_n)),
 'excellent',excellent_n,'streak',streak_n,'bestStreak',greatest(0,public.league_number_v50(payload,'bestStreak')),
 'awards',jsonb_array_length(case when jsonb_typeof(payload->'awards')='array' then payload->'awards' else '[]'::jsonb end));
end;$$;
revoke all on function public.league_stats_v50(jsonb,text) from public,anon,authenticated;
create or replace function public.get_league_board(p_league text)
returns table(user_id uuid,display_name text,stats jsonb,is_me boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.user_id,p.display_name,public.league_stats_v50(coalesce(pr.data,'{}'),p_league),p.user_id=auth.uid()
 from public.student_profiles p left join public.student_progress pr on pr.user_id=p.user_id
 where auth.uid() is not null and p_league in ('ortho','english','spanish')
 order by (public.league_stats_v50(coalesce(pr.data,'{}'),p_league)->>'points')::numeric desc,p.display_name,p.user_id;
$$;
revoke all on function public.get_league_board(text) from public,anon;
grant execute on function public.get_league_board(text) to authenticated;
create or replace function public.get_league_roster_v50()
returns table(user_id uuid,display_name text,ortho_xp numeric,english_xp numeric,spanish_xp numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.user_id,p.display_name,(public.league_stats_v50(coalesce(pr.data,'{}'),'ortho')->>'points')::numeric,
 (public.league_stats_v50(coalesce(pr.data,'{}'),'english')->>'points')::numeric,
 (public.league_stats_v50(coalesce(pr.data,'{}'),'spanish')->>'points')::numeric
 from public.student_profiles p left join public.student_progress pr on pr.user_id=p.user_id where auth.uid() is not null;
$$;
revoke all on function public.get_league_roster_v50() from public,anon;
grant execute on function public.get_league_roster_v50() to authenticated;
notify pgrst,'reload schema';

-- Named non-anonymous accounts must exist in the ranking profile registry.
create or replace function public.register_named_league_account()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare nickname text;
begin
 if coalesce(new.is_anonymous,false) then return new;end if;
 nickname:=left(btrim(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),new.raw_user_meta_data->>'full_name','')),24);
 if length(nickname)<2 then return new;end if;
 insert into public.student_profiles(user_id,display_name,login_key,created_at)
 values(new.id,nickname,coalesce(lower(new.email),'account:'||new.id::text),new.created_at)
 on conflict do nothing;
 return new;
end;$$;
revoke all on function public.register_named_league_account() from public,anon,authenticated;
do $$begin
 if not exists(select 1 from pg_trigger where tgname='league_named_account_profile' and tgrelid='auth.users'::regclass) then
 create trigger league_named_account_profile after insert or update of raw_user_meta_data on auth.users
 for each row execute function public.register_named_league_account();
 end if;
end;$$;
insert into public.student_profiles(user_id,display_name,login_key,created_at)
select u.id,left(btrim(coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.raw_user_meta_data->>'full_name','')),24),
 coalesce(lower(u.email),'account:'||u.id::text),u.created_at
from auth.users u where not coalesce(u.is_anonymous,false)
 and length(btrim(coalesce(nullif(u.raw_user_meta_data->>'display_name',''),u.raw_user_meta_data->>'full_name','')))>=2
 and not exists(select 1 from public.student_profiles p where p.user_id=u.id)
on conflict do nothing;
notify pgrst,'reload schema';

-- Only point awards, never answers, emails or the full progress document.
create or replace function public.get_league_point_history(p_user_id uuid, p_league text)
returns table(points numeric, kind text, occurred_at text, earned_date text)
language sql stable security definer set search_path=public,pg_temp as $$
 with source as (
 select coalesce(pr.data,'{}'::jsonb) as progress
 from public.student_profiles p left join public.student_progress pr on pr.user_id=p.user_id
 where p.user_id=p_user_id and auth.uid() is not null
 and p_league in ('ortho','english','spanish')
 ), entries as (
 select public.league_number_v50(e,'delta') as points,
 case when e->>'kind' in ('battle','flash','sentence') then e->>'kind' else 'answer' end as kind,
 nullif(e->>'at','') as occurred_at, null::text as earned_date
 from source cross join lateral jsonb_array_elements(
 case when jsonb_typeof(progress->(case p_league when 'english' then 'englishLeague' when 'spanish' then 'spanishLeague' else 'orthoBattle' end)->(case when p_league='english' then 'scoreEvents' else 'events' end))='array'
 then progress->(case p_league when 'english' then 'englishLeague' when 'spanish' then 'spanishLeague' else 'orthoBattle' end)->(case when p_league='english' then 'scoreEvents' else 'events' end)
 else '[]'::jsonb end) x(e)
 union all
 select greatest(0,least(100,round(public.league_number_v50(e,'score')))),
 'dictation',nullif(e->>'createdAt',''),nullif(e->>'date','')
 from source cross join lateral jsonb_array_elements(
 case when p_league='ortho' and jsonb_typeof(progress->'sessions')='array' then progress->'sessions' else '[]'::jsonb end) x(e)
 )
 select points,kind,occurred_at,earned_date from entries where points>0
 order by coalesce(occurred_at,earned_date) desc nulls last limit 30;
$$;
revoke all on function public.get_league_point_history(uuid,text) from public,anon;
grant execute on function public.get_league_point_history(uuid,text) to authenticated;
notify pgrst,'reload schema';

alter table public.english_battle_invitations add column if not exists league text not null default 'english' check (league in ('ortho','english','spanish'));
create or replace function public.send_league_battle_invitation(p_recipient_id uuid,p_league text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sender uuid:=auth.uid();v_existing uuid;v_id uuid;
begin
 if v_sender is null then raise exception 'Zaloguj się, aby zaprosić do bitwy.';end if;
 if p_league is null or p_league not in ('ortho','english','spanish') then raise exception 'Wybierz ligę.';end if;
 if p_recipient_id is null or p_recipient_id=v_sender then raise exception 'Wybierz innego użytkownika.';end if;
 if not exists(select 1 from public.student_profiles where user_id=v_sender) or not exists(select 1 from public.student_profiles where user_id=p_recipient_id) then raise exception 'Nie znaleziono konta użytkownika.';end if;
 perform pg_advisory_xact_lock(hashtext('english-invite:'||v_sender::text));
 select id into v_existing from public.english_battle_invitations where sender_id=v_sender and recipient_id=p_recipient_id and league=p_league and status='pending' and expires_at>now() order by created_at desc limit 1;
 if v_existing is not null then return v_existing;end if;
 if exists(select 1 from public.english_battle_invitations where sender_id=v_sender and recipient_id=p_recipient_id and created_at>now()-interval '20 seconds')
 or (select count(*) from public.english_battle_invitations where sender_id=v_sender and created_at>now()-interval '1 minute')>=5 then raise exception 'Odczekaj chwilę przed kolejnym zaproszeniem.';end if;
 insert into public.english_battle_invitations(sender_id,recipient_id,league) values(v_sender,p_recipient_id,p_league) returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.send_league_battle_invitation(uuid,text) from public,anon;
grant execute on function public.send_league_battle_invitation(uuid,text) to authenticated;
create or replace function public.get_league_battle_invitations()
returns table(id uuid,sender_id uuid,sender_name text,league text,expires_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select i.id,i.sender_id,p.display_name,i.league,i.expires_at from public.english_battle_invitations i
 join public.student_profiles p on p.user_id=i.sender_id
 where i.recipient_id=auth.uid() and i.status='pending' and i.expires_at>now() order by i.created_at limit 10;
$$;
revoke all on function public.get_league_battle_invitations() from public,anon;
grant execute on function public.get_league_battle_invitations() to authenticated;
create or replace function public.get_english_battle_invitations()
returns table(id uuid,sender_id uuid,sender_name text,room_name text,expires_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select i.id,i.sender_id,p.display_name,i.room_name,i.expires_at from public.english_battle_invitations i
 join public.student_profiles p on p.user_id=i.sender_id
 where i.recipient_id=auth.uid() and i.league='english' and i.status='pending' and i.expires_at>now() order by i.created_at limit 5;
$$;
notify pgrst,'reload schema';
