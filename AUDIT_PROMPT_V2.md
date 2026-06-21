# LotCompass / FleetFinder — Exhaustive Two-Phase Audit (Correctness, then Optimization)

You are a senior engineer auditing a production multi-tenant SaaS. Your job is to find and fix **every** defect, then — in a second pass — find every **optimization**. You work on a **branch only**, prove every change, and **do not merge**: the owner reviews and merges. This document is self-contained; read it fully before touching anything.

---

## 0. The single most important rule: MAKE NO ASSUMPTIONS

Every prior audit of this app "passed" while serious, user-facing, money-costing bugs hid in plain sight. **They were missed because reviewers reasoned about code instead of verifying behavior against reality.** Internalize this:

- **Code that looks correct is not evidence it is correct.** A param can be named right, typed right, and still match nothing on the provider.
- **Documentation is not evidence.** The MarketCheck docs said the pagination cap was "10,000/rows"; the real cap on this account's plan is **1,500** (verified by a live `422`). Docs lie or generalize; the live API with our key is ground truth.
- **A UI label is not a provider value.** "AWD", "Truck", "Van", "sunroof", "Gas" are all UI labels that returned **zero results** because MarketCheck's facet vocabulary is `4WD`, `Pickup`, `Cargo Van/Minivan/Passenger Van`, `sun/moonroof`, `Combustion`. Every value sent to any external API must be verified against that API's **live facet vocabulary**.
- **A non-zero count is not availability.** `/search/car/active?dealer_id=…` returns a `num_found` of hundreds but **zero listings** under our entitlement. Count ≠ data.
- **A cache in code is not a cache in production.** The VIN-decode "cache" was in-memory only; on serverless it never survived cold starts, so the same VINs were re-charged at $0.08 forever. The DB cache tables existed but were wired to nothing.
- **A passing test harness is not verification.** A co-worker produced a 2-million-row "exhaustive check" that verified nothing (every row `PENDING`, `live_count=0`) and the executed slivers compared meaningless quantities. It looked authoritative and caught zero real defects.

**Therefore: every finding and every "fixed" claim in your report MUST carry concrete evidence** — a live API response, a SQL query result, a specific code line + file, and a live re-test after the fix. "I reviewed it and it looks fine" is not allowed as a conclusion. If you cannot prove something, mark it **UNVERIFIED** and say exactly what you'd need to prove it.

---

## 0.5. The persistent bug registry — READ FIRST, APPEND ALWAYS (mandatory)

There is a living, **append-only** file **`BUG_REGISTRY.md`** at each repo root. It is the shared, cross-agent memory of **every bug ever found and fixed in this app** — by any agent, in any session, past or future. It exists so no one re-treads old ground and so every documented bug becomes a **pattern you actively hunt elsewhere**.

