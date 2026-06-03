# FleetFinder

Cross-brand lease inventory search for leasing agents. Built by [RHD Reality Group](https://github.com/rhdrealitygroup).

This is **v2** — a clean rebuild on Next.js 16 + Supabase + Vercel + Stripe. The original (Base44-hosted) version lives at [`rayswtyft/majestic-motors`](https://github.com/rayswtyft/majestic-motors) and is being retired.

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Hosting | Vercel |
| Database + Auth + Storage | Supabase (Postgres) |
| Payments | Stripe (Subscriptions + Customer Portal) |
| Styling | Tailwind CSS v4 |
| Icons | lucide-react |
| Email | Resend (Phase 4) |
| Data providers | MarketCheck (primary), Auto.dev (fallback) |

## Getting started (local dev)

```bash
# Install deps
npm install

# Copy env template and fill in your values
cp .env.example .env.local
# Edit .env.local with your Supabase + Stripe keys

# Start dev server (uses Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
├── app/                    # Next.js App Router routes
│   ├── layout.tsx          # Root layout with fonts + metadata
│   ├── page.tsx            # Landing page
│   └── globals.css         # Tailwind + design tokens
├── components/             # Reusable React components (Phase 2)
├── lib/
│   ├── supabase/
│   │   ├── client.ts       # Browser-side Supabase client
│   │   └── server.ts       # Server-side client + service role
│   └── utils.ts            # cn(), moneyShort(), etc.
└── ...

supabase/
└── migrations/             # SQL migrations (Phase 4)
```

## Roadmap

- [x] **Phase 1 — Scaffold + landing page** (you are here)
- [ ] **Phase 2 — Live Search** (port reusable components from Base44)
- [ ] **Phase 3 — Auth (Supabase) + multi-tenant schema**
- [ ] **Phase 4 — Stripe billing + Customer Portal**
- [ ] **Phase 5 — Cut over from Base44, retire old site**

See `AGENTS.md` for AI-agent notes on this codebase.

## License

Proprietary — © RHD Reality Group.
