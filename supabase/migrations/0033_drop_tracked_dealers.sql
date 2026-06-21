-- Drop the last vestige of the deleted inventory-dump / auto-desking pipeline.
-- `tracked_dealers` was the deduped registry of dealers to mirror inventory for.
-- With the dump pipeline and `inventory` table removed (BUG-0019, migration 0032),
-- nothing reads it anymore, and the on-select upsert that wrote to it has been
-- removed from dealers/selection. Drop it so the pipeline is fully gone.
-- Dealer-scoped search reads live from /dealerships/inventory; the org's selected
-- dealers live in `dealers` (unaffected).
drop table if exists public.tracked_dealers cascade;
