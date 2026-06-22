# BUG REGISTRY — LotCompass / FleetFinder

**This is the permanent, append-only ledger of every bug ever found and fixed in this app.** It is shared across all agents and sessions.

## Protocol (every agent MUST follow)
1. **READ this entire file before auditing or fixing anything.** Every entry is a known failure mode — its **Pattern** field tells you where the same class of bug can re-hide. Hunt those places.
2. **Append a new `BUG-NNNN` entry the moment you confirm a new bug** (don't wait for the end). Fill fix/commit/evidence when resolved.
3. **Append-only.** Never edit or delete a prior entry except to update its own Status/Fix/Evidence. Never renumber. IDs are permanent and increasing.
4. On a merge conflict here, **keep both sides** (union) — never drop an entry.
5. This is the canonical ledger; `AUDIT_FINDINGS.md` is a per-run working log. Keep them consistent.

## The recurring patterns (memorize these — most bugs are a new face of one of them)
- **P1 — Provider-value vocabulary mismatch:** any value sent to MarketCheck/Auto.dev (filter label, trim, color, feature, drivetrain, body type, powertrain) must equal a REAL live facet value, or it silently matches nothing → 0 results. Verify every value against the live facet.
- **P2 — Count ≠ availability:** some endpoints return a `num_found` but no `listings` under our entitlement (e.g. `/search/car/active?dealer_id=`). A non-zero count is not data.
- **P3 — Plan/tier limits, undocumented:** real caps (pagination offset 1500, rows 50) differ from the generic docs. Verify limits live with our key.
- **P4 — Unwired/ineffective cache:** in-memory caches don't survive serverless cold starts; DB cache tables can exist but be unconnected. "Cached" in code ≠ cached in prod.
- **P5 — Sparse-column filtering:** filtering on a partially-populated column silently excludes the un-populated majority.
- **P6 — Recompute faster than data changes:** expensive cron work on a cadence faster than the underlying data actually changes.
- **P7 — Producer with no consumer:** a table/pipeline written but read by nothing (spends quota/compute). (Exception: the `inventory`/dump pipeline is intentionally kept for future auto-desking.)
- **P8 — Raw provider junk stored / un-sanitized into params:** factory-code cruft, typos, comma/bracket/slash tokens that break comma-OR filters downstream.
- **P9 — Stale client state:** `router.refresh()` doesn't reset `useState`; server-prop changes must be re-synced into client state.
- **P10 — Unbounded math / missing edge handling:** financial/range math not clamped (negatives, zero, missing MSRP); assumed JSON field paths.
- **P11 — Identifier mismatch across systems:** our DB strings/ids differ from the provider's (model names, dealer ids, make casing).
- **P12 — PostgREST quirks:** untagged arrays are `'{}'` not NULL; `.or()` interpolation is injection-prone; array-contains needs `cs.{"value"}`.

---

## Entries

### BUG-0001 — Search returned only the first 10 results
- **Date:** 2026-06-18  **Severity:** High  **Found by:** owner report → agent
- **Area:** `live-search` / `lib/marketcheck.ts` (PAGE_SIZE)
- **Symptom:** every search showed ~10 results regardless of inventory.
- **Root cause:** `PAGE_SIZE=100` but MarketCheck's max `rows`/request is 50; over-asking made the API silently return its DEFAULT of 10, then the paging loop broke (`10 < 100`).
- **Pattern (P3):** an API silently ignores an out-of-range param and substitutes a default — verify every `rows`/`limit`/`start`/facet-size range against the live API.
- **Fix:** `PAGE_SIZE=50`, `SEARCH_LIMIT=150` (3 pages), both provider loops. Commits: fleetfinder-v2 `f7d5490`, fleetfinder `72ad764`.
- **Evidence:** live search returned 150 results after fix (was 10).
- **Status:** Fixed & verified live.

### BUG-0002 — Dealer-scoped search returned 0 results
- **Date:** 2026-06-20  **Severity:** Critical  **Found by:** owner report → agent
- **Area:** `live-search` dealer path
- **Symptom:** selecting dealers and searching returned `total>0` but 0 results.
- **Root cause:** `/search/car/active?dealer_id=` returns a `num_found` COUNT but NO `listings` under our entitlement. (A first fix attempt using `source=domain` ALSO returned count-only — same root cause.) The data only comes from `/dealerships/inventory` (Dealership Inventory Syndication, $1/call), which accepts a comma-OR `dealer_id` list.
- **Pattern (P2):** count ≠ availability; wrong endpoint for the data shape. Hunt anywhere `.listings` is read after a filtered call.
- **Fix:** dealer-scoped searches route to `/dealerships/inventory` with comma-OR `dealer_id`; guard for no-valid-ids; geo skipped. Commits: fleetfinder-v2 `3610dcc`, fleetfinder `d1eba8d`.
- **Evidence:** live: single dealer → 150 results all from that dealer; multi-dealer merges sources; `/search/car/active?dealer_id=…` proven count-only (num_found 193, listings 0).
- **Status:** Fixed & verified live.

### BUG-0003 — Dealer directory truncated at the 1500 offset cap
- **Date:** 2026-06-20  **Severity:** High  **Found by:** owner report ("NY/NJ dealers missing") → agent
- **Area:** `sync-dealers` cron
- **Symptom:** dense states' dealer lists were short (NY independent stored 1500 of 1906; CA/TX/FL likewise).
- **Root cause:** MarketCheck Standard-tier caps pagination at `start` offset 1500 (`422 "Subscribed package pagination limit of 1500 rows exceeded"`). The generic docs said 10,000/rows; our plan's real cap is 1500.
- **Pattern (P3):** plan-specific limits. Hunt every paging loop for silent tail-drop.
- **Fix:** sub-partition a saturated state+type slice by city (each city < cap), resumable across runs via new `dealer_sync_state.city_cursor`. Migration `0031`. Commit: fleetfinder-v2 `3610dcc`.
- **Evidence:** live 422 at start=1500 confirmed; city facet + city-filtered pulls verified to reach the tail.
- **Status:** Fixed & verified.

### BUG-0004 — Filter values returned 0 (drivetrain/body_type vocabulary mismatch)
- **Date:** 2026-06-21  **Severity:** High  **Found by:** owner report ("no matches") → agent
- **Area:** `live-search` + `diagnose` (body_type, drivetrain)
- **Symptom:** picking "AWD", "Truck", or "Van" returned 0 results on every search.
- **Root cause:** MarketCheck's facet vocabulary differs from UI labels: `drivetrain` = `4WD|FWD|RWD` (no "AWD"; AWD is bucketed `4WD`); `body_type` = `Pickup`/`Cargo Van`/`Minivan`/`Passenger Van`/… (no "Truck"/"Van"). Verified live: `drivetrain=AWD` → 0 vs `4WD` → 2.28M; `body_type=Truck` → 0 vs `Pickup` → 760K.
- **Pattern (P1):** every UI/catalog value sent to a provider must equal a real facet value. Hunt EVERY filter value the UI can emit.
- **Fix:** `mcDrivetrain`/`mcBodyType` mappers (AWD→4WD, Truck→Pickup, Van→Cargo Van,Minivan,Passenger Van); UI collapsed to one "AWD/4WD" option; dead `FUEL_TYPES`/`EV_FUELS` removed. Commits: fleetfinder-v2 `2304126`, fleetfinder `c8594da`.
- **Evidence:** live after deploy: AWD/4WD → 192,989; Truck → 760,205; Van → 117,216.
- **Status:** Fixed & verified live.

### BUG-0005 — Make filter hid ~80% of dealers
- **Date:** 2026-06-21  **Severity:** High  **Found by:** owner report ("NJ list incomplete") → agent
- **Area:** `dealers/catalog` picker
- **Symptom:** picking a make showed a tiny fraction of dealers (NJ + Honda → 19 of ~1700).
- **Root cause:** filter used strict `makes @> {make}`, but ~80% of dealers had empty `makes` tags (`'{}'`, not NULL) → all untagged dealers excluded.
- **Pattern (P5/P12):** sparse-column filtering excludes the un-populated majority; untagged arrays are `'{}'` not NULL.
- **Fix:** include untagged-but-stocked dealers alongside tagged matches; backfilled NY/NJ makes (2,870 dealers, opt-in `?backfill_makes`) so those states are precise while others keep the inclusive safety net. Commits: fleetfinder-v2 `2304126`,`44cd550`,`eef7996`.
- **Evidence:** live: NJ Honda 19→1707 (inclusive) → 38 (precise after backfill); CA Honda 1960 (still inclusive, no regression).
- **Status:** Fixed & verified live.

### BUG-0006 — VIN-decode cache never wired to the DB (the MarketCheck bill driver)
- **Date:** 2026-06-21  **Severity:** Critical (cost)  **Found by:** owner ($2,177 invoice) → agent
- **Area:** `lib/marketcheck.ts` decode functions; `vin_decode_cache` table
- **Symptom:** NeoVIN decodes = 17,594 × $0.08 = $1,407 in 20 days.
- **Root cause:** decodes were "cached" only in `memoryCache` (per-isolate, in-memory). On Vercel serverless, cold starts + parallel isolates meant the same VINs were re-decoded and re-charged. The DB cache tables (`vin_decode_cache`/`trim_cache`/`color_cache`/`search_cache`) existed but were wired to nothing.
- **Pattern (P4):** in-memory cache doesn't survive cold starts; schema landed but code never connected.
- **Fix:** durable DB cache under the memory cache (memory→DB→live), shared by the names+details paths (one decode per VIN, ever). Commits: fleetfinder-v2 `82d1375`, fleetfinder `dffbbb2`.
- **Evidence:** live: `vin_decode_cache` 0→150 rows on a search; second identical search reused cache (2,254ms vs 5,418ms, only new VINs added).
- **Status:** Fixed & verified live. NOTE: `trim_cache`/`color_cache`/`search_cache` are STILL unused — candidates for the optimization pass.

### BUG-0007 — Nightly catalog option-decode on churning inventory
- **Date:** 2026-06-21  **Severity:** High (cost)  **Found by:** agent (during cost diagnosis)
- **Area:** `refresh-catalog` / `catalogSnapshot`
- **Symptom:** ~2,352 NeoVIN decodes/night just to rebuild the options catalog, on fresh inventory the cache couldn't help.
- **Root cause:** the snapshot re-decoded 6 sampled VINs per model every night; available options barely change.
- **Pattern (P6):** recompute faster than the data changes.
- **Fix:** only re-decode a model's options when missing or stale; throttled to once a week (`skipOptions` + `OPTIONS_TTL_MS`). Commits: fleetfinder-v2 `82d1375`,`8b4d108`.
- **Evidence:** code path verified; options row preserved on skip/budget-cut.
- **Status:** Fixed. (Optimization pass: consider event/model-year-gated instead of weekly.)

### BUG-0008 — On-select dealer dump spent quota writing nothing
- **Date:** 2026-06-21  **Severity:** Low (cost)  **Found by:** agent
- **Area:** `dealers/selection` POST `after()` hook
- **Symptom:** adding a dealer fired `dumpDealerListings` which pages `/search/car/active?dealer_id=` (count-only) → wrote nothing into the unread, cron-paused `inventory` table.
- **Pattern (P2/P7):** count-only endpoint; producer with no live consumer.
- **Fix:** paused the on-select dump (kept dealer registration in `tracked_dealers`); restore via `/dealerships/inventory` when auto-desking ships. Commit: fleetfinder-v2 `b17c26d`.
- **Evidence:** code path; matches the already-paused `dump-inventory` cron.
- **Status:** Fixed. (Pipeline intentionally KEPT for auto-desking — do not remove.) **UPDATE 2026-06-21: SUPERSEDED by BUG-0019 — owner decided to delete the dump pipeline; the "keep for auto-desking" note and the P7 exception no longer apply.**

### BUG-0009 — Comma-bearing color facet values mis-filter (S4)
- **Date:** 2026-06-21  **Severity:** Med  **Found by:** audit loop
- **Area:** pickers (color facets)
- **Symptom:** color values containing commas broke the comma-OR `exterior_color` filter.
- **Pattern (P8):** raw provider strings with delimiters break downstream comma-OR params.
- **Fix:** drop/scrub comma-bearing color facet values. Commit: fleetfinder-v2 `ffdbd12`.
- **Status:** Fixed (per audit loop).

### BUG-0010 — Diagnose made a guaranteed-null closest-match call for dealer-scoped searches (D1)
- **Date:** 2026-06-21  **Severity:** Low (cost)  **Found by:** audit loop
- **Area:** `diagnose`
- **Root cause:** the closest-match query used `/search/car/active` with `dealer_id` (count-only) → always empty, while still spending a call.
- **Pattern (P2):** count-only endpoint where listings are needed.
- **Fix:** skip the closest-match query when dealer-scoped (facet-derived reasons still render). Commits: fleetfinder-v2 `109f346`, fleetfinder mirror.
- **Evidence:** live: `/search/car/active?dealer_id=…&make=…` count matches syndication count (129), listings 0.
- **Status:** Fixed (per audit loop).

### BUG-0011 — Lease payment could go negative (L1)
- **Date:** 2026-06-21  **Severity:** Med  **Found by:** audit loop
- **Area:** lease calculator
- **Root cause:** depreciation unbounded → negative monthly payment for edge inputs.
- **Pattern (P10):** financial math not clamped against edge inputs.
- **Fix:** clamp depreciation at 0. Commit: fleetfinder-v2 `fac5180`.
- **Status:** Fixed (per audit loop). (Optimization/audit pass: review ALL lease terms — residual>MSRP, money-factor signs, $0 price, used cars.)

### BUG-0012 — Admin price map stale after refresh (U1)
- **Date:** 2026-06-21  **Severity:** Low  **Found by:** audit loop
- **Area:** admin CompaniesTable
- **Root cause:** `router.refresh()` doesn't reset client `useState`; the price map wasn't re-synced from props.
- **Pattern (P9):** server-prop changes not re-synced into client state.
- **Fix:** re-sync from props after refresh. Commit: fleetfinder-v2 `6f5b0a6`.
- **Status:** Fixed (per audit loop). (Hunt P9 in every client component seeding useState from props.)

### BUG-0013 — Feature chips sent labels MarketCheck doesn't index (F1)
- **Date:** 2026-06-21  **Severity:** High  **Found by:** audit loop (in-flight)
- **Area:** feature picker (`FEATURE_GROUPS`) → `high_value_features`
- **Root cause:** feature `value`s were UI labels (e.g. "sunroof", "navigation system") not real facet strings ("sun/moonroof", "navigation") → 0 results.
- **Pattern (P1):** provider-value vocabulary mismatch (high_value_features facet).
- **Fix:** map every feature chip to a verified live facet value; omit features MarketCheck can't filter. Commits: fleetfinder-v2 `38e176c`, fleetfinder `8de45f0`.
- **Evidence (live on www.lotcompass.com after deploy):** `features:["sun/moonroof"]` → **106,163** results; the old `features:["sunroof"]` → **0** (bug reproduced + fix proven on the deployed app). Live facet probe: `sun/moonroof`→1,482,013 vs `sunroof`→0.
- **Status:** Fixed & verified live (merged to main, deployed). Another instance of P1 — confirms the pattern is broad.

### BUG-0014 — Trim filter didn't round-trip (F2)
- **Date:** 2026-06-21  **Severity:** Med  **Found by:** audit loop (in-flight)
- **Area:** `list-trims` / trim filter
- **Root cause:** the trim string wasn't sent to MarketCheck in the raw form that round-trips through its trim filter.
- **Pattern (P1/P11):** provider value/identifier mismatch (trim strings).
- **Fix:** send the raw MarketCheck trim string (what the catalog path already did). Commits: fleetfinder-v2 `35352fd`, fleetfinder `f367afc`.
- **Evidence (live on www.lotcompass.com after deploy):** Mercedes-Benz GLE `trim:"GLE350"` → **11,803** results (was unfilterable as the space-inserted "GLE 350"). Live facet probe: `trim=GLE350`→40 vs `trim=GLE 350`→0 (space-sensitive).
- **Status:** Fixed & verified live (merged to main, deployed).

### BUG-0015 — Catalog stored raw factory-code color/version junk
- **Date:** 2026-06-20  **Severity:** Med  **Found by:** agent
- **Area:** `catalogSnapshot` / pickers
- **Symptom:** colors like "0475 Black Sapphire Metallic", "Nh-731p", "Blk"; version typo "Stamdard Range".
- **Pattern (P8):** raw provider data persisted without cleaning, surfaces in pickers.
- **Fix:** `cleanColorFacet` + `scrubColorCode` + `fixVersionName` applied at snapshot write time; SQL cleanup of existing rows. Commits: fleetfinder-v2 `7e7a7321`,`a78d8f1`,`591f7fb`.
- **Status:** Fixed.

### BUG-0016 — refresh-catalog self-chain stalled (~258/392 models)
- **Date:** 2026-06-19  **Severity:** Med  **Found by:** agent
- **Area:** `refresh-catalog` cron
- **Root cause:** models returning null never advanced `catalog_sync_state`; since never-seen sort first, they were re-attempted every chained link, burning budget before the cycle finished.
- **Pattern:** self-chaining cron must mark every model attempted-even-on-null or it loops.
- **Fix:** stamp every attempted model regardless of outcome; raise MAX_LINKS. Commit: fleetfinder-v2 `1c07bc8`.
- **Status:** Fixed.

### BUG-0017 — Catalog snapshot sampled 10 listings instead of 150 (rows>50 → API default 10)
- **Date:** 2026-06-21  **Severity:** Med  **Found by:** audit loop (Pass 7)
- **Area:** `lib/catalogSnapshot.ts` (the trim→color sampler; run nightly by `refresh-catalog`, feeds the trims/colors pickers)
- **Symptom:** each model's per-trim exterior/interior color lists were built from a tiny sample, so trims showed too few colors.
- **Root cause:** the sampler used `ROWS=100`. MarketCheck's `/search/car/active` silently ignores a `rows` above 50 and returns its DEFAULT of 10; the loop then broke (`10 < 100`), so only 10 cars per model were sampled instead of the intended 150 (`PAGES=3 × 100`).
- **Pattern (P3):** same class as BUG-0001 — an out-of-range param is silently replaced by a default. Hunt EVERY `rows`/`limit` > 50 against `/search/car/active`.
- **Fix:** `ROWS=50` (the real per-page max) → 3×50 = 150 samples, offset within the 1500 cap. Commit: fleetfinder-v2 `a25e942` (LotCompass only — FleetFinder has no nightly catalog system). Re-verify after merge/deploy.
- **Evidence:** live: `rows=10`→10 listings, `rows=50`→50, `rows=100`→**10** (Toyota RAV4, `/search/car/active`) — confirms >50 silently defaults to 10. Commit `a25e942` deployed; the per-trim color lists repopulate with the fuller 150-car sample on the next nightly `refresh-catalog` run.
- **Status:** Fixed — merged to main, deployed.

### BUG-0018 — Stripe webhook seat true-up had no idempotency key
- **Date:** 2026-06-21  **Severity:** Low  **Found by:** audit (independent billing/auth review)
- **Area:** `stripe/webhook` trial→active seat reconciliation
- **Symptom:** none observed in practice — the gap is an invariant violation, not a live defect.
- **Root cause:** the two `stripe.subscriptions.update(...)` true-up calls carried no `idempotencyKey`. They are idempotent-by-value (absolute quantity, `proration_behavior:"none"`, guarded by `desired !== currentQty`), so no double-billing was possible — but a redelivered `subscription.updated` event could fire a redundant update, violating the app's "every sub mutation uses an idempotency key" rule.
- **Pattern:** money-path idempotency invariant; any Stripe write must carry a stable key so retries are no-ops.
- **Fix:** added `idempotencyKey: seat-trueup-${sub.id}-${desired}` to both calls. Commit: fleetfinder-v2 `a25e942` (LotCompass only — FleetFinder billing is a separate Base44 `manage_billing`).
- **Evidence:** code review + invariant; quantity is absolute so no over-billing was ever possible. Rest of billing/auth (checkout/cancel/referrals/gate/RLS/`/api`-JSON) reviewed and upheld. Commit `a25e942` deployed.
- **Status:** Fixed — merged to main, deployed.

### BUG-0019 — Inventory dump read the count-only dealer endpoint → captured nothing; pipeline removed
- **Date:** 2026-06-21  **Severity:** Med (latent)  **Found by:** audit loop (Pass 7) + owner decision
- **Area:** `lib/inventoryDump.ts`, `cron/dump-inventory`, the `inventory` table
- **Symptom:** the dump mirrored 0 cars per dealer (and the table was read by nothing anyway).
- **Root cause:** the dump paged `/search/car/active?dealer_id=` — which returns a `num_found` COUNT but NO `listings` under our entitlement (same truth as BUG-0002) — AND asked for `rows=100` (→ default 10). So it spent quota and stored nothing; the destructive sweep was correctly blocked (deduped=0 fails the coverage guard), so no wrongful deletion ever occurred.
- **Pattern (P2 + P7):** count ≠ availability (wrong endpoint for the data shape) + producer with no consumer.
- **Resolution:** **owner decided to DELETE the pipeline** (reverses the earlier "keep for auto-desking" note in BUG-0008/P7). Removed `lib/inventoryDump.ts`, `cron/dump-inventory/route.ts`, the stale on-select dump comments, and dropped the unused `inventory` table (migration). Commit: fleetfinder-v2 (see merge).
- **Evidence:** live MarketCheck: `/search/car/active?dealer_id=1018518` → `num_found 616, listings 0`; `/dealerships/inventory?dealer_id=1018518` → `616` with listings (confirms the dump could never have captured data). Post-deploy: `GET https://www.lotcompass.com/api/cron/dump-inventory` → **404** (route gone); `to_regclass('public.inventory')` → **null** (table dropped, migration 0032); `get_advisors(security)` shows no new issue.
- **Status:** Resolved by removal — merged to main, deployed & verified live.

### BUG-0020 — `tracked_dealers` vestige: written on dealer-add, read by nothing
- **Date:** 2026-06-21  **Severity:** Low  **Found by:** agent (follow-up to BUG-0019)
- **Area:** `dealers/selection` POST; `tracked_dealers` table
- **Symptom:** after BUG-0019 removed the dump pipeline, `dealers/selection` still upserted every added dealer into `tracked_dealers`, which now had no reader.
- **Root cause:** the on-select registration write outlived the pipeline it fed.
- **Pattern (P7):** producer with no consumer (the last remaining piece of the deleted pipeline).
- **Fix:** removed the `tracked_dealers` upsert from `dealers/selection`; dropped the `tracked_dealers` table (migration `0033`). Dealer-scoped search reads live from `/dealerships/inventory`; the org's selected dealers live in `dealers` (unaffected). Commit: fleetfinder-v2 (this change).
- **Evidence:** `to_regclass('public.tracked_dealers')` → null; build clean; no remaining code refs (`grep tracked_dealers src` empty).
- **Status:** Fixed & verified.

### BUG-0021 — verify-catalog self-chain re-attempts null models every link (cycle stall)
- **Date:** 2026-06-21  **Severity:** Med  **Found by:** audit/v2-correctness (Pass 1)
- **Area:** `src/app/api/cron/verify-catalog/route.ts` (self-chaining monthly sweep)
- **Symptom:** the verification chain burns each chained link's budget re-checking the same transient-miss models, and can keep chaining up to MAX_LINKS=450 without the cycle ever reaching `unattempted===0`.
- **Root cause:** when `verifyModel(...)` returns `null` (a transient MarketCheck miss), the loop did `continue` (line 65), which SKIPS the `catalog_verify_state` upsert at the end of the loop body. `pending` is recomputed each link as "state.updated_at < cycleStart OR absent", so an unstamped model stays pending and is re-attempted on EVERY subsequent link of the same cycle. The intent (per the line-65 comment) was "retry next CYCLE," but the missing stamp makes it retry next LINK.
- **Pattern:** identical to BUG-0016 (refresh-catalog) — a self-chaining cron must mark every model attempted-even-on-null, or never-finished/never-seen items re-run forever. refresh-catalog was fixed by stamping unconditionally (with a warning comment); verify-catalog reintroduced the bug via `continue`. Hunt every self-chaining cron for an early `continue`/`break` that skips the attempted-marker.
- **Fix:** stamp `catalog_verify_state` for every attempted model regardless of outcome; on a `null` result, keep the model's existing discrepancy report (skip the delete/insert) but STILL mark it attempted so it isn't retried until the next cycle. Commit: fleetfinder-v2 (this branch).
- **Evidence:** code: refresh-catalog/route.ts marks `catalog_sync_state` unconditionally after the try/catch (lines ~104) with an explicit comment about this exact stall; verify-catalog/route.ts:65 `continue` bypasses its line-80 upsert. (FleetFinder has no catalog cron — LotCompass-only.)
- **Status:** Fixed & verified (build-gated). Re-verify on next monthly run that `catalog_verify_state` advances for null models.

### BUG-0022 — Auto.dev fallback sent the raw "AWD/4WD" drivetrain label → 0 results
- **Date:** 2026-06-21  **Severity:** Med  **Found by:** audit/v2-correctness (Pass 1)
- **Area:** `src/app/api/live-search/route.ts` `searchAutoDev()` (the Auto.dev fallback path)
- **Symptom:** during a MarketCheck rate-limit/hard-failure, a search with the "AWD/4WD" drivetrain filter falls back to Auto.dev and returns 0 — the agent sees "no inventory" for a filter that is actually fine, exactly when the primary provider is briefly down.
- **Root cause:** the MarketCheck path maps the UI label via `mcDrivetrain` ("AWD/4WD"→"4WD"), but the Auto.dev path sent `body.drivetrain` RAW to `vehicle.drivetrain`. Auto.dev uses the SAME drivetrain vocabulary as MarketCheck (4WD/FWD/RWD, no "AWD") and HONORS the filter, so the combined UI label "AWD/4WD" matches nothing.
- **Pattern (P1 + #21 Auto.dev parity):** any UI label sent to a provider must equal that provider's real vocabulary; the fallback path must apply the SAME value mappers as the primary. Hunt every Auto.dev param for an unmapped UI label.
- **Fix:** apply `mcDrivetrain(body.drivetrain)` on the Auto.dev path (same as MarketCheck). `body_type` is left RAW on Auto.dev deliberately — verified live that Auto.dev's bodyStyle accepts "Truck"/"Van" natively (returns results), whereas MarketCheck's "Cargo Van" returns 0 on Auto.dev, so the MarketCheck mapper must NOT be applied there. Commit: fleetfinder-v2 (this branch). Mirror: FleetFinder `live_search` has the same Auto.dev fallback — apply there too.
- **Evidence (live Auto.dev with our key):** `vehicle.drivetrain=AWD/4WD` → 0 listings; `vehicle.drivetrain=4WD` → 5. `vehicle.bodyStyle=Cargo Van` → 0 but `=Truck` → 5 and `=Van` → 5 (so body_type stays raw). `vehicle.drivetrain=FWD/RWD` already valid raw.
- **Status:** Fixed & verified (live Auto.dev probe + build-gate).

### BUG-0023 — decode-vin uses a memory-only cache → cold-start re-charge + double-decode
- **Date:** 2026-06-21  **Severity:** Med (cost)  **Found by:** audit/v2-correctness (Pass 2)
- **Area:** `src/app/api/decode-vin/route.ts`
- **Symptom:** viewing a VIN's build sheet re-charges the $0.08 NeoVIN decode on every serverless cold start, and a VIN that is BOTH viewed (build sheet) and searched-with-options is decoded twice — two separate $0.08 charges for the same `/decode/car/neovin/{vin}/specs` call.
- **Root cause:** decode-vin calls MarketCheck directly (line 88-90) and caches the result only in `memoryCache` (key `vin::VIN`, in-isolate only). It does NOT use the durable `vin_decode_cache` DB layer that BUG-0006 added to `neovinSpecs`. Worse, the two paths store DIFFERENT parsed payloads (decode-vin's full build sheet vs `neovinSpecs`' `NeovinParsed` slice under key `vinspecs::VIN`), so neither memory nor DB cache is shared — the same upstream decode is paid for twice.
- **Pattern (P4):** in-memory cache doesn't survive serverless cold starts; same class as BUG-0006 (the $2,177 bill driver). Lower volume here (build-sheet view is a deliberate click, not bulk search), so Med not Critical.
- **Fix (APPLIED — owner sign-off given):** added a `build_sheet jsonb` column to the existing per-VIN `vin_decode_cache` row (migration `0034`). New `decodeVinBuildSheet()` in `lib/marketcheck.ts` caches the full build sheet durably (memory → DB `build_sheet` → live) and, on a live decode, ALSO primes the search slice (`payload`) from the SAME raw response via `primeVinDecodeCache()` — so a VIN that's viewed then option-searched is decoded once. `decode-vin/route.ts` now just calls `decodeVinBuildSheet`. `neovinSpecs` (the proven BUG-0006 path) is untouched except a pure extraction of `parseNeovinParsed`. Residual: a VIN option-searched THEN viewed costs one extra decode (search fetches the same raw but only persists the option slice) — bounded ≤1, acceptable. Commit: fleetfinder-v2 (this branch). LotCompass-only (FleetFinder VIN decode uses Base44 storage, not this table).
- **Evidence:** migration `0034` applied (`alter table vin_decode_cache add column build_sheet jsonb` → success); `get_advisors(security)` shows NO new issue (vin_decode_cache already carried the by-design service-role-only `rls_enabled_no_policy` INFO). Build passes. Pre-fix: decode-vin used only `cacheGet/cacheSet` (memory) → cold-start re-charge; post-fix it reads/writes the durable row.
- **Status:** Fixed & verified LIVE (merged to main, deployed). Live re-verify on www.lotcompass.com (authed owner): VIN `2T36DRBV3TW019251` → call 1 `provider:"marketcheck-neovin"` (3 packages, 5 options, 508ms), call 2 `provider:"cache"` (172ms). DB row after: `has_build_sheet=true AND has_payload=true` from the ONE decode (durable build-sheet cache + search-slice prime both confirmed), provider `marketcheck-neovin`, fresh. Migration 0034 `build_sheet` column confirmed present.

### BUG-0024 — Color picker DB-vs-live cleaning divergence (display-only)
- **Date:** 2026-06-21  **Severity:** Low (cosmetic)  **Found by:** audit/v2-correctness (Pass 2)
- **Area:** `list-colors/route.ts`, `list-interior-colors/route.ts` vs `catalogSnapshot.ts` (`cleanColorFacet`)
- **Symptom:** for a model NOT yet in the nightly snapshot (the live fallback), the color picker shows differently-cleaned/deduped names than the DB-served picker for a snapshotted model — e.g. a leading factory code ("0475 Black Sapphire Metallic") is scrubbed in the DB list but shown raw in the live exterior list; conversely the live INTERIOR list strips material qualifiers ("… Leather"/"… Interior") that the DB interior list keeps.
- **Root cause:** two divergent code paths. The snapshot uses `cleanColorFacet` (exterior-tuned: `scrubColorCode` + placeholder-drop + strips metallic/pearl finishes) for BOTH exterior and interior. The live routes hand-roll their own bucketing: list-colors uses `normalizeColorName` only (NO `scrubColorCode`/placeholder-drop), and list-interior-colors uses interior-aware cleaning (strips " interior" suffix + leather/cloth/vinyl/etc.) that `cleanColorFacet` lacks. So exterior diverges one way (live less-clean) and interior the other (live more-clean).
- **Impact:** DISPLAY ONLY. Both paths preserve the RAW facet values in `variants`, and search filters on `variants` (verified live: facet string round-trips exactly), so filtering/counts are correct in both — only the shown name/bucketing differs, and only on the rarely-hit live fallback.
- **Pattern:** DB-first vs live-fallback parity (#2 in the connection map) + duplicated cleaning logic. Hunt: any picker that has separate snapshot-write cleaning and live-read cleaning.
- **Fix (APPLIED — owner sign-off given):** made `cleanColorFacet(items, mode)` mode-aware — `"interior"` strips trim-material qualifiers (leather/leatherette/cloth/vinyl/premium/perforated/suede/alcantara) + a trailing " Interior"; `"exterior"` strips finishes (metallic/pearl/clear-coat) as before. Now used by BOTH `catalogSnapshot.ts` (ext/int + per-trim) AND both live picker routes, so DB-served and live-fallback lists are identical by construction. `variants` (raw) preserved → filtering unaffected. Commit: fleetfinder-v2 (this branch). LotCompass-only (FleetFinder has no nightly snapshot, so its pickers are live-only with no DB to diverge from).
- **Evidence:** `list-colors/route.ts` and `list-interior-colors/route.ts` now call `cleanColorFacet(facet, "exterior"|"interior")` (hand-rolled bucketing removed); `catalogSnapshot.ts:45-46,92` pass the matching mode. Build passes. Filtering still proven by the live round-trip (Storm Cloud facet 5614 → search 5614 — variants unchanged).
- **Status:** Fixed & verified LIVE (merged to main, deployed). Live re-verify on www.lotcompass.com (authed, `fresh:true` to exercise the LIVE cleaner): `list-colors` RAV4 → clean names (Beige, Black, Black Currant Metallic, Blizzard Pearl…) each with raw `variants` preserved; `list-interior-colors` → clean names with merged variants (Ash Softex nv:2, Black nv:4). Both routes now run the shared `cleanColorFacet`, so DB-served and live lists are identical. (Minor pre-existing cosmetic note, NOT a regression: the interior material list doesn't include Toyota "Fabric"/"Softex", so "Ash Fabric" shows separate from "Ash" — same as before this fix; filtering unaffected. Phase-2 nicety.)

### BUG-0025 — Orphan `leads` table: created but never wired, dropped
- **Date:** 2026-06-22  **Severity:** Low  **Found by:** audit/v2-correctness follow-up (Pass 2) → owner-approved cleanup
- **Area:** `public.leads` table (created by migration `0008_inventory_dump_and_leads.sql`)
- **Symptom:** an empty table lingering only as an `rls_enabled_no_policy` security advisory; never read or written.
- **Root cause:** `leads` (columns: id, created_at, name, email, phone, vin, vehicle, dealer_id, dealer_name, source, message, status) was provisioned for a public lead-capture / "contact dealer" form that never shipped. No application code in either repo references it, there are no Supabase Edge Functions, and RLS is enabled with no policy (so no client could ever write it).
- **Pattern (P7):** producer-with-no-consumer — schema landed but nothing ever connected (same family as the deleted `inventory`/BUG-0019 and `tracked_dealers`/BUG-0020 vestiges).
- **Fix:** `DROP TABLE IF EXISTS public.leads;` (migration `0035_drop_leads.sql`). Branch `chore/drop-leads-table` — NOT merged to main (owner review).
- **Evidence:** pre-drop SQL: `table_exists=true, row_count=0, inbound_fks=0`; columns as above. Code: `grep leads` across `fleetfinder-v2/src` + `fleetfinder/src` + `base44` → only the table's own DDL migrations (0008/0024/0028). `list_edge_functions` → none. Post-drop: `get_advisors(security)` no longer lists `public.leads` and shows no new advisory; build clean.
- **Status:** Fixed & verified (migration applied, advisor cleared, build-gated). Pending owner review/merge of the branch.

### BUG-0026 — NeoVIN high_value_features/features parsed as array but API returns a dict → "must-have options" feature filter matches nothing
- **Date:** 2026-06-22  **Severity:** High  **Found by:** audit/v2-correctness (fresh run, Pass 1)
- **Area:** `src/lib/marketcheck.ts` `parseNeovinParsed()` → consumed by `decodeVinOptionNames()` → the `option_names`/`option_query` "must-have options" filter in `live-search` + `diagnose`
- **Symptom:** selecting a "must-have option" whose value is in MarketCheck's **high_value_features vocabulary** ("sun/moonroof", "premium speakers", "apple carplay", "adaptive cruise control", "heated seats", …) silently returns ~0 results even when lots of inventory has that feature. Affects every generic FEATURE_GROUPS chip (the no-make picker) AND the `list-features` facet-supplement chips shown for low-build-sheet models (EVs, low-option brands). Diagnose's closest-match scoring also under-counts these options.
- **Root cause (P22 assumed JSON shape + P1 vocabulary):** NeoVIN `/decode/car/neovin/{vin}/specs` returns `high_value_features` and `features` as **objects keyed by STANDARD/OPTIONAL** whose values are arrays of `{category, description, …}` — NOT flat arrays. `parseNeovinParsed` did `Array.isArray(d.high_value_features) ? … : []`, so for the real dict shape it always produced `hvf:[]` and `feats:[]`. Proven live: across all 152 rows in `vin_decode_cache`, `has_hvf=0` and `has_feats=0` (only `installed_options_details`→`details` ever populated, 111/152). So `decodeVinOptionNames` only ever returns the installed-option NAMES ("moonroof", "jbl premium audio", "convenience package"), whose vocabulary does NOT intersect the high_value_features chip vocabulary ("sun/moonroof", "premium speakers"). The two-vocabulary mismatch zeroes the filter.
- **Pattern (hunt elsewhere):** assumed array where the provider returns a keyed object (P22); any UI value matched against a DIFFERENT vocabulary than it's drawn from (P1). Hunt every `Array.isArray(provider.X)` guard and every place a facet/UI value is matched against decoded/derived data of another shape.
- **Fix:** flatten the NeoVIN feature groups (dict-of-category-arrays OR legacy array) and pull each entry's `.description` (fallback `.name`/string) into `hvf`/`feats`, lowercased downstream. Now `decodeVinOptionNames` includes the high_value_features vocabulary, so the chips match. `installed_options_details`→`details` path unchanged (rich OEM option names still matched). Commit: fleetfinder-v2 (this branch). Mirror: FleetFinder base44 `_shared/mc.ts` — apply if it has the same parser.
- **Evidence:** LIVE NeoVIN decode of `2T36DRBV5TW017839` → `high_value_features` = `{"STANDARD":[{"description":"Premium Speakers"},{"description":"Apple CarPlay"},{"description":"Heated Seats"},…47 items]}` (a dict, not an array). DB proof of effect: `count(*) filter (where jsonb_array_length(payload->'hvf')>0)` = **0/152**. Post-fix LIVE re-test (same raw response run through the new `flattenNeovinFeatureGroup` + `decodeVinOptionNames` + `phraseMatch`): hvf 0→**47**, feats 0→**249**; FEATURE_GROUPS chip matches on this RAV4 went **0/25 → 18/25** (the 7 unmatched — head-up display, heated/cooled seats, sun/moonroof, panoramic, memory seats, 360 cam, 3rd row — are genuinely not equipped on this VIN; before the fix even "apple carplay"/"heated seats" that the car DOES have were excluded). Build-gated (npm run build exit 0). (Existing cached rows refresh lazily on the 30-day TTL; not force-re-decoded to avoid paid re-decode churn.)
- **Status:** Fixed & verified (parser fix proven against the live decode; build clean). Live end-to-end re-verify on www.lotcompass.com after deploy (owner merges).

### BUG-0027 — Auto.dev fallback removed (owner decision: ineffective, dataset lacked mainstream makes)
- **Date:** 2026-06-22  **Severity:** Med (correctness + clarity)  **Found by:** audit/v2-correctness → owner directive ("completely remove auto dev")
- **Area:** `live-search` (both repos), `lib/marketcheck.ts` / `_shared/mc.ts`, `cron/sync_inventory` (FleetFinder), env templates, CLAUDE.md
- **Symptom / why removed:** Auto.dev was the secondary search provider, used when MarketCheck rate-limited/hard-failed. **Live-verified its entitlement's dataset is missing the mainstream makes brokers actually search** — `vehicle.make=Toyota`/`Honda`/`Chevrolet` → **0 listings** (the param works: `=Kia`→101, `=Volvo`→41,743; the data just isn't there). So whenever the fallback fired, it returned ~0 for the typical search and the agent saw "no inventory" — strictly worse than surfacing a clear rate-limit/unavailable message.
- **Pattern (P2-adjacent):** a provider's count/param "working" ≠ the data being present under our entitlement; a fallback that silently returns empty is worse than an honest error.
- **Fix:** removed the entire Auto.dev path. LotCompass: deleted `searchAutoDev()`, `autoDevCantHonor`, the dual-provider try/catch, `adListing`, `autoDevKey`, `AUTO_DEV_HOST`, `DEFAULT_LAT/LNG/ZIP`, dead `normalizeBaseColor`; `live-search` is now MarketCheck-only (a 429 surfaces the rate-limit note; a hard failure returns 502). FleetFinder mirror: same removal in `live_search` + `_shared/mc.ts`; `sync_inventory` (gated-off dev tooling) rewired to MarketCheck-only (dropped `fetchAutoDevRegion`, `AUTO_DEV_HOST`, `useAutoDev`; the dev mock now uses the renamed `mapMockListing`). Docs/env updated. Commits: fleetfinder-v2 + fleetfinder (this branch).
- **Evidence:** live Auto.dev probes with our key: `vehicle.make=Toyota`→0 vs `=Kia`→101 / `=Volvo`→41,743; facet `makes` lists Volvo/Mercury/Saturn but no Toyota/Honda/Chevy. Post-removal: v2 `npm run build` exit 0; ff `deno check` clean on `sync_inventory` + all `_shared/mc.ts` importers (`live_search` can't be locally checked — pre-existing missing `@base44/sdk` dep — but references only existing symbols). Residual: FleetFinder usage-accounting/entity schemas (`ProviderUsage`/`SearchUsage`/`admin_console`/`quota`) keep "auto.dev" as a historical provider LABEL — no Auto.dev API is called anywhere; left as-is to avoid touching stored data/accounting (documented).
- **Status:** Done (owner-directed change) — build/deno-gated. No Auto.dev API call remains in any functional path.

<!-- APPEND NEW ENTRIES BELOW. Next ID: BUG-0028. Never edit/delete above. -->
