#!/usr/bin/env python3
# ============================================================================
# release-audit — 「출시가 정말 나갔는가」를 스토어에게 직접 묻는다.
# ----------------------------------------------------------------------------
# 왜 만들었나 (2026-09-02 대표 지적: 「일을 하다 말고 다 한 것처럼 하면 어떻게
# 믿냐」):
#   ASO 이름·부제·키워드를 새 버전에 다 채워놓고 **빌드를 안 올려서** UC 1.0.4 ·
#   WIM 1.0.2 가 하루 동안 `PREPARE_FOR_SUBMISSION` 에 멈춰 있었다.
#   에러도 경고도 없었다. 나는 「내가 그 단계를 실행했다」를 「완료」로 보고했다.
#
#   이 스크립트의 목적은 하나다 — **완료 여부를 내 기억이 아니라 스토어가
#   대답하게 만든다.** 하나라도 걸리면 exit 1 이다.
#
# 사용:  python3 scripts/release-audit.py
#        python3 scripts/release-audit.py --json   (기계용)
#
# ⚠️ 플레이는 서비스 계정이 없어 API 로 못 본다. 그래서 «모른다»를 «괜찮다»로
#    바꾸지 않고, 확인해야 할 URL 을 찍고 **WARN 으로 남긴다**(조용히 통과 금지).
# ============================================================================
import html, json, os, re, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

APPS = [
    ("SIGNUM", "6783130444", "4974871698649706116", "com.signumhq.app"),
    ("UC",     "6788779895", "4976096296089482490", "com.signumhq.undercurrent"),
    ("WIM",    "6794356135", "4974011153222225088", "com.signumhq.wim"),
]
PLAY_DEV = "4769683602295618218"
LOCALES = {"en-US", "ko", "ja"}
# 앱스토어 로케일 → 라이브 확인용 스토어 국가
STORE_CC = {"ko": "kr", "ja": "jp", "en-US": "us"}
# 플레이는 «의도»를 읽을 API 가 없다. 그래서 여기에 적는다.
# 플레이 이름을 바꾸면 여기도 바꾼다 — 안 바꾸면 이 검사기가 잡는다(그게 목적이다).
PLAY_EXPECTED = {
    # 2026-09-03 변경: 플레이 이름이 UC 와 같은 자리(«AI Stock News»)를 노리고 있었고
    # 앱스토어 이름과도 어긋났다. 한국 플레이 검색 10개 전부에서 부재였던 원인이다.
    # 앱스토어 이름(실적 발표 일정 #1)에 통일했다. 정본=.agent/marketing/ASO-PLAN.md
    "com.signumhq.app": {
        "ko": "SIGNUM HQ: 서학개미 미국증시 실적",
        "ja": "SIGNUM HQ: 米国株リアルタイム決算",
        "en": "SIGNUM HQ: Premarket Earnings"},
    "com.signumhq.undercurrent": {
        "ko": "언더커런트: AI 주식 뉴스 캘린더",
        "ja": "アンダーカレント: AI 株式ニュース",
        "en": "Undercurrent: AI Stock News"},
    "com.signumhq.wim": {
        "ko": "Why'd It Move? AI 주식 퀴즈 공부",
        "ja": "Why'd It Move? AI 株クイズ 勉強",
        "en": "Why'd It Move? AI Stock Quiz"},
}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126 Safari/537.36")


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def live_appstore(app_id: str, cc: str):
    """앱스토어에 «지금 보이는» 이름과 버전. 공개 lookup API — 인증 불필요."""
    try:
        d = json.loads(_get(f"https://itunes.apple.com/lookup?id={app_id}&country={cc}"))
        r = d.get("results") or []
        return (r[0].get("trackName"), r[0].get("version")) if r else (None, None)
    except Exception as e:
        return (f"__ERR__{e}", None)


