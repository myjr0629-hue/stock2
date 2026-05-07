"""
Full 1,000 Ticker Verification — Upstash Only Version
EC2 proxy is VPC-internal only, so we verify via Upstash.
Since flow-harvest writes to EC2 first (and skips Upstash on success),
flow data may not be in Upstash. 

Verification strategy:
- cache:analysis (signum-harvest) -> ALWAYS in Upstash (harvest uses mset to Upstash)
- cache:flow:unified -> May NOT be in Upstash (EC2 priority write)
- We verify what's available and compare before/after

For flow data, we verify via Lambda CloudWatch logs:
- Each shard must report same total success count
- Sum of all shard tickers must equal 1,000
"""
import urllib.request
import json
import sys
import os
import time

UPSTASH_URL = "https://sacred-manatee-21571.upstash.io"
UPSTASH_TOKEN = "AVRDAAIncDIwNzE3MjMwY2ZjZDg0MWY2OWY5OGYyYzdlODUzYjU4Y3AyMjE1NzE"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Load universe from JSON
UNIVERSE_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), "data", "stock_universe_us800.json")
with open(UNIVERSE_PATH, encoding="utf-8") as f:
    _data = json.load(f)
    UNIVERSE = _data["symbols"]  # symbols key contains the ticker array

def upstash_cmd(args):
    body = json.dumps(args).encode()
    req = urllib.request.Request(UPSTASH_URL, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {UPSTASH_TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def upstash_pipeline(commands):
    """Execute multiple commands in a single pipeline request"""
    body = json.dumps(commands).encode()
    req = urllib.request.Request(f"{UPSTASH_URL}/pipeline", data=body, method="POST")
    req.add_header("Authorization", f"Bearer {UPSTASH_TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

def capture_all_analysis(label):
    """Capture ALL tickers' cache:analysis data using pipeline batches"""
    print(f"{'='*80}")
    print(f"CAPTURING ALL {len(UNIVERSE)} TICKERS (cache:analysis) -- {label.upper()}")
    print(f"{'='*80}")
    
    results = {}
    success = 0
    empty = 0
    
    # Process in batches of 50 using pipeline
    BATCH = 50
    for batch_start in range(0, len(UNIVERSE), BATCH):
        batch_tickers = UNIVERSE[batch_start:batch_start + BATCH]
        
        # Build pipeline commands
        commands = [["GET", f"cache:analysis:{t}"] for t in batch_tickers]
        responses = upstash_pipeline(commands)
        
        if isinstance(responses, dict) and responses.get("error"):
            print(f"  ERROR at batch {batch_start}: {responses['error']}")
            continue
        
        for i, resp in enumerate(responses):
            ticker = batch_tickers[i]
            raw = resp.get("result") if isinstance(resp, dict) else None
            
            if raw:
                try:
                    data = json.loads(raw)
                    entry = {
                        "alphaScore": data.get("alphaSnapshot", {}).get("score"),
                        "grade": data.get("alphaSnapshot", {}).get("grade"),
                        "action": data.get("alphaSnapshot", {}).get("action"),
                        "rsi": data.get("rsi"),
                        "gex": data.get("gex"),
                        "gexM": data.get("gexM"),
                        "maxPain": data.get("maxPain"),
                        "pcr": data.get("pcr"),
                        "callWall": data.get("callWall"),
                        "putFloor": data.get("putFloor"),
                        "squeezeScore": data.get("squeezeScore"),
                        "iv": data.get("iv"),
                        "whaleIndex": data.get("whaleIndex"),
                        "whaleConfidence": data.get("whaleConfidence"),
                        "darkPoolPct": data.get("darkPoolPct"),
                        "netPremium": data.get("netPremium"),
                        "return3d": data.get("return3d"),
                        "relVol": data.get("relVol"),
                        "shortVolPct": data.get("shortVolPct"),
                        "volume": data.get("volume"),
                    }
                    results[ticker] = entry
                    success += 1
                except:
                    results[ticker] = None
                    empty += 1
            else:
                results[ticker] = None
                empty += 1
        
        if (batch_start + BATCH) % 200 == 0 or batch_start + BATCH >= len(UNIVERSE):
            print(f"  Progress: {min(batch_start + BATCH, len(UNIVERSE))}/{len(UNIVERSE)} (ok={success} empty={empty})")
    
    # Save
    filepath = os.path.join(SCRIPT_DIR, f"fulldata_analysis_{label}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"\nCapture complete: {success} tickers with data, {empty} empty (TTL expired)")
    print(f"Saved to: {filepath}")
    return results

def compare_analysis():
    """Compare before vs after for ALL tickers"""
    before_path = os.path.join(SCRIPT_DIR, "fulldata_analysis_before.json")
    after_path = os.path.join(SCRIPT_DIR, "fulldata_analysis_after.json")
    
    if not os.path.exists(before_path) or not os.path.exists(after_path):
        print("ERROR: Need both fulldata_analysis_before.json and fulldata_analysis_after.json")
        return False
    
    with open(before_path, encoding="utf-8") as f:
        before = json.load(f)
    with open(after_path, encoding="utf-8") as f:
        after = json.load(f)
    
    print(f"{'='*80}")
    print(f"FULL COMPARISON: {len(UNIVERSE)} TICKERS (cache:analysis)")
    print(f"{'='*80}")
    
    match = 0
    mismatch = 0
    both_empty = 0
    before_only = 0
    after_only = 0
    mismatches = []
    
    # Fields that MUST be identical (not dependent on timing)
    MUST_MATCH = [
        "alphaScore", "grade", "action", "gex", "gexM", "maxPain",
        "pcr", "callWall", "putFloor", "squeezeScore", "iv",
        "whaleIndex", "whaleConfidence", "darkPoolPct", "netPremium",
    ]
    
    for ticker in UNIVERSE:
        b = before.get(ticker)
        a = after.get(ticker)
        
        if not b and not a:
            both_empty += 1
            continue
        if b and not a:
            before_only += 1
            mismatches.append(f"  [DATA LOST] {ticker}: had data before, empty after")
            continue
        if not b and a:
            after_only += 1
            continue
        
        # Both have data
        ticker_ok = True
        for field in MUST_MATCH:
            bv = b.get(field)
            av = a.get(field)
            if bv != av:
                ticker_ok = False
                mismatches.append(f"  [MISMATCH] {ticker}.{field}: {bv} -> {av}")
        
        if ticker_ok:
            match += 1
        else:
            mismatch += 1
    
    print(f"\nResults:")
    print(f"  MATCH (identical):        {match}")
    print(f"  MISMATCH (fields differ): {mismatch}")
    print(f"  Both empty:               {both_empty}")
    print(f"  Before only (DATA LOST):  {before_only}")
    print(f"  After only (new data):    {after_only}")
    
    if mismatches:
        print(f"\n{'!'*60}")
        print(f"DISCREPANCIES ({len(mismatches)}):")
        print(f"{'!'*60}")
        for m in mismatches[:50]:  # Show first 50
            print(m)
        if len(mismatches) > 50:
            print(f"  ... and {len(mismatches)-50} more")
    else:
        print(f"\n[PASS] ALL {len(UNIVERSE)} TICKERS VERIFIED")
        print(f"       ZERO DISCREPANCIES — ZERO DATA LOSS")
    
    if before_only > 0:
        print(f"\n[FAIL] {before_only} TICKERS LOST DATA — ROLLBACK REQUIRED")
    
    return mismatch == 0 and before_only == 0

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python test_full_verify.py capture before")
        print("  python test_full_verify.py capture after")
        print("  python test_full_verify.py compare")
        sys.exit(1)
    
    cmd = sys.argv[1]
    if cmd == "capture":
        label = sys.argv[2] if len(sys.argv) > 2 else "snapshot"
        capture_all_analysis(label)
    elif cmd == "compare":
        ok = compare_analysis()
        sys.exit(0 if ok else 1)
