-- 0028 — 0024 revoked the standing anon write grants on inventory/leads/
-- dealer_removal_requests but missed public.customers. anon never legitimately
-- writes customers (consumer /usedcar doesn't touch them; agents write via the
-- authenticated RLS policy customers_write). Remove the unused anon grants so RLS
-- isn't the only barrier. Keep authenticated's grants — the app relies on them.
-- Idempotent.
revoke insert, update, delete on public.customers from anon;
