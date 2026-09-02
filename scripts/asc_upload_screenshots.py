#!/usr/bin/env python3
# ============================================================================
# asc_upload_screenshots — 앱스토어 «로케일별» 스크린샷을 API 로 올린다.
# ----------------------------------------------------------------------------
# 왜 필요했나 (2026-09-03 실측):
#   스토어 언어를 3 → 12 로 늘렸더니 UC 1.0.6 제출이 409 로 막혔다.
#     STATE_ERROR.ENTITY_STATE_INVALID — "This resource cannot be reviewed"
#   원인은 **스크린샷이다.** 앱스토어는 스크린샷을 «로케일마다» 요구한다.
#   설명·키워드를 다 채워도 스크린샷이 0장인 로케일이 하나라도 있으면
#   버전 전체가 제출 불가다. 이유를 안 알려주므로 직접 세어 봐야 안다.
#
#   앱 UI 자체는 en/ko/ja 뿐이라 신규 9개 언어에는 **영문 스크린샷**을 쓴다.
#   그 로케일에서 앱은 실제로 영어로 뜬다 — 즉 이게 정직한 화면이다.
#
# 업로드는 4단계다(하나라도 빠지면 애플이 조용히 안 받는다):
#   ① POST /appScreenshotSets              — 로케일에 «세트»를 만든다
#   ② POST /appScreenshots                 — 파일명·크기를 예약 → uploadOperations
#   ③ PUT  각 uploadOperation              — 바이트를 조각내 올린다
#   ④ PATCH /appScreenshots/{id}           — uploaded:true + md5 체크섬
#
# 사용:
#   python3 scripts/asc_upload_screenshots.py <appId> <version> <srcDir> [로케일…]
#   로케일을 안 주면 «스크린샷 0장인 로케일 전부»에 올린다.
# ============================================================================
import hashlib
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call, token

DISPLAY_TYPE = os.environ.get("ASC_DISPLAY_TYPE", "APP_IPHONE_65")


def upload_one(set_id: str, path: str) -> bool:
    """파일 하나를 세트에 올린다. 성공하면 True."""
    blob = open(path, "rb").read()
    name = os.path.basename(path)

    r = call("POST", "/appScreenshots", {"data": {
        "type": "appScreenshots",
        "attributes": {"fileSize": len(blob), "fileName": name},
        "relationships": {"appScreenshotSet": {
            "data": {"type": "appScreenshotSets", "id": set_id}}}}})
    if "__error__" in r:
        print(f"      ✗ 예약 실패 {name}: {r['body'][:160]}")
        return False

    sid = r["data"]["id"]
    for op in r["data"]["attributes"]["uploadOperations"]:
        chunk = blob[op["offset"]:op["offset"] + op["length"]]
        req = urllib.request.Request(op["url"], data=chunk, method=op["method"])
        for h in op.get("requestHeaders", []):
            req.add_header(h["name"], h["value"])
        try:
            urllib.request.urlopen(req).read()
        except Exception as e:                       # noqa: BLE001
            print(f"      ✗ 전송 실패 {name}: {e}")
            return False

    r = call("PATCH", f"/appScreenshots/{sid}", {"data": {
        "type": "appScreenshots", "id": sid,
        "attributes": {"uploaded": True,
                       "sourceFileChecksum": hashlib.md5(blob).hexdigest()}}})
    if "__error__" in r:
        print(f"      ✗ 커밋 실패 {name}: {r['body'][:160]}")
        return False
    return True


def main() -> None:
    app_id, version, src = sys.argv[1], sys.argv[2], sys.argv[3]
    only = set(sys.argv[4:])

    files = sorted(f for f in os.listdir(src) if f.lower().endswith((".png", ".jpg", ".jpeg")))
    if not files:
        sys.exit(f"✗ {src} 에 이미지가 없다")
    print(f"원본 {len(files)}장 · {src}")

    ver = next((v["id"] for v in call("GET", f"/apps/{app_id}/appStoreVersions?limit=10")["data"]
                if v["attributes"]["versionString"] == version), None)
    if not ver:
        sys.exit(f"✗ 버전 {version} 없음")

    locs = call("GET", f"/appStoreVersions/{ver}/appStoreVersionLocalizations")["data"]
    done = 0
    for l in locs:
        loc = l["attributes"]["locale"]
        if only and loc not in only:
            continue
        sets = call("GET", f"/appStoreVersionLocalizations/{l['id']}/appScreenshotSets").get("data", [])
        have = 0
        for s in sets:
            have += len(call("GET", f"/appScreenshotSets/{s['id']}/appScreenshots").get("data", []))
        if have and not only:
            print(f"  {loc:8} 건너뜀 (이미 {have}장)")
            continue

        # 기존 세트를 재사용한다 — 같은 displayType 세트를 두 번 만들면 409 다.
        sid = next((s["id"] for s in sets
                    if s["attributes"]["screenshotDisplayType"] == DISPLAY_TYPE), None)
        if not sid:
            r = call("POST", "/appScreenshotSets", {"data": {
                "type": "appScreenshotSets",
                "attributes": {"screenshotDisplayType": DISPLAY_TYPE},
                "relationships": {"appStoreVersionLocalization": {
                    "data": {"type": "appStoreVersionLocalizations", "id": l["id"]}}}}})
            if "__error__" in r:
                print(f"  {loc:8} ✗ 세트 생성 실패: {r['body'][:160]}")
                continue
            sid = r["data"]["id"]

        ok = sum(upload_one(sid, os.path.join(src, f)) for f in files)
        print(f"  {loc:8} {'✅' if ok == len(files) else '✗'} {ok}/{len(files)}장")
        done += ok == len(files)

    print(f"\n로케일 {done}개 완료")


if __name__ == "__main__":
    main()
