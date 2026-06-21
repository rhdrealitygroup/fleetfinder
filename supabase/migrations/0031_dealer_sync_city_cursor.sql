-- Resumable city-partition cursor for the dealer directory sync.
--
-- MarketCheck's Standard tier caps pagination at a 1500 offset, so a state+type
-- slice with more than ~1500 dealers (e.g. NY/CA/TX/FL independents) loses its
-- tail. sync-dealers now sub-partitions a saturated slice by city (each city is
-- far under the cap). A dense state has hundreds of cities and can't finish in
-- one 60s cron run, so we persist how far we got: `city_cursor` = the last
-- "<type>|<city>" completed. The next run rebuilds the deterministic city work
-- list and resumes after the cursor. NULL = no partition in progress (slice fit
-- within the cap, or the partition finished this run).
alter table public.dealer_sync_state
  add column if not exists city_cursor text;
