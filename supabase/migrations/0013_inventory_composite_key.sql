-- 0013 — inventory: per-dealer VIN identity + decode backoff. Idempotent-ish.
--
-- (1) The same VIN can appear at two dealers (dealer groups / shared source ids).
-- With vin as the sole PK, the second dealer's dump overwrote the first's row and
-- a later sweep could delete a car still in stock at the other dealer. Make the
-- identity (dealer_id, vin) so each dealer owns its own copy.
--
-- (2) decode_attempts: permanently-undecodable VINs (e.g. a 404 from NeoVIN) were
-- retried every cron run, burning the decode budget. Track attempts so we can
-- back off after a few failures.

alter table public.inventory add column if not exists decode_attempts int not null default 0;

-- Repoint the primary key to (dealer_id, vin). dealer_id must be non-null for the
-- composite PK; drop any orphan null-dealer rows first (the dump always sets it).
delete from public.inventory where dealer_id is null;
alter table public.inventory alter column dealer_id set not null;
alter table public.inventory drop constraint if exists inventory_pkey;
alter table public.inventory add constraint inventory_pkey primary key (dealer_id, vin);