def live_play(pkg: str, hl: str):
    """플레이 스토어 페이지에 «지금 보이는» 이름. og:title 이 유일하게 안정적이다."""
    try:
        h = _get(f"https://play.google.com/store/apps/details?id={pkg}&hl={hl}&gl=US")
        m = re.search(r'property="og:title" content="([^"]*)"', h)
        if not m:
            return None
        t = html.unescape(m.group(1))
        return re.sub(r"\s*[-–]\s*(Google Play|Apps on Google Play).*$", "", t).strip()
    except Exception as e:
        return f"__ERR__{e}"

# 「사람 손이 더 필요 없다」는 뜻의 상태들.
SETTLED = {"READY_FOR_SALE", "WAITING_FOR_REVIEW", "IN_REVIEW",
           "PENDING_DEVELOPER_RELEASE", "PROCESSING_FOR_APP_STORE",
           "PENDING_APPLE_RELEASE", "REPLACED_WITH_NEW_VERSION"}
# 「멈춰 있다」 — 전부 조용히 실패하는 상태다.
STUCK = {"PREPARE_FOR_SUBMISSION": "빌드/제출이 안 됐다",
         "DEVELOPER_REJECTED": "내가 취소해놓고 다시 안 냈다",
         "REJECTED": "반려됐다",
         "METADATA_REJECTED": "메타데이터 반려",
         "INVALID_BINARY": "바이너리 무효",
         "DEVELOPER_REMOVED_FROM_SALE": "판매 중지됨"}

problems: list[tuple[str, str, str]] = []   # (심각도, 어디, 무엇)


def bad(where: str, what: str):
    problems.append(("FAIL", where, what))


def warn(where: str, what: str):
    problems.append(("WARN", where, what))


