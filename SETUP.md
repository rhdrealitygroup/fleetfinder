# FleetFinder — Setup & Status

_Last updated: build session while Ray was at work._

## ✅ What's built and working

| Area | Status | Notes |
|---|---|---|
| Landing page | ✅ | Modern dark design at `/` |
| **Live Search** | ✅ **working with real data** | `/search` — real trims, real MarketCheck inventory, real photos, distance sort, filters, detail panel w/ VIN decode |
| Trims | ✅ **fixed** | Vehicle Style catalog + facet availability, deduped |
| Lease Calculator | ✅ | `/calculator` — money-factor math, customer payment + your cut |
| Search API routes | ✅ | `/api/live-search`, `list-trims`, `list-colors`, `list-styles`, `decode-vin` |
| Auth | ✅ scaffolded | `/login`, `/signup`, magic link + password, `/auth/callback`, `/auth/signout`, route protection |
| Database schema | ✅ written | `supabase/migrations/0001_init.sql` — **needs to be applied (see below)** |
| Design previews | ✅ | `/preview/*` (can delete later) |

## 🔧 What YOU need to do (in order)

### 1. Fix the Vercel 404 (2 min) — BLOCKING
Vercel → project → **Settings**:
- **Framework Preset** → **Next.js**
- **Root Directory** → blank
- Save → **Deployments → ⋯ → Redeploy**

### 2. Add Vercel environment variables (3 min)
Settings → Environment Variables → add all 7 (Supabase URL/anon/service, MarketCheck,
Auto.dev, SUPER_ADMIN_EMAILS, NEXT_PUBLIC_APP_URL) → Redeploy.
Without these the `/api/*` routes (search) won't work in production.

### 3. Apply the database schema (1 min)
Supabase dashboard → **SQL Editor** → New query → paste ALL of
`supabase/migrations/0001_init.sql` → **Run**. Creates every table + security rules.
(Couldn't auto-apply this — it needs your database password, which only you have.)

### 4. Turn off the Vercel login wall (1 min)
Settings → **Deployment Protection** → Vercel Authentication → **OFF** (so the public/brother can see it).

### 5. Stripe (when ready for billing)
Sign up at stripe.com as RHD Reality Group → Test mode → send me the test
`pk_test_…` and `sk_test_…` keys. I'll wire checkout + the $100 / $15-agent plans.

### 6. Domain (optional, anytime)
Buy a name → tell me → I connect it to Vercel.

## ⏳ What I'm building next (no input needed)
- 3-tier accounts (super-admin / owner / agent) wired to the schema
- Owner dashboard (manage agents, see billing)
- Saved-vehicles + recent-searches synced to Supabase (currently localStorage)
- Stripe billing (once test keys arrive)
- Super-admin platform console

## Decisions made while you were out (change anytime)
- Auth: email/password + magic link (Google addable later)
- Trial: 14 days, no card upfront
- Customer-profiles table: included now (the desking 7-day feature)

## Local dev
```bash
npm install
cp .env.example .env.local   # fill in keys (already done locally)
npm run dev                  # http://localhost:3000
```
