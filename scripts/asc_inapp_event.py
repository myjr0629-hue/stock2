#!/usr/bin/env python3
# ============================================================================
# asc_inapp_event — App Store «인앱 이벤트»를 API 로 끝까지 만든다.
# ----------------------------------------------------------------------------
# 왜 필요했나 (2026-09-18 실측):
#   인앱 이벤트는 «검색 결과·앱 페이지·Today»에 추가로 노출되는 «무료 표면»이다.
#   3앱 모두 0건이었다. 웹 UI 없이 API 로 전부 된다.
#
# 절차 6단계 — 하나라도 빠지면 조용히 DRAFT 에 머문다:
#   ① POST /appEvents                     — 이벤트 뼈대(badge·purpose·deepLink)
#   ② POST /appEventLocalizations         — 언어별 이름·짧은설명·긴설명
#   ③ POST /appEventScreenshots           — 에셋 «예약»(assetType 필수)
#   ④ PUT  uploadOperations               — 바이트 전송
#   ⑤ PATCH /appEventScreenshots/{id}     — uploaded:true 만! (sourceFileChecksum 은 없는 속성)
#   ⑥ reviewSubmissions → items → submitted:true
#
# 함정 (전부 실제로 밟았다):
#   · 카드는 16:9 «1920x1080», 상세페이지는 9:16 «1080x1920» 이다. 둘이 다르다.
#     16:9 를 상세에 올리면 IMAGE_BAD_ASPECT_RATIO + BAD_DIMENSION_SM_LESS_MIN.
#   · «기본 로케일»은 EVENT_CARD 와 EVENT_DETAILS_PAGE 를 «둘 다» 요구한다.
#   · 에셋이 COMPLETE 되기 전에 제출하면 APP_EVENT_LOCALIZATION_ASSET_INCOMPLETE.
#   · 이미지에 글자·로고·CTA 를 넣지 않는다(애플 규정) — 앱 화면만 쓴다.
#   · 글자수: 이름 30 · 짧은설명 50 · 긴설명 120.
# ============================================================================
import base64, json, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_client as A
from asc_client import call


def territories(app_id: str):
    """앱이 실제로 판매되는 국가 코드. v2 전용 경로다."""
    old, A.BASE = A.BASE, "https://api.appstoreconnect.apple.com/v2"
    try:
        r = call('GET', f'/appAvailabilities/{app_id}/territoryAvailabilities?limit=200')
        return sorted({json.loads(base64.b64decode(x['id'] + '=='))['t']
                       for x in r.get('data', []) if x['attributes'].get('available')})
    finally:
        A.BASE = old


def upload(loc_id: str, path: str, asset_type: str) -> "str|None":
    blob = open(path, 'rb').read()
    r = call('POST', '/appEventScreenshots', {'data': {
        'type': 'appEventScreenshots',
        'attributes': {'fileSize': len(blob), 'fileName': os.path.basename(path),
                       'appEventAssetType': asset_type},
        'relationships': {'appEventLocalization': {
            'data': {'type': 'appEventLocalizations', 'id': loc_id}}}}})
    if '__error__' in r:
        print('      ✗ 예약', asset_type, r['body'][:200].replace('\n', ' ')); return None
    sid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']],
                                     method=op['method'])
        for h in op.get('requestHeaders', []):
            req.add_header(h['name'], h['value'])
        try:
            urllib.request.urlopen(req).read()
        except Exception as e:                                    # noqa: BLE001
            print('      ✗ 전송', e); return None
    p = call('PATCH', f'/appEventScreenshots/{sid}',
             {'data': {'type': 'appEventScreenshots', 'id': sid, 'attributes': {'uploaded': True}}})
    if '__error__' in p:
        print('      ✗ 확정', p['body'][:200].replace('\n', ' ')); return None
    return sid


