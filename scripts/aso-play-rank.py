#!/usr/bin/env python3
# ============================================================================
# aso-play-rank — 구글 플레이 검색에서 우리 세 앱이 «몇 위에 있는지» 잰다.
# ----------------------------------------------------------------------------
#   python3 scripts/aso-play-rank.py            (표만)
#   python3 scripts/aso-play-rank.py --save     (결과를 이력 파일에 붙인다)
#
# 왜 (2026-09-03):
#   같은 앱이 **앱스토어에서는 「실적 발표 일정」 #1** 인데
#   **플레이에서는 한국어 10개 검색어 전부에서 부재**였다.
#   차이는 이름이었다 — 플레이 목록에는 서학개미·실적발표·시황이 한 글자도 없었다.
#
#   그래서 그날 SIGNUM 만 3개 언어(en/ko/ja) 이름·설명을 고쳐 심사에 넣었고,
#   **UC·WIM 은 일부러 그대로 뒀다.** 두 앱이 대조군이다.
#
#     묻는 것: 「설치가 0에 가까운 앱도 텍스트만으로 플레이 순위가 움직이는가?」
#     읽는 법: 며칠 뒤 이걸 돌려 SIGNUM 만 올라오면 «텍스트가 먹힌다»,
#              셋 다 그대로면 «플레이는 설치·평점 가중치라 텍스트로는 안 된다».
#     그 답에 따라 플레이 ASO 에 더 투자할지가 갈린다.
#
# ⚠️ 검사기부터 의심할 것. 브랜드 질의(대조군)에서 우리가 안 잡히면
#    앱이 아니라 이 스크립트가 고장 난 것이다 — 그래서 항상 같이 잰다.
# ============================================================================
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
OURS = {"com.signumhq.app": "SIGNUM",
        "com.signumhq.undercurrent": "UC",
        "com.signumhq.wim": "WIM"}

# 대조군 — 여기서 우리가 안 잡히면 스크립트가 고장 난 것이다.
CONTROL = [("SIGNUM", "ko", "KR"), ("signumhq", "en", "US")]

TERMS = [
    # (검색어, hl, gl, 누구를 겨냥한 말인가)
    ("실적 발표 일정", "ko", "KR", "SIGNUM"),
    ("실적발표", "ko", "KR", "SIGNUM"),
    ("서학개미", "ko", "KR", "SIGNUM"),
    ("미국증시", "ko", "KR", "SIGNUM"),
    ("프리마켓", "ko", "KR", "SIGNUM"),
    ("애프터마켓", "ko", "KR", "SIGNUM"),
    ("시황", "ko", "KR", "SIGNUM"),
    ("오늘의 증시", "ko", "KR", "SIGNUM"),
    ("증시 캘린더", "ko", "KR", "UC"),
    ("증시뉴스", "ko", "KR", "UC"),
    ("주식 공부", "ko", "KR", "WIM"),
    ("주식 초보", "ko", "KR", "WIM"),
    ("決算", "ja", "JP", "SIGNUM"),
    ("決算 カレンダー", "ja", "JP", "SIGNUM"),
    ("プレマーケット", "ja", "JP", "SIGNUM"),
    ("時間外取引", "ja", "JP", "SIGNUM"),
    ("株 勉強", "ja", "JP", "WIM"),
    ("premarket earnings", "en", "US", "SIGNUM"),
    ("after hours stocks", "en", "US", "SIGNUM"),
    ("earnings calendar", "en", "US", "SIGNUM"),
    ("stock news", "en", "US", "UC"),
    ("stock quiz", "en", "US", "WIM"),
]

HIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_aso-play-rank-history.jsonl")


def rank(q: str, hl: str, gl: str) -> dict:
    u = (f"https://play.google.com/store/search?q={urllib.parse.quote(q)}"
         f"&c=apps&hl={hl}&gl={gl}")
    try:
        h = urllib.request.urlopen(
            urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30
        ).read().decode("utf-8", "ignore")
    except Exception as e:                                     # noqa: BLE001
        return {"err": str(e)}
    seen = []
    for m in re.finditer(r"/store/apps/details\?id=([A-Za-z0-9_.]+)", h):
        if m.group(1) not in seen:
            seen.append(m.group(1))
    return {"n": len(seen),
            "hits": {OURS[p]: i for i, p in enumerate(seen, 1) if p in OURS}}


def main() -> None:
    save = "--save" in sys.argv
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print("대조군 (여기서 우리가 안 잡히면 스크립트를 먼저 의심할 것)")
    healthy = False
    for q, hl, gl in CONTROL:
        r = rank(q, hl, gl)
        hits = r.get("hits") or {}
        if hits:
            healthy = True
        print(f"  {q:12} ({gl}) {r.get('n', '?'):3}개  "
              f"{', '.join(f'{k}=#{v}' for k, v in hits.items()) or '— 없음'}")
        time.sleep(0.5)
    if not healthy:
        sys.exit("\n✗ 대조군에서도 우리가 안 잡힌다 — 앱이 아니라 검사기 문제다. 여기서 멈춘다.")

    print(f"\n{'검색어':<20} {'국가':<4} {'겨냥':<7} {'결과':>5}  우리 순위")
    print("─" * 72)
    rows = []
    for q, hl, gl, who in TERMS:
        r = rank(q, hl, gl)
        hits = r.get("hits") or {}
        mine = ", ".join(f"{k}=#{v}" for k, v in hits.items()) or "— 없음"
        print(f"{q:<20} {gl:<4} {who:<7} {r.get('n', '?'):>5}  {mine}")
        rows.append({"term": q, "gl": gl, "target": who,
                     "results": r.get("n"), "hits": hits})
        time.sleep(0.5)

    found = sum(1 for x in rows if x["hits"])
    print(f"\n{len(rows)}개 중 **{found}개**에서 우리가 잡힌다.")

    if save:
        with open(HIST, "a", encoding="utf-8") as f:
            f.write(json.dumps({"date": day, "found": found, "total": len(rows),
                                "rows": rows}, ensure_ascii=False) + "\n")
        print(f"→ {HIST} 에 기록")
        prev = [json.loads(l) for l in open(HIST, encoding="utf-8")][:-1]
        if prev:
            p = prev[-1]
            print(f"   지난 측정({p['date']}) {p['found']}/{p['total']} → 오늘 {found}/{len(rows)}")


if __name__ == "__main__":
    main()
