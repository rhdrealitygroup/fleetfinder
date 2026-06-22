-- Drop the orphan `leads` table (BUG-0025).
-- Created by 0008 for a never-shipped public lead-capture form (columns: name,
-- email, phone, vin, vehicle, dealer_id, dealer_name, source, message, status).
-- No application code in either repo references it (only its own DDL migrations
-- 0008/0024/0028), there are no Supabase Edge Functions, RLS is enabled with no
-- policy (so no client could ever write it), and it holds 0 rows with no inbound
-- foreign keys. It only lingers as an `rls_enabled_no_policy` advisory.
-- Verified before drop: 0 rows, 0 inbound FKs, 0 code refs, 0 edge functions.
DROP TABLE IF EXISTS public.leads;
