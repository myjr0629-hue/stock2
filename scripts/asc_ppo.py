#!/usr/bin/env python3
# ============================================================================
# asc_ppo — App Store «제품 페이지 최적화»(PPO) 실험을 API 로 만든다.
#   실측(2026-09-18): GET /apps/{id}/appStoreVersionExperimentsV2 → 200·0건
#   즉 우리 키로 PPO 가 열려 있다(웹 로그인 불필요).
# 변형 자산은 «라이브 스크린샷을 그대로 내려받아 순서만 바꿔» 쓴다 — 새 렌더 0,
#   되돌리기 쉬움, 첫 프레임(검색 결과에 보이는 장면)만 달라진다.
# 실험을 «시작»하지는 않는다: 라이브 노출 변경은 대표 결정이다.
# 사용: python3 scripts/asc_ppo.py <appId> <locale> <실험이름> <첫장면키워드>
# ============================================================================
import os, sys, json, hashlib, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import urllib.error
from asc_client import call, token
from asc_upload_screenshots import upload_one

BASE2 = "https://api.appstoreconnect.apple.com"
def raw(method, path, body=None):
    """/v2 경로용 — asc_client 는 /v1 고정이다. (실측: PPO 생성은 POST /v2/appStoreVersionExperiments)"""
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(BASE2 + path, data=data, method=method,
        headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return {"__error__": e.code, "body": e.read().decode()}

APP, LOCALE, NAME, FIRST = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
DT = "APP_IPHONE_65"
OUT = f"/tmp/ppo-{LOCALE}"
os.makedirs(OUT, exist_ok=True)

def die(msg, r=None):
    print("✗", msg, (json.dumps(r)[:400] if r else "")); sys.exit(1)

# ① 라이브 버전의 해당 로케일 스크린샷을 순서대로 읽어 내려받는다
v = call("GET", f"/apps/{APP}/appStoreVersions?limit=1&fields[appStoreVersions]=versionString")["data"][0]
locs = call("GET", f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations?limit=20&fields[appStoreVersionLocalizations]=locale")["data"]
loc = next((l for l in locs if l["attributes"]["locale"] == LOCALE), None) or die(f"{LOCALE} 로케일 없음")
sets = call("GET", f"/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets?limit=10&fields[appScreenshotSets]=screenshotDisplayType")["data"]
st = next((s for s in sets if s["attributes"]["screenshotDisplayType"] == DT), None) or die(f"{DT} 세트 없음")
shots = call("GET", f"/appScreenshotSets/{st['id']}/appScreenshots?limit=20&fields[appScreenshots]=fileName,imageAsset")["data"]
files = []
for s in shots:
    a = s["attributes"]; ia = a.get("imageAsset") or {}
    url = (ia.get("templateUrl") or "").replace("{w}", str(ia.get("width", 1242))).replace("{h}", str(ia.get("height", 2688))).replace("{f}", "png")
    if not url: die(f"imageAsset 없음: {a.get('fileName')}")
    p = os.path.join(OUT, a["fileName"])
    if not os.path.exists(p):
        urllib.request.urlretrieve(url, p)
    files.append(p)
print(f"라이브 {v['attributes']['versionString']} · {LOCALE} 스크린샷 {len(files)}장 확보 →", [os.path.basename(f) for f in files])

# ② 순서 재배열: FIRST 키워드가 든 파일을 맨 앞으로
order = sorted(files, key=lambda p: (0 if FIRST in os.path.basename(p) else 1))
if FIRST not in os.path.basename(order[0]): die(f"«{FIRST}» 들어간 스크린샷이 없다")
print("변형 순서 →", [os.path.basename(f) for f in order])

# ③ 실험 생성(트래픽 50%) — 스키마는 오류 메시지로 배운다(ENGINE §39)
def create(path, typ, attrs, rels):
    r = call("POST", path, {"data": {"type": typ, "attributes": attrs, "relationships": rels}})
    if "__error__" in r:
        print(f"   ! {typ} 생성 실패 {r['__error__']}: {r['body'][:300]}"); return None
    return r["data"]["id"]

# 실측 스키마(409 로 학습): POST /v2/appStoreVersionExperiments · name·platform·trafficProportion·app
r = raw("POST", "/v2/appStoreVersionExperiments", {"data": {"type": "appStoreVersionExperiments",
        "attributes": {"name": NAME, "platform": "IOS", "trafficProportion": 50},
        "relationships": {"app": {"data": {"type": "apps", "id": APP}}}}})
if "__error__" in r: die(f"실험 생성 실패 {r['__error__']}: {r['body'][:300]}")
exp = r["data"]["id"]
print("실험 생성:", exp)

tre = create("/appStoreVersionExperimentTreatments", "appStoreVersionExperimentTreatments",
             {"name": f"{NAME} · A"},
             {"appStoreVersionExperimentV2": {"data": {"type": "appStoreVersionExperimentsV2", "id": exp}}})
if not tre: die("처리군 생성 불가 — 실험은 초안으로 남았다: " + exp)
print("처리군 생성:", tre)

tl = create("/appStoreVersionExperimentTreatmentLocalizations", "appStoreVersionExperimentTreatmentLocalizations",
            {"locale": LOCALE},
            {"appStoreVersionExperimentTreatment": {"data": {"type": "appStoreVersionExperimentTreatments", "id": tre}}})
if not tl: die("처리군 로케일 생성 불가")
print("처리군 로케일:", tl)

ss = create("/appScreenshotSets", "appScreenshotSets", {"screenshotDisplayType": DT},
            {"appStoreVersionExperimentTreatmentLocalization": {"data": {"type": "appStoreVersionExperimentTreatmentLocalizations", "id": tl}}})
if not ss: die("스크린샷 세트 생성 불가")
print("스크린샷 세트:", ss)

ok = 0
for p in order:
    if upload_one(ss, p): ok += 1; print(f"   ✓ {os.path.basename(p)}")
print(f"업로드 {ok}/{len(order)}")

# ④ 검증 — 처리군에 실제로 올라간 순서를 다시 읽는다
got = call("GET", f"/appScreenshotSets/{ss}/appScreenshots?limit=20&fields[appScreenshots]=fileName,assetDeliveryState")["data"]
print("검증:", json.dumps([{"f": g["attributes"]["fileName"], "state": (g["attributes"].get("assetDeliveryState") or {}).get("state")} for g in got], ensure_ascii=False))
e = raw("GET", f"/v2/appStoreVersionExperiments/{exp}?fields[appStoreVersionExperiments]=name,state,trafficProportion,startDate")
print("실험 상태:", json.dumps(e.get("data", e).get("attributes", e), ensure_ascii=False)[:300])
print("\n※ 시작하지 않았다(state 확인). 시작 = 라이브 노출 변경 → 대표 결정.")
