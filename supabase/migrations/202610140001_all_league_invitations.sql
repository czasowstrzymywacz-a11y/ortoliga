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