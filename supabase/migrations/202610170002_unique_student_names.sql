begin;

create or replace function public.student_name_key(p_name text)
returns text language sql immutable strict set search_path=public,pg_temp
as $$ select lower(regexp_replace(btrim(normalize(p_name,NFC)), '[[:space:]]+', ' ', 'g')); $$;

-- Reserve the name when Auth creates the account, before email confirmation.
-- The primary key arbitrates concurrent registrations atomically.
create table public.student_name_claims (
 name_key text primary key,
 user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.student_name_claims enable row level security;
revoke all on public.student_name_claims from public,anon,authenticated,service_role;

insert into public.student_name_claims(name_key,user_id)
select public.student_name_key(coalesce(nullif(u.raw_user_meta_data->>'display_name',''),p.display_name)),u.id
from auth.users u left join public.student_profiles p on p.user_id=u.id
where coalesce(nullif(u.raw_user_meta_data->>'display_name',''),p.display_name) is not null;

create unique index student_profiles_unique_display_name
on public.student_profiles(public.student_name_key(display_name));

create or replace function public.claim_student_name()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen text:=regexp_replace(btrim(normalize(new.raw_user_meta_data->>'display_name',NFC)),'[[:space:]]+',' ','g');
begin
 if chosen is null or chosen='' then
  if exists(select 1 from public.student_name_claims where user_id=new.id) then
   raise exception 'Pseudonim nie może być pusty.';
  end if;
  return new;
 end if;
 if length(chosen) not between 2 and 24 or chosen !~ '^[[:alnum:] _-]+$' then
  raise exception 'Pseudonim musi mieć 2–24 znaki: litery, cyfry, spacje, myślnik lub podkreślenie.';
 end if;
 insert into public.student_name_claims(name_key,user_id)
 values(public.student_name_key(chosen),new.id)
 on conflict(user_id) do update set name_key=excluded.name_key;
 update public.student_profiles set display_name=chosen where user_id=new.id;
 return new;
exception when unique_violation then
 raise exception 'Ten pseudonim jest już zajęty.' using errcode='23505';
end; $$;
revoke all on function public.claim_student_name() from public,anon,authenticated;
create trigger eduliga_claim_student_name
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.claim_student_name();

create or replace function public.is_student_name_available(p_name text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_name is not null and length(regexp_replace(btrim(p_name),'[[:space:]]+',' ','g')) between 2 and 24
 and regexp_replace(btrim(p_name),'[[:space:]]+',' ','g') ~ '^[[:alnum:] _-]+$'
 and not exists(select 1 from public.student_name_claims where name_key=public.student_name_key(p_name))
 and not exists(select 1 from public.student_profiles where public.student_name_key(display_name)=public.student_name_key(p_name));
$$;
revoke all on function public.is_student_name_available(text) from public;
grant execute on function public.is_student_name_available(text) to anon,authenticated;

-- Use the current Auth profile rather than an old browser token's display name.
create or replace function public.ensure_student_profile(p_display_name text,p_login_key text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen text; login text;
begin
 if auth.uid() is null then raise exception 'Zaloguj się, aby utworzyć profil.'; end if;
 select coalesce(nullif(raw_user_meta_data->>'display_name',''),p_display_name),coalesce(lower(email),auth.uid()::text)
 into chosen,login from auth.users where id=auth.uid();
 chosen:=regexp_replace(btrim(normalize(chosen,NFC)),'[[:space:]]+',' ','g');
 if chosen is null or length(chosen) not between 2 and 24 or chosen !~ '^[[:alnum:] _-]+$' then
  raise exception 'Imię lub pseudonim musi mieć 2–24 znaki.';
 end if;
 insert into public.student_name_claims(name_key,user_id) values(public.student_name_key(chosen),auth.uid())
 on conflict(user_id) do update set name_key=excluded.name_key;
 insert into public.student_profiles(user_id,display_name,login_key) values(auth.uid(),chosen,login)
 on conflict(user_id) do update set display_name=excluded.display_name;
exception when unique_violation then raise exception 'Ten pseudonim jest już zajęty.';
end; $$;
revoke all on function public.ensure_student_profile(text,text) from public,anon;
grant execute on function public.ensure_student_profile(text,text) to authenticated;

notify pgrst,'reload schema';
commit;
