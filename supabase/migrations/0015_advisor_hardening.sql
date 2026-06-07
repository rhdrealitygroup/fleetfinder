-- 0015 — Supabase advisor hardening. Idempotent.
--
-- Security advisor (anon/authenticated can execute SECURITY DEFINER funcs): the
-- trigger + maintenance functions must never be callable directly via the
-- PostgREST /rpc endpoint. Revoke EXECUTE — triggers still fire (they run as the
-- table owner, not the caller). NOTE: my_org_ids() / my_admin_org_ids() are
-- deliberately left executable because RLS policies invoke them as the querying
-- role; revoking would break those policies. They only expose the caller's own
-- org ids and already pin search_path.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.enforce_seat_limit() from anon, authenticated;
revoke execute on function public.sync_profile_email() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- Performance advisor (unindexed foreign keys): add covering indexes so FK
-- lookups / cascading deletes don't seq-scan.
create index if not exists customers_agent_id_idx on public.customers (agent_id);
create index if not exists dealer_removal_requests_requested_by_idx on public.dealer_removal_requests (requested_by);
create index if not exists saved_vehicles_org_id_idx on public.saved_vehicles (org_id);
