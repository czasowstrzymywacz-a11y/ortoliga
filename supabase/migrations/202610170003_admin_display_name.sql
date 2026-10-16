begin;
-- Verified in the live database: this UUID belongs to Filip, not Dominik.
do $$
declare current_name text;
begin
 select raw_user_meta_data->>'display_name' into current_name from auth.users
 where id='84daf817-d5a0-43ae-a346-1867e011d79f' for update;
 if current_name is null or current_name not in ('Filip','admin') then
  raise exception 'Nie potwierdzono konta Filipa; zmiana nazwy przerwana.';
 end if;
 update auth.users set raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{display_name}','"admin"'::jsonb),updated_at=now()
 where id='84daf817-d5a0-43ae-a346-1867e011d79f';
end; $$;
commit;
