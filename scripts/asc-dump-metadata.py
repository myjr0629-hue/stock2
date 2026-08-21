#!/usr/bin/env python3
# ============================================================================
# asc-dump-metadata — App Store Connect 의 «현재» 스토어 메타데이터를 전량 덤프한다.
# ----------------------------------------------------------------------------
# 왜 필요한가 (2026-08-20 조사):
#   ASO 병목이 «이름 필드»라는 건 이미 실측으로 확인됐다(3앱 평점 0 + KR 검색 미노출).
#   그런데 지금 무엇이 들어가 있는지가 어디에도 기록돼 있지 않아, 고치려 해도
#   «무엇을 고치는지»를 말할 수 없었다. 먼저 현재 상태를 파일로 고정한다.
#
#   메모리 «ASO 키워드는 제출 시점에 붙여넣기까지가 일» 사고(7/10 준비 → 7/29 제출 때
#   전달 안 돼 한국어 키워드가 45/100자로 방치됨)의 재발 방지책이기도 하다.
#   파일로 버전관리되면 «준비했는데 안 들어갔다»가 성립하지 않는다.
#
# 키: ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8  (내용은 열지 않는다)
# 사용: python3 scripts/asc-dump-metadata.py
# ============================================================================
import json
import os
import sys
import time
import urllib.request
import urllib.error

KEY_ID = os.environ.get("ASC_KEY_ID", "2LD2B7366M")
ISSUER_ID = os.environ.get("ASC_ISSUER_ID", "ede31c44-c5ac-437b-ab19-ad5d581ef6f9")
KEY_PATH = os.path.expanduser(f"~/.appstoreconnect/private_keys/AuthKey_{KEY_ID}.p8")
BASE = "https://api.appstoreconnect.apple.com/v1"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "store-metadata")

APPS = {
    "6783130444": "signum",
    "6788779895": "undercurrent",
    "6794356135": "wim",
}


def token() -> str:
    import jwt  # PyJWT
    with open(KEY_PATH, "r") as f:
        private_key = f.read()
    now = int(time.time())
    payload = {"iss": ISSUER_ID, "iat": now, "exp": now + 19 * 60, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"})


def get(path: str, tok: str):
    url = path if path.startswith("http") else f"{BASE}{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:400], "_path": path}


def main() -> int:
    if not os.path.exists(KEY_PATH):
        print(f"✗ 키 파일 없음: {KEY_PATH}")
        return 1
    tok = token()
    os.makedirs(OUT_DIR, exist_ok=True)

    apps = get("/apps?limit=200", tok)
    if "_error" in apps:
        print(f"✗ /apps 실패: {apps['_error']} {apps['_body']}")
        return 1
    print(f"계정의 앱 {len(apps.get('data', []))}개\n")

    summary = []
    for app in apps.get("data", []):
        aid = app["id"]
        slug = APPS.get(aid)
        attrs = app.get("attributes", {})
        if not slug:
            print(f"  (건너뜀) {attrs.get('name')} — 우리 3앱 아님 (id {aid})")
            continue

        record = {
            "appId": aid,
            "slug": slug,
            "bundleId": attrs.get("bundleId"),
            "name": attrs.get("name"),
            "primaryLocale": attrs.get("primaryLocale"),
            "contentRightsDeclaration": attrs.get("contentRightsDeclaration"),
            "localizations": {},
            "versionLocalizations": {},
        }

        # 앱 레벨 현지화 — 이름 / 부제 / 개인정보정책 URL
        loc = get(f"/apps/{aid}/appInfos", tok)
        for info in loc.get("data", []) or []:
            iid = info["id"]
            ils = get(f"/appInfos/{iid}/appInfoLocalizations?limit=50", tok)
            for il in ils.get("data", []) or []:
                a = il.get("attributes", {})
                lc = a.get("locale")
                if not lc:
                    continue
                record["localizations"][lc] = {
                    "name": a.get("name"),
                    "subtitle": a.get("subtitle"),
                    "privacyPolicyUrl": a.get("privacyPolicyUrl"),
                }

        # 버전 레벨 현지화 — 설명 / 키워드 / 프로모션 텍스트 / whatsNew
        vers = get(f"/apps/{aid}/appStoreVersions?limit=3", tok)
        for v in vers.get("data", []) or []:
            vid = v["id"]
            vattrs = v.get("attributes", {})
            vls = get(f"/appStoreVersions/{vid}/appStoreVersionLocalizations?limit=50", tok)
            bucket = {}
            for vl in vls.get("data", []) or []:
                a = vl.get("attributes", {})
                lc = a.get("locale")
                if not lc:
                    continue
                kw = a.get("keywords") or ""
                bucket[lc] = {
                    "keywords": kw,
                    "keywordsLen": len(kw),
                    "keywordsRoom": 100 - len(kw),
                    "promotionalText": a.get("promotionalText"),
                    "description": (a.get("description") or "")[:400],
                    "whatsNew": (a.get("whatsNew") or "")[:200],
                    "marketingUrl": a.get("marketingUrl"),
                    "supportUrl": a.get("supportUrl"),
                }
            record["versionLocalizations"][f"{vattrs.get('versionString')} ({vattrs.get('appStoreState')})"] = bucket

        path = os.path.join(OUT_DIR, f"{slug}.json")
        with open(path, "w") as f:
            json.dump(record, f, ensure_ascii=False, indent=1)

        locs = sorted(record["localizations"].keys())
        print(f"■ {slug}  ({attrs.get('name')})")
        print(f"   로케일 {len(locs)}개: {', '.join(locs) or '(없음)'}")
        for lc in locs:
            L = record["localizations"][lc]
            print(f"     {lc:8s} 이름 {len(L.get('name') or ''):>2}/30  부제 {len(L.get('subtitle') or ''):>2}/30  «{L.get('name')}» / «{L.get('subtitle')}»")
        for vlabel, bucket in record["versionLocalizations"].items():
            for lc in sorted(bucket):
                b = bucket[lc]
                flag = "  ⚠️ 여유" if b["keywordsRoom"] > 20 else ""
                print(f"     {lc:8s} 키워드 {b['keywordsLen']:>3}/100{flag}")
            break
        summary.append((slug, len(locs)))
        print()

    print("저장 위치: store-metadata/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
