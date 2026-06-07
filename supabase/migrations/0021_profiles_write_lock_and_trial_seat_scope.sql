-- 0021 — close two gaps found in audit round 2. Idempotent.

-- (R2-2) The 0014 email-lock only revoked UPDATE on profiles, but `authenticated`
-- still held INSERT and DELETE, and profiles_self is FOR ALL. So a user could
-- DELETE their own profile row and re-INSERT it with someone else's email (the
-- WITH CHECK only constrains id, not email), re-opening the team-invite
-- email-spoofing hole 0014 fixed. profiles rows are created by the
-- handle_new_user trigger and removed by ON DELETE CASCADE from auth.users, so
-- clients never need INSERT/DELETE here.
revoke insert, delete on public.profiles from authenticated;

-- (R2-5) Scope the seat-limit trial exemption to APP-TRIAL only. A paid
-- subscription in its Stripe trial window also has plan_status='trial' but
-- already carries an agent_limit from checkout, so it must respect that limit.
-- App-trial = on trial with no Stripe subscription yet.
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  cnt int;
  is_comped boolean;
  status text;
  sub_id text;
begin
  select agent_limit, comped, plan_status, stripe_subscription_id
    into lim, is_comped, status, sub_id
    from public.organizations where id = NEW.org_id for update;
  -- no limit configured, complimentary, or app-trial (trial + no Stripe sub) → allow
  if lim is null or coalesce(is_comped, false) or (status = 'trial' and sub_id is null) then
    return NEW;
  end if;
  select count(*) into cnt from public.memberships where org_id = NEW.org_id;
  if cnt >= lim then
    raise exception 'seat limit reached for org % (% of % seats used)', NEW.org_id, cnt, lim
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
