"""
Step 0: Baseline Data Capture
현재 시스템의 실제 저장 데이터를 캡처하여 기준점(Baseline)으로 저장.
작업 후 이 데이터와 1:1 비교하여 기능 영향 제로를 증명.
"""
import urllib.request
import json
import os

UPSTASH_URL = "https://sacred-manatee-21571.upstash.io"
UPSTASH_TOKEN = "AVRDAAIncDIwNzE3MjMwY2ZjZDg0MWY2OWY5OGYyYzdlODUzYjU4Y3AyMjE1NzE"

# 검증 대상: 각 shard 경계에 걸치는 종목 + 주요 M7 + 유니버스 마지막 종목
TEST_TICKERS = [
    "AAPL",   # shard 0 (앞부분)
    "CPRT",   # shard 0 끝 경계
    "CRDO",   # shard 1 시작 경계
    "GS",     # shard 1 끝 경계
    "GSIT",   # shard 2 시작 경계  
    "NFLX",   # shard 2 끝 경계
    "NG",     # shard 3 시작 경계
    "ZTS",    # shard 3 끝 (유니버스 마지막)
    "NVDA",   # M7 핵심 (타임아웃 피해 종목)
    "TSLA",   # M7 핵심
    "META",   # M7 핵심
    "AMD",    # 옵션 거래량 최상위
    "AMZN",   # M7 핵심
    "GOOGL",  # M7 핵심
    "MSFT",   # M7 핵심
    "JPM",    # 금융 대표주
]

def redis_get(key):
    req = urllib.request.Request(f"{UPSTASH_URL}/GET/{key}")
    req.add_header("Authorization", f"Bearer {UPSTASH_TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            if data.get("result"):
                return json.loads(data["result"])
    except Exception as e:
        print(f"  [ERROR] {key}: {e}")
    return None

def capture_baseline():
    baseline = {}
    
    print("=" * 80)
    print("STEP 0: BASELINE DATA CAPTURE")
    print("=" * 80)
    
    # 1. cache:analysis (Alpha Score, GEX, etc.)
    print("\n--- cache:analysis (signum-harvest 저장 데이터) ---")
    for ticker in TEST_TICKERS:
        data = redis_get(f"cache:analysis:{ticker}")
        if data:
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
            }
            baseline[f"analysis:{ticker}"] = entry
            print(f"  {ticker:6s} | alpha={entry['alphaScore']:3d} grade={entry['grade']} "
                  f"gex={entry['gexM']} maxPain={entry['maxPain']} "
                  f"whale={entry['whaleIndex']} squeeze={entry['squeezeScore']} "
                  f"dp={entry['darkPoolPct']}%")
        else:
            print(f"  {ticker:6s} | NO DATA (TTL expired - normal for off-hours)")
    
    # 2. cache:flow:unified (flow-harvest 저장 데이터)
    print("\n--- cache:flow:unified (flow-harvest 저장 데이터) ---")
    for ticker in TEST_TICKERS[:5]:  # 샘플 5개
        data = redis_get(f"cache:flow:unified:{ticker}")
        if data:
            dp_items = len(data.get("darkPoolTrades", []))
            dp_stats = data.get("darkPoolStats", {})
            rt = data.get("realtimeMetrics", {})
            entry = {
                "darkPoolTradeCount": dp_items,
                "darkPoolPercent": dp_stats.get("darkPoolPercent"),
                "tradesScanned": dp_stats.get("tradesScanned"),
                "rtDarkPoolPct": rt.get("darkPool", {}).get("percent") if rt.get("darkPool") else None,
                "blockTradeCount": rt.get("blockTrade", {}).get("count") if rt.get("blockTrade") else None,
                "shortVolPct": rt.get("shortVolume", {}).get("percent") if rt.get("shortVolume") else None,
                "_source": data.get("_source"),
            }
            baseline[f"flow:{ticker}"] = entry
            print(f"  {ticker:6s} | dp_trades={dp_items} dp%={entry['darkPoolPercent']} "
                  f"blocks={entry['blockTradeCount']} short={entry['shortVolPct']}% "
                  f"source={entry['_source']}")
        else:
            print(f"  {ticker:6s} | NO DATA (TTL expired - normal for off-hours)")
    
    # 3. polygon:snapshot:probe (flow-harvest raw 옵션 캐시)
    print("\n--- polygon:snapshot:probe (flow-harvest raw 캐시) ---")
    for ticker in TEST_TICKERS[:5]:
        data = redis_get(f"polygon:snapshot:probe:{ticker}")
        if data:
            entry = {
                "probeCount": len(data.get("probeResults", [])),
                "exactCount": len(data.get("exactResults", [])),
                "weeklyExpiry": data.get("weeklyExpiry"),
                "_source": data.get("_source"),
            }
            baseline[f"snapshot:{ticker}"] = entry
            print(f"  {ticker:6s} | probe={entry['probeCount']} exact={entry['exactCount']} "
                  f"expiry={entry['weeklyExpiry']} source={entry['_source']}")
        else:
            print(f"  {ticker:6s} | NO DATA (TTL expired)")
    
    # 4. Redis 전체 상태
    print("\n--- Redis 전체 상태 ---")
    req = urllib.request.Request(f"{UPSTASH_URL}/DBSIZE")
    req.add_header("Authorization", f"Bearer {UPSTASH_TOKEN}")
    with urllib.request.urlopen(req, timeout=5) as resp:
        dbsize = json.loads(resp.read().decode())["result"]
    
    req2 = urllib.request.Request(f"{UPSTASH_URL}/INFO/memory")
    req2.add_header("Authorization", f"Bearer {UPSTASH_TOKEN}")
    with urllib.request.urlopen(req2, timeout=5) as resp:
        info = json.loads(resp.read().decode())["result"]
        for line in info.split("\r\n"):
            if "used_memory_human" in line:
                mem = line.split(":")[1]
                break
    
    baseline["_redis_state"] = {"dbsize": dbsize, "memory": mem}
    print(f"  Total keys: {dbsize}")
    print(f"  Memory used: {mem}")
    
    # 5. 저장
    output_path = os.path.join(os.path.dirname(__file__), "baseline_data.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, ensure_ascii=False)
    
    print(f"\n[OK] Baseline saved: {output_path}")
    print(f"   총 {len(baseline)} 항목 캡처")
    print("=" * 80)
    
    return baseline

if __name__ == "__main__":
    capture_baseline()
