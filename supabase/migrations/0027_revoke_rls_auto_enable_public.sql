-- 0027 — rls_auto_enable() (event-trigger maintenance fn, SECURITY DEFINER) is
-- still PUBLIC-executable via /rpc (0015's role-scoped revoke was a no-op). It's
-- invoked by the event-trigger mechanism, never by a client, so revoke from PUBLIC.
-- my_org_ids()/my_admin_org_ids() are intentionally left executable — RLS policies
-- invoke them and would break otherwise.
--
-- rls_auto_enable is a Supabase-MANAGED function (not created by these migrations),
-- so guard the revoke in an existence check — otherwise a fresh `db reset` on an
-- environment where it doesn't exist would error and roll back the whole file
-- (mirrors the guard 0015 uses for the same function).
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public';
  end if;
end $$;
