# LotCompass / FleetFinder — Full-Sweep Audit Findings

Branch: `audit/full-sweep` (both repos). Method: read contract → probe live MarketCheck API with the real key → cross-check UI→API→provider value flow → (fix) → build-gate → verify. Do not mark fixed without proof.

Baseline live MarketCheck facts (probed 2026-06-21, `car_type=new`):
- `num_found` all new = **3,257,077**
- `body_type` real vocab: SUV, Pickup, Sedan, Hatchback, Minivan, Cargo Van, Coupe, Chassis Cab, Convertible, Cutaway, Passenger Van, Targa, Wagon, Combi, Car Van, Van(8), Mini Mpv. **No "Truck"/"Van"/"SUV-as-Truck".**
- `drivetrain` real vocab: **4WD, FWD, RWD only** (no AWD).
- `fuel_type` real vocab: Unleaded, Premium Unleaded, Diesel, Electric, E85/Unleaded, Electric/Premium Unleaded, … **No "Hybrid"/"Gasoline".**
- `powertrain_type` real vocab: **Combustion, HEV, MHEV, BEV, PHEV, FCEV, EREV.** `powertrain_type=Hybrid`→0, `=Electric`→0.
- `high_value_features` filter does **exact** match and comma = **AND** (intersection). Sample: `heated seats`=2.47M, `leather seats`=987k, both=963k.

---

## Status legend
`CONFIRMED-FIXED` (prior session, re-verified) · `OPEN-BUG` · `FIX-ON-BRANCH` · `REVIEWED-OK` (looked, not a defect) · `RECOMMEND` (needs user sign-off / prod blast radius)

---

## SEARCH — filter value contracts

### S1. body_type / drivetrain / van label mapping — CONFIRMED-FIXED
`mcBodyType` (truck→Pickup, van→Cargo Van,Minivan,Passenger Van) and `mcDrivetrain` (AWD/4WD→4WD) match live facet vocab exactly. UI `BODY_TYPES`/`DRIVETRAINS` (inventory.ts) all map to real values. Re-verified live: Pickup=760,205; 4WD=2,283,957; van buckets=117,216. Applied in live-search + diagnose. No action.

### S2. `high_value_features` param is DEAD in live UI — REVIEWED-OK (latent)
The search UI sends the feature Set as **`option_names`** (VIN-decode phrase filter), NOT `body.features`. No UI code sends `body.features`, so the `high_value_features` MarketCheck param in live-search is never exercised. The "UI feature labels return 0 against the facet" trap therefore does NOT affect the live app. `FEATURE_GROUPS` values are used as VIN-decode phrases (forgiving word-boundary match), not facet values.
- Latent risk only: if anyone wires `body.features` → `high_value_features`, most labels (`blind spot monitor`, `navigation system`, `sunroof`, `wifi hotspot`, `third row seating`, `tow package`, `remote start`, `backup camera`) return 0 (confirmed live). Real terms differ (`blind spot system`, `navigation`, `sun/moonroof`, `wifi network`, `3rd row seats`, `trailer tow mirrors`, `keyless start/remote engine start`).
- Recommendation: either delete the unused `high_value_features` branch in live-search, or (if a future facet-based feature filter is wanted) add a `mcFeature()` mapper. Not user-facing today. Low priority.

### S3. `powertrain_type` plumbed but unused by UI — REVIEWED-OK (latent)
live-search + diagnose forward `body.powertrain_type` verbatim, but no UI sends it. If a fuel/powertrain selector is added sending human labels (Hybrid/Electric/Gas), it returns 0 — needs mapping (Electric→BEV, Hybrid→HEV/MHEV, Plug-in→PHEV, Gas→Combustion, Hydrogen→FCEV). Low priority until UI exists.

