"""
Step 4: Universe Expansion — Efficient Candidate Selection
Uses Polygon ticker list with market_cap filter + batch options check.
"""
import urllib.request
import json
import os
import time
import sys

POLYGON_KEY = "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Load current universe
with open(os.path.join(os.path.dirname(SCRIPT_DIR), "data", "stock_universe_us800.json"), encoding="utf-8") as f:
    CURRENT_UNIVERSE = set(json.load(f)["symbols"])

print(f"Current universe: {len(CURRENT_UNIVERSE)} tickers", flush=True)

def polygon_get(url, timeout=15):
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "SIGNUM-UNIVERSE/1.0")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())

# Step 1: Fetch ALL active US Common Stock tickers with options
print("\nStep 1: Fetching active US stock tickers...", flush=True)
all_tickers = []
url = f"https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&type=CS&limit=1000&apiKey={POLYGON_KEY}"
pages = 0
while url and pages < 20:
    try:
        data = polygon_get(url)
    except Exception as e:
        print(f"  Error at page {pages}: {e}", flush=True)
        time.sleep(2)
        continue
    results = data.get("results", [])
    for r in results:
        ticker = r.get("ticker", "")
        exchange = r.get("primary_exchange", "")
        # Exclude OTC
        if any(x in exchange for x in ["OTC", "GREY", "PINK", "ARCX"]):
            continue
        # Exclude already in universe
        if ticker in CURRENT_UNIVERSE:
            continue
        # Exclude weird tickers
        if len(ticker) > 5:
            continue
        all_tickers.append({
            "ticker": ticker,
            "name": r.get("name", ""),
            "exchange": exchange,
        })
    url = data.get("next_url")
    if url:
        if "apiKey" not in url:
            url += f"&apiKey={POLYGON_KEY}"
    pages += 1
    if pages % 5 == 0:
        print(f"  Page {pages}: total candidates so far = {len(all_tickers)}", flush=True)
    time.sleep(0.15)  # Rate limit

print(f"\nStep 1 done: {len(all_tickers)} candidate tickers (excluding {len(CURRENT_UNIVERSE)} current)", flush=True)

# Step 2: Get market cap via Polygon snapshot for candidates (batch)
# Use the ticker details endpoint which includes market_cap
print("\nStep 2: Fetching market caps via Polygon snapshot...", flush=True)

# Batch via /v2/snapshot/locale/us/markets/stocks/tickers (all at once)
try:
    snap_url = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?apiKey={POLYGON_KEY}"
    print("  Fetching entire market snapshot...", flush=True)
    snap_data = polygon_get(snap_url, timeout=30)
    snap_tickers = snap_data.get("tickers", [])
    print(f"  Got snapshot for {len(snap_tickers)} tickers", flush=True)
    
    # Build lookup: ticker -> market data
    snap_map = {}
    for s in snap_tickers:
        t = s.get("ticker", "")
        if t:
            snap_map[t] = {
                "volume": s.get("day", {}).get("v", 0) or s.get("day", {}).get("volume", 0) or 0,
                "price": s.get("day", {}).get("c", 0) or 0,
            }
except Exception as e:
    print(f"  Snapshot error: {e}", flush=True)
    snap_map = {}

# Enrich candidates with volume data
enriched = []
for t in all_tickers:
    ticker = t["ticker"]
    snap = snap_map.get(ticker, {})
    vol = snap.get("volume", 0)
    price = snap.get("price", 0)
    # Filter: must have trading volume > 100K and price > $1
    if vol < 100000 or price < 1:
        continue
    t["volume"] = vol
    t["price"] = price
    t["dollar_volume"] = vol * price  # Dollar volume as liquidity proxy
    enriched.append(t)

enriched.sort(key=lambda x: x["dollar_volume"], reverse=True)
print(f"\nStep 2 done: {len(enriched)} tickers with volume > 100K and price > $1", flush=True)

# Step 3: Verify options existence for top candidates
# Take top 1500 by dollar volume, check if they have options
top_candidates = enriched[:1500]
print(f"\nStep 3: Checking options for top {len(top_candidates)} by dollar volume...", flush=True)

with_options = []
checked = 0
no_options = 0

for t in top_candidates:
    ticker = t["ticker"]
    try:
        today = time.strftime("%Y-%m-%d")
        max_date = time.strftime("%Y-%m-%d", time.localtime(time.time() + 35 * 86400))
        url = (f"https://api.polygon.io/v3/snapshot/options/{ticker}"
               f"?limit=1&expiration_date.gte={today}&expiration_date.lte={max_date}"
               f"&apiKey={POLYGON_KEY}")
        data = polygon_get(url, timeout=8)
        results = data.get("results", [])
        
        if len(results) > 0:
            t["has_options"] = True
            with_options.append(t)
        else:
            no_options += 1
    except Exception as e:
        if "429" in str(e):
            time.sleep(5)
            try:
                data = polygon_get(url, timeout=8)
                if data.get("results"):
                    t["has_options"] = True
                    with_options.append(t)
                else:
                    no_options += 1
            except:
                no_options += 1
        else:
            no_options += 1
    
    checked += 1
    if checked % 100 == 0:
        print(f"  Checked {checked}/{len(top_candidates)}: {len(with_options)} with options, {no_options} without", flush=True)
    
    time.sleep(0.15)
    
    # If we already have 1100+ with options, stop early
    if len(with_options) >= 1100:
        print(f"  Early stop: found {len(with_options)} tickers with options", flush=True)
        break

print(f"\nStep 3 done: {len(with_options)} tickers with active options", flush=True)

# Step 4: Select final 1,000
final = with_options[:1000]
print(f"\nStep 4: Final selection: {len(final)} tickers", flush=True)

print(f"\nTop 20:")
for i, t in enumerate(final[:20]):
    dv = t.get("dollar_volume", 0)
    dv_str = f"${dv/1e6:.1f}M" if dv > 1e6 else f"${dv/1e3:.0f}K"
    print(f"  {i+1:3d}. {t['ticker']:6s} | DolVol={dv_str:>10s} | Vol={t['volume']:>12,.0f} | {t['name'][:35]}", flush=True)

print(f"\nBottom 10:")
for i, t in enumerate(final[-10:]):
    dv = t.get("dollar_volume", 0)
    dv_str = f"${dv/1e6:.1f}M" if dv > 1e6 else f"${dv/1e3:.0f}K"
    print(f"  {len(final)-10+i+1:3d}. {t['ticker']:6s} | DolVol={dv_str:>10s} | Vol={t['volume']:>12,.0f} | {t['name'][:35]}", flush=True)

# Save
output = {
    "selected": len(final),
    "tickers": [t["ticker"] for t in final],
    "details": final,
}
output_path = os.path.join(SCRIPT_DIR, "universe_expansion_candidates.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"\nSaved to: {output_path}", flush=True)
print(f"\nTotal: {len(CURRENT_UNIVERSE)} current + {len(final)} new = {len(CURRENT_UNIVERSE) + len(final)} total", flush=True)
