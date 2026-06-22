-- BUG-0023: durable cache for the full VIN build sheet (the decode-vin route).
-- decode-vin used to cache only in-memory, so on Vercel it re-charged the $0.08
-- NeoVIN /specs decode on every serverless cold start (P4 — same class as the
-- $2,177 BUG-0006) and a VIN that was both viewed AND option-searched got decoded
-- twice. We reuse the existing per-VIN vin_decode_cache row: `payload` already
-- holds the search slice (NeovinParsed); add `build_sheet` for the full decode-vin
-- payload. One row per VIN serves both consumers, so a single decode is shared.
-- Service-role only (RLS is already enabled on this table with no client policy).
alter table public.vin_decode_cache add column if not exists build_sheet jsonb;
