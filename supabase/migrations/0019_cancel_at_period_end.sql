-- 0019 — track whether a subscription is scheduled to cancel at period end, so
-- the billing UI can show "cancels on <date>" (and a Resume option) without
-- calling Stripe on every page load. Set by the Stripe webhook. Idempotent.
alter table public.organizations
  add column if not exists cancel_at_period_end boolean not null default false;
