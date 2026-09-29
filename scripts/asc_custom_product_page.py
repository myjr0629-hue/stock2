#!/usr/bin/env python3
# ============================================================================
# asc_custom_product_page — App Store «맞춤 제품 페이지(CPP)»를 API 로 끝까지 만든다.
# ----------------------------------------------------------------------------
# 왜 필요했나 (2026-09-18 실측): 3앱 모두 CPP 0건이었다. CPP 는 앱당 70개까지(애플 공식, 옛 35)
#   «자기 URL(?ppid=…)»을 갖고, 스크린샷·홍보문구를 따로 둘 수 있고,
#   애플 검색광고 광고그룹에 붙일 수 있다. 전부 무료다.
#   ★ 키워드를 지정하면 그 검색어의 «일반 검색 결과»에 기본 페이지 대신 이 페이지가 나간다.
#     키워드는 «최신 승인 버전의 키워드 칸»에서만 고를 수 있다(GET /apps/{id}/searchKeywords
#     ?filter[locale]=&filter[platform]=IOS 가 그 풀이다) · 조합은 페이지마다 유일해야 한다.
#
# 절차:
#   ① POST /appCustomProductPages — 버전·로케일을 «인라인»으로 함께 보내야 한다.
#      (둘 다 필수 관계다. 따로 만들면 409 RELATIONSHIP.REQUIRED)
#   ② POST /appScreenshotSets — 관계는 appCustomProductPageLocalization
#   ③ POST /appScreenshots → PUT uploadOperations → PATCH uploaded+md5
#      (appScreenshots 는 sourceFileChecksum 이 «있다». appEventScreenshots 와 다르다)
#   ④ COMPLETE 폴링 → 키워드 연결(searchKeywords) → visible → reviewSubmissions + items(appCustomProductPageVersion) → submitted
#
# 함정:
#   · 스크린샷을 «기본 등록정보와 같은 것»으로 올리면 CPP 의 존재 이유가 없어진다.
#     오디언스에 맞춘 캡션으로 새로 렌더할 것. (한 번 그렇게 올려 취소·교체했다)
#   · 제출 취소는 PATCH /reviewSubmissions/{id} {canceled:true} — 즉시 반영되고
#     CPP 버전이 PREPARE_FOR_SUBMISSION 으로 돌아온다. 그때 세트를 지우고 다시 올린다.
#   · 홍보문구(promotionalText) 한도 170자. 이름·부제·설명은 CPP 에서 못 바꾼다.
#   · 앱 기본 언어(primaryLocale) 로컬라이제이션이 없으면 엉뚱한 409 RELATIONSHIP.REQUIRED(9/23).
#
# ★2026-09-30 «이어서 하기»: 같은 이름의 CPP 가 있으면 새로 만들지 않고 이어 쓴다 · 로케일·세트·스크린샷(파일명)·키워드는
#   있으면 건너뛴다 · 이미 심사 중/승인이면 제출을 건너뛴다. 끊기면 같은 명령을 다시 돌린다.
# 사용: python3 scripts/asc_custom_product_page.py <앱ID> <스펙.json> [--dry-run] [--no-submit]
#   스펙: {name, deepLink, visible?, locales:{<loc>:{promo, shots:[…], keywords?:[…]}}}
# ============================================================================
import hashlib, json, os, sys, time, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

DISPLAY = os.environ.get('ASC_DISPLAY_TYPE', 'APP_IPHONE_65')
SIZES = {'APP_IPHONE_65': {(1242, 2688), (2688, 1242), (1284, 2778), (2778, 1284)},
         'APP_IPHONE_67': {(1290, 2796), (2796, 1290), (1320, 2868), (2868, 1320)}}
DONE = {'WAITING_FOR_REVIEW', 'IN_REVIEW', 'ACCEPTED', 'APPROVED'}


def log(*a):
    print(*a, flush=True)


