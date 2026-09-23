#!/usr/bin/env python3
# ============================================================================
# asc_custom_product_page — App Store «맞춤 제품 페이지(CPP)»를 API 로 끝까지 만든다.
# ----------------------------------------------------------------------------
# 왜 필요했나 (2026-09-18 실측): 3앱 모두 CPP 0건이었다. CPP 는 앱당 35개까지
#   «자기 URL(?ppid=…)»을 갖고, 스크린샷·홍보문구를 따로 둘 수 있고,
#   애플 검색광고 광고그룹에 붙일 수 있다. 전부 무료다.
#
# 절차:
#   ① POST /appCustomProductPages — 버전·로케일을 «인라인»으로 함께 보내야 한다.
#      (둘 다 필수 관계다. 따로 만들면 409 RELATIONSHIP.REQUIRED)
#   ② POST /appScreenshotSets — 관계는 appCustomProductPageLocalization
#   ③ POST /appScreenshots → PUT uploadOperations → PATCH uploaded+md5
#      (appScreenshots 는 sourceFileChecksum 이 «있다». appEventScreenshots 와 다르다)
#   ④ COMPLETE 폴링 → reviewSubmissions + items(appCustomProductPageVersion) → submitted
#
# 함정:
#   · 스크린샷을 «기본 등록정보와 같은 것»으로 올리면 CPP 의 존재 이유가 없어진다.
#     오디언스에 맞춘 캡션으로 새로 렌더할 것. (한 번 그렇게 올려 취소·교체했다)
#   · 제출 취소는 PATCH /reviewSubmissions/{id} {canceled:true} — 즉시 반영되고
#     CPP 버전이 PREPARE_FOR_SUBMISSION 으로 돌아온다. 그때 세트를 지우고 다시 올린다.
#   · 홍보문구(promotionalText) 한도 170자. 이름·부제·설명은 CPP 에서 못 바꾼다.
# ============================================================================
import hashlib, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

DISPLAY = os.environ.get('ASC_DISPLAY_TYPE', 'APP_IPHONE_65')