def audit_app(tag: str, aid: str) -> bool:
    """돌려주는 값 = «지금 심사에 나가 있는 버전이 있는가».
    라이브 이름이 아직 옛것이어도 «나가는 중»이면 실패가 아니다."""
    versions = call("GET", f"/apps/{aid}/appStoreVersions?limit=10").get("data", [])
    if not versions:
        bad(tag, "버전을 하나도 못 읽었다 (API 키/권한 확인)")
        return False

    newest = versions[0]
    vid, va = newest["id"], newest["attributes"]
    vs, state = va["versionString"], va["appStoreState"]
    print(f"\n■ {tag}  iOS {vs} → {state}")

    if state in STUCK:
        bad(f"{tag} {vs}", f"{state} — {STUCK[state]}")
    elif state not in SETTLED:
        warn(f"{tag} {vs}", f"모르는 상태 {state}")

    live = state == "READY_FOR_SALE"

    # ---- 빌드 ---------------------------------------------------------------
    # 이름·부제·키워드는 «새 빌드»가 붙어야 나간다. data:null 이면 절대 안 나간다.
    b = call("GET", f"/appStoreVersions/{vid}/build")
    build = b.get("data") if "__error__" not in b else None
    if build:
        print(f"    빌드 {build['attributes'].get('version')}")
    else:
        bad(f"{tag} {vs}", "빌드가 안 붙어 있다 — 이 상태로는 절대 제출되지 않는다")

    # ---- 버전 로케일 ---------------------------------------------------------
    locs = call("GET", f"/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=20").get("data", [])
    seen = set()
    for L in locs:
        a = L["attributes"]
        loc = a["locale"]
        seen.add(loc)
        if loc not in LOCALES:
            continue
        kw = a.get("keywords") or ""
        if not kw.strip():
            bad(f"{tag} {vs} {loc}", "키워드가 비었다")
        elif len(kw) > 100:
            bad(f"{tag} {vs} {loc}", f"키워드 {len(kw)}자 — 100자 초과")
        if not (a.get("description") or "").strip():
            bad(f"{tag} {vs} {loc}", "설명이 비었다")
        # 새로운 기능은 «라이브가 아닌» 버전에서만 필수다(첫 버전 제외).
        if not live and len(versions) > 1 and not (a.get("whatsNew") or "").strip():
            bad(f"{tag} {vs} {loc}", "새로운 기능이 비었다 — 제출이 막힌다")
        print(f"    {loc:6s} kw {len(kw):3d}자  설명 {len(a.get('description') or ''):4d}자")
    for missing in LOCALES - seen:
        bad(f"{tag} {vs}", f"로케일 {missing} 이 없다")

    # ---- 이름·부제 (appInfo) --------------------------------------------------
    # appInfo 는 앱당 여러 개다. 편집 대상은 READY_FOR_SALE 이 아닌 쪽이다.
    for info in call("GET", f"/apps/{aid}/appInfos?limit=10").get("data", []):
        st = info["attributes"].get("appStoreState")
        if st == "READY_FOR_SALE":
            continue
        ilocs = call("GET", f"/appInfos/{info['id']}/appInfoLocalizations?limit=20").get("data", [])
        iseen = set()
        for L in ilocs:
            a = L["attributes"]
            iseen.add(a["locale"])
            if a["locale"] not in LOCALES:
                continue
            if not (a.get("name") or "").strip():
                bad(f"{tag} appInfo {a['locale']}", "이름이 비었다")
            print(f"    이름 {a['locale']:6s} {a.get('name')}")
        for missing in LOCALES - iseen:
            bad(f"{tag} appInfo", f"로케일 {missing} 이 없다")

    # ---- 구독·인앱 -----------------------------------------------------------
    # READY_TO_SUBMIT 은 «준비만 됐다» = 안 나갔다는 뜻이다. 통과시키면 안 된다.
    for g in call("GET", f"/apps/{aid}/subscriptionGroups?limit=10").get("data", []):
        for s in call("GET", f"/subscriptionGroups/{g['id']}/subscriptions?limit=10").get("data", []):
            a = s["attributes"]
            st = a.get("state")
            print(f"    구독 {a.get('productId')} → {st}")
            if st in ("MISSING_METADATA", "DEVELOPER_ACTION_NEEDED", "REJECTED"):
                bad(f"{tag} {a.get('productId')}", f"{st} — 손이 더 필요하다")
            elif st == "READY_TO_SUBMIT":
                bad(f"{tag} {a.get('productId')}",
                    "READY_TO_SUBMIT — 준비만 되고 «제출은 안 됐다»")

    # ---- 안 보낸 심사 묶음 -----------------------------------------------------
    # 만들어놓고 submitted 를 안 누른 초안이 가장 조용한 실패다.
    # 단, «항목 0개» 초안은 아무것도 못 숨긴다 — 실패가 아니라 잔여물이다.
    # (ASC 는 빈 초안을 취소도 삭제도 못 하게 한다: 409 "not in cancellable state",
    #  reviewSubmissions 에 DELETE 없음. 그래서 지울 방법 자체가 없다.)
    for rs in call("GET", f"/apps/{aid}/reviewSubmissions?limit=10").get("data", []):
        st = rs["attributes"].get("state")
        if st not in ("READY_FOR_REVIEW", "UNRESOLVED_ISSUES"):
            continue
        n = len(call("GET", f"/reviewSubmissions/{rs['id']}/items?limit=10").get("data", []))
        if n:
            bad(f"{tag} 심사묶음 {rs['id'][:8]}",
                f"{st} · 항목 {n}개 — 만들어놓고 제출을 «안 눌렀다»")
        else:
            warn(f"{tag} 심사묶음 {rs['id'][:8]}",
                 "빈 초안 잔여물 (항목 0개 — 숨기는 것 없음, API 로 삭제 불가)")

    return state in ("WAITING_FOR_REVIEW", "IN_REVIEW",
                     "PENDING_DEVELOPER_RELEASE", "PROCESSING_FOR_APP_STORE",
                     "PENDING_APPLE_RELEASE")