def _upload(set_id, path):
    blob = open(path, 'rb').read()
    r = call('POST', '/appScreenshots', {'data': {'type': 'appScreenshots',
        'attributes': {'fileSize': len(blob), 'fileName': os.path.basename(path)},
        'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}}}})
    if '__error__' in r:
        log('      ✗ 예약', r['body'][:160].replace('\n', ' ')); return False
    sid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        q = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']],
                                   method=op['method'])
        for h in op.get('requestHeaders', []):
            q.add_header(h['name'], h['value'])
        try:
            urllib.request.urlopen(q).read()
        except Exception as e:                                   # noqa: BLE001
            log('      ✗ 전송', e); return False
    p = call('PATCH', f'/appScreenshots/{sid}', {'data': {'type': 'appScreenshots', 'id': sid,
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()}}})
    return '__error__' not in p


def keyword_pool(app_id, loc):
    r = call('GET', f'/apps/{app_id}/searchKeywords?filter[locale]={urllib.parse.quote(loc)}&filter[platform]=IOS&limit=200')
    return [d['id'] for d in r.get('data', [])]


def keywords_in_use(app_id, skip_cpp_id=None):
    """다른 CPP 가 이미 쓰는 키워드(로케일별) — 페이지마다 유일해야 한다."""
    used = {}
    for c in call('GET', f'/apps/{app_id}/appCustomProductPages?limit=100').get('data', []):
        if c['id'] == skip_cpp_id:
            continue
        for v in call('GET', f"/appCustomProductPages/{c['id']}/appCustomProductPageVersions?limit=10").get('data', []):
            for l in call('GET', f"/appCustomProductPageVersions/{v['id']}/appCustomProductPageLocalizations?limit=50").get('data', []):
                ks = call('GET', f"/appCustomProductPageLocalizations/{l['id']}/searchKeywords?limit=200").get('data', [])
                for k in ks:
                    used.setdefault(l['attributes']['locale'], {})[k['id']] = c['attributes'].get('name')
    return used


def validate(app_id, spec):
    errs = []
    prim = (call('GET', f'/apps/{app_id}?fields[apps]=primaryLocale').get('data') or {}).get('attributes', {}).get('primaryLocale')
    if prim and prim not in spec['locales']:
        errs.append(f'기본 언어 {prim} 로컬라이제이션이 없다(없으면 409 로 위장한다)')
    try:
        from PIL import Image
    except Exception:
        Image = None
    for loc, t in spec['locales'].items():
        if len(t.get('promo', '')) > 170:
            errs.append(f"{loc} 홍보문구 {len(t['promo'])}>170")
        for p in t['shots']:
            if not os.path.exists(p):
                errs.append(f'{loc} 파일 없음 {p}'); continue
            if Image and DISPLAY in SIZES and Image.open(p).size not in SIZES[DISPLAY]:
                errs.append(f'{loc} {os.path.basename(p)} {Image.open(p).size} ≠ {DISPLAY} 규격')
        if t.get('keywords'):
            pool = set(keyword_pool(app_id, loc))
            miss = [k for k in t['keywords'] if k not in pool]
            if miss:
                errs.append(f'{loc} 키워드 풀(최신 승인 버전 키워드 칸)에 없음: {miss}')
    return errs, prim


def find_cpp(app_id, name):
    for c in call('GET', f'/apps/{app_id}/appCustomProductPages?limit=100').get('data', []):
        if c['attributes'].get('name') == name:
            return c
    return None


def ensure_shots(set_id, loc, shots, dry):
    have = {d['attributes'].get('fileName'): d for d in call('GET', f'/appScreenshotSets/{set_id}/appScreenshots?limit=20').get('data', [])}
    for p in shots:
        fn = os.path.basename(p)
        d = have.get(fn)
        st = ((d or {}).get('attributes', {}).get('assetDeliveryState') or {}).get('state')
        if d and st in ('COMPLETE', 'UPLOAD_COMPLETE', 'AWAITING_UPLOAD'):
            log(f'      = {fn} 있음({st})'); continue
        if d:
            log(f'      ↻ {fn} {st} → 지우고 다시')
            if not dry:
                call('DELETE', f"/appScreenshots/{d['id']}")
        if dry:
            log(f'      (dry) ↑ {fn}'); continue
        log(f"      {'✓' if _upload(set_id, p) else '✗'} {fn}")


def reorder(set_id, shots):
    g = call('GET', f'/appScreenshotSets/{set_id}/appScreenshots?limit=20')
    by = {d['attributes']['fileName']: d['id'] for d in g.get('data', [])}
    want = [by[os.path.basename(p)] for p in shots if os.path.basename(p) in by]
    cur = [d['id'] for d in g.get('data', [])]
    if want and want != cur[:len(want)]:
        call('PATCH', f'/appScreenshotSets/{set_id}/relationships/appScreenshots',
             {'data': [{'type': 'appScreenshots', 'id': x} for x in want]})
        log('      ↕ 순서 맞춤')


def wait_complete(sets, spec, tries=12, gap=15):
    for i in range(1, tries + 1):
        bad = []
        for loc, s in sets.items():
            for d in call('GET', f'/appScreenshotSets/{s}/appScreenshots?limit=20').get('data', []):
                st = d['attributes'].get('assetDeliveryState', {})
                if st.get('state') != 'COMPLETE':
                    bad.append((loc, s, d, st))
        if not bad:
            log(f'   ✓ 에셋 COMPLETE ({i}회차)'); return True
        log(f'   {i}회차 대기 {len(bad)}장: ' + ', '.join(f"{b[0]}:{b[2]['attributes'].get('fileName')}={b[3].get('state')}" for b in bad[:4]))
        # ★2026-09-23: UPLOAD_COMPLETE 에서 6분 넘게 멈추는 장이 있다 → 5회차에 한 번 지우고 다시 올린다(순서는 되돌린다).
        if i == 5:
            for loc, s, d, st in bad:
                fn = d['attributes'].get('fileName')
                src = next((p for p in spec['locales'][loc]['shots'] if os.path.basename(p) == fn), None)
                if src:
                    call('DELETE', f"/appScreenshots/{d['id']}")
                    log(f'      ↻ {fn} 다시 올림', '✓' if _upload(s, src) else '✗')
            for loc, s in sets.items():
                reorder(s, spec['locales'][loc]['shots'])
        time.sleep(gap)
    return False


def ensure_keywords(app_id, cpp_id, loc_ids, spec, dry):
    used = keywords_in_use(app_id, skip_cpp_id=cpp_id)
    for loc, lid in loc_ids.items():
        want = spec['locales'].get(loc, {}).get('keywords') or []
        if not want:
            continue
        cur = {k['id'] for k in call('GET', f'/appCustomProductPageLocalizations/{lid}/searchKeywords?limit=200').get('data', [])}
        clash = {k: used.get(loc, {}).get(k) for k in want if k in used.get(loc, {})}
        add = [k for k in want if k not in cur and k not in clash]
        if clash:
            log(f'   ! {loc} 다른 페이지가 쓰는 키워드는 뺀다: {clash}')
        if not add:
            log(f'   = {loc} 키워드 {sorted(cur)}'); continue
        if dry:
            log(f'   (dry) {loc} 키워드 + {add}'); continue
        r = call('POST', f'/appCustomProductPageLocalizations/{lid}/relationships/searchKeywords',
                 {'data': [{'type': 'appKeywords', 'id': k} for k in add]})
        if '__error__' in r:
            log(f'   ✗ {loc} 키워드', r['__error__'], r['body'][:300].replace('\n', ' '))
        else:
            got = [k['id'] for k in call('GET', f'/appCustomProductPageLocalizations/{lid}/searchKeywords?limit=200').get('data', [])]
            log(f'   ✓ {loc} 키워드 {got}')


def submit(app_id, ver):
    subs = call('GET', f'/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=5')
    sid = (subs.get('data') or [{}])[0].get('id')
    if not sid:
        sub = call('POST', '/reviewSubmissions', {'data': {'type': 'reviewSubmissions',
            'attributes': {'platform': 'IOS'},
            'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})
        if '__error__' in sub:
            log('✗ 제출건:', sub['body'][:300]); return
        sid = sub['data']['id']
    else:
        log(f'   = 열린 제출건 재사용 {sid}')
    items = call('GET', f'/reviewSubmissions/{sid}/items?include=appCustomProductPageVersion&limit=50')
    has = any((((it.get('relationships') or {}).get('appCustomProductPageVersion') or {}).get('data') or {}).get('id') == ver
              for it in items.get('data', []))
    if not has:
        it = call('POST', '/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems',
            'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}},
                              'appCustomProductPageVersion': {
                                  'data': {'type': 'appCustomProductPageVersions', 'id': ver}}}}})
        if '__error__' in it:
            log('✗ 항목:', it['body'][:600]); return
    f = call('PATCH', f'/reviewSubmissions/{sid}',
             {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
    log('   ' + ('✓ 심사 제출 ' + sid + ' ' + str(f['data']['attributes'].get('state'))
                 if '__error__' not in f else '✗ 제출 ' + f['body'][:300]))


def create(app_id: str, spec: dict, dry=False, do_submit=True):
    errs, prim = validate(app_id, spec)
    if errs:
        log('⛔ 스펙 검사 실패:\n  - ' + '\n  - '.join(errs)); return None
    locs = list(spec['locales'].keys())
    cpp = find_cpp(app_id, spec['name'])
    if cpp:
        cpp_id = cpp['id']
        log(f"= CPP 이어 쓰기 {cpp_id}  {cpp['attributes'].get('url')}")
        vers = call('GET', f'/appCustomProductPages/{cpp_id}/appCustomProductPageVersions?limit=10').get('data', [])
        ver_obj = vers[0] if vers else None
        ver = ver_obj['id'] if ver_obj else None
        vstate = (ver_obj or {}).get('attributes', {}).get('state')
        log(f'  버전 {ver} [{vstate}]')
    elif dry:
        log('(dry) CPP 생성', spec['name'], locs); cpp_id = ver = vstate = None
    else:
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
            log('✗ CPP 생성:', r['body'][:500]); return None
        cpp_id = r['data']['id']
        ver = next(x['id'] for x in r['included'] if x['type'] == 'appCustomProductPageVersions')
        vstate = 'PREPARE_FOR_SUBMISSION'
        log(f"✓ CPP {cpp_id}  {r['data']['attributes']['name']}")
        log(f"  URL {r['data']['attributes'].get('url')}")

    loc_ids = {}
    if ver:
        for l in call('GET', f'/appCustomProductPageVersions/{ver}/appCustomProductPageLocalizations?limit=50').get('data', []):
            loc_ids[l['attributes']['locale']] = l['id']
    for loc in locs:
        if loc in loc_ids or not ver:
            continue
        if dry:
            log(f'   (dry) {loc} 로컬라이제이션 추가'); continue
        r = call('POST', '/appCustomProductPageLocalizations', {'data': {'type': 'appCustomProductPageLocalizations',
            'attributes': {'locale': loc, 'promotionalText': spec['locales'][loc]['promo']},
            'relationships': {'appCustomProductPageVersion': {'data': {'type': 'appCustomProductPageVersions', 'id': ver}}}}})
        if '__error__' in r:
            log(f'   ✗ {loc} 로컬라이제이션', r['body'][:200]); continue
        loc_ids[loc] = r['data']['id']

    if vstate in DONE:
        log(f'  버전이 이미 {vstate} — 스크린샷·제출은 건너뛰고 키워드만 맞춘다')
        ensure_keywords(app_id, cpp_id, {l: i for l, i in loc_ids.items() if l in locs}, spec, dry)
        return cpp_id

    sets = {}
    for loc in locs:
        lid = loc_ids.get(loc)
        if not lid:
            if dry:
                log(f"   (dry) {loc} 세트 ← {len(spec['locales'][loc]['shots'])}장")
            continue
        ex = [s for s in call('GET', f'/appCustomProductPageLocalizations/{lid}/appScreenshotSets?limit=20').get('data', [])
              if s['attributes'].get('screenshotDisplayType') == DISPLAY]
        if ex:
            sets[loc] = ex[0]['id']
        elif dry:
            log(f"   (dry) {loc} 세트 생성 ← {len(spec['locales'][loc]['shots'])}장"); continue
        else:
            s = call('POST', '/appScreenshotSets', {'data': {'type': 'appScreenshotSets',
                'attributes': {'screenshotDisplayType': DISPLAY},
                'relationships': {'appCustomProductPageLocalization': {
                    'data': {'type': 'appCustomProductPageLocalizations', 'id': lid}}}}})
            if '__error__' in s:
                log(f'   ✗ {loc} 세트:', s['body'][:160].replace('\n', ' ')); continue
            sets[loc] = s['data']['id']
        log(f'   {loc} 세트 {sets[loc]}')
        ensure_shots(sets[loc], loc, spec['locales'][loc]['shots'], dry)
    if dry:
        if cpp_id:
            ensure_keywords(app_id, cpp_id, loc_ids, spec, dry=True)
        else:
            for loc in locs:
                if spec['locales'][loc].get('keywords'):
                    log(f"   (dry) {loc} 키워드 + {spec['locales'][loc]['keywords']}")
        log('(dry) 여기까지 — 쓰기 없음'); return cpp_id

    for loc, s in sets.items():
        reorder(s, spec['locales'][loc]['shots'])
    if not wait_complete(sets, spec):
        log('✗ 에셋 미완 — 제출 보류(다시 돌리면 이어서 한다)'); return cpp_id

    ensure_keywords(app_id, cpp_id, loc_ids, spec, dry)
    if spec.get('visible') is not None:
        v = call('PATCH', f'/appCustomProductPages/{cpp_id}', {'data': {'type': 'appCustomProductPages', 'id': cpp_id,
                                                                        'attributes': {'visible': bool(spec['visible'])}}})
        log(f"   {'✓' if '__error__' not in v else '✗'} visible={spec['visible']}" + ('' if '__error__' not in v else ' ' + v['body'][:200]))
    if do_submit:
        submit(app_id, ver)
    else:
        log('   (--no-submit) 제출은 건너뜀')
    return cpp_id


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    create(args[0], json.load(open(args[1])), dry='--dry-run' in sys.argv, do_submit='--no-submit' not in sys.argv)
