#!/usr/bin/env python3
# ============================================================================
# asc-apply-next-keywords — 다음 빌드에 «준비해 둔 키워드»를 실제로 밀어 넣는다.
# ----------------------------------------------------------------------------
# 왜 스크립트로 만드는가:
#   `keywords` 는 **빌드 게이트**다. 2026-09-21 실측 — 라이브(READY_FOR_SALE) 버전에
#   같은 값을 그대로 PATCH 해도 **409 STATE_ERROR**. (`promotionalText` 는 200 으로 통과한다.
#   `whatsNew` 도 409. ENGINE §store-fields-split-by-gate 에 셋 다 기록.)
#   그래서 지금 쓸 수 없고 «다음 제출»까지 기다려야 하는데, 이 저장소에는
#   **「7/10 준비 → 7/29 제출 때 전달 안 돼 한국어 키워드가 45/100 로 방치」** 라는 사고가 있다.
#   사람 기억에 맡기지 않는다 — 준비값을 파일에 두고, 이 스크립트가 밀어 넣는다.
#
# 입력: store-metadata/NEXT-BUILD-keywords.json  (키 = "<app>/<locale>")
# 사용: python3 scripts/asc-apply-next-keywords.py          미리보기(쓰지 않음)
#       python3 scripts/asc-apply-next-keywords.py --live   실제 반영
#
# 편집 가능한 상태(PREPARE_FOR_SUBMISSION 등)의 버전에만 쓴다. 라이브뿐이면
# 「아직 빌드 게이트」라고 알려 주고 아무것도 하지 않는다 — 실패가 아니라 대기다.
# ============================================================================
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_client as A

LIMIT = 100
APPS = {"signum": "6783130444", "undercurrent": "6788779895", "wim": "6794356135"}
# 키워드를 «쓸 수 있는» 상태. READY_FOR_SALE 은 여기 없다(409 로 확인됨).
EDITABLE = ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
            "METADATA_REJECTED", "INVALID_BINARY")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN_PATH = os.path.join(ROOT, "store-metadata", "NEXT-BUILD-keywords.json")

live = "--live" in sys.argv
plan = json.load(open(PLAN_PATH, encoding="utf-8"))

by_app = {}
for key, v in plan.items():
    app, lc = key.split("/")
    by_app.setdefault(app, {})[lc] = v["keywords"]

wrote = waiting = failed = skipped = 0
for app, locmap in by_app.items():
    app_id = APPS.get(app)
    if not app_id:
        print(f"✗ {app}: 알 수 없는 앱"); failed += 1; continue

    vs = A.call("GET", f"/apps/{app_id}/appStoreVersions?limit=10")
    if "__error__" in vs:
        print(f"✗ {app}: 버전 조회 실패 {vs['__error__']}"); failed += 1; continue

    ver = None
    for v in vs.get("data", []):
        st = v["attributes"].get("appStoreState") or v["attributes"].get("state")
        if st in EDITABLE:
            ver = v; break
    if not ver:
        states = [(v["attributes"].get("appStoreState") or v["attributes"].get("state"))
                  for v in vs.get("data", [])][:3]
        print(f"⏸ {app}: 편집 가능한 버전 없음 (현재 {states}) — 빌드 게이트, 다음 제출 때 다시 실행")
        waiting += 1
        continue

    print(f"\n■ {app} v{ver['attributes'].get('versionString')} "
          f"[{ver['attributes'].get('appStoreState') or ver['attributes'].get('state')}]")
    locs = A.call("GET", f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations?limit=50")
    for lo in locs.get("data", []):
        lc = lo["attributes"]["locale"]
        new = locmap.get(lc)
        if new is None:
            continue
        old = lo["attributes"].get("keywords") or ""
        if old == new:
            print(f"   {lc:8} 그대로"); skipped += 1; continue
        if len(new) > LIMIT:
            print(f"   {lc:8} ‼{len(new)}/{LIMIT} 초과 — 건너뜀"); failed += 1; continue
        print(f"   {lc:8} {len(old)} → {len(new)}/{LIMIT}")
        if not live:
            continue
        r = A.call("PATCH", f"/appStoreVersionLocalizations/{lo['id']}",
                   {"data": {"type": "appStoreVersionLocalizations", "id": lo["id"],
                             "attributes": {"keywords": new}}})
        if "__error__" in r:
            print(f"      ✗ {r['__error__']} {str(r.get('body'))[:160]}"); failed += 1
        else:
            wrote += 1

print(f"\n{'반영' if live else '미리보기'} — 쓴 칸 {wrote} · 동일 {skipped} · 대기 {waiting} · 실패 {failed}")
# 대기는 «정상»이다(아직 빌드 전). 실패만 종료코드로 올린다.
sys.exit(1 if failed else 0)
