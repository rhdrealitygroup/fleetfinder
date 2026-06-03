# FleetFinder — Product Roadmap

_Living document. The plan for what FleetFinder is and what we build next._

## What it is
Cross-brand live lease-inventory search + intelligence for leasing brokers.
Built on Next.js + Supabase + Vercel, data from MarketCheck (primary) and
Auto.dev (fallback). Pricing: $100/mo per company + $15/mo per agent.

---

## ✅ Built today
- Live nationwide inventory search (MarketCheck/Auto.dev), distance-sorted
- Trims **with range/config sub-variants** (Extended/Max/Standard Range, Hybrid/Prime, etc.)
- Model auto-resolution (fixes brands like RAM) + casing/noise cleanup
- **Customer ZIP location search** (radius 25–100 mi)
- Lease calculator (money-factor math + your profit)
- VIN decode (packages/options), colors, full style catalog
- Vehicle detail panel, save/favorites, compare toggle
- Gallery design system (warm, serif, mobile-first)
- Auth + 3-tier accounts (super-admin / owner / agent), team, billing (Stripe-ready)
- Database schema written (needs to be applied)

---

## 🔑 The strategic unlock: build our own history
MarketCheck only shows **now**. Most "intelligence" features (price drops,
days-on-lot trends, sold prediction, demand, scarcity-over-time) need
**historical data we don't get retroactively**. So: **snapshot the data daily
into our DB starting ASAP.** In 1–3 months that proprietary time-series powers
half the backlog AND becomes a moat competitors can't copy without also waiting.

---

## ⭐ My additions — built for *leasing*, not flipping
Most arbitrage ideas optimize purchase price. For leasing, the deal is driven by
**residual value + money factor + incentives** — not sticker. Three additions:

1. **Lease Deal Score (not Price Deal Score)** — rank inventory by *best monthly
   payment* (residual + MF), not lowest sticker. This is what actually sells.
   ⚠️ Dependency: residual/MF data comes from bank/captive programs, **not
   MarketCheck** — we need to source it. Hardest + highest-value piece.
2. **Customer-match alerts** — when new inventory matching a saved 7-day customer
   profile appears, ping the agent. Turns the customer vault into a deal engine.
3. **Incentive-by-ZIP awareness** — regional rebates/loyalty/conquest vary by
   region; surface them per customer ZIP. Big for leasing math.

---

## Near-term follow-ons (small, high-value)
- **"No results? Search wider"** — one tap to expand radius when a tight search is empty
- **Auto-fill ZIP from the customer profile** into search
- **Dealer settings** — pick your dealers, scope searches to them, fall back to all (needs DB)

---

## Big ideas — verdicts
| Idea | Verdict |
|---|---|
| Inventory Arbitrage Finder (cheapest identical + margin) | ✅ Flagship — build |
| Mislisted Vehicle Finder (VIN-decode vs listing) | ✅ Killer; costs decode calls |
| Option Match AI (green + pano + <$700/mo, closest match) | ✅ Build (fuzzy rank + calc) |
| Market Scarcity Score | ✅ Easy (nationwide counts) |
| Rare Build Detector | ✅ Needs snapshot engine + alerts |
| Broker Demand Tracker | ✅ Our own search logs — start logging day 1 |
| Inventory Prediction AI (sell in 7/14/30d) | ⚠️ Needs months of our history |
| Dealer Negotiation Score | ⚠️ Avg-discount now; behavior later |
| Hidden Incoming Inventory (allocations) | ❌ Not in any feed |
| Nationwide Swap Finder | ❌ Would require building a dealer marketplace |

## 50-feature list — buckets
- **Have / trivial:** VIN search, MSRP exact+range, trim filter, exterior color, drivetrain, radius, closest/cheapest match, favorites, days-on-lot, compare
- **Doable now (no new data):** monthly-payment-target filter, interior color, tow/sunroof/seat/engine/seating filters, build-sheet (VIN decode), aging score, deal score, shipping estimate, state heat maps, multi-state presets, saved searches, team-shared searches, Excel/PDF export, one-click quote, notes, availability re-check
- **Need snapshot DB:** price-drop, history timeline, MSRP-change, new-arrival + removal alerts, sold prediction, discount-over-time
- **Need external integration:** transport quote, map view, (partial) stock-number + dealer-installed-option
- **Not feasible:** hidden incoming allocations, true swap network

---

