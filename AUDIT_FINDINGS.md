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

## CONVERGENCE — 6 passes, ended on 3 consecutive clean
- **Pass 1** (fixes): D1 diagnose dealer-scope, S4 color comma, C3 verify-catalog comment. Billing/auth/crons/gating reviewed clean. Supabase advisors analyzed (DB1 intentional).
- **Pass 2** (fix): L1 lease negative-payment clamp. S4 validated against GM interiors live; NeoVIN decode path verified.
- **Pass 3** (fix): U1 CompaniesTable price re-sync. UI race-guards all verified; live contract regression clean.
- **Pass 4 — CLEAN**: audited the owner's concurrent perf commits (durable VIN-decode cache + weekly re-decode) — correct, no poisoning, fails-closed. Combined filters + `rows` cap + S4 sanity re-probed live.
- **Pass 5 — CLEAN**: inventoryDump destructive-sweep × durable-cache (independent agent) — all guards hold. `MODEL_ALIASES` verified live (every alias resolves, bare names ~0).
- **Pass 6 — CLEAN**: independent auth/middleware/Stripe-webhook security second-opinion — no exploit across all 5 categories. Re-flagged B1; closed as unreachable (FK cascade). Edge probes (trim/0-result/special-char) clean. No new commits.
- **Net: 5 bugs fixed (D1/S4/C3/L1/U1), all deployed; 0 high-severity security/money defects.**
- **Owner decision (2026-06-21): leave the non-bug items as-is for future use** — C1 (KEEP, auto-desking substrate, ~6mo), L2 (used-car $/mo approximation), P2 (dead list-styles route), DB3/4 (Supabase perf RLS migrations), U2 (optimistic-delete seq guard). All documented above; none are bugs, intentionally deferred.

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
- **Encoding ruled out (live):** `interior_color="Black, Ebony"` URL-encoded → 896,276 = identical to plain `"Black"`. MarketCheck decodes `%2C` then splits, so escaping can't save it. The only correct remedy is to drop comma-bearing values.
- **Fix shipped (both repos):** drop any raw facet value containing a comma in the color/interior bucket loops — don't count it, don't offer it — so the picker only shows interiors/colors that filter correctly and whose displayed count matches the filtered result. Applied to all loops: LotCompass `list-interior-colors`, `list-colors` (defensive), `marketcheck.ts#cleanColorFacet` (catalog path — the stored catalog had the same raw variants); FleetFinder `list_interior_colors`, `list_colors`. Tradeoff: the few compound-interior listings (e.g. "Jet Black, Cloth Seat Trim") are no longer pickable by interior — but they were never correctly filterable. You can change the remedy before merge.
- **GM nuance (Pass 2, verified live):** Chevrolet has 125/300 comma interior values covering **257k of 286k** listings (GM labels interiors "BaseColor, Material Seat Trim"). This looked alarming, but those compound values were NEVER correctly filterable — `interior_color="Jet Black, Cloth Seat Trim"` already split to exact `"Jet Black"`=8,149 — and the base colors (Jet Black/Black/Gray) survive comma-free. So the fix cleans a cluttered picker and makes counts honest **without losing real coverage**. GM interiors remain inherently under-filterable by interior color — a MarketCheck data-labeling limitation, not fixable via the API (would need client-side post-filtering).

### S5. Confirmed working (REVIEWED-OK): `interior_color` filter (BMW 85,971→20,339 for Black), `exterior_color` comma-OR (Black,Alpine White=11,654), `car_type=used` (BMW=94,514), year/price/miles ranges, `resolveModel` alias table.

---

## DIAGNOSE

