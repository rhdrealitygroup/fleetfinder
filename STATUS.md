# LotCompass — Status & Roadmap

_Living source of truth. Updated as we ship._

---

## ✅ DONE & LIVE (on lotcompass.com)

### Core product
- **Cross-brand live inventory search** (MarketCheck, **nationwide** on the Standard tier)
- **Trims + sub-trims** — make/model specific (330i, M340i, Extended/Max Range, etc.)
- **Colors** — make/model specific
- **Options/features** — make/model specific, pulled from real VIN build sheets, **grouped like the configurator** (Packages · Exterior · Interior · Mechanical · Entertainment · Safety) with factory MSRP, and selectable as search filters
- **Lease + finance calculator** (money-factor math, profit shown)
- **VIN decode** (packages/options, interior color)
- CSV export, result cards with $-off-MSRP + days-on-lot

### Dealers
- **NY/NJ dealer directory** pulled (~5,260 dealers)
- Filter by **state · make · franchise/independent**; multi-make dealers show under **each** make
- **Search scoping** — defaults to *your* dealers, with one-off "search all dealers" override

### Platform / brand
- **Domain live** — lotcompass.com (DNS + SSL), apex→www
- Rebranded FleetFinder → **LotCompass**; Gallery design system
- **Sign-in required** to use the app (gated)
- **Google sign-in published** (any customer can sign in)
- **Compass logo** — nav, landing, browser tab favicon, and home-screen icon (all match)
- **Signed-in users land on /search** automatically
- **MarketCheck Standard** ($749, unlimited calls) wired — nationwide, 500-mi radius
- Everything sorts **by name**

---

## 📋 LEFT TO BUILD (in recommended order)

### 1. 🔑 Account-scoped data — THE FOUNDATION (unlocks most of the rest)
Today saved dealers/vehicles live in the browser (localStorage). Move to Supabase, scoped correctly:
- **Dealer list → per COMPANY** (whole office shares it)
- **Saved vehicles + Lists + Compare → per AGENT** (each rep their own)
> Everything below 2–5 depends on or is easier after this.

### 2. ⚖️ Compare view + 💾 Save-to-list (per agent)
- A real side-by-side **compare** screen
- Save vehicles into **named lists** per agent

### 3. 🔍 No-match diagnosis
- When a search returns 0, explain *why* and suggest: "3 of your 5 options are in stock; Heads-Up Display + Cooled Seats together aren't" / "Tanzanite Blue is out of stock — available: Black, White." (Independent — can slot in anytime.)

### 4. 🌎 All US dealers (~80k)
- Expand the dealer directory nationwide (feasible on unlimited API). Belongs in the DB, so it rides on #1.

### 5. 📅 Daily vehicle catalog dump (cron)
- Nightly job that refreshes the full catalog (trims/sub-trims/colors/options for every model) into our DB → instant, complete, and the data **moat**. Needs DB + a Vercel Cron.

### 6. 💳 Stripe billing (paused, your move)
- The `sk_test_…` paste box is still open. Wires the $100/mo + $15/seat + 14-day trial. Independent of the above.

---

## 🧭 Notes
- **Logo:** current compass is our vector rendered to PNG. Swap your exact art anytime by uploading `src/app/icon.png` + `src/app/apple-icon.png`.
- **Data tier:** Standard (unlimited API) is enough to build our own daily catalog — no need for MarketCheck's separate bulk "feed dump" product yet.
