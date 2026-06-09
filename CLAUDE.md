# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `@AGENTS.md` is load-bearing: **this is Next.js 16** with breaking changes vs. your training data — read `node_modules/next/dist/docs/` before writing framework code. Already in play: middleware is **`src/proxy.ts`** (`proxy()` + `config.matcher`), not `middleware.ts`; route handlers set runtime via `export const maxDuration`; page `searchParams`/`params` are **async**.

## What this is

**LotCompass** (dir/legacy name "fleetfinder-v2") — multi-tenant SaaS for car-leasing brokers: cross-brand, VIN-deduped lease-inventory search + lease calculator + zero-result diagnoser. RHD Reality Group. Pricing: **$100/mo per company + $15/mo per agent seat, 14-day trial, no card at signup.** Stack: Next.js 16 / React 19 on Vercel · Supabase (Postgres+Auth) · Stripe (LIVE subs) · Tailwind v4 · MarketCheck (primary) + Auto.dev (fallback). **README.md is stale ("Phase 1") — trust the code.**

## Commands

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # node/npm aren't on the default PATH
npm run build   # the gate: compiles + eslint + typecheck. Must pass before commit.
npm run dev     # localhost:3000
```
**No test suite** — verify via a clean `build` + manual check of the touched flow. Push to `main` auto-deploys on Vercel. Commits end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Architecture

**Multi-tenancy:** `organizations` → `memberships` (`owner`|`admin`|`agent`) → `auth.users`. **Super-admin = an email in `SUPER_ADMIN_EMAILS`**, not a row.

**Two gating layers (both matter):**
1. `src/proxy.ts` → `lib/supabase/middleware.ts#updateSession`: refreshes the auth cookie, sends signed-out users to `/login` (**401 JSON for `/api/*`**), forces onboarding (`user_metadata.onboarded`). Redirects must copy rotated auth cookies (`redirectTo`) or users get logged out.
2. `lib/auth.ts#requireActivePlan`: the real subscription enforcement on paid/metered routes.

**Search** (`/api/live-search`, `/diagnose`, `/list-*`): MarketCheck primary, Auto.dev fallback. Auto.dev can't filter dealer_id/interior_color/powertrain_type/zip-without-coords → those force MarketCheck-only (`autoDevCantHonor`). VIN-deduped, NeoVIN option decode, all under a wall-clock budget (see Invariants).

**Inventory dump** (`lib/inventoryDump.ts`) + Vercel crons (`vercel.json`, auth via `CRON_SECRET`): mirrors selected dealers into `inventory`. The destructive sweep is guarded (see Invariants).

**Billing:** the **Stripe webhook (`/api/stripe/webhook`) is the source of truth** for plan_status / stripe_subscription_id / agent_limit. Checkout = `/api/stripe/checkout`, cancel = `/api/stripe/cancel`. Referrals (`lib/referrals.ts`): "give $50 / get $50" via idempotent Stripe balance credits; routes under `/r/[code]` + `/api/referral`.

## Invariants — these are the recurring audit findings; do not regress them

- **Money paths are idempotent.** Every Stripe credit/checkout/sub mutation uses an idempotency key. The webhook derives state from the payload — it never increments.
- **Webhook ordering:** reject stale events via `last_sub_event_at`; on a same-second tie, re-fetch the sub from Stripe. Atomically claim `stripe_subscription_id` (loser cancels its sub) so concurrent checkouts can't double-subscribe. `trial_used` blocks trial farming.
- **Gate logic fails OPEN on transient errors** (never block a paying agent on a blip) — but **never grant free metered access** to an org-less or definitively-canceled org.
- **Serverless budget:** metered routes set `export const maxDuration = 60`, anchor `reqStart` at the top, break loops at `reqStart + 47_000ms`, and cache truncated/partial results with a **short** TTL only.
- **Destructive ops fail CLOSED on uncertainty.** A delete-sweep needs coverage guards; a suspect-low provider count skips the sweep AND must not overwrite the baseline (`listing_count`). PostgREST `count` is `null` on error → treat as "don't delete."
- **Postgres grants:** `REVOKE EXECUTE … FROM PUBLIC` (not from `anon`/`authenticated` — EXECUTE is inherited from PUBLIC). Run `get_advisors` after every schema change and keep it clean.
- **`/api/*` returns JSON, never an HTML redirect.** Use the service-role client only after `auth.getUser()`. `router.refresh()` doesn't reset client `useState` — re-sync from props.

## Database (Supabase)

Project ref **`vbacqlizbzcxesiwifcv`**. Apply changes via the **Supabase MCP** (`apply_migration` / `execute_sql` / `get_advisors`) — no local CLI. Files: `supabase/migrations/00NN_name.sql`. **Keep file version == ledger version:** `apply_migration` records timestamp versions that drift from `00NN`; the ledger is currently reconciled to `0001–0028`. Security = RLS + `security definer` functions with pinned `search_path`.

## Env

Keys are in `.env.example` (Supabase, Stripe live keys + price ids, MarketCheck/Auto.dev, `SUPER_ADMIN_EMAILS`, `CRON_SECRET`). `SUPER_ADMIN_EMAILS` = `rhdrealitygroup@gmail.com` — controls platform-owner access; change deliberately.
