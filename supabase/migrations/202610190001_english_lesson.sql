begin;
alter table public.english_battle_invitations drop constraint english_battle_invitations_topic_check;
alter table public.english_battle_invitations add constraint english_battle_invitations_topic_check check(topic in ('part1','part2','all','tenses','lesson-20261019','everyday'));
create or replace function public.send_topic_battle_invitation(p_recipient_id uuid,p_league text,p_topic text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
 if p_topic is null or (p_league='english' and p_topic not in ('part1','part2','all','tenses','lesson-20261019')) or (p_league='spanish' and p_topic<>'everyday') or (p_league='ortho' and p_topic<>'part1') then raise exception 'Nieprawidłowy dział.';end if;
 result:=public.send_league_battle_invitation(p_recipient_id,p_league);
 update public.english_battle_invitations set topic=p_topic where id=result and sender_id=auth.uid();return result;
end;$$;
notify pgrst,'reload schema';
commit;
