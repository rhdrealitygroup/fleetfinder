-- 0017 — atomic per-VIN decode-attempt increment. Idempotent.
--
-- decodeUndecoded's success path fans out across all dealer copies of a VIN
-- (.eq("vin")), but the failure back-off only bumped the one selected (dealer_id,
-- vin) row, so a permanently-undecodable VIN at N dealers took ~5*N runs to fully
-- back off. A literal-value fan-out can't be used (it would reset higher
-- counters), so use a true increment: decode_attempts = decode_attempts + 1 for
-- every dealer copy of the VIN — each advances from its own value, none reset.
create or replace function public.bump_decode_attempts(p_vin text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.inventory set decode_attempts = decode_attempts + 1 where vin = p_vin;
$$;

-- Service-role only (the dump uses the service-role client); not a public RPC.
revoke execute on function public.bump_decode_attempts(text) from anon, authenticated;
