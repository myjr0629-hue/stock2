#!/usr/bin/env python3
# ============================================================================
# asc_submit_version — 버전 하나를 심사에 넣고, 막히면 «진짜 이유»를 말한다.
# ----------------------------------------------------------------------------
# 왜 별도로 두나 (2026-09-03):
#   제출이 막힐 때 애플이 주는 겉면은 늘 똑같다 —
#     409 STATE_ERROR.ENTITY_STATE_INVALID
#     "This resource cannot be reviewed, please check associated errors to see why."
#   진짜 이유는 `errors[].meta.associatedErrors` 안에 있는데, 기본 클라이언트가
#   본문을 900자에서 자르는 바람에 **그 부분이 통째로 잘려** 원인을 못 봤다.
#   실제로 오늘 두 번 헤맸다(원인은 privacyPolicyUrl·supportUrl 누락이었다).
#
#   ⚠️ 스토어 언어를 늘리면 로케일마다 다음이 **전부** 있어야 제출이 된다:
#        appInfoLocalization       → name · subtitle · privacyPolicyUrl
#        appStoreVersionLocalization → description · keywords · whatsNew · supportUrl
#        appScreenshotSet            → 최소 1세트(APP_IPHONE_65) 5장
#      하나라도 비면 **버전 전체**가 막히고, 어느 로케일인지는 안 알려준다.
#
# 사용: python3 scripts/asc_submit_version.py <appId> <versionString>
# ============================================================================
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import BASE, call, token


def raw(method: str, path: str, body=None):
    """에러 본문을 자르지 않고 그대로 돌려준다."""
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            b = r.read()
            return True, (json.loads(b) if b else {})
    except urllib.error.HTTPError as e:
        return False, json.loads(e.read().decode())


def explain(err_json) -> None:
    for err in err_json.get("errors", []):
        print(f"  ✗ {err.get('code')} — {err.get('detail')}")
        ae = (err.get("meta") or {}).get("associatedErrors") or {}
        seen = set()
        for path, items in ae.items():
            for it in items:
                line = f"     · {path}: {it.get('detail')}"
                if line not in seen:
                    seen.add(line)
                    print(line)


def main() -> None:
    app, version = sys.argv[1], sys.argv[2]
    vid = next((v["id"] for v in call("GET", f"/apps/{app}/appStoreVersions?limit=10")["data"]
                if v["attributes"]["versionString"] == version), None)
    if not vid:
        sys.exit(f"✗ 버전 {version} 없음")

    # 열려 있는 제출묶음을 재사용한다 — 앱당 하나만 열 수 있다.
    subs = [s for s in call("GET", f"/apps/{app}/reviewSubmissions?limit=10").get("data", [])
            if not s["attributes"].get("submitted")]
    if subs:
        sub = subs[0]["id"]
        print(f"  기존 제출묶음 재사용 {sub}")
    else:
        ok, r = raw("POST", "/reviewSubmissions", {"data": {
            "type": "reviewSubmissions", "attributes": {"platform": "IOS"},
            "relationships": {"app": {"data": {"type": "apps", "id": app}}}}})
        if not ok:
            explain(r)
            sys.exit(1)
        sub = r["data"]["id"]
        print(f"  제출묶음 생성 {sub}")

    time.sleep(2)
    have = [i for i in call("GET", f"/reviewSubmissions/{sub}/items").get("data", [])]
    if not have:
        ok, r = raw("POST", "/reviewSubmissionItems", {"data": {
            "type": "reviewSubmissionItems",
            "relationships": {
                "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub}},
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": vid}}}}})
        if not ok:
            explain(r)
            sys.exit(1)
        print("  ✓ 항목 추가")

    time.sleep(2)
    ok, r = raw("PATCH", f"/reviewSubmissions/{sub}", {"data": {
        "type": "reviewSubmissions", "id": sub, "attributes": {"submitted": True}}})
    if not ok:
        explain(r)
        sys.exit(1)
    print("  ✅ 제출 완료 →", r["data"]["attributes"].get("state"))


if __name__ == "__main__":
    main()