def audit_live(tag: str, aid: str, pkg: str, in_flight: bool):
    """★ 이 검사가 핵심이다 — «사용자가 실제로 보는 화면»을 스토어에 직접 묻는다.
    콘솔이 뭐라 하든, 라이브에 안 떠 있으면 안 나간 것이다."""
    print(f"\n■ {tag} 라이브 스토어")

    # 의도 = ASC 의 편집중 appInfo(라이브가 아닌 쪽). 이게 나가야 할 이름이다.
    want = {}
    for info in call("GET", f"/apps/{aid}/appInfos?limit=10").get("data", []):
        if info["attributes"].get("appStoreState") == "READY_FOR_SALE":
            continue
        for L in call("GET", f"/appInfos/{info['id']}/appInfoLocalizations?limit=20").get("data", []):
            a = L["attributes"]
            if a["locale"] in LOCALES:
                want[a["locale"]] = (a.get("name") or "").strip()

    for loc, cc in STORE_CC.items():
        exp = want.get(loc)
        got, ver = live_appstore(aid, cc)
        if isinstance(got, str) and got.startswith("__ERR__"):
            warn(f"{tag} AppStore {cc}", f"조회 실패 {got[7:][:60]}")
            continue
        if got is None:
            bad(f"{tag} AppStore {cc}", "스토어에서 앱을 못 찾았다")
            continue
        # exp 가 없으면 «틀렸다»가 아니라 «비교 기준을 못 읽었다»다.
        # ✗ 로 찍으면 멀쩡한 앱을 쫓게 된다 — 실제로 UC·WIM 이 그렇게 보였다.
        if not exp:
            mark = "–"
        elif got == exp:
            mark = "✓"
        else:
            mark = "…" if in_flight else "✗"
        print(f"    AppStore {cc}  v{ver:<7s} {mark} {got}")
        if exp and got != exp:
            if in_flight:
                pass  # 심사 중이면 아직 안 바뀐 게 정상이다
            else:
                bad(f"{tag} AppStore {cc}",
                    f"의도한 이름이 라이브에 없는데 «나가는 중인 버전도 없다» "
                    f"— 원함 {exp!r} / 실제 {got!r}")

    for hl, exp in PLAY_EXPECTED.get(pkg, {}).items():
        got = live_play(pkg, hl)
        if isinstance(got, str) and got.startswith("__ERR__"):
            warn(f"{tag} Play {hl}", f"조회 실패 {got[7:][:60]}")
            continue
        if got is None:
            warn(f"{tag} Play {hl}", "og:title 을 못 읽었다 (페이지 구조 변경?)")
            continue
        ok = got == exp
        print(f"    Play     {hl}           {'✓' if ok else '✗'} {got}")
        if not ok:
            bad(f"{tag} Play {hl}",
                f"라이브 이름이 의도와 다르다 — 원함 {exp!r} / 실제 {got!r}")


def main():
    as_json = "--json" in sys.argv
    for tag, aid, pid, pkg in APPS:
        in_flight = audit_app(tag, aid)
        audit_live(tag, aid, pkg, in_flight)

    print("\n■ 플레이 콘솔 — 미제출 변경분은 API 로 못 본다(자격증명 없음)")
    for tag, _aid, pid, _pkg in APPS:
        url = f"https://play.google.com/console/u/0/developers/{PLAY_DEV}/app/{pid}/publishing"
        warn(f"{tag} Play 콘솔", f"«Changes not yet submitted» 0 인지 눈으로: {url}")

    fails = [p for p in problems if p[0] == "FAIL"]
    warns = [p for p in problems if p[0] == "WARN"]

    print("\n" + "=" * 68)
    if fails:
        print(f"✗ 미완 {len(fails)}건")
        for _, where, what in fails:
            print(f"   ✗ {where}: {what}")
    else:
        print("✓ 앱스토어: 멈춰 있는 것 없음")
    for _, where, what in warns:
        print(f"   ! {where}: {what}")
    print("=" * 68)

    if as_json:
        print(json.dumps([{"level": l, "where": w, "what": t} for l, w, t in problems],
                         ensure_ascii=False, indent=2))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
