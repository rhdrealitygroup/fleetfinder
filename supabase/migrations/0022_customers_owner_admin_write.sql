-- 0022 — let owners/admins write (edit/delete) any customer in their org, not
-- just rows where they are the agent_id. Agents stay scoped to their own rows.
-- Mirrors customers_read (which is already org-wide) so an owner can clean up /
-- reassign customers left behind by a removed agent. Idempotent.
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all
  using (
    org_id in (select public.my_org_ids())
    and (agent_id = auth.uid() or org_id in (select public.my_admin_org_ids()))
  )
  with check (
    org_id in (select public.my_org_ids())
    and (agent_id = auth.uid() or org_id in (select public.my_admin_org_ids()))
  );
