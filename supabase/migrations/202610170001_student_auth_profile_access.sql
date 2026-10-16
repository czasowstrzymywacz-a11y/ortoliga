-- The server-side student-auth function resolves a pseudonym before verifying
-- the password through Supabase Auth. RLS bypass does not grant table SELECT.
-- This grant is only for the existing server role; clients retain RPC access.
grant select on table public.student_profiles to service_role;
