#!/usr/bin/env python3
# ios_make_profiles — 현재 배포 인증서를 참조하는 App Store 프로파일을 3앱 분
# 새로 만들고 로컬에 설치한다. Xcode 자동 갱신은 «Cloud signing permission error»
# 로 막히므로 ASC API 로 직접 만든다. (2026-08-23 이 방법으로 뚫었다)
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

APPS = [("com.signumhq.app", "SIGNUM HQ AppStore 2026"),
        ("com.signumhq.undercurrent", "Undercurrent AppStore 2026"),
        ("com.signumhq.wim", "WIM AppStore 2026")]
dest = os.path.expanduser("~/Library/Developer/Xcode/UserData/Provisioning Profiles")

certs = [c for c in call("GET", "/certificates?limit=200")["data"]
         if c["attributes"].get("certificateType") == "DISTRIBUTION"]
if not certs:
    sys.exit("배포 인증서가 계정에 없다. Xcode 에서 먼저 만들 것.")
cert_id = certs[0]["id"]
print("cert:", cert_id, certs[0]["attributes"].get("displayName"))

bundles = {b["attributes"]["identifier"]: b["id"]
           for b in call("GET", "/bundleIds?limit=200&filter[platform]=IOS")["data"]}

for ident, name in APPS:
    bid = bundles.get(ident)
    if not bid:
        print(ident, "✗ bundleId 없음"); continue
    r = call("POST", "/profiles", {"data": {
        "type": "profiles",
        "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}},
                          "certificates": {"data": [{"type": "certificates", "id": cert_id}]}}}})
    if "__error__" in r:
        print(ident, "✗", r["__error__"], r["body"][:200]); continue
    a = r["data"]["attributes"]
    open(os.path.join(dest, a["uuid"] + ".mobileprovision"), "wb").write(
        base64.b64decode(a["profileContent"]))
    print(ident, "✓", a["name"], a["profileState"])
