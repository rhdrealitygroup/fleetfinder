-- Catalog verification sweep: a discrepancy report comparing the stored
-- vehicle_catalog against live MarketCheck, plus a per-model verify cursor for
-- the self-chaining /api/cron/verify-catalog job. Service-role only (RLS on,
-- no policies; grants revoked from PUBLIC) — same lockdown as catalog_health.

create table if not exists public.catalog_discrepancies (
  id           bigserial primary key,
  make         text not null,
  model        text not null,
  trim         text,
  field        text not null,   -- trim | ext_color | int_color | version
  issue        text not null,   -- typo | missing | orphan | zero_count
  stored_value text,
  live_value   text,
  live_count   integer,
  checked_at   timestamptz not null default now()
);
create index if not exists catalog_discrepancies_mm_idx      on public.catalog_discrepancies(make, model);
create index if not exists catalog_discrepancies_checked_idx on public.catalog_discrepancies(checked_at);
alter table public.catalog_discrepancies enable row level security;

create table if not exists public.catalog_verify_state (
  key        text primary key,   -- make::model
  updated_at timestamptz not null default now()
);
alter table public.catalog_verify_state enable row level security;

revoke all on public.catalog_discrepancies from public;
revoke all on public.catalog_verify_state from public;
revoke all on sequence public.catalog_discrepancies_id_seq from public;
