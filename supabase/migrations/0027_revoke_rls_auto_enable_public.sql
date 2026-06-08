-- 0027 — rls_auto_enable() (event-trigger maintenance fn, SECURITY DEFINER) is
-- still PUBLIC-executable via /rpc (0015's role-scoped revoke was a no-op). It's
-- invoked by the event-trigger mechanism, never by a client, so revoke from PUBLIC.
-- my_org_ids()/my_admin_org_ids() are intentionally left executable — RLS policies
-- invoke them and would break otherwise.
revoke execute on function public.rls_auto_enable() from public;
