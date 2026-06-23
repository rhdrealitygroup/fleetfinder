# LotCompass / FleetFinder — Operational Audit (v3)

You are auditing a production multi-tenant SaaS. This prompt is **operational**: it gives you the exact procedures to verify behavior, the rules to prove every claim, and a completion bar you cannot fake. Read it fully, then read `BUG_REGISTRY.md` fully, before you touch anything.

---

## 0. The doctrine: behavior is the only truth

Every prior audit "passed" while real, user-facing, money-costing bugs hid in plain sight — because reviewers reasoned about code instead of **observing behavior**. So:

> **No claim — "this is a bug", "this is fixed", "this is fine" — is valid without a reproducible observation attached: a command you ran and its output.** Reading code is how you form a hypothesis. Running something is how you know. If you cannot produce an observation, your status is **UNVERIFIED**, not "fine".

Concretely, for **every** finding and **every** fix, you paste into your notes:
- the **exact command** (curl / SQL / same-origin fetch / build),
- its **output** (before), and after a fix, the **output again** (after).

"I reviewed it and it looks correct" is banned as a conclusion.

---

## 0.4 Autonomy contract — run to completion without stopping to ask

You run **fully autonomously**. You are pre-authorized for every tool and command you need (reads, build, `curl`, read-only SQL, `git` on your branch, Supabase MCP). **Do not ask the user anything. Do not pause for confirmation, clarification, approval, or a "should I continue?" check at any point.** The user is not watching and will not answer; stopping to ask just wastes the run.

When you hit a decision, ambiguity, or judgment call — the kind of thing you'd normally ask about — **do NOT ask. Instead:**
1. Choose the **safest reasonable option** and proceed immediately.
2. Record it in `AUDIT_FINDINGS.md` under a **"Decisions made (autonomous)"** list: what you decided, why, and how to reverse it.
3. Keep going. The owner reviews all of it on the branch later.

**Never end your turn to solicit input.** "Want me to fix this too?" / "Should I keep going?" / "Let me know if…" are forbidden. The answer is always: keep working until the completion bar (§4) is met. Produce text only at real checkpoints (a finding logged, a pass completed) — never to ask for direction.

**The ONLY ways to stop:**
- **(a) Completion:** three consecutive clean passes achieved (§4) → write the final report and end.
- **(b) Hard block:** something makes work literally impossible (missing API key, repo absent, build tooling broken). Even then: document it, do everything else you still can, and only stop if *nothing* remains doable.

**What to DEFER instead of ask or do** (add to a `Deferred — needs owner sign-off` list in `AUDIT_FINDINGS.md`, then continue auditing everything else — never let one item halt the run):
- **Destructive / irreversible DB ops on the shared live database** — `DROP TABLE`, `DELETE`/`UPDATE` of rows, data migrations. These apply to production immediately (they are NOT branch-isolated), so do not run them. You may write the migration *file* on the branch and document it; the owner applies it.
- **Any Stripe / money mutation** (refunds, credits, sub changes) — never execute; document only.
- **Anything that changes shared production state irreversibly.**
Everything that IS branch-isolated (code fixes, new files, additive schema migration *files*) you do autonomously — the branch is reviewed before merge, so there's no need to ask.

**Continuity across consecutive runs:** you are likely **one of several back-to-back runs** (the owner keeps launching fresh chats). Your memory is the repo, not the chat. So FIRST read `BUG_REGISTRY.md` and `AUDIT_FINDINGS.md` to see what prior runs already found, fixed, decided, and deferred — then **continue and extend** that work. Do not redo completed checks, do not undo a prior run's fix, do not re-ask a decision already recorded. Pick up the audit where the last run left off and push it further toward the 3-clean-pass bar.

---

## 1. Apps, access, rules

