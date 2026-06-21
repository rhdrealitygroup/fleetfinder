#!/usr/bin/env python3
"""One-off NY/NJ dealer makes backfill. Mirrors the sync-dealers ?backfill_makes
branch: per dealer, pull the cheap make facet from MarketCheck and write makes to
dealer_catalog. Manual, user-approved (~$0.002/dealer)."""
import json, os, sys, time, urllib.parse, urllib.request

ENV = {}
with open(os.path.join(os.path.dirname(__file__), "..", ".env.local")) as f:
    for line in f:
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            ENV[k.strip()] = v.strip().strip('"').strip("'")

MC = ENV["MARKETCHECK_API_KEY"]
SB_URL = ENV["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SVC = next(ENV[k] for k in ENV if "SERVICE_ROLE" in k)
HDR = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}

def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

# 1) collect all NY/NJ stocked dealers with empty makes
dealers = []
off = 0
while True:
    u = (f"{SB_URL}/rest/v1/dealer_catalog?state=in.(NJ,NY)&listing_count=gt.0"
         f"&or=(makes.is.null,makes.eq.%7B%7D)&select=id&order=listing_count.desc"
         f"&offset={off}&limit=1000")
    batch = get(u, HDR)
    dealers += [d["id"] for d in batch]
    if len(batch) < 1000:
        break
    off += 1000

print(f"to_tag={len(dealers)}", flush=True)
tagged = 0
for i, did in enumerate(dealers):
    try:
        mu = (f"https://api.marketcheck.com/v2/search/car/active?api_key={MC}"
              f"&dealer_id={urllib.parse.quote(str(did))}&car_type=new&rows=0&facets=make")
        d = get(mu)
        makes = [t["item"].strip() for t in (d.get("facets", {}).get("make") or []) if t.get("item")]
        body = json.dumps({"makes": makes if makes else ["—"]}).encode()
        req = urllib.request.Request(
            f"{SB_URL}/rest/v1/dealer_catalog?id=eq.{urllib.parse.quote(str(did))}",
            data=body, headers=HDR, method="PATCH")
        urllib.request.urlopen(req, timeout=30).read()
        tagged += 1
    except Exception as e:
        print(f"skip {did}: {e}", flush=True)
    if (i + 1) % 100 == 0:
        print(f"progress {i+1}/{len(dealers)} tagged={tagged}", flush=True)

print(f"DONE tagged={tagged}/{len(dealers)}", flush=True)
