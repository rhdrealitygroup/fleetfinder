-- 0016 — exempt comped orgs from the seat-limit trigger. Idempotent.
--
-- enforce_seat_limit (0012) blocks inserts once memberships >= agent_limit. A
-- comped (complimentary) org never runs checkout, so its agent_limit stays at the
-- creation default of 1 — meaning the owner alone hits the cap and can't add any
-- agent. Skip the check for comped orgs (the team route does the same).
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
begin
  select agent_limit, comped into lim, is_comped from public.organizations where id = NEW.org_id for update;
  if lim is null or coalesce(is_comped, false) then
    return NEW; -- no limit configured, or complimentary org → don't block
  end if;
  select count(*) into cnt from public.memberships where org_id = NEW.org_id;
  if cnt >= lim then
    raise exception 'seat limit reached for org % (% of % seats used)', NEW.org_id, cnt, lim
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
