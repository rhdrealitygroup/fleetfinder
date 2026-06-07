-- 0018 — let trial orgs add agents before subscribing. Idempotent.
--
-- enforce_seat_limit (0012/0016) blocks inserts once memberships >= agent_limit.
-- A free-trial org hasn't run checkout yet, so its agent_limit is still the
-- creation default of 1 — meaning the owner alone hits the cap and can't add a
-- teammate during the trial. Exempt trial orgs too (the team route does the same).
-- Billing integrity is preserved at conversion: checkout floors the paid seat
-- count at the current agent count, so trial-added agents become paid seats.
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
begin
  select agent_limit, comped, plan_status into lim, is_comped, status
    from public.organizations where id = NEW.org_id for update;
  -- no limit configured, complimentary org, or still on the free trial → allow
  if lim is null or coalesce(is_comped, false) or status = 'trial' then
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
