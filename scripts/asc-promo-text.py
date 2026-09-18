#!/usr/bin/env python3
# ============================================================================
# asc-promo-text — App Store 제품 페이지 «최상단 170자»(promotionalText)를 쓴다.
# ----------------------------------------------------------------------------
# 왜 이 자리인가 (ENGINE §35): 빌드도 심사도 필요 없이 즉시 반영되는 유일한 카피 자리다.
# 무엇을 쓰는가 (ENGINE §42, 대표 지시 2026-09-19):
#   「내용은 내용이고 광고는 가치를 설명하는 것」 — 스토어는 «광고 자리»이므로
#   ③가치 설명(다른 곳 얼마 → 우리는 무료)이 «첫 줄»에 온다.
# 규칙: 경쟁 서비스 «이름»은 스토어 메타데이터에 쓰지 않는다(심사 리스크). 시장가만 적는다.
# 사용: python3 scripts/asc-promo-text.py          (미리보기)
#       python3 scripts/asc-promo-text.py --live   (실제 반영)
# ============================================================================
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_client as A

LIMIT = 170
APPS = {"6783130444": "signum", "6788779895": "undercurrent", "6794356135": "wim"}

COPY = {
 "signum": {
  "ko": "옵션 흐름과 다크풀 체결 비중은 미국에서 월 50~99달러에 파는 자료입니다. 여기서는 무료입니다. 가입도 카드도 없습니다. 프리마켓·애프터마켓 시세는 어느 세션 기준인지까지 표시합니다.",
  "ja": "オプションフローとダークプール比率は米国では月50〜99ドルで売られている情報です。ここでは無料、登録もカードも不要。プリマーケットと時間外の株価は「どのセッション基準か」まで表示します。",
  "en": "Options flow and dark pool share sell for $50-99/month in the US. Free here - no signup, no card. Premarket and after-hours prices show which session they came from.",
 },
 "undercurrent": {
  "ko": "뉴스가 나온 그 시각에 돈이 어디로 움직였는지. 다크풀 체결 비중은 미국에서 월 99달러부터 파는 자료입니다. 여기서는 무료, 가입 없음. AI가 미국 증시 뉴스를 쉬운 말로 풀어 줍니다.",
  "ja": "ニュースが出たその瞬間にお金がどこへ動いたか。ダークプール比率は米国では月99ドルから売られる情報です。ここでは無料・登録不要。AIが米国株ニュースをやさしい言葉で解説します。",
  "en": "Where the money actually moved when the headline hit. Dark pool share starts at $99/month in the US - free here, no signup. AI reads every US headline in plain language.",
 },
 "wim": {
  "ko": "매일 실제로 움직인 종목 하나, 이유 네 개, 정답 하나. 실제 시장 데이터로 만든 문제를 무료로 풉니다. 가입 없음. 읽는 대신 맞혀 보며 왜 움직였는지를 익힙니다.",
  "ja": "毎日、実際に動いた銘柄ひとつ。理由は四つ、答えは一つ。実際の市場データから作った問題を無料で。登録不要。読むのではなく当てながら「なぜ動いたか」を学べます。",
  "en": "One real stock move a day, four reasons, one answer. Built from real market data, free, no signup. Learn why the market moved by guessing instead of reading.",
 },
}

def text_for(app, locale):
    t = COPY[app]
    if locale.startswith("ko"): return t["ko"]
    if locale.startswith("ja"): return t["ja"]
    return t["en"]

live = "--live" in sys.argv
wrote = skipped = failed = 0
for app_id, name in APPS.items():
    vs = A.call("GET", f"/apps/{app_id}/appStoreVersions?limit=5")
    if "__error__" in vs:
        print(f"✗ {name}: 버전 조회 실패 {vs['__error__']}"); failed += 1; continue
    ver = None
    for v in vs.get("data", []):
        st = v["attributes"].get("appStoreState") or v["attributes"].get("state")
        if st in ("READY_FOR_SALE", "READY_FOR_DISTRIBUTION", "PREPARE_FOR_SUBMISSION",
                  "PENDING_DEVELOPER_RELEASE", "WAITING_FOR_REVIEW", "IN_REVIEW"):
            ver = v; break
    if not ver:
        print(f"✗ {name}: 편집 가능한 버전 없음"); failed += 1; continue
    st = ver["attributes"].get("appStoreState") or ver["attributes"].get("state")
    print(f"\n■ {name}  v{ver['attributes'].get('versionString')}  [{st}]")
    locs = A.call("GET", f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations?limit=50")
    for loc in locs.get("data", []):
        lc = loc["attributes"]["locale"]
        new = text_for(name, lc)
        old = loc["attributes"].get("promotionalText") or ""
        n = len(new)
        flag = "‼초과" if n > LIMIT else ""
        if old == new:
            print(f"   {lc:8} {n:3}자 = 그대로"); skipped += 1; continue
        print(f"   {lc:8} {n:3}자 {flag} | {new[:58]}…")
        if n > LIMIT: failed += 1; continue
        if live:
            r = A.call("PATCH", f"/appStoreVersionLocalizations/{loc['id']}",
                       {"data": {"type": "appStoreVersionLocalizations", "id": loc["id"],
                                 "attributes": {"promotionalText": new}}})
            if "__error__" in r:
                print(f"      ✗ {r['__error__']} {r['body'][:160]}"); failed += 1
            else:
                wrote += 1
print(f"\n{'반영' if live else '미리보기'} — 쓴 칸 {wrote} · 동일 {skipped} · 실패 {failed}")
sys.exit(1 if failed else 0)
