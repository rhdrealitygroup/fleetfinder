-- 0026 — the seat-limit trigger must only exempt an ACTIVE app-trial. An expired
-- trial (plan_status still 'trial', trial_ends_at in the past, no Stripe sub) must
-- respect the seat limit, or it could add unlimited agents for free forever.
-- Mirrors the team route. Idempotent.
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
  ends_at timestamptz;
begin
  select agent_limit, comped, plan_status, stripe_subscription_id, trial_ends_at
    into lim, is_comped, status, sub_id, ends_at
    from public.organizations where id = NEW.org_id for update;
  -- allow: no limit, complimentary, or an ACTIVE app-trial (trial + no Stripe sub
  -- + not past trial_ends_at)
  if lim is null
     or coalesce(is_comped, false)
     or (status = 'trial' and sub_id is null and (ends_at is null or ends_at > now()))
  then
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