### D1. Closest-match query is a guaranteed-null wasted call for dealer-scoped searches — FIX-ON-BRANCH
`diagnose` `withHard()` builds the closest-match query against `/search/car/active` with `dealer_id`, which (per the prior confirmed bug + live-search's own comment) returns a COUNT but **no listings** under our entitlement. So `cData.listings` is always empty → `closest=null` for any dealer-scoped search — AND it spends a MarketCheck call to get that null.
- **Live proof of premise:** `/search/car/active?dealer_id=1011864&rows=5` → `num_found:720`, `listings:0`. Count works, listings don't — so the closest-match query could never return a car.
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
- Micro-note (very low) — **CLOSED as unreachable.** Line 108 `if (!org) → ok:true` would grant free access to an orphaned membership→deleted-org. Flagged independently by two audits (Pass 1 + Pass 6 security second-opinion). **Reachability proof:** `memberships.org_id references organizations(id) ON DELETE CASCADE` (migration 0001:42), and `deleteCompany` deletes the org so memberships cascade away atomically — no dangling state can exist. The only trigger is a sub-second race (membership read, then org deleted+cascaded before the org read) granting ONE request of free access. Negligible; the transient-tolerant fail-open is correct. **No change** to the live auth gate.

### B2. Referral payout has no minimum-charge threshold — REVIEWED (by-design question)
Money paths audited in depth (webhook, checkout, cancel, portal, update-seats, referrals, account). **All invariants hold:** raw-body signature verify; webhook DERIVES state (no increments); out-of-order guard via `last_sub_event_at` + same-second re-fetch; atomic claim of `stripe_subscription_id` (loser cancels) prevents double-subscribe; `trial_used` blocks trial farming; idempotency keys on every Stripe mutation (checkout/customer/price/update-seats FROM→TO/referral credits); double-sub guards (DB + Stripe live-list); service-role only after `auth.getUser()`; all `/api/*` return JSON. Referral credits idempotent via `ref-referee-${id}`/`ref-referrer-${id}` keys (Stripe dedups even under concurrent webhooks). 
- Only lever for your call: `onRefereePaid` gates on `amountPaid>0` but no MINIMUM — a referee who pays any tiny prorated invoice earns the referrer the full $50. Likely intended; flagging as a money lever, not a bug.

## CRONS / INVENTORY

### C1. The `inventory` dump pipeline is DEAD (write-only, no reader) — OPEN (retire-or-wire decision)
Grep-confirmed: the only `.from("inventory")` calls in `src/` are inside `inventoryDump.ts` (sweep/upsert/decode-update + a self-read of its own undecoded rows). `live-search` + `diagnose` never read `inventory`; pickers read `vehicle_catalog`; `dealers/catalog` reads `dealer_catalog`. So `dump-inventory` cron + the `after()` hook in `dealers/selection` + the whole decode/sweep machinery write a table **nothing consumes**. This actively spends MarketCheck quota + Postgres writes for zero benefit, and matches the advisor's 4 unused `inventory_*` indexes (DB6). Severity MED (cost waste, not a correctness bug). **OWNER DECISION (2026-06-21): KEEP — do NOT retire.** This pipeline (`inventory` + `tracked_dealers` tables, the dump cron, the decode/sweep machinery) is the intended substrate for the planned **auto-desking** feature (~6 months out). Leaving it in place for future use. A future audit should NOT flag it as dead/removable. The remaining piece desking needs is a lender-program data source (residual % + money factor + incentives) — see the desking plan. Cost lever — **DONE (2026-06-21): `dump-inventory` cron PAUSED.** Removed `{ "path": "/api/cron/dump-inventory", "schedule": "0 */6 * * *" }` from `vercel.json` so it stops the every-6h quota spend while the `inventory` table is dormant. **All code is intact** — the route `/api/cron/dump-inventory` still exists and runs on manual trigger; only the schedule was removed. **To restore when desking ships:** re-add that exact line to the `crons` array in `vercel.json`. NOTE: the on-select `after()` hook in `dealers/selection` still dumps a dealer's inventory when a broker adds it (bounded, user-initiated) — left enabled; disable separately if you want a full cost-stop.

### C2. Cron/destructive invariants — REVIEWED-OK
All 5 cron routes check `CRON_SECRET`. Destructive sweep in `inventoryDump.ts` fails CLOSED: `numFoundSuspect` skips the sweep AND preserves the `listing_count` baseline; `readAll` returns null on any page error and aborts GC on partial reads; truncated(>1500)/failed fetches never sweep. Serverless budget honored (maxDuration=60, 47s/45s deadlines, 13s fetch margin). Self-chaining (refresh/verify) bounded by per-cycle gating + MAX_LINKS + unattempted-terminator + models-marked-attempted-even-on-null. sync-dealers preserves `makes` (upsert omits it), handles the 1500 offset cap via city-partition + `city_cursor`, reconciles typeless dealers behind a cheap rows=0 probe, and doesn't overwrite count when saturated.

### C3. `verify-catalog` header comment is wrong — FIX-ON-BRANCH (doc-only)
Lines 7-8 claim "Each fresh cycle clears the previous report first"; the code actually deletes per-model inside the loop (safer). Trivial comment correction.

## PICKERS / VIN

### P1. color comma bug — see S4 (FIX-ON-BRANCH). Also affected the stored-catalog path (`cleanColorFacet`), now fixed.

### P2. `list-styles` route is DEAD — REVIEWED (safe to delete)
`/vehicle/style/{year}/{make}/{model}` returns `HTTP 404 "no Route matched"` for current models (verified live: 2025/Toyota/RAV4), so the route always errors — AND it's referenced by **no UI code** (grep). Pure dead code: never called, would fail if it were. Harmless (uncalled). Recommend deleting the route file; left in place this pass to keep changes focused.

### P3. `cleanColorFacet` dedupKey over-aggressive — LOW
`marketcheck.ts` dedupKey strips any trailing digit-bearing token before keying, which could merge distinct color names ending in a digit. Colors rarely do; low frequency. Noted, not changed.

### P4. `list-trims` DB-first parity — LOW/MED
DB path emits only `available:true` trims; the live path additionally unions an unscoped "universe" of dimmed/unavailable trims. Shape divergence (DB mode shows fewer trims). Acceptable; noted.

### P5. `decode-vin` fallback only on 404 — LOW
NeoVIN `429`/`5xx` returns 502 without trying the basic `/decode/car/{vin}/specs` fallback (which only fires on 404). Minor resilience gap.

### Picker REVIEWED-OK
All plan-gated; short-TTL on empty; `resolveModel` never poisons cache on fallback; `model` comma-OR list is intended; trim variant chips + `option_names` arrays are intended OR (no comma bug — that's interior/exterior color only).

## GATING / MULTI-TENANCY / ADMIN

### G1. REVIEWED-OK — no HIGH/MED findings
proxy/middleware rotates auth cookies onto every redirect (no silent-logout), returns **401 JSON for `/api/*`** (never HTML 302), onboarding force-redirect skips `/api/*`+`/auth/*`+`/onboarding`. Every org-scoped route (customers/team/saved/dealers selection+removal) scopes reads AND writes to the caller's org/user; `team` DELETE and removal-request PATCH re-verify the row's `org_id` before a service-role write (no cross-org id-spoof). `admin/*` + `stripe/setup-products` gated on `SUPER_ADMIN_EMAILS`. Service-role client used only after `auth.getUser()`. Injection guards present (`.eq()` values parameterized; `.or()` strings static). Role checks (owner/admin/agent) on every mutation.
- Caveat: RLS verified from migration files (ledger 0001–0031), not live `pg_policies`; app-layer `.eq` scoping holds regardless.

### C3. verify-catalog header comment — FIXED (doc-only) on branch.

## CALCULATOR / LEASE MATH (Pass 2)

### L1. Negative monthly payment possible — FIX-ON-BRANCH
`computeLease` depreciation `(adjCap - residual$)/term` and `estMonthlyCard` `(price-residual)/36` go negative when the residual exceeds the cap — a >42%-off new car (card shows "-$30/mo" AND sorts as "cheapest" via `monthly_asc`), or an over-large down payment in the calculator ("-$328/mo"). **Fixed:** clamp depreciation at 0 (a lease floors at the rent charge) in LotCompass `lease.ts#computeLease` + `marketcheck.ts#estMonthlyCard`, and FleetFinder `lease.js#computeLease` (covers calculator + card). Normal-case output unchanged.

### L2. Used-car `max_monthly` estimate uses a fabricated residual — DOCUMENTED (intentional)
`live-search` max_monthly fallback calls `estMonthlyCard(price, msrp||price)`; for used cars with no real MSRP, residual becomes 58% of the *selling price* (the code's own comment calls this "garbage" for the card display, but the filter re-introduces it). This was a DELIBERATE tradeoff (so "Used + under $X/mo" returns inventory instead of dropping every used car). Correct used-lease math needs lender programs (the planned auto-desking feature). **Not changed unilaterally — your call:** exclude used from the $/mo filter, or keep the approximation.

### L3. `lease.ts#estMonthly` is dead code — LOW. Exported but never imported (cards use `estMonthlyCard`). Drift risk; safe to delete. Left in place.

### L4. Calculator has no card→prefill — UX NOTE. Standalone with hardcoded defaults; brokers retype vehicle numbers. Not a bug.

### Lease REVIEWED-OK: card formula, residual-on-MSRP (not selling price), rent base, MF×2400 APR, all 3 tax methods applied to the right base, profit/`mfReserve`, `dueAtSigning`, finance amortization (with r=0 fallback), single end rounding.

## UI STATE / VALUE-FLOW (Pass 3)

### U1. `CompaniesTable` price map not re-synced from props — FIX-ON-BRANCH (low)
The super-admin companies table re-synced `comped` from refreshed props after a toggle/delete `router.refresh()` but NOT `price` — the one instance of the documented `router.refresh()`/`useState` invariant being incompletely applied. Symptom (super-admin only): an unsaved price edit lingered, and a price changed in another tab didn't appear after refresh. **Fixed:** added a parallel `price` re-sync effect keyed on `orgs`, guarded by the in-flight `savingPrice` row (mirrors the `comped` pattern). Low blast radius (platform-owner page).

### U2. Optimistic delete/save lacks a seq guard — DOCUMENTED (low/acceptable)
`customers#del` + `useSavedVehicles` save/remove optimistically mutate then reload only on failure; a rapid delete during a slow in-flight reload could momentarily resurrect a row. No `router.refresh()`, local-only, likely never manifests. Adopt the `mutSeq` ref pattern (already used in `useOrgDealers`) only if it ever surfaces.

### UI REVIEWED-OK (guards verified)
diagnose out-of-order race (`diagSeq`); every picker load — list-models/trims/colors/interior-colors/features + DetailPanel VIN-decode — guarded by per-effect `cancelled` cleanup; dealers catalog (`loadSeq`); `useOrgDealers` GET-vs-mutation (`mutSeq`); `TeamManager` + `CompanyForm` correctly re-sync `useState` from props after refresh (CompanyForm adds a `dirty` guard); search error/empty/loading metadata fully reset on failure; value-flow card/form→params→`useSearchParams` re-key correct; control resets on make/model/trim/car-type change are complete; `BillingActions` overwrites banner from the authoritative cancel response (never tells a charged subscriber "you won't be charged").

---

## PASS 7 (new sweep, 2026-06-21)

### F1. Feature chips sent values MarketCheck doesn't index → silent zero — FIX-ON-BRANCH (both repos)
**Area:** `/api/live-search` `high_value_features` filter; `FEATURE_GROUPS` (`src/lib/inventory.ts` + FleetFinder `src/lib/inventory.js`).
**Root cause:** the prior sweep verified the `high_value_features` *mechanism* (exact match, comma=AND) but never checked that the UI chip `value`s exist in the facet vocabulary. Most did not — so selecting a common feature (Sunroof, Navigation, Backup Camera, Blind Spot, …) zeroed the search even with millions in stock. Same contract-mismatch class as AWD/Truck/Van, on the feature filter.
**Evidence (live `/search/car/active`, `car_type=new`, `rows=0`):**
`sunroof`→**0** vs `sun/moonroof`→1,482,013 · `navigation system`→**0** vs `navigation`→2,140,715 · `backup camera`→**0** vs `rear parking device`→3,167,881 · `blind spot monitor`→**0** vs `blind spot system`→2,788,138 · `wireless charging`→**0** vs `wireless charging/connection`→1,983,848 · `heads-up display`→**0** vs `head-up display`→556,954 · `wifi hotspot`→**0** vs `wifi network`→2,635,673 · `panoramic sunroof`→**0** vs `panoramic sun/moonroof`→972,075 · `cooled seats`→**0** vs `heated/cooled seats`→924,681 · `surround view camera`→**0** vs `360 view parking device`→1,226,363 · `automatic emergency braking`→**0** vs `anti collision system`→3,147,579 · `parking sensors`→**0** vs `parking distance system`→3,186,628 · `keyless entry`→**0** vs `smart card / smart key`→3,183,590 · `push button start`/`remote start`→**0** vs `keyless start/remote engine start`→3,133,110 · `power liftgate`→**0** vs `power closing liftgate`→1,644,696 · `tow package`→**0** vs `trailer assist`→1,789,268 · `third row seating`→**0** vs `3rd row seats`→650,571.
Already-correct (kept): apple carplay, android auto, premium speakers, heated seats, leather seats, memory seats, adaptive cruise control, lane keep assist.
No facet equivalent at all (each →0 live; **removed** from the picker): heated steering wheel, ambient interior lighting, roof rails, running boards.
**Fix:** rewrote `FEATURE_GROUPS` with verified facet strings; removed the 4 unfilterable chips + redundant "Wireless CarPlay" (indistinguishable from "apple carplay"); merged Push-Button/Remote Start (same facet). None of the corrected values contain a comma, so the AND-join is unambiguous.
**Verification:** every corrected value returns 6-figure+ live inventory (above); both repos `npm run build` clean. E2E on www.lotcompass.com pending merge/deploy.

### F2. Trim picker sent prettified names the `trim` filter can't match → silent zero — FIX-ON-BRANCH (both repos)
**Area:** `/api/list-trims` (live path) → `trim` filter in `/api/live-search`; FleetFinder `list_trims`.
**Root cause:** the live trims path returned `prettyTrim(titleCase(rawFacet))` as the trim name, and the UI sends that exact string back as the `trim` filter. The `trim` filter is case-insensitive but **space-sensitive**, and prettyTrim inserts a space for Mercedes-style prefixes (`Gle350` → `GLE 350`). So every Mercedes GLE/GLC/GLS/GLA/GLB/CLA/CLS/EQ/SL numeric trim was unfilterable. It also broke the version→trim attachment (`version.includes(trimName)` fails when the trim has an inserted space).
**Evidence (live, Mercedes-Benz GLE-Class):** facet value is `GLE350`. `trim=GLE350`→**40**, `trim=gle350`→40 (case-insensitive), `trim=GLE 350`→**0**. Contrast: BMW X5 `trim=40i`/`40I`/`M60i`/`M60I` all match (no space → fine).
**Why the catalog path was OK:** `catalogSnapshot` stores the raw facet `item` and `buildTrimsFromCatalog` returns it unmodified, so new in-catalog models already round-tripped. The bug only hit the LIVE path (used cars, non-catalog models, `fresh=true`).
**Fix:** the live path now uses the **raw** facet string as the trim name (dedup by `canonicalTrimKey`, shortest raw = representative), matching the catalog path. Provably round-trips (it's MarketCheck's own string) and repairs version→trim matching. Removed now-unused `prettyTrim`/`titleCase` imports. Mirrored to FleetFinder `list_trims` (no catalog path there). `prettyTrim` is unchanged for result-card display (cosmetic, never round-tripped).
**Verification:** both repos build clean; live contract proven above. E2E pending merge/deploy.

### F4. Catalog snapshot sampled 10 listings instead of 150 (rows=100 → API default 10) — FIX-ON-BRANCH (LotCompass only)
**Area:** `src/lib/catalogSnapshot.ts` (run nightly by `refresh-catalog`; feeds the trims/colors pickers).
**Root cause:** the trim→color sampler used `ROWS=100`. MarketCheck's `/search/car/active` silently **ignores** a `rows` above 50 and returns its DEFAULT of **10** (verified live: rows=10→10, rows=50→50, rows=100→**10**). So page 0 returned 10, then `listings.length < ROWS` (10<100) broke the loop — the per-trim exterior/interior color associations (`colorsByTrim`) were built from 10 cars per model instead of the intended ~300.
**Fix:** `ROWS=50` (the real per-page max) → 3×50 = 150 samples, with the offset staying inside the 1500 cap. Build clean.
**Status:** FIXED on branch (LotCompass only — FleetFinder has no nightly catalog system).

### F3. Inventory dump reads the count-only endpoint → captures 0 listings — CONFIRMED, NEEDS USER DECISION (not fixed)
**Area:** `src/lib/inventoryDump.ts` (the `inventory` mirror table; `dump-inventory` cron).
**Root cause:** the dump pages `/search/car/active?dealer_id=...`, but under our entitlement that endpoint returns a **count with NO listings** for a dealer filter (the same D1 truth). Verified live: `/search/car/active?dealer_id=1018518` → `num_found=616, listings=0`, whereas `/dealerships/inventory?dealer_id=1018518` → `616` with listings. It also uses `rows=100` (→ default 10). Net: the dump mirrors nothing; the destructive sweep is correctly blocked (deduped=0 fails the coverage guard), so **no wrongful deletion** — it's simply non-functional.
**Why NOT auto-fixed:** (1) the `dump-inventory` cron is currently **paused** ("until auto-desking ships") and the `inventory` table is **read by nothing**, so there is no live impact today; (2) the correct endpoint `/dealerships/inventory` is metered at **$1/call**, so running it nightly across every tracked dealer is a real cost decision, not a silent swap. The mission itself flags this as "decide with the user whether to retire it or wire a reader." **Recommendation for the user:** when auto-desking work begins, either (a) retire `inventoryDump` and rebuild on `/dealerships/inventory` with an explicit per-dealer refresh budget, or (b) switch the endpoint + set `MC_PAGE=50, MC_MAX_START=1450` and accept the $1/dealer/run cost. Left untouched pending that call.

### B3. Webhook seat true-up lacked an idempotency key — FIX-ON-BRANCH (LotCompass only)
**Area:** `src/app/api/stripe/webhook/route.ts` (trial→active seat reconciliation).
**Root cause:** the two `stripe.subscriptions.update(...)` true-up calls had no idempotency key. They are already idempotent-by-value (quantity is absolute, `proration_behavior:"none"`, guarded by `desired !== currentQty`), so the billed amount was always correct — but a redelivered `subscription.updated` event could fire a redundant update, technically violating the "every sub mutation uses an idempotency key" invariant.
**Fix:** added `idempotencyKey: seat-trueup-${sub.id}-${desired}` to both calls so a retry is a true no-op. Independent billing/auth review otherwise found all money-path / webhook-ordering / gate-fail-open / RLS / `/api`-JSON invariants upheld.
**Status:** FIXED on branch (LotCompass billing is Stripe-on-Next; FleetFinder uses a separate Base44 `manage_billing` — not affected).

---

## PASS 7 — areas reviewed clean this pass (no defect)
- **Model picker** (`list-models`): NEW = static catalog (normalized by `resolveModel`); USED-derived models also pass through `resolveModel`, which returns the real facet string regardless of casing → round-trips. OK.
- **Color/interior pickers**: search sends raw `variants` (comma-OR), not display names; comma-bearing interior variants dropped (S4). Live OR confirmed. OK.
- **Dealer-scoped search** (`/dealerships/inventory`): re-verified live (dealer 1018518 → 616, listings returned). D1 holds.
- **Dealers catalog picker**: inclusive make filter + injection-sanitized `.or()`; static-file fallback fail-safe. OK.
- **sync-dealers / dump GC / catalog crons**: offset math within 1500 cap, destructive sweeps fail-closed with coverage guards, baseline not poisoned by suspect-low counts, locks have a 3-min TTL + finally release, self-chaining crons terminate (independent cron review). OK.
- **Billing/auth/multi-tenancy**: idempotency, webhook ordering/atomic-claim, gate fail-open-on-transient / closed-on-canceled, service-role-after-auth, `/api` JSON-not-redirect — all upheld (independent review).

---

## PASS 8 (branch audit/v2-correctness) — new finding + areas re-verified

**BUG-0021 (FIXED) — verify-catalog self-chain re-attempts null models every link.**
`verify-catalog/route.ts:65` did `continue` on a `null` (transient-miss) result, skipping the
`catalog_verify_state` stamp at the loop's end. Since `pending` is recomputed per link as
"updated_at < cycleStart", an unstamped model stays pending and is re-attempted on every chained
link of the cycle (up to MAX_LINKS=450), burning budget and stalling the cycle. Same class as
BUG-0016. Fix: always stamp attempted; on null, keep the existing report (skip delete/insert) but
still mark attempted so it refreshes next cycle, not next link. Build-gated clean. LotCompass-only
(FleetFinder has no catalog cron). Evidence: refresh-catalog already stamps unconditionally with an
explicit warning comment about this exact stall.

**Areas re-verified clean this pass (live API + code):**
- **powertrain_type facet** = Combustion/HEV/MHEV/BEV/PHEV/FCEV/EREV (live). v2 search UI emits NO
  powertrain field, so no mismatch. FleetFinder `FUEL_TYPES`/`EV_FUELS` are dead (never imported).
- **body_type facet** (live) = SUV/Pickup/Sedan/Hatchback/Minivan/Coupe/Cargo Van/Convertible/Wagon/
  Passenger Van… UI {SUV,Sedan,Truck,Wagon,Coupe,Van}: Truck→Pickup, Van→Cargo Van,Minivan,Passenger
  Van; SUV/Sedan/Wagon/Coupe pass through and are all real. OK.
- **drivetrain facet** (live) = 4WD/FWD/RWD. UI {AWD/4WD→4WD, FWD, RWD} all real. OK.
- **Sort keys**: applied CLIENT-SIDE over fetched ≤150 results (search/page.tsx:343); only "distance"
  uses API order. Consistent. OK.
- **diagnose**: applies mcBodyType/mcDrivetrain, skips null closest-match when dealer-scoped, decode
  loop bounded. OK.
- **Feature chips**: v2 sends model-specific AND generic chips as `option_names` → client-side NeoVIN
  decode phraseMatch (vocabulary-agnostic), NOT the high_value_features facet filter. No P1 mismatch.

**BUG-0022 (FIXED) — Auto.dev fallback sent raw "AWD/4WD" → 0.** The Auto.dev path sent
`body.drivetrain` raw to `vehicle.drivetrain`. Live probe: Auto.dev shares MarketCheck's drivetrain
vocab (4WD/FWD/RWD) and HONORS the filter (`AWD/4WD`→0, `4WD`→5), so the combined UI label matched
nothing during a MarketCheck rate-limit fallback. Fix: apply `mcDrivetrain` on the Auto.dev path
(both repos). body_type left RAW — verified Auto.dev accepts `Truck`/`Van` natively but returns 0 for
`Cargo Van`, so the MC mapper must NOT be applied there. Build-gated + mirrored to FleetFinder.

**Live round-trip seams re-verified (picker→search, the #1 historical break point):**
- exterior_color: RAV4 facet `Storm Cloud`=5614 → search `exterior_color=Storm Cloud`=5614 (exact). OK.
- trim: RAV4 facet `XLE`=11578 → search `trim=XLE`=11578 (raw round-trips). OK.
- resolveModel alias: RAM `1500`→`Ram 1500 Pickup,Ram 1500 Classic`=94347 vs bare `1500`=0. Alias works.
- Auto.dev exterior_color: real marketing names (`Storm Cloud`, `Midnight Black Metallic`) all return
  results on Auto.dev → color filter parity is fine on the fallback (no fix needed).

**Observations (not fixed — not live defects):**
- Auto.dev path `total` reads `data.total||meta.total`, but the live response nests listings under
  `data.data` with no top-level total → Auto.dev fallback reports total=results.length (no "showing N
  of M" banner). Cosmetic, fallback-only. Phase-2 candidate.
- `list-styles/route.ts` sends RAW `body.model` (skips resolveModel), but the route has NO UI caller
  (dead code) — latent only. Phase-2 cleanup or wire-up.
- `lease.ts` clamps depreciation but not rentCharge; a negative money-factor input yields a negative
  monthly. Dealer-controlled internal calculator (GIGO, no money path); card path already clamped
  (BUG-0011). Left unchanged to avoid scope creep.
- `sync-dealers` city sub-partition ignores `cr.saturated`; a single city >1500 dealers of one type
  would drop the tail. No US city approaches that — latent only. Documented.

---

## PASS 9 (branch audit/v2-correctness) — Pass 2 of the v2 sweep

**BUG-0023 (DEFERRED, documented) — decode-vin memory-only cache → cold-start re-charge + double-decode.**
`decode-vin/route.ts` calls NeoVIN `/specs` directly and caches only in `memoryCache` (key `vin::VIN`),
NOT the durable `vin_decode_cache` that BUG-0006 added to `neovinSpecs`. The two paths also store
different payloads under different keys, so the same $0.08 decode is paid twice (build-sheet view +
option search) and re-charged on cold starts. Same P4 pattern as the $2,177 BUG-0006 but lower volume.
Durable fix needs a small schema decision (existing table is one-payload-per-VIN) → deferred for owner
sign-off per the no-scope-creep / cost-posture rules. Proposal recorded in BUG_REGISTRY.

**Areas re-verified clean this pass:**
- **dealers/catalog**: BUG-0005 inclusive-make filter intact (`makes.cs.{}` + untagged-with-inventory via
  `makes.is.null`/`makes.eq.{}`); `.or()` injection guards on both make and q. OK.
- **dealers/selection**: GET via RLS client; POST/DELETE service-role after auth; DELETE owner/admin-gated,
  soft-deselect; no tracked_dealers vestige (BUG-0019/0020 clean). OK.
- **dealers/removal-requests**: org-scoped, role-gated PATCH, dedupe, only-pending guard. OK.
- **UI client-state (P9)**: full sweep of all 18 "use client" components — every prop-seeded component
  subject to in-place `router.refresh()` (TeamManager, CompaniesTable, CompanyForm, ReferralPanel) has a
  resync effect; the rest own their fetch (loadSeq/mutSeq guards) or full-reload on mutation. No P9 bug.

---

## PASS 10 (branch audit/v2-correctness) — remaining API routes + final value-class checks

**BUG-0024 (DEFERRED) — color picker DB-vs-live cleaning divergence.** Snapshot uses exterior-tuned
`cleanColorFacet` for both ext+int; live routes hand-roll (ext: no scrub; int: material-aware). Display
-only (variants preserved → filtering correct, proven by the live round-trip). Proposed: mode-aware
shared cleaner used by snapshot + both live routes. Deferred (changes nightly-job stored names).

**Remaining API routes audited (referral/customers/saved/team/me/account/admin) — no defects:**
auth + 401/402-JSON, org/role-scoped tenancy, service-role-after-auth, PostgREST injection guards, and
money-path idempotency (account/finalize stripe-sub claim is null-guarded; onboard referral is
UNIQUE-backed; admin/companies cancels Stripe before delete with rollback + fail-closed on null count)
all upheld. Three NITS (not logged as bugs): saved POST may write org_id=null on provisioning failure
(harmless — saved is user-scoped by user_id); admin/promos coupon create lacks an idempotency key
(super-admin manual, non-billing); customers email/phone unvalidated (own-row only). Phase-2 hygiene.

**Last UI→provider value class verified live (make strings, incl. casing/hyphens/spaces):**
Mercedes-Benz 88,257 · Land Rover 24,201 · Alfa Romeo 1,188 · MINI 10,427 · GMC 148,649 · RAM 159,461 ·
Mazda 117,174 — all valid. Combined with prior live checks (body_type, drivetrain, powertrain, color &
trim round-trips, model aliases), EVERY value the UI can send to MarketCheck is now confirmed against the
live facet vocabulary.

### Run summary (branch audit/v2-correctness)
- **Fixed + build-gated:** BUG-0021 (verify-catalog self-chain stall), BUG-0022 (Auto.dev drivetrain map; mirrored to FleetFinder).
- **Deferred (owner sign-off, documented with proposal):** BUG-0023 (decode-vin durable cache), BUG-0024 (color cleaner unification).
- **Verified clean:** all search filters, diagnose, every picker, all crons, full billing/auth/multi-tenancy, UI client-state (P9), and all remaining API routes.
- **Completion bar:** the two deferred items are open pending owner decisions, so a "zero-findings" clean streak can't be certified until they're resolved/accepted. The two code defects are fixed; the whole checklist has been walked once end-to-end with live evidence.

---

## TODO (areas not yet swept this pass)
- Pickers: list-models/trims/colors/interior/features/styles DB-vs-live parity, comma-variant issue (S4).
- Dealers: catalog picker makes filter (prompt: ~80% empty makes tags), selection, removal-requests, sync-dealers cron.
- Catalog crons: refresh/verify/health self-chaining; inventoryDump reader gap.
- Billing/auth: Stripe webhook idempotency/ordering, requireActivePlan fail-open/closed, referrals idempotency, proxy gating.
- UI flows end-to-end on live lotcompass.com.
