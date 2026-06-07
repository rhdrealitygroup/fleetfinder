-- 0012 — atomic seat-limit enforcement. Idempotent.
--
-- The team-invite route counts memberships then inserts (a TOCTOU): two
-- concurrent invites at the seat boundary can both pass the count and both
-- insert, giving an org one more agent than it pays for. Back the cap with a
-- DB trigger that locks the org row before counting, so concurrent inserts
-- serialize and the limit holds even under races. agent_limit is TOTAL seats
-- (owner included), matching the webhook's 1 + paid-seat-quantity.

create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  cnt int;
begin
  -- Lock the org row so concurrent membership inserts for the same org serialize.
  select agent_limit into lim from public.organizations where id = NEW.org_id for update;
  if lim is null then
    return NEW; -- no limit configured → don't block
  end if;
  select count(*) into cnt from public.memberships where org_id = NEW.org_id;
  if cnt >= lim then
    raise exception 'seat limit reached for org % (% of % seats used)', NEW.org_id, cnt, lim
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_seat_limit on public.memberships;
create trigger trg_enforce_seat_limit
  before insert on public.memberships
  for each row execute function public.enforce_seat_limit();
