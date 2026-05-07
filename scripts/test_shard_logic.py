"""
Pre-deployment test: Verify shard slicing logic
Simulates the same JavaScript slicing logic in Python to confirm:
1. All 1,000 tickers are covered (no gaps, no overlaps)
2. Each shard gets ~250 tickers
3. Boundary tickers match expectations
"""
import json
import os

# Load actual universe
with open("data/stock_universe_us800.json", encoding="utf-8") as f:
    UNIVERSE = json.load(f)["symbols"]

print(f"Universe size: {len(UNIVERSE)}")
print(f"First 3: {UNIVERSE[:3]}")
print(f"Last 3: {UNIVERSE[-3:]}")
print()

TOTAL_SHARDS = 4

all_tickers = set()
shard_tickers = {}

for shard in range(TOTAL_SHARDS):
    perShard = -(-len(UNIVERSE) // TOTAL_SHARDS)  # ceil division (same as Math.ceil)
    startIdx = shard * perShard
    endIdx = min(startIdx + perShard, len(UNIVERSE))
    myUniverse = UNIVERSE[startIdx:endIdx]
    
    shard_tickers[shard] = myUniverse
    
    print(f"Shard {shard}: index [{startIdx}..{endIdx-1}] = {len(myUniverse)} tickers")
    print(f"  First: {myUniverse[0]}")
    print(f"  Last:  {myUniverse[-1]}")
    
    # Check for overlaps
    for t in myUniverse:
        if t in all_tickers:
            print(f"  !! OVERLAP: {t} already in another shard!")
        all_tickers.add(t)
    print()

# Verify completeness
print("=" * 50)
missing = set(UNIVERSE) - all_tickers
extra = all_tickers - set(UNIVERSE)

if len(missing) == 0 and len(extra) == 0 and len(all_tickers) == len(UNIVERSE):
    print("[PASS] All {0} tickers covered. Zero gaps. Zero overlaps.".format(len(UNIVERSE)))
else:
    print("[FAIL] Missing: {0}, Extra: {1}".format(len(missing), len(extra)))
    if missing:
        print("  Missing tickers:", sorted(missing)[:10])

# Verify sum
total = sum(len(v) for v in shard_tickers.values())
print(f"Sum of all shards: {total} (expected: {len(UNIVERSE)})")
assert total == len(UNIVERSE), "SHARD SUM MISMATCH!"

# Lock key test
for shard in range(TOTAL_SHARDS):
    lock = f"flow-harvest:lock:shard-{shard}"
    print(f"  Shard {shard} lock key: {lock}")