def _upload(set_id, path):
    blob = open(path, 'rb').read()
    r = call('POST', '/appScreenshots', {'data': {'type': 'appScreenshots',
        'attributes': {'fileSize': len(blob), 'fileName': os.path.basename(path)},
        'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}}}})
    if '__error__' in r:
        print('      ✗ 예약', r['body'][:160].replace('\n', ' ')); return False
    sid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        q = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']],
                                   method=op['method'])
        for h in op.get('requestHeaders', []):
            q.add_header(h['name'], h['value'])
        try:
            urllib.request.urlopen(q).read()
        except Exception as e:                                   # noqa: BLE001
            print('      ✗ 전송', e); return False
    p = call('PATCH', f'/appScreenshots/{sid}', {'data': {'type': 'appScreenshots', 'id': sid,
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()}}})
    return '__error__' not in p


def create(app_id: str, spec: dict):
    # ★2026-09-23 실측: CPP 는 «앱 기본 언어(primaryLocale)» 로컬라이제이션이 반드시 있어야 한다.
    #   없으면 ASC 는 엉뚱하게 409 RELATIONSHIP.REQUIRED('appCustomProductPageLocalizations')를 돌려준다
    #   (관계를 더하면 UNKNOWN, 역참조를 넣으면 INVALID — 세 번 헛돌았다). 기본 언어를 넣자 바로 201.
    prim = (call('GET', f'/apps/{app_id}?fields[apps]=primaryLocale').get('data') or {}).get('attributes', {}).get('primaryLocale')
    if prim and prim not in spec['locales']:
        print(f'⛔ 기본 언어 {prim} 로컬라이제이션이 spec 에 없다 — CPP 는 이것 없이 만들어지지 않는다'); return None
    locs = list(spec['locales'].keys())
    body = {'data': {'type': 'appCustomProductPages', 'attributes': {'name': spec['name']},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}},
            'appCustomProductPageVersions': {'data': [
                {'type': 'appCustomProductPageVersions', 'id': '${v}'}]}}},
        'included': [
            {'type': 'appCustomProductPageVersions', 'id': '${v}',
             'attributes': {'deepLink': spec['deepLink']},
             'relationships': {'appCustomProductPageLocalizations': {'data': [
                 {'type': 'appCustomProductPageLocalizations', 'id': f'${{l{i}}}'} for i in range(len(locs))]}}},
        ] + [
            {'type': 'appCustomProductPageLocalizations', 'id': f'${{l{i}}}',
             'attributes': {'locale': loc, 'promotionalText': spec['locales'][loc]['promo']}}
            for i, loc in enumerate(locs)
        ]}
    r = call('POST', '/appCustomProductPages', body)
    if '__error__' in r:
        print('✗ CPP 생성:', r['body'][:500]); return None
    cpp = r['data']
    ver = next(x['id'] for x in r['included'] if x['type'] == 'appCustomProductPageVersions')
    loc_ids = {}
    for x in r['included']:
        if x['type'] == 'appCustomProductPageLocalizations':
            loc_ids[x['attributes']['locale']] = x['id']
    print(f"✓ CPP {cpp['id']}  {cpp['attributes']['name']}")
    print(f"  URL {cpp['attributes'].get('url')}")

    sets = {}
    for loc, lid in loc_ids.items():
        s = call('POST', '/appScreenshotSets', {'data': {'type': 'appScreenshotSets',
            'attributes': {'screenshotDisplayType': DISPLAY},
            'relationships': {'appCustomProductPageLocalization': {
                'data': {'type': 'appCustomProductPageLocalizations', 'id': lid}}}}})
        if '__error__' in s:
            print(f'   ✗ {loc} 세트:', s['body'][:160].replace('\n', ' ')); continue
        sets[loc] = s['data']['id']
        print(f'   ✓ {loc} 세트 ({len(spec["locales"][loc]["shots"])}장)')
        for p in spec['locales'][loc]['shots']:
            print(f"      {'✓' if _upload(sets[loc], p) else '✗'} {os.path.basename(p)}")

    for i in range(1, 8):
        bad = []
        for loc, s in sets.items():
            g = call('GET', f'/appScreenshotSets/{s}/appScreenshots')
            for d in g.get('data', []):
                st = d['attributes'].get('assetDeliveryState', {})
                if st.get('state') != 'COMPLETE':
                    bad.append(f"{loc}:{st.get('state')}{st.get('errors') or ''}")
        if not bad:
            print(f'   ✓ 에셋 COMPLETE ({i}회차)'); break
        print(f'   {i}회차 대기 {len(bad)}장'); time.sleep(12)
        # ★2026-09-23: 8장 중 2장이 UPLOAD_COMPLETE 에서 6분 넘게 멈췄다 → 지우고 다시 올리자 즉시 COMPLETE.
        #   4회차부터 멈춘 장을 한 번 다시 올리고, 세트 순서를 spec 순서로 되돌린다(다시 올린 장은 맨 뒤로 붙는다).
        if i == 4:
            for loc, s in sets.items():
                g = call('GET', f'/appScreenshotSets/{s}/appScreenshots')
                for d in g.get('data', []):
                    if d['attributes'].get('assetDeliveryState', {}).get('state') != 'COMPLETE':
                        fn = d['attributes'].get('fileName')
                        call('DELETE', f"/appScreenshots/{d['id']}")
                        src = next((p for p in spec['locales'][loc]['shots'] if os.path.basename(p) == fn), None)
                        if src: print(f'      ↻ {fn} 다시 올림', '✓' if _upload(s, src) else '✗')
                g = call('GET', f'/appScreenshotSets/{s}/appScreenshots')
                by = {d['attributes']['fileName']: d['id'] for d in g.get('data', [])}
                want = [by[os.path.basename(p)] for p in spec['locales'][loc]['shots'] if os.path.basename(p) in by]
                call('PATCH', f'/appScreenshotSets/{s}/relationships/appScreenshots', {'data': [{'type': 'appScreenshots', 'id': x} for x in want]})
    else:
        print('✗ 에셋 미완 — 제출 보류'); return cpp['id']

    sub = call('POST', '/reviewSubmissions', {'data': {'type': 'reviewSubmissions',
        'attributes': {'platform': 'IOS'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})
    if '__error__' in sub:
        print('✗ 제출건:', sub['body'][:300]); return cpp['id']
    sid = sub['data']['id']
    it = call('POST', '/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems',
        'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}},
                          'appCustomProductPageVersion': {
                              'data': {'type': 'appCustomProductPageVersions', 'id': ver}}}}})
    if '__error__' in it:
        print('✗ 항목:', it['body'][:600]); return cpp['id']
    f = call('PATCH', f'/reviewSubmissions/{sid}',
             {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
    print('   ' + ('✓ 심사 제출 ' + str(f['data']['attributes'].get('state'))
                   if '__error__' not in f else '✗ 제출 ' + f['body'][:200]))
    return cpp['id']


if __name__ == '__main__':
    create(sys.argv[1], json.load(open(sys.argv[2])))
