#!/usr/bin/env python3
# ============================================================================
# asc-aso-fix-2026-09-11 — en-US · ko · ja 의 «이름 · 부제 · 키워드» 를
#                          Apple Ads 콘솔 실측에 맞춰 교정한다.
# ----------------------------------------------------------------------------
# 왜 (2026-09-11 실측, 근거는 store-metadata/ASO-FIX-2026-09-11-MEASURED.md):
#   이름 칸이 가중치가 가장 높은데 미국·한국이 인기도 «1» 짜리 단어에 쓰고 있었다.
#     US 이름 Premarket(1) Earnings(1)   ·  KR 이름 서학개미(1) 미국증시(1)
#     JP 이름 米国株(2)  ← 유일하게 맞게 돼 있었다
#   그리고 en-US 지면 어디에도 stock/stocks/stock market/trading/investing 이 없었다
#   (인기도 3짜리 전부 공백). `gamma` 는 AI 프레젠테이션 앱 "Gamma" 를 불러오므로 뺀다.
#
# ⚠️ appInfo 는 앱당 여러 개다(승인된 구버전용 / 심사대상 신버전용).
#    잘못된 쪽을 고치면 «고쳤는데 반영 안 됨» 이 된다 → 편집 가능한 것만 고른다.
#
# 사용:  python3 scripts/asc-aso-fix-2026-09-11.py --dry     (검사만)
#        python3 scripts/asc-aso-fix-2026-09-11.py           (실제 반영)
# ============================================================================
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

APP = "6783130444"   # SIGNUM HQ

# (이름 30 · 부제 30 · 키워드 100) — 글자수는 계산해서 확정했다
FIELDS = {
    "en-US": (
        "SIGNUM HQ: Stock Market AI",
        "Options Trading Flow & Data",
        "stocks,investing,premarket,earnings,after hours,dark pool,unusual,gex,max pain,0dte,nvidia",
    ),
    "ko": (
        "SIGNUM HQ: 미국 주식 투자 앱",
        "서학개미 미국증시 실적·옵션 흐름",
        "주식,주식어플,투자,코스피,미국주식,미장,증시,시황,실적발표일정,기업실적,나스닥,테슬라,주가,무료,실시간,해외주식,종목분석,배당주,오늘의증시,증시캘린더,장마감,옵션,공시,리포트",
    ),
    "ja": (
        "SIGNUM HQ: 米国株リアルタイム決算",          # 변경 없음 — 이미 맞다
        "株価アプリ・プレマーケット・決算速報",
        "株価,株式,株アプリ,米国株,米国株アプリ,決算発表,決算カレンダー,テスラ,エヌビディア,ナスダック,個別株,銘柄,速報,市況,相場,出来高,需給,オプション,時間外取引,経済指標,オルカン",
    ),
}

EDITABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
            "METADATA_REJECTED", "INVALID_BINARY", "WAITING_FOR_REVIEW"}


def check() -> bool:
    ok = True
    print("길이 검사 (이름 30 · 부제 30 · 키워드 100)")
    for loc, (n, s, k) in FIELDS.items():
        for label, val, lim in (("이름", n, 30), ("부제", s, 30), ("키워드", k, 100)):
            bad = len(val) > lim
            ok = ok and not bad
            print(f"  {loc:6} {label:4} {len(val):3}/{lim} {'✗ 초과' if bad else '✓'}  {val[:46]}")
    # 납치된 단어가 다시 들어가지 않게 고정 검사
    for loc, (n, s, k) in FIELDS.items():
        pool = f"{n} {s} {k}".lower()
        for banned in ("gamma", "watchlist"):
            if loc == "en-US" and banned in pool:
                print(f"  ✗ {loc} 에 금지어 '{banned}' 가 들어 있다")
                ok = False
    return ok


def main() -> None:
    dry = "--dry" in sys.argv
    if not check():
        sys.exit("✗ 한도/금지어 위반 — 반영하지 않는다")

    # ---- 편집 가능한 버전 찾기 -------------------------------------------
    vers = call("GET", f"/apps/{APP}/appStoreVersions?limit=10")["data"]
    ver = next((v for v in vers if v["attributes"]["appStoreState"] in EDITABLE), None)
    print("\n버전 상태:", ", ".join(f'{v["attributes"]["versionString"]}({v["attributes"]["appStoreState"]})' for v in vers[:5]))
    if not ver:
        sys.exit("✗ 편집 가능한 버전이 없다 — 먼저 새 버전(1.9)을 만들어야 한다")
    vid = ver["id"]; vstr = ver["attributes"]["versionString"]
    print(f"→ 편집 대상 버전: {vstr} ({ver['attributes']['appStoreState']})")

    # ---- 편집 가능한 appInfo 찾기 (앱당 여러 개다) -----------------------
    infos = call("GET", f"/apps/{APP}/appInfos?limit=10")["data"]
    print("appInfo 상태:", ", ".join(f'{i["id"][:8]}({i["attributes"].get("appStoreState")})' for i in infos))
    info = next((i for i in infos if i["attributes"].get("appStoreState") in EDITABLE), None)
    if not info:
        sys.exit("✗ 편집 가능한 appInfo 가 없다")
    print(f"→ 편집 대상 appInfo: {info['id']} ({info['attributes'].get('appStoreState')})")

    if dry:
        print("\n(--dry: 여기까지. 실제 반영 안 함)")
        return

    # ---- 이름·부제 (appInfoLocalizations) --------------------------------
    have_info = {l["attributes"]["locale"]: l["id"]
                 for l in call("GET", f"/appInfos/{info['id']}/appInfoLocalizations?limit=50")["data"]}
    for loc, (name, sub, _kw) in FIELDS.items():
        if loc not in have_info:
            print(f"  ⚠️ {loc}: appInfoLocalization 없음 — 건너뜀"); continue
        call("PATCH", f"/appInfoLocalizations/{have_info[loc]}",
             {"data": {"type": "appInfoLocalizations", "id": have_info[loc],
                       "attributes": {"name": name, "subtitle": sub}}})
        print(f"  ✓ {loc} 이름·부제 반영")

    # ---- 키워드 (appStoreVersionLocalizations) ---------------------------
    have_ver = {l["attributes"]["locale"]: l["id"]
                for l in call("GET", f"/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50")["data"]}
    for loc, (_n, _s, kw) in FIELDS.items():
        if loc not in have_ver:
            print(f"  ⚠️ {loc}: versionLocalization 없음 — 건너뜀"); continue
        call("PATCH", f"/appStoreVersionLocalizations/{have_ver[loc]}",
             {"data": {"type": "appStoreVersionLocalizations", "id": have_ver[loc],
                       "attributes": {"keywords": kw}}})
        print(f"  ✓ {loc} 키워드 반영")

    # ---- 되읽어 검증 ------------------------------------------------------
    print("\n되읽기 검증")
    for loc in FIELDS:
        if loc in have_info:
            a = call("GET", f"/appInfoLocalizations/{have_info[loc]}")["data"]["attributes"]
            print(f"  {loc:6} 이름 «{a.get('name')}»  부제 «{a.get('subtitle')}»")
        if loc in have_ver:
            a = call("GET", f"/appStoreVersionLocalizations/{have_ver[loc]}")["data"]["attributes"]
            kw = a.get("keywords") or ""
            print(f"  {loc:6} 키워드({len(kw)}/100) {kw[:70]}…")


if __name__ == "__main__":
    main()
