#!/usr/bin/env python3
# 사용: python3 scripts/asc_live_promo_9.py [--apply]  (기본 미리보기)
# 라이브 1.9.2 의 비영어 9개 로케일 promotionalText 를 현지화본으로 교체(심사 없음·즉시). ko·ja·en-US 는 건드리지 않는다.
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_client as A
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, '.agent/marketing/store-surfaces/2026-09-30-growth/promo-9-locales.json')))['live_1.9.2']
apply = '--apply' in sys.argv
vs = A.call('GET', '/apps/6783130444/appStoreVersions?limit=5')['data']
v = [x for x in vs if x['attributes']['versionString'] == '1.9.2'][0]
assert v['attributes']['appStoreState'] == 'READY_FOR_SALE', v['attributes']['appStoreState']
locs = {l['attributes']['locale']: l for l in A.call('GET', f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations?limit=50")['data']}
for lc, text in d.items():
    lo = locs.get(lc)
    if not lo: print('없음', lc); continue
    old = lo['attributes'].get('promotionalText') or ''
    if old == text: print('그대로', lc); continue
    print(f"{'적용' if apply else '(미리보기)'} {lc} {len(old)}→{len(text)}자 : {text[:70]}")
    if apply:
        r = A.call('PATCH', f"/appStoreVersionLocalizations/{lo['id']}", {'data': {'type': 'appStoreVersionLocalizations', 'id': lo['id'], 'attributes': {'promotionalText': text}}})
        print('   ', '✓' if '__error__' not in r else '✗ ' + r['body'][:200])
