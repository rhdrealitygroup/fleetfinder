-- Remove the inventory dump pipeline (BUG-0019).
-- The `inventory` mirror table was written only by lib/inventoryDump.ts, which
-- paged /search/car/active?dealer_id= — a count-only endpoint under our
-- entitlement — so it never captured listings, and nothing ever read the table
-- (dealer-scoped search reads /dealerships/inventory live on demand). The dump
-- code + cron were removed; drop the now-orphaned table.
-- Verified before drop: 0 rows, no inbound foreign keys, no views reference it.
DROP TABLE IF EXISTS public.inventory;