def wait_complete(loc_ids, tries=10, gap=12) -> bool:
    for i in range(1, tries + 1):
        bad = []
        for name, lid in loc_ids.items():
            r = call('GET', f'/appEventLocalizations/{lid}/appEventScreenshots')
            for s in r.get('data', []):
                st = s['attributes'].get('assetDeliveryState', {})
                if st.get('state') != 'COMPLETE':
                    bad.append(f"{name}/{s['attributes'].get('appEventAssetType')}"
                               f"={st.get('state')}{st.get('errors') or ''}")
        if not bad:
            print(f'   ✓ 에셋 전부 COMPLETE ({i}회차)'); return True
        print(f'   {i}회차 대기: ' + ' | '.join(bad))
        time.sleep(gap)
    return False


def create(app_id: str, spec: dict) -> "str|None":
    ev = call('POST', '/appEvents', {'data': {'type': 'appEvents',
        'attributes': {'referenceName': spec['ref'], 'badge': spec['badge'],
                       'deepLink': spec['deepLink'], 'purpose': 'ATTRACT_NEW_USERS',
                       'primaryLocale': spec['primary'], 'priority': 'HIGH',
                       'purchaseRequirement': 'NO_COST_ASSOCIATED', 'territorySchedules': []},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})
    if '__error__' in ev:
        print('✗ 이벤트 생성:', ev['body'][:400]); return None
    eid = ev['data']['id']
    print(f"✓ 이벤트 {eid}  ({spec['ref']})")

    loc_ids = {}
    for loc, t in spec['locales'].items():
        r = call('POST', '/appEventLocalizations', {'data': {'type': 'appEventLocalizations',
            'attributes': {'locale': loc, 'name': t['name'],
                           'shortDescription': t['short'], 'longDescription': t['long']},
            'relationships': {'appEvent': {'data': {'type': 'appEvents', 'id': eid}}}}})
        if '__error__' in r:
            print(f'   ✗ {loc} 문안:', r['body'][:250].replace('\n', ' ')); continue
        loc_ids[loc] = r['data']['id']
        print(f"   ✓ {loc} 문안 ({len(t['name'])}/{len(t['short'])}/{len(t['long'])}자)")
        for kind, at in (('card', 'EVENT_CARD'), ('details', 'EVENT_DETAILS_PAGE')):
            p = t[kind]
            sid = upload(loc_ids[loc], p, at)
            print(f"      {'✓' if sid else '✗'} {at} {os.path.basename(p)}")
    if not loc_ids:
        return None
    if not wait_complete(loc_ids):
        print('✗ 에셋 처리 미완 — 제출 보류'); return eid

    terr = territories(app_id)
    s = call('PATCH', f'/appEvents/{eid}', {'data': {'type': 'appEvents', 'id': eid,
        'attributes': {'territorySchedules': [{'territories': terr,
            'publishStart': spec['publishStart'], 'eventStart': spec['eventStart'],
            'eventEnd': spec['eventEnd']}]}}})
    if '__error__' in s:
        print('✗ 일정:', s['body'][:300]); return eid
    print(f'   ✓ 일정 {len(terr)}개국  {spec["eventStart"]} → {spec["eventEnd"]}')

    sub = call('POST', '/reviewSubmissions', {'data': {'type': 'reviewSubmissions',
        'attributes': {'platform': 'IOS'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})
    if '__error__' in sub:
        print('✗ 제출건:', sub['body'][:300]); return eid
    sid = sub['data']['id']
    it = call('POST', '/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems',
        'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}},
                          'appEvent': {'data': {'type': 'appEvents', 'id': eid}}}}})
    if '__error__' in it:
        print('✗ 항목:', it['body'][:600]); return eid
    f = call('PATCH', f'/reviewSubmissions/{sid}',
             {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
    if '__error__' in f:
        print('✗ 제출:', f['body'][:300])
    else:
        print('   ✓ 심사 제출', f['data']['attributes'].get('state'))
    return eid


if __name__ == '__main__':
    spec = json.load(open(sys.argv[2]))
    create(sys.argv[1], spec)