## Near-term backlog — buildable now (no new data source)
Committed "yes" list, all on today's MarketCheck data + our own DB:
monthly-payment-target filter (ties to calc), interior color, tow/sunroof/
seat-material/engine/seating filters, build-sheet search (VIN decode), aging
score, deal score (1–100), shipping estimate (distance×rate), state heat maps,
multi-state presets, saved searches, team-shared searches, Excel/PDF export,
one-click quote, inventory notes, availability re-check.

---

# 🖥️ DESKING PHASE (the future phase)

> **The gate:** residual values, money factors, and incentives/rebates are NOT
> in MarketCheck. ~70% of desking needs them. The desking-software API you're
> sourcing is the likely provider. **If that API returns residual + MF +
> incentive data, almost all of this becomes buildable. If not, only the
> manual-input calculators and our-own-data profit tools work.** Everything
> below is tagged: ✅ now · ⚠️ after lender data · ❌ not feasible.

### Calculators (1–10) — ✅ buildable now (pure math)
Lease, finance, one-pay, MSD, sign-&-drive, zero-down, custom cash-down,
acquisition fee, disposition fee, tax-by-state. All variations of the existing
lease math. Only external need: a static state-tax table (easy). Today they take
manual residual/MF; later they auto-fill from the lender DB.

### Lender Program data (11–20) — 🔒 THE dependency
Residual DB, money-factor DB, incentive DB, loyalty/conquest/grad/military/
first-responder rebates, business lease, supplier discounts. **None of this
exists in MarketCheck.** Source = desking API or a lender-data provider. This
single bucket unlocks 21–30 and the AI desking tools.

### Payment Optimization (21–30) — ⚠️ feasible *after* lender data
Lowest-payment finder, best term, best mileage, payment sensitivity, down /
trade-in simulators, rebate optimizer, lease-vs-finance, cost-per-mile, TCO.
The algorithms are easy; they just need 11–20 to compute against.

### Broker Profit Tools (31–40) — ✅ our own data, build with the deal system
Front/back gross, broker fee, commission, profit-per-deal, leaderboard,
profitability score, revenue dashboard, rep performance, closing ratio. No
external dependency — needs a "deal" object in our DB + accounts. Build
alongside quotes.

### Quote Generation (41–50) — ✅ mostly buildable
One-click lease/finance quote, proposal builder, compare vehicles/lenders, PDF,
branded templates, customer portal, conversion tracking. E-signature (49) needs
an integration (DocuSign/Dropbox Sign). Quotes get *real* once lender data lands;
until then they use estimates.

### AI Desking concepts — assessment
| Concept | Verdict |
|---|---|
| **Inventory + Desking combined** (click car → 24/36/39/48-mo payments) | ✅ Now as *estimates* (default residual%+MF); exact after lender data. Great UX, no separate screen. |
| **Radius Deal Search / Deal Ranking** (Dealer A $649 vs B $622) | ✅ Now as estimate — payment gaps come from listed-price gaps; exact needs real MF/residual + dealer incentives. |
| **Customer Budget Match** ("$700/mo, 12k mi, SUV") | ✅ Option-Match + calc; estimate now, exact after data. High value. |
| **Payment Builder** (target payment → builds deal backwards) | ⚠️ Solver over the deal math — needs lender data to be real. |
| **AI Desking Assistant** ("get this under $699": adjust terms/rebates/mileage) | ⚠️ Same solver + needs incentive data. The headline feature; gated on lender data. |
| **AI Deal Auditor** ("missing a $2,500 conquest rebate") | ⚠️ Needs incentive DB to know what's missing. |
| **Broker Margin Optimizer** (customer payment + broker + dealer profit, best structure in budget) | ⚠️ Needs lender data + a margin model. Highest-value, fully gated. |

**Reframe:** "AI Desking Assistant" / "Payment Builder" / "Margin Optimizer" are
all the *same engine* — a solver that searches term × mileage × down × rebate
combinations to hit a target payment or max margin. Build the engine once; it
powers all three. It only needs residual + MF + incentive data to run for real.

---

## Phased build order
1. **Foundation** — apply DB + accounts (unlocks saved searches, customers, dealer settings)
2. **Snapshot engine** — quietly start the data moat
3. **Sellable now** — Arbitrage Finder, Scarcity Score, payment-target + Option-Match search; the 3 near-term follow-ons
4. **Demand Tracker** — log every search from day 1
5. **Later** — prediction AI (after history), mislisting finder, alerts, lease-deal score (once residual/MF data sourced)

## Open dependency to chase
**Lease residual + money-factor data** (bank/captive programs). It's the one
piece that unlocks the lease-specific features above and is the hardest to get.