- **LotCompass** = `fleetfinder-v2` (Next.js 16 / React 19 / TS / Tailwind v4 / Supabase / Stripe / Vercel; live at www.lotcompass.com). **FleetFinder** = `fleetfinder` (Vite SPA + base44 Deno funcs in `base44/functions/`). Cross-cutting fixes go to **both**, respecting each stack. Read `CLAUDE.md` + `AGENTS.md` in `fleetfinder-v2` first. **This is Next 16** — middleware is `src/proxy.ts`, route runtime via `export const maxDuration`, async `searchParams`/`params`. README is stale; trust code.
- Build gate: `export PATH="$HOME/.local/node/bin:$PATH" && npm run build` (compile+eslint+typecheck). FleetFinder: `deno check base44/functions/<fn>/entry.ts`. **No test suite.**
- Supabase project `vbacqlizbzcxesiwifcv` via the Supabase MCP (`execute_sql`/`apply_migration`/`get_advisors`). MarketCheck key in `fleetfinder-v2/.env.local`. Authenticated test tab on www.lotcompass.com for same-origin `fetch` (check HTTP status, not just body).
- **Hard rules:** Work on branch **`audit/v3`** in both repos. **Never push `main`. Never merge — hand the branch to the owner.** Build-gate every commit. Commits end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. You are the **only** agent touching the DB/migrations and MarketCheck quota — if another audit is live, stop.
- **Cost discipline:** MarketCheck bills per call (Inventory Search $0.002, Dealership Syndication **$1.00**, NeoVIN decode **$0.08**). Probe with `rows=0`+facets; never loop the $1/$0.08 endpoints in testing; note any spend.
- **Registry:** read `BUG_REGISTRY.md` first (it holds every past bug + the **P1–P12 pattern catalog** — those patterns are your hunting list). Append `BUG-NNNN` the moment you confirm a defect; append-only; union on conflict.

---

## 2. Verification primitives (your toolbox — reuse these everywhere)

These are the procedures that catch this app's bug classes. Apply the matching primitive to every relevant code path; paste the output as evidence.

