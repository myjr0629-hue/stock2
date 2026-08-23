#!/usr/bin/env python3
# ios_submit — 업로드된 빌드를 버전에 붙이고 심사까지 제출한다.
#
# 순서가 정해져 있고 하나라도 빠지면 애플이 거부한다 (2026-08-23 실측):
#   1) 버전이 없으면 만든다 (PREPARE_FOR_SUBMISSION)
#   2) 빌드 처리 완료(VALID)를 기다린다 — 보통 3~10분
#   3) 버전에 빌드를 연결한다
#   4) whatsNew 를 «모든 로케일에» 채운다 ← 비어 있으면 제출이 막힌다
#   5) reviewSubmission 생성 → item 추가 → submitted:true
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

APP, VERSION, BUILD_NUM, WN_EN = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

WN = {"en-US": WN_EN,
      "ko": "안정성 개선과 스토어 정보 업데이트입니다.",
      "ja": "安定性の改善とApp Store情報の更新です。"}

# 1) 버전 확보
ver = None
for v in call("GET", f"/apps/{APP}/appStoreVersions?limit=10")["data"]:
    a = v["attributes"]
    if a["versionString"] == VERSION:
        ver = v["id"]
        print(f"  기존 버전 {VERSION} 사용 ({a['appStoreState']})")
        break
if not ver:
    r = call("POST", "/appStoreVersions", {"data": {
        "type": "appStoreVersions",
        "attributes": {"platform": "IOS", "versionString": VERSION},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
    if "__error__" in r:
        sys.exit("✗ 버전 생성 실패: " + r["body"][:300])
    ver = r["data"]["id"]
    print(f"  버전 {VERSION} 생성")

# 2) 빌드 대기
build = None
for i in range(20):
    d = call("GET", f"/builds?filter[app]={APP}&limit=5&sort=-uploadedDate").get("data", [])
    hit = [b for b in d if str(b["attributes"].get("version")) == str(BUILD_NUM)]
    if hit:
        st = hit[0]["attributes"].get("processingState")
        print(f"  [{i}] build {BUILD_NUM} → {st}")
        if st == "VALID":
            build = hit[0]["id"]; break
        if st in ("INVALID", "FAILED"):
            sys.exit("✗ 애플 처리 실패")
    else:
        print(f"  [{i}] build {BUILD_NUM} 대기중")
    time.sleep(60)
if not build:
    sys.exit("✗ 빌드 처리 타임아웃")

# 3) 연결
r = call("PATCH", f"/appStoreVersions/{ver}", {"data": {
    "type": "appStoreVersions", "id": ver,
    "relationships": {"build": {"data": {"type": "builds", "id": build}}}}})
if "__error__" in r:
    sys.exit("✗ 빌드 연결 실패: " + r["body"][:300])
print("  ✓ 빌드 연결")

# 4) whatsNew — 비어 있으면 제출이 막힌다
for l in call("GET", f"/appStoreVersions/{ver}/appStoreVersionLocalizations")["data"]:
    loc = l["attributes"]["locale"]
    if loc not in WN:
        continue
    call("PATCH", f"/appStoreVersionLocalizations/{l['id']}", {"data": {
        "type": "appStoreVersionLocalizations", "id": l["id"],
        "attributes": {"whatsNew": WN[loc]}}})
    time.sleep(1)
print("  ✓ 새로운 기능 작성")

# 5) 제출
r = call("POST", "/reviewSubmissions", {"data": {
    "type": "reviewSubmissions", "attributes": {"platform": "IOS"},
    "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
if "__error__" in r:
    sys.exit("✗ 제출묶음 생성 실패: " + r["body"][:300])
sub = r["data"]["id"]
time.sleep(2)
r = call("POST", "/reviewSubmissionItems", {"data": {
    "type": "reviewSubmissionItems",
    "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub}},
                      "appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver}}}}})
if "__error__" in r:
    sys.exit("✗ 항목 추가 실패: " + r["body"][:300])
time.sleep(2)
r = call("PATCH", f"/reviewSubmissions/{sub}", {"data": {
    "type": "reviewSubmissions", "id": sub, "attributes": {"submitted": True}}})
if "__error__" in r:
    sys.exit("✗ 제출 실패: " + r["body"][:400])
print("  ✓ 제출 완료 →", r["data"]["attributes"].get("state"))