### S4. interior_color OR-list splits comma-bearing facet values → wrong results — OPEN-BUG (confirmed live)
`list-interior-colors` stores the RAW facet value in `variants` (line 84); the UI joins variants with commas into the `interior_color` param. MarketCheck's `interior_color` filter is **exact-match per term, comma = OR**. So a facet value that itself contains a comma is silently mis-split.
- Live proof: `interior_color="Jet Black, Cloth Seat Trim"` → **10,608**, NOT the bucket's 97,379. It splits to `"Jet Black"`(exact)=10,608 OR `"Cloth Seat Trim"`=0. So selecting that interior returns the WRONG ~10k set and misses the intended ~97k.
- Scope: **interior_color only** — exterior_color facet has no comma-bearing values (verified). 
- No clean API remedy (MarketCheck can't escape a comma in the value). Options, each a tradeoff for user to pick: (a) drop comma-bearing facet values from the picker (loses those buckets); (b) bucket by base color + accept they can't be filtered exactly; (c) post-filter interior client-side (cost/complexity). **Needs product decision — surfaced, not auto-fixed.**

### S5. Confirmed working (REVIEWED-OK): `interior_color` filter (BMW 85,971→20,339 for Black), `exterior_color` comma-OR (Black,Alpine White=11,654), `car_type=used` (BMW=94,514), year/price/miles ranges, `resolveModel` alias table.

---

## DIAGNOSE

### D1. Closest-match query is a guaranteed-null wasted call for dealer-scoped searches — FIX-ON-BRANCH
`diagnose` `withHard()` builds the closest-match query against `/search/car/active` with `dealer_id`, which (per the prior confirmed bug + live-search's own comment) returns a COUNT but **no listings** under our entitlement. So `cData.listings` is always empty → `closest=null` for any dealer-scoped search — AND it spends a MarketCheck call to get that null.
- **Fix shipped (both repos):** added `dealerScoped` guard that skips the closest-match query entirely when dealer-scoped. Facet-derived reasons + "search all dealers" fix still render (those use the facet pool, whose COUNT is reliable). Strictly better: removes a wasted call, identical UX (closest was already always null for this path). Cost-positive (no new $1/call). `src/app/api/diagnose/route.ts` + `base44/functions/diagnose/entry.ts`. Built clean (next build / deno check).
- Optional follow-up (needs user OK — adds $1/call): to actually SHOW a closest car for dealer-scoped, route the closest query to `/dealerships/inventory`. Deferred for cost.

---

## SUPABASE ADVISORS (project vbacqlizbzcxesiwifcv)

### DB1. `my_org_ids()` / `my_admin_org_ids()` anon/auth-executable (security WARN) — REVIEWED-OK
**Intentional and documented** (migrations 0027 + 0015): RLS policies reference these helpers, so the calling `authenticated` role must retain EXECUTE (inherited from PUBLIC). Both are SECURITY DEFINER with pinned search_path (0011) reading `auth.uid()`, so an anon caller gets an empty set — no data leak. Revoking would break RLS for all signed-in users. **Do not change.**

### DB2. 13 tables "RLS enabled, no policy" (security INFO) — REVIEWED-OK
catalog_*, *_cache, dealer_sync_state, provider_usage, search_cache, tracked_dealers, leads, vin_decode_cache. These are service-role-only (crons/server). RLS-on + no-policy = deny-all to anon/authenticated = the correct fail-closed posture. Confirm no client reads them with the anon key (server uses service role). Acceptable.

### DB3. `auth_rls_initplan` perf WARN on ~10 policies — RECOMMEND
Policies call `auth.uid()` unwrapped; standard fix is `(select auth.uid())` (semantics-identical, avoids per-row re-eval). Tables: profiles, organizations, vehicle_catalog, saved_vehicles, recent_searches, dealers, dealer_catalog, customers, memberships, inventory. Real but non-urgent (tables small now); each rewrite touches PROD RLS, so batch carefully + re-run advisors. Deferred to user sign-off.

### DB4. `multiple_permissive_policies` on customers/dealers (perf WARN) — RECOMMEND
`customers_write` (FOR ALL) overlaps `customers_read` (FOR SELECT); same for dealers. Minor perf; verify the write policy's USING doesn't unintentionally widen SELECT. Deferred.

### DB5. leaked-password protection disabled (security WARN) — RECOMMEND
Supabase Auth dashboard setting (enable HaveIBeenPwned check). Not code. Recommend enabling.

### DB6. unindexed FK `organizations_referred_by_org_fkey`; unused inventory/leads indexes (perf INFO) — RECOMMEND
Minor. The unused `inventory_*` indexes align with the "inventory table read by nothing" note (see catalog section TBD).

---

## BILLING / AUTH

### B1. `requireActivePlan` gate — REVIEWED-OK
Matches CLAUDE.md invariants: signed-out→401; super-admin→allow; org-less user is provisioned a trial org, and if provisioning FAILS it returns 503 (transient) rather than failing open to free metered access (correct fail-closed on the cost-leak path); org read uses service-role **after** `auth.getUser()`; card-gated trial (`billingOn && !hasCard` → 402) closes the direct-API bypass; `incomplete` gets grace; catch → fail-open (transient only). 
- Micro-note (very low): line 108 `if (!org) → ok:true`. With the service-role client `!org` means the org row genuinely doesn't exist (not an RLS blip), so an orphaned membership pointing at a deleted org would get free access. Orgs aren't deleted in normal flow, so this is theoretical. Could tighten to fail-closed on definitive 0-rows. Not acting without confirmation.

## TODO (areas not yet swept this pass)
- Pickers: list-models/trims/colors/interior/features/styles DB-vs-live parity, comma-variant issue (S4).
- Dealers: catalog picker makes filter (prompt: ~80% empty makes tags), selection, removal-requests, sync-dealers cron.
- Catalog crons: refresh/verify/health self-chaining; inventoryDump reader gap.
- Billing/auth: Stripe webhook idempotency/ordering, requireActivePlan fail-open/closed, referrals idempotency, proxy gating.
- UI flows end-to-end on live lotcompass.com.
