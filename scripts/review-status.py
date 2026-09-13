#!/usr/bin/env python3
"""
review-status — «지금 심사가 어디까지 갔나»만 한눈에.
=============================================================================
왜 있나 (2026-09-13): 크롬 창 버그 수정본(iOS 1.9.1 / Android 1.2.2)을 제출한 뒤,
«통과했는지»를 매 사이클 확인해야 한다. release-audit 는 전수검사라 무겁고
느리다. 이건 상태 한 줄만 본다.

사용:  python3 scripts/review-status.py
       python3 scripts/review-status.py --json     (기계가 읽을 형태)
=============================================================================
"""
import sys, os, json, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

APPS = [("SIGNUM", "6783130444", "com.signumhq.app"),
        ("UC",     "6788779895", "com.signumhq.undercurrent"),
        ("WIM",    "6794356135", "com.signumhq.wim")]

# 심사를 통과해 판매 중이면 더 볼 것이 없다.
DONE = {"READY_FOR_SALE", "READY_FOR_DISTRIBUTION"}

def live_appstore(app_id, cc="us"):
    try:
        u = f"https://itunes.apple.com/lookup?id={app_id}&country={cc}"
        with urllib.request.urlopen(u, timeout=20) as r:
            d = json.load(r)
        res = d.get("results") or []
        return res[0].get("version") if res else None
    except Exception:
        return None

rows = []
for tag, aid, bundle in APPS:
    try:
        vs = call("GET", f"/apps/{aid}/appStoreVersions?limit=3"
                         "&fields[appStoreVersions]=versionString,appStoreState,createdDate")
        items = vs.get("data", [])
    except Exception as e:
        rows.append({"app": tag, "error": str(e)[:120]})
        continue
    for it in items[:1]:
        a = it.get("attributes", {})
        rows.append({
            "app": tag,
            "version": a.get("versionString"),
            "state": a.get("appStoreState"),
            "live_us": live_appstore(aid),
            "done": a.get("appStoreState") in DONE,
        })

if "--json" in sys.argv:
    print(json.dumps(rows, ensure_ascii=False))
    sys.exit(0)

print("\n=== 심사 상태 ===\n")
for r in rows:
    if r.get("error"):
        print(f"  {r['app']:7} ✗ {r['error']}"); continue
    mark = "✅ 통과·판매중" if r["done"] else "⏳ 심사중"
    print(f"  {r['app']:7} {r['version']:8} {r['state']:26} {mark}   (스토어 라이브: {r['live_us']})")
print("\n  ※ Play 는 자격증명이 없어 API 로 못 본다 — 콘솔 Publishing overview 를 볼 것.")
print("     https://play.google.com/console/u/0/developers/4769683602295618218/app/4974871698649706116/publishing\n")
