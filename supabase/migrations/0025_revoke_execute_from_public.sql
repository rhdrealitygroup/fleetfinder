-- 0025 — actually lock down SECURITY DEFINER / trigger functions. Idempotent.
--
-- 0015/0017/0024 ran `revoke execute ... from anon, authenticated`, which is a
-- NO-OP: those roles never held a direct grant — EXECUTE is inherited from the
-- default PUBLIC grant. So the functions stayed callable via PostgREST /rpc by
-- anon/authenticated. Most are trigger/auth functions that error when called bare,
-- but bump_decode_attempts(text) is a genuine SECURITY DEFINER that an
-- unauthenticated caller could invoke to corrupt inventory decode state.
-- Fix: revoke from PUBLIC. The service role keeps its own direct grant (and is
-- re-granted below to be safe), so triggers, RLS, the dump RPC, and the
-- referral-code column DEFAULT all keep working.

revoke execute on function public.enforce_seat_limit()        from public;
revoke execute on function public.handle_new_user()           from public;
revoke execute on function public.sync_profile_email()        from public;
revoke execute on function public.bump_decode_attempts(text)  from public;

-- gen_referral_code: also pin a fixed search_path (advisor warning), then revoke.
create or replace function public.gen_referral_code()
returns text language sql volatile set search_path = public as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;
revoke execute on function public.gen_referral_code() from public;

-- Belt-and-suspenders: ensure the service role can still call the two it needs.
grant execute on function public.bump_decode_attempts(text) to service_role;
grant execute on function public.gen_referral_code()        to service_role;