**Your obligations, in order:**
1. **Before you audit or fix anything, READ `BUG_REGISTRY.md` in full.** Treat every entry as a known failure mode to look for in new places (the registry's "Pattern" field tells you where it can re-hide).
2. **The moment you confirm a NEW bug, append an entry to `BUG_REGISTRY.md`** (do not wait until the end). Use the exact entry format below. Fill the fix/commit/evidence fields when you fix it.
3. **Append-only. NEVER edit or delete a prior entry** (except to update its own Status/Fix/Evidence when you resolve it). Never renumber. IDs are permanent and monotonically increasing (`BUG-NNNN`).
4. If two agents might run, treat the highest existing `BUG-NNNN` as the watermark and continue from there; if you hit a merge conflict on this file, **keep both sides** (union of entries) — never drop anyone's entry.
5. This file is committed to the branch with your fixes, so it travels with the code. `AUDIT_FINDINGS.md` is your per-run working log; **`BUG_REGISTRY.md` is the permanent canonical ledger** — keep them consistent but the registry is the source of truth.

**Entry format (copy exactly):**
```
### BUG-NNNN — <one-line title>
- **Date:** YYYY-MM-DD     **Severity:** Critical|High|Med|Low     **Found by:** <agent/session>
- **Area:** <file/route/cron/UI>
- **Symptom:** <what the user/system saw>
- **Root cause:** <the real why, proven>
- **Pattern (hunt elsewhere):** <the generalizable failure mode + where else it can hide>
- **Fix:** <what changed> — Commits: <repo sha(s)>
- **Evidence:** <live API output / SQL / live re-test that proves found AND fixed>
- **Status:** Open | Fixed & verified | Deferred (owner sign-off) | Not-a-bug (with reason)
```

The registry is **seeded** with the bugs already found in this app — read them; many are different faces of the same few patterns (provider-value vocabulary, count≠availability, unwired cache, tier limits, sparse-column filtering). Your job is to find the faces no one has hit yet.

---

## 1. The apps

- **LotCompass** — dir `fleetfinder-v2`. The production SaaS. **Next.js 16 / React 19 / TypeScript / Tailwind v4 / Supabase (Postgres+Auth) / Stripe (LIVE) / Vercel.** Live at **www.lotcompass.com**. Multi-tenant: brokers do cross-brand, VIN-deduped lease-inventory search + a lease calculator + a zero-result diagnoser. Providers: **MarketCheck** (primary) + **Auto.dev** (fallback).
- **FleetFinder** — dir `fleetfinder`. Personal mirror. **Vite/React SPA + base44 Deno edge functions** in `base44/functions/`. Shares logic with LotCompass; cross-cutting fixes must be applied to both, respecting each stack. Its frontend mock is **dev-only** (`VITE_USE_MOCK`); in prod its base44 functions call MarketCheck for real. It has **no catalog-refresh cron** and its scheduled syncs are gated off (`SYNC_ENABLED`).

> **This is NOT the Next.js you were trained on.** It's Next 16 with breaking changes. Middleware is **`src/proxy.ts`** (`proxy()` + `config.matcher`), not `middleware.ts`. Route handlers set runtime via `export const maxDuration`. Page `searchParams`/`params` are **async**. Read `node_modules/next/dist/docs/` before writing framework code. `README.md` is stale ("Phase 1") — **trust the code, not the docs.** Read `CLAUDE.md` and `AGENTS.md` in `fleetfinder-v2` first.

### Infra & access you have
- Build gate (LotCompass): `export PATH="$HOME/.local/node/bin:$PATH" && npm run build` (compiles + eslint + typecheck). **There is no test suite** — you verify by a clean build + manual/live checks.
- FleetFinder Deno check: `deno check base44/functions/<fn>/entry.ts`.
- Supabase project ref **`vbacqlizbzcxesiwifcv`** via the **Supabase MCP** (`execute_sql`, `apply_migration`, `get_advisors`). Migrations live in `supabase/migrations/00NN_name.sql`; keep file version == ledger version. Run `get_advisors` after every schema change and keep it clean.
- **MarketCheck API key** is in `fleetfinder-v2/.env.local` (`MARKETCHECK_API_KEY`). Use it with `curl` to verify every external contract. Supabase service-role key + URL are also there.
- A logged-in test browser tab on www.lotcompass.com exists (org "tester", raymondbijou@gmail.com — trial extended to ~2026-07-21) for same-origin `fetch` tests against the live deployed routes. Do not assume it stays authenticated; check HTTP status, not just the body.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never skip hooks.

---

## 2. Operating rules (hard constraints)

1. **Branch only. Never push to `main`. Never merge.** Create `git checkout -b audit/v2-correctness` (phase 1) in **both** repos. Commit fixes there. When the audit completes, **stop and hand the branch to the owner for review** — they merge. Phase 2 uses a second branch `audit/v2-optimization` (only after phase 1 is approved, OR on top of phase-1 branch if owner says so).
2. **Build-gate every commit.** LotCompass `npm run build` must pass; FleetFinder `deno check` on touched functions must pass.
3. **Maintain `AUDIT_FINDINGS.md` on the branch.** One entry per finding: area, severity, root cause, **evidence** (API output / SQL / code line / live test), the fix, and the **post-fix live re-verification**. No item is "done" without re-verification evidence.
4. **Cost discipline.** MarketCheck charges per call: Inventory Search $0.002, **Dealership Inventory Syndication $1.00**, **NeoVIN decode $0.08**, dealer dir ~$0.0025. When probing, prefer `rows=0` + facets (cheap), avoid the $1 syndication and $0.08 decode endpoints except where a single targeted call is genuinely needed. Never loop expensive calls during testing. Note any spend in the findings.
5. **Fail closed on uncertainty.** If a change touches money (Stripe), access (RLS/auth), or destructive DB ops, and you cannot fully prove safety, do NOT make it — document it as a recommendation for owner sign-off.
6. **No silent scope creep.** If you find something big (architecture, a paid endpoint swap, a schema migration on a hot table), document and propose; don't just do it.
7. **Respect deliberate decisions** recorded in `BUG_REGISTRY.md` / `AUDIT_FINDINGS.md`. NOTE: the `inventory`/`dump-inventory` pipeline (`inventoryDump.ts`, the `dump-inventory` cron, the `inventory` table) was **DELETED** per owner decision (BUG-0019) — do **not** recreate it; if "auto-desking" is built later it will be rebuilt fresh through `/dealerships/inventory`. The `tracked_dealers` table + its upsert in `dealers/selection` is a known harmless vestige of that pipeline (registration write, no current reader) — flag it if you like, but it is not a bug.

---

## 3. The completion bar (strict — do not declare done early)

Phase 1 is complete ONLY when **ALL** hold:
1. You have run the **full area checklist (Section 6)** end-to-end.
2. Every issue found is either **fixed + live-re-verified** on the branch, or **documented with evidence** as a deferred recommendation with a clear reason (money/access/destructive → owner sign-off).
3. You then run the **entire sweep again from scratch**, and again, until you get **three consecutive full passes that surface zero new findings.** A pass that finds even one new issue resets the counter — fix it, then start a fresh clean-streak count.
4. Both repos build clean; `get_advisors` is clean (or every remaining advisor is documented as intentional).
5. `AUDIT_FINDINGS.md` is complete and every "fixed" line has re-verification evidence.
6. **`BUG_REGISTRY.md` has a new `BUG-NNNN` entry for every defect you found this run**, each with proof and status. (Read it first; append as you go.)

Then **stop and report** — do not merge. Wait for owner approval before Phase 2.

---

## 4. The bug catalog — every problem this app has actually had, and where each pattern can re-hide

Treat each as a **pattern to hunt elsewhere**, not a one-off. For each, I give the original bug → the generalizable pattern → where else to look.

1. **"Showing first 10."** `PAGE_SIZE=100` but MarketCheck's max `rows` is 50; over-asking made the API silently return its default 10 and the loop broke. → **Pattern: an API silently ignores an out-of-range param and substitutes a default.** → Hunt: every `rows`/`limit`/`start`/`facets size` param on every MarketCheck + Auto.dev call; confirm the accepted range live.
2. **Dealer search returned 0.** `/search/car/active?dealer_id=` returns a count but no listings under our entitlement; needs `/dealerships/inventory`. → **Pattern: count-only responses; wrong endpoint for the data shape you need.** → Hunt: anywhere code reads `.listings`/`.data` after a filtered call — confirm that filter actually yields listings, not just a count. Check `diagnose`, `list-features`, catalog snapshot sampling.
3. **Directory truncation at offset 1500.** Tier pagination cap, undocumented in the generic docs. → **Pattern: plan-specific limits.** → Hunt: every paginating loop (sync-dealers, catalog refresh, search, inventory dump) — what happens at the cap? Is the tail silently dropped? Is there a resumable cursor?
4. **Filter value vocabulary mismatches** (the biggest, most recurring class): `drivetrain` AWD→nothing (real: 4WD/FWD/RWD), `body_type` Truck/Van→nothing (real: Pickup/Cargo Van/Minivan/Passenger Van), `high_value_features` sunroof→nothing (real: sun/moonroof), `powertrain_type` Gas/Hybrid/Electric→nothing (real: Combustion/MHEV/HEV/BEV/PHEV). → **Pattern: ANY UI/catalog value sent to a provider must equal a real facet value.** → Hunt: **enumerate every value the UI can send for every filter** (BODY_TYPES, DRIVETRAINS, FUEL_TYPES, FEATURE_GROUPS values, color lists, trims, year/price ranges, sort keys) and verify each against the live facet for that field. Check the `mcBodyType`/`mcDrivetrain` mappers cover every option. Check Auto.dev's vocabulary too (it differs from MarketCheck). Check `colors`/`interior_color` full-string matching and comma-OR behavior.
5. **Make filter hid ~80% of dealers** (sparse `makes` column). → **Pattern: filtering on a sparsely/partially-populated column silently excludes the un-populated majority.** → Hunt: every DB filter on an optional/backfilled column (makes, lat/lng, listing_count, options, colors_by_trim). Does an empty/null value get wrongly excluded?
6. **VIN decode cache never wired** (memory-only; DB tables `vin_decode_cache`/`trim_cache`/`color_cache`/`search_cache` unused). → **Pattern: a "cache" that doesn't survive serverless cold starts is not a cache; schema landed but code never connected.** → Hunt: confirm which caches are DB-backed vs memory-only; cold-start test (does a fresh request reuse prior work?). Are `trim_cache`/`color_cache`/`search_cache` still unused? Should the live search results cache be DB-backed?
7. **Nightly decode on churning data.** refresh-catalog decoded fresh VINs every night. Now weekly. → **Pattern: expensive recompute on a cadence faster than the data changes.** → Hunt: every cron — does it recompute things that rarely change? Could it be event-driven or less frequent?
8. **Write-only dead pipeline.** The `inventory` table was written and read by nothing — DELETED in BUG-0019 (table dropped, code removed). → **Pattern: producers with no consumers spending quota/compute.** → Hunt: for every table, confirm there's a reader; for every cron/after()-hook, confirm the output is consumed. (Current known vestige: `tracked_dealers` is still upserted by `dealers/selection` with no reader — harmless, documented.)
9. **False-confidence verification.** → **Pattern: an audit artifact that looks thorough but verifies nothing.** → Applies to YOU: do not produce summaries that assert correctness without evidence.
10. **Raw provider junk stored.** Factory-code color cruft, typos, comma-bearing color values that break the comma-OR filter. → **Pattern: provider data persisted without cleaning, then surfacing in pickers or breaking downstream parsing.** → Hunt: everywhere raw MarketCheck strings are stored or concatenated into params (colors, trims, versions, options, dealer names). Any value containing a comma, bracket, slash, or code token that flows into a comma-OR filter is suspect.
11. **Diagnose count-only wasted call (D1).** → see #2.
12. **Lease calc could go negative (L1).** Depreciation unbounded. → **Pattern: financial/math not clamped against edge inputs (0/negative/huge MSRP, residual > MSRP, money factor signs).** → Hunt: the entire lease calculator — every term, every division, residual %, money factor, fees, tax, negative equity; what happens with missing MSRP, $0 price, used cars, residual=0?
13. **Stale client state after refresh (U1).** `router.refresh()` doesn't reset `useState`. → **Pattern: server-prop changes not re-synced into client state.** → Hunt: every client component that seeds `useState` from props and also calls `router.refresh()` or reloads (admin tables, team manager, company form, billing actions, saved/customers lists, dealer picker, search stepper).
14. **Auth/gating seams.** `/api/*` must return **401 JSON, never an HTML redirect**; service-role only after `auth.getUser()`; the trial gate must **fail closed to 402** and never grant free metered access to an org-less/canceled org. → Hunt: every metered route's gate; every service-role usage; proxy.ts redirect cookie rotation (no silent logout); onboarding redirect exclusions.
15. **Money paths.** Stripe webhook must be idempotent + ordered (`last_sub_event_at`, atomic `stripe_subscription_id` claim, `trial_used`). → Hunt: webhook, checkout, cancel, portal, update-seats, referrals (idempotent credits). Never increment from a payload; derive state.
16. **Serverless budget.** maxDuration=60; anchor `reqStart`; break loops ~47s; short TTL on partial/truncated caches. → Hunt: every route that loops over API calls or VIN decodes.
17. **Destructive ops fail closed.** Delete-sweeps need coverage guards; a suspect-low provider count must skip the sweep AND not overwrite the baseline; PostgREST `count` is null on error → treat as "don't delete." → Hunt: any `.delete()`, sync-dealers GC/city-partition, catalog cleanup/verify sweeps.
18. **Self-chaining crons stall.** Must mark every model attempted-even-on-null or never-seen items re-run forever. → Hunt: refresh-catalog, verify-catalog chaining + terminators + per-cycle gating + MAX_LINKS.
19. **Model/make string mismatch.** Catalog "1500" vs MarketCheck "Ram 1500 Pickup" (`resolveModel`). → **Pattern: identifiers differ between our DB and the provider.** → Hunt: resolveModel coverage for every make; dealer_id spaces (our `dealer_key` vs MC `dealer_id`); make casing (KIA, BMW, Mercedes-Benz).
20. **PostgREST quirks.** Untagged arrays are `'{}'` not NULL; `.or()` strings are injection-prone if interpolated; array-contains needs `cs.{"value"}`. → Hunt: every `.or()`, `.contains()`, `.in()`, array filter; confirm injection guards and empty-vs-null handling.
21. **Auto.dev fallback parity.** `autoDevCantHonor` lists filters Auto.dev can't do (dealer scope, interior color, powertrain, zip-without-coords). → Hunt: is the list complete and current after all the new filters/mappers? Does a fallback ever serve/cache a result that silently ignored a filter?
22. **Provider response field paths.** Code reads `build.trim`, `installed_options_details`, `facets.X.item`, `dealer.name`, `num_found`, `listings`, `inventory_url`, etc. → **Pattern: assumed JSON shape.** → Hunt: every field access on an API response — confirm the path exists in a live response and handle absence.

---

## 5. The connection map — the seams most likely to be broken

Audit each seam by tracing a real value across it and proving the contract holds at both ends:

- **UI control value → request body → provider param → provider facet vocabulary.** (Filters, sorts, ranges, features, colors, trims.) The #1 break point.
- **`vehicle_catalog` (nightly snapshot) → `list-*` picker routes → search params.** Do stored values match what search sends? Are cleaned values consistent between snapshot and live fallback?
- **`dealer_catalog` → picker (`/api/dealers/catalog`) → `dealers.dealer_key` (selection) → live-search `dealer_ids` → `/dealerships/inventory` comma-OR.** Confirm the ID space is identical end to end.
- **memoryCache vs DB caches** (`vin_decode_cache` now wired; `trim_cache`/`color_cache`/`search_cache` — verify status).
- **Stripe webhook → `organizations.plan_status` / `trial_ends_at` / `stripe_subscription_id` → `requireActivePlan` → 402/200.**
- **`proxy.ts` → `lib/supabase/middleware.ts` cookie rotation → redirects** (401 JSON for `/api/*`, onboarding gate).
- **Crons (`CRON_SECRET`) → MarketCheck quota → DB writes → consumers.** Every cron's output must have a reader.
- **`resolveModel` / make normalization** between catalog and MarketCheck.
- **Auto.dev fallback path** parity with the MarketCheck path for every filter.
- **Cross-repo parity**: any shared logic fixed in `fleetfinder-v2/src/lib/marketcheck.ts` likely has a twin in `fleetfinder/base44/functions/_shared/mc.ts` and entry functions.

---

## 6. The exhaustive area checklist (run ALL; for each: read → verify live → test edge cases → fix → re-verify)

For **every** route/lib/cron/UI flow below, do the five-step loop: (A) read the code and list every external contract & assumption; (B) verify each against the live API (curl) and live DB (SQL); (C) exercise the live route with realistic + edge inputs (empty, max, zero-result, unicode, injection, used vs new, huge dealer lists, missing fields); (D) fix on the branch + build-gate; (E) re-verify live and log evidence.

**Search & inventory**
- `live-search`: every filter end-to-end (make, model via resolveModel, trim, variant, year, price, miles, body_type, drivetrain, powertrain, exterior/interior color, features→option_names, max_monthly, zip+radius, dealer_ids). Pagination (PAGE_SIZE=50, SEARCH_LIMIT, dealer rows=150 single call). The 47s budget. Cache TTLs (and whether results cache should be DB-backed). Auto.dev fallback + `autoDevCantHonor`. The option-decode post-filter (cap, deadline, cache reuse). The dealer-scoped path → `/dealerships/inventory`, comma-OR, 200-dealer cap, no-valid-ids guard, geo skipped.
- `diagnose`: facet pool correctness, value mappers applied, dealer-scoped closest-match skip, decode budget, the "reasons"/"fixes" logic, 503-on-unavailable vs 0-results.
- Pickers: `list-models`, `list-trims`, `list-colors`, `list-interior-colors`, `list-features`, `list-styles` — DB-first vs live fallback parity, cleaning/scrub consistency, trim-specific colors, the comma-bearing-color fix, **every feature value vs live facet**.
- VIN decode (`decode-vin`) + the shared NeoVIN cache (memory→DB→live, names/details share one decode, 30d TTL, cold-start reuse).

**Dealers**
- `dealers/catalog` (picker): make filter (precise for backfilled NY/NJ, inclusive-for-stocked elsewhere), state/type filters, pagination, stocked-first ordering, the static-file fallback (stale? does the DB path ever silently fall back?).
- `dealers/selection` (dealer_key = MC id; the on-select dump is intentionally paused), `removal-requests`.
- `sync-dealers` cron: 1500-offset city-partition + `city_cursor` resume, rotation fairness, typeless reconciliation probe, `makes` preservation on upsert, the opt-in `?backfill_makes` branch.
- (The `inventoryDump.ts` + `dump-inventory` cron + `inventory` table were DELETED in BUG-0019 — do not recreate. `tracked_dealers` upsert in `dealers/selection` is a harmless vestige.)

**Catalog**
- `refresh-catalog` (self-chaining, weekly option-decode throttle, mark-attempted terminator), `verify-catalog`, `catalog-health`; `catalogSnapshot` (facet cleaning, trim×color sampling, skipOptions), `catalogRead`. Coverage vs the 392-model catalog. Color/trim/version scrubbing correctness.

**Billing / auth / multi-tenancy** (do not skip — money & access)
- Stripe webhook idempotency & ordering; checkout/cancel/portal/update-seats; referrals (idempotent balance credits); `trial_used` anti-farming.
- `requireActivePlan` (trial vs active vs canceled vs comped, card-gated, fail-closed 402); `proxy.ts` gating (401 JSON for `/api/*`, cookie rotation, onboarding redirect exclusions); super-admin email gate; RLS + `security definer` `search_path`; service-role only after `auth.getUser()`. Run `get_advisors` (security + performance) and resolve or justify each.

**UI**
- Search stepper, results, saved, customers, account hub, team manager, billing actions, dealer picker, **lease calculator** (clamp/edge math), admin tables. Value flow card/form→params→`useSearchParams`; `router.refresh()` vs `useState` resync; error/empty/loading resets; race guards (`mutSeq`/`loadSeq`/`diagSeq`/`cancelled`).

---

## 7. PHASE 2 — the optimization audit (run ONLY after Phase 1 is approved)

New branch `audit/v2-optimization`. Same anti-assumption doctrine, same branch/no-merge/approval rules, same "3 consecutive clean passes" bar — but now you are not hunting **bugs**, you are hunting **improvements**. Every proposed optimization must be backed by evidence (a measurement, a cost number, an API-doc fact verified live) and must not change correctness. Produce `OPTIMIZATION_FINDINGS.md` with, per item: what, why (measured benefit), risk, and the change.

**A. MarketCheck API usage (HIGHEST PRIORITY — the owner cares about this most)**
- **Audit every MarketCheck call in both repos**: endpoint, params, frequency, cost, and whether a cheaper/better endpoint or call pattern exists. Read the live MarketCheck docs AND verify against the live API with our key.
- Specifically investigate: is the **$0.08 NeoVIN `/specs` decode** the cheapest way to get installed options, or does the **$0.02 "NeoVIN Available Options Packages"** endpoint (or another) return what we need at ¼ the cost? Verify what each actually returns for a real VIN before recommending.
- Are we using **facets** to get in one call what we currently get in many? Are we paging when a single faceted call would do? Are we requesting `fields=` to shrink payloads and latency?
- Are we hitting **count-only** endpoints anywhere we could use a cheaper signal, or expensive endpoints where a cheaper one suffices?
- Could the **search results cache be DB-backed** (`search_cache`) so identical broker searches across instances/cold-starts don't re-spend? Quantify the hit rate.
- Could **trim/color catalog reads** use `trim_cache`/`color_cache` to cut live fallback calls?
- Is the **catalog refresh** sampling more listings/decodes than needed for the same data quality? Can option decode be event-driven or model-year-gated instead of weekly?
- Right-size cadence on every cron vs how often the underlying data actually changes.
- Propose a **monthly cost model** (calls × unit price per endpoint) before and after each optimization.

**B. Code efficiency & quality**
- N+1 DB queries, unbounded selects (PostgREST 1000-row cap), missing/unused indexes (cross-check `get_advisors` performance), redundant awaits that could be `Promise.all`, repeated work that could be memoized/cached, oversized client bundles, duplicated logic that should be shared (esp. cross-repo).
- Dead code / unused exports / unused env (e.g. the `tracked_dealers` vestige).
- Serverless cold-start cost; payload sizes; needless `cache: "no-store"`.

**C. Product / UX / website quality**
- Search latency and perceived performance; result relevance/sort; empty-state and error UX; the diagnoser's helpfulness; picker speed (DB-first coverage); mobile; accessibility; SEO/meta where relevant; onboarding and billing flows; anything that would make a broker's day faster.
- Data quality: catalog completeness/cleanliness, dealer directory coverage, color/trim naming.

**D. Reliability**
- Better failure handling, retries with backoff, idempotency, observability (are errors/cost visible anywhere? `provider_usage` table — is it populated/used?), rate-limit handling.

Deliver Phase 2 as a **prioritized, evidence-backed recommendation list on the branch** — implement the safe, high-value, correctness-neutral ones; propose (don't apply) anything that changes behavior, cost posture, or schema until the owner approves.

---

## 8. Final deliverables
- Branch `audit/v2-correctness` (+ `audit/v2-optimization`) in **both** repos, never merged.
- `AUDIT_FINDINGS.md` and `OPTIMIZATION_FINDINGS.md` with evidence per item.
- A short top-level summary: what was found, what was fixed (with live proof), what's deferred for owner sign-off, the before/after MarketCheck cost model, and confirmation of the 3-consecutive-clean-pass completion for each phase.
- **Then stop and wait for the owner to review and merge.**