**VP-1 — Facet-vocabulary check (pattern P1, the #1 bug class).**
For any value the UI/catalog sends to MarketCheck (filter, trim, color, feature, drivetrain, body_type, powertrain, sort), confirm it equals a value the live facet actually returns:
```
curl -s "https://api.marketcheck.com/v2/search/car/active?api_key=$KEY&car_type=new&rows=0&facets=<field>" | python3 -c "import sys,json;print([t['item'] for t in json.load(sys.stdin)['facets']['<field>']])"
```
Then prove the value matches: `&<field>=<value>&rows=0` must return a non-trivial `num_found`. A value the facet never lists is a bug even if the code "looks right". **Enumerate every option the UI can emit and check each.**

**VP-2 — Count-vs-listings check (P2).**
For any filtered call whose `.listings`/`.data` the code consumes, confirm listings actually come back — not just a count:
```
curl -s "<endpoint>?...&rows=3" | python3 -c "import sys,json;d=json.load(sys.stdin);print('num_found',d.get('num_found'),'listings',len(d.get('listings') or []))"
```
`num_found>0, listings=0` = the code is reading a count-only response and will silently return nothing.

**VP-3 — Tier-limit check (P3).**
For every paginating loop, probe the real cap with our key (not the docs): push `start`/`rows` to the edge and read the error. Confirm the loop stops cleanly and doesn't silently drop the tail.

**VP-4 — Cold-cache / durable-cache check (P4).**
For anything described as "cached": is it memory-only (dies on cold start) or DB-backed? Prove reuse: run the operation, check the DB cache table row count, run again, confirm it did **not** re-hit the paid API (row count/latency unchanged). An unused `*_cache` table = a cache that isn't wired.

**VP-5 — Sparse-column / empty-vs-null check (P5/P12).**
For any DB filter on an optional/backfilled column, count how many rows have it populated, then confirm the filter doesn't silently exclude the empty ones when it shouldn't. Remember untagged arrays are `'{}'` not `NULL`.

**VP-6 — Round-trip check (P1/P11).**
For any value taken FROM a provider response and later sent BACK as a filter (trims, colors, dealer ids, model names), confirm it round-trips: the exact stored value, sent back, returns the same row. Identifier/format drift between our DB and the provider is a bug.

**VP-7 — Live end-to-end check.**
Exercise the real deployed route (same-origin fetch on the test tab) with realistic inputs **and** edge cases: empty, max, zero-result, unicode, injection (`a,b)`, used vs new, huge dealer lists, missing fields. Check the HTTP status and the JSON shape.

**VP-8 — Adversarial self-test (after every fix).**
Try to break your own fix: feed it the input that would have triggered the original bug, the boundary just past your new guard, and a malformed variant. A fix isn't "verified" until you've tried and failed to break it, with the attempts pasted.

---

## 3. What to audit (apply §2 primitives to each)

Don't just read — pick the primitive(s) that fit and run them.

- **Search / inventory** (`live-search`, `diagnose`): VP-1 on every filter value; VP-2 on the dealer/diagnose paths; VP-3 on pagination; VP-7 with edge inputs; option-decode post-filter (cap, budget, VP-4 cache reuse); the 47s wall-clock budget. NOTE: MarketCheck is now the **sole** inventory provider (the Auto.dev fallback was removed) — confirm no dead Auto.dev code paths remain and that a provider error surfaces honestly rather than silently returning an unfiltered/empty set.
- **Pickers** (`list-models|trims|colors|interior-colors|features|styles`): VP-1 + VP-6 on every emitted value; DB-first vs live-fallback parity; cleaning/scrub consistency; comma/bracket/slash sanitization (P8).
- **Dealers**: `dealers/catalog` make filter (VP-5, precise vs inclusive), pagination, stocked-first; `dealers/selection`/`removal-requests` (org-scoping); `sync-dealers` (VP-3 city-partition + cursor, makes preservation, typeless probe). NOTE: the inventory-dump pipeline + `inventory`/`tracked_dealers` tables were **DELETED** (BUG-0019/0020) — do not recreate.
- **Catalog**: `refresh-catalog`/`verify-catalog`/`catalog-health` (self-chaining terminators, VP-4 decode cache, weekly-options throttle); `catalogSnapshot` cleaning.
- **Billing / auth / multi-tenancy** (do NOT skip — money & access): Stripe webhook idempotency+ordering, checkout/cancel/portal/seats, referrals; `requireActivePlan` (trial/active/canceled/comped, fail-closed 402); `proxy.ts` (401 JSON for `/api/*`, cookie rotation, onboarding); super-admin gate; RLS + `security definer search_path`; service-role only after `auth.getUser()`. Run `get_advisors` (security+perf); resolve or justify each.
- **UI**: search stepper, results, saved, customers, account, team, billing, dealer picker, **lease calculator** (VP for clamps/edge math: $0 price, residual>MSRP, money-factor signs, used cars), admin tables; value-flow card/form→params→`useSearchParams`; `router.refresh()`-vs-`useState` resync (P9); race guards.

---

## 4. Completion bar (you CANNOT declare done early)

A **"clean pass"** = you ran §3 across **all** areas applying the §2 primitives, and surfaced **zero** new findings during that pass. Finding even one new issue (or one fix that fails VP-8) **resets the streak to zero** — fix it, then start counting clean passes again.

You are done with Phase 1 only when ALL hold:
1. Every defect is **fixed + VP-8-survived + live-re-verified**, or documented as a deferred recommendation (money/access/destructive → owner sign-off) with evidence.
2. **Three consecutive clean passes.** State the pass number and what you checked for each.
3. Both repos build clean; `get_advisors` clean or each item justified.
4. Every `BUG-NNNN` entry has a reproducible before/after observation.
5. `AUDIT_FINDINGS.md` (working log) + `BUG_REGISTRY.md` (ledger) consistent.

Then **stop and report; do not merge.** Report = punch list of fixed (with proof) / deferred (with reason) + the 3-clean-pass attestation. Wait for owner approval before Phase 2.

**Anti-false-confidence:** a big "looks thorough" summary with no observations is worthless (a prior 2M-row "audit" verified nothing). Quantity of words ≠ verification. If you're tempted to write "everything checks out," that's the moment to run one more primitive.

---

## 5. Phase 2 — optimization (only after owner approves Phase 1)

New branch `audit/v3-optimization`, same evidence rules, same 3-clean-pass bar — but hunting **improvements**, never changing correctness. `OPTIMIZATION_FINDINGS.md`, per item: what, measured benefit, risk, change.

**A. MarketCheck API usage (HIGHEST PRIORITY).** Inventory every MarketCheck call (both repos): endpoint, params, frequency, $ cost. Verify against live docs AND live API. Investigate concretely (with VP-1/VP-2 evidence): is the **$0.08 NeoVIN `/specs`** decode the cheapest source of installed options, or does the **$0.02 "NeoVIN Available Options Packages"** endpoint return what we need at ¼ cost? Are we faceting where one call replaces many? Using `fields=` to shrink payloads? Should the search-results / trim / color caches be **DB-backed** (`search_cache`/`trim_cache`/`color_cache` exist and are unused)? Right-size every cron cadence vs how often data changes. Deliver a **before/after monthly cost model** (calls × unit price).

**B. Code/efficiency.** N+1 queries, unbounded selects (PostgREST 1000-row cap), `get_advisors` perf items, `Promise.all` opportunities, dead code/exports, bundle size, needless `cache:"no-store"`.

**C. Product/UX/reliability.** Search latency & relevance, empty/error states, diagnoser helpfulness, picker speed, mobile/a11y, onboarding/billing flows; retries/backoff/idempotency; is `provider_usage` populated/used for cost observability?

Implement the safe, high-value, correctness-neutral wins on the branch; **propose** (don't apply) anything that changes behavior, cost posture, or schema. Then stop for owner review.
