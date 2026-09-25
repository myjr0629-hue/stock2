#!/usr/bin/env python3
# ============================================================================
# asc_promoted_iap — 구독 대표 이미지(1024) 업로드 + 프로모션 인앱 구입(promotedPurchases) 생성·조회.
# ★2026-09-25 신설: /apps/6783130444/promotedPurchases = 0, 구독 이미지 0 → App Store 검색 결과의 «추가 카드» 미사용.
# 사용: python3 scripts/asc_promoted_iap.py <앱 id> <구독 id> <1024 PNG>      (이미 있으면 건너뛴다)
#       python3 scripts/asc_promoted_iap.py <앱 id> <구독 id> --check
# 흐름(API): ① POST /subscriptionImages(예약) → ② PUT uploadOperations → ③ PATCH uploaded:true(+체크섬, 거부되면 없이)
#            ④ POST /promotedPurchases(app·subscription, visibleForAllUsers·enabled) → ⑤ 조회로 상태 확인. 이미지는 애플 심사.
# ============================================================================
import hashlib, json, os, sys, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
from asc_client import call

app_id, sub_id = sys.argv[1], sys.argv[2]
arg = sys.argv[3] if len(sys.argv) > 3 else '--check'

def show():
    im = call('GET', f'/subscriptions/{sub_id}/images?limit=5')
    for d in (im.get('data') or []):
        a = d['attributes']; print('이미지', d['id'], a.get('fileName'), a.get('state'), (a.get('assetDeliveryState') or {}).get('state'))
    pp = call('GET', f'/apps/{app_id}/promotedPurchases?limit=10')
    for d in (pp.get('data') or []):
        a = d['attributes']; print('프로모션', d['id'], 'enabled', a.get('enabled'), 'visibleForAllUsers', a.get('visibleForAllUsers'), 'state', a.get('state'))
    return im, pp

if arg == '--check':
    show(); sys.exit(0)

im, pp = show()
if not (im.get('data') or []):
    blob = open(arg, 'rb').read()
    r = call('POST', '/subscriptionImages', {'data': {'type': 'subscriptionImages',
        'attributes': {'fileSize': len(blob), 'fileName': os.path.basename(arg)},
        'relationships': {'subscription': {'data': {'type': 'subscriptions', 'id': sub_id}}}}})
    if '__error__' in r: print('✗ 예약 실패', r['body'][:400]); sys.exit(1)
    iid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']], method=op['method'])
        for h in op.get('requestHeaders', []): req.add_header(h['name'], h['value'])
        urllib.request.urlopen(req).read()
    body = {'data': {'type': 'subscriptionImages', 'id': iid, 'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()}}}
    r = call('PATCH', f'/subscriptionImages/{iid}', body)
    if '__error__' in r:
        print('  체크섬 포함 커밋 거부 → 체크섬 없이 재시도:', r['body'][:200])
        body['data']['attributes'].pop('sourceFileChecksum')
        r = call('PATCH', f'/subscriptionImages/{iid}', body)
        if '__error__' in r: print('✗ 커밋 실패', r['body'][:400]); sys.exit(1)
    print('✓ 이미지 업로드', iid)
if not (pp.get('data') or []):
    r = call('POST', '/promotedPurchases', {'data': {'type': 'promotedPurchases',
        'attributes': {'visibleForAllUsers': True, 'enabled': True},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}},
                          'subscription': {'data': {'type': 'subscriptions', 'id': sub_id}}}}})
    if '__error__' in r: print('✗ 프로모션 생성 실패', r['body'][:500]); sys.exit(1)
    print('✓ 프로모션 인앱 구입 생성', r['data']['id'])
print('--- 현재'); show()
