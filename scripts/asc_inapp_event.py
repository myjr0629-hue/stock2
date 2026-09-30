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
#   · 카드는 16:9(1920x1080~3840x2160), 상세페이지는 9:16(1080x1920~2160x3840) 이다. 둘이 다르다.
#     16:9 를 상세에 올리면 IMAGE_BAD_ASPECT_RATIO + BAD_DIMENSION_SM_LESS_MIN.
#   · «기본 로케일»은 EVENT_CARD 와 EVENT_DETAILS_PAGE 를 «둘 다» 요구한다.
#   · 에셋이 COMPLETE 되기 전에 제출하면 APP_EVENT_LOCALIZATION_ASSET_INCOMPLETE.
#   · 이미지에 글자·로고·CTA·테두리·그라디언트를 넣지 않는다(애플 규정 — 애플이 자동 적용) — 앱 화면만.
#   · 글자수: 이름 30 · 짧은설명 50 · 긴설명 120. 가격(금액) 표기 금지.
#   · 일정: 최대 31일 · 게시는 시작 14일 전까지 · 승인이 게시 시각보다 늦으면 «승인 즉시» 보인다.
#
# ★2026-09-30 «이어서 하기»(단위마다 서버 상태로 판정) — 끊겨도 다시 돌리면 이어서 한다:
#   같은 referenceName 이벤트가 있으면 새로 만들지 않고 이어 쓴다 · 로케일·에셋은 있으면 건너뛴다(실패 에셋은 지우고 다시)
#   · 일정이 같으면 건너뛴다 · 이미 심사 중이면 제출을 건너뛴다 · 열려 있는 초안 제출건이 있으면 그걸 쓴다.
#   eventStart 에 "auto" 를 주면 «지금+90분(정시 올림)» · eventEnd "auto" = 시작 + 30일 23시간(31일 한도 안).
#
# 사용: python3 scripts/asc_inapp_event.py <앱ID> <스펙.json> [--dry-run] [--no-submit]
# ============================================================================
import base64, datetime as dt, json, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import asc_client as A
from asc_client import call

LIMITS = {'name': 30, 'short': 50, 'long': 120}
DONE_STATES = {'WAITING_FOR_REVIEW', 'IN_REVIEW', 'ACCEPTED', 'APPROVED', 'PUBLISHED', 'PAST', 'ARCHIVED'}
EDITABLE = {'DRAFT', 'READY_FOR_REVIEW', 'REJECTED', 'DEVELOPER_REJECTED', None}


def log(*a):
    print(*a, flush=True)


def territories(app_id: str):
    """앱이 실제로 판매되는 국가 코드. v2 전용 경로다."""
    old, A.BASE = A.BASE, "https://api.appstoreconnect.apple.com/v2"
    try:
        r = call('GET', f'/appAvailabilities/{app_id}/territoryAvailabilities?limit=200')
        return sorted({json.loads(base64.b64decode(x['id'] + '=='))['t']
                       for x in r.get('data', []) if x['attributes'].get('available')})
    finally:
        A.BASE = old


def _iso(t: dt.datetime) -> str:
    return t.strftime('%Y-%m-%dT%H:%M:%SZ')


def resolve_dates(spec: dict) -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    if spec.get('eventStart') == 'auto':
        t = now + dt.timedelta(minutes=90)
        t = t.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1)
        spec['eventStart'] = _iso(t)
    if spec.get('publishStart') in (None, 'auto', 'same'):
        spec['publishStart'] = spec['eventStart']
    if spec.get('eventEnd') == 'auto':
        s = dt.datetime.strptime(spec['eventStart'], '%Y-%m-%dT%H:%M:%SZ')
        spec['eventEnd'] = _iso(s + dt.timedelta(days=30, hours=23))
    return spec


def validate(spec: dict) -> list:
    """애플 공식 한도로 미리 막는다(글자수·이미지 규격·일정)."""
    errs = []
    prim = spec['primary']
    if prim not in spec['locales']:
        errs.append(f'기본 로케일 {prim} 이 없다')
    for loc, t in spec['locales'].items():
        for k, lim in LIMITS.items():
            if len(t[k]) > lim:
                errs.append(f'{loc} {k} {len(t[k])}>{lim}')
        try:
            from PIL import Image
            for kind, (ar, lo, hi) in (('card', (16 / 9, (1920, 1080), (3840, 2160))),
                                       ('details', (9 / 16, (1080, 1920), (2160, 3840)))):
                w, h = Image.open(t[kind]).size
                if abs(w / h - ar) > 0.002 or w < lo[0] or h < lo[1] or w > hi[0] or h > hi[1]:
                    errs.append(f'{loc} {kind} {w}x{h} 규격 밖')
        except FileNotFoundError as e:
            errs.append(f'{loc} 이미지 없음 {e.filename}')
    f = lambda s: dt.datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ')
    es, ee, ps = f(spec['eventStart']), f(spec['eventEnd']), f(spec['publishStart'])
    if ee - es > dt.timedelta(days=31):
        errs.append('기간 31일 초과')
    if ee - es < dt.timedelta(minutes=15):
        errs.append('기간 15분 미만')
    if es - ps > dt.timedelta(days=14):
        errs.append('게시가 시작보다 14일 넘게 앞섬')
    if es <= dt.datetime.utcnow():
        errs.append('시작 시각이 과거')
    return errs


def upload(loc_id: str, path: str, asset_type: str) -> "str|None":
    blob = open(path, 'rb').read()
    r = call('POST', '/appEventScreenshots', {'data': {
        'type': 'appEventScreenshots',
        'attributes': {'fileSize': len(blob), 'fileName': os.path.basename(path),
                       'appEventAssetType': asset_type},
        'relationships': {'appEventLocalization': {
            'data': {'type': 'appEventLocalizations', 'id': loc_id}}}}})
    if '__error__' in r:
        log('      ✗ 예약', asset_type, r['body'][:200].replace('\n', ' ')); return None
    sid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        req = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']],
                                     method=op['method'])
        for h in op.get('requestHeaders', []):
            req.add_header(h['name'], h['value'])
        try:
            urllib.request.urlopen(req).read()
        except Exception as e:                                    # noqa: BLE001
            log('      ✗ 전송', e); return None
    p = call('PATCH', f'/appEventScreenshots/{sid}',
             {'data': {'type': 'appEventScreenshots', 'id': sid, 'attributes': {'uploaded': True}}})
    if '__error__' in p:
        log('      ✗ 확정', p['body'][:200].replace('\n', ' ')); return None
    return sid


def ensure_assets(lid: str, loc: str, t: dict, dry: bool):
    """로케일의 카드·상세 에셋 — 완료본은 건너뛰고, 실패본은 지우고 다시 올린다."""
    have = call('GET', f'/appEventLocalizations/{lid}/appEventScreenshots?limit=20').get('data', [])
    for kind, at in (('card', 'EVENT_CARD'), ('details', 'EVENT_DETAILS_PAGE')):
        mine = [s for s in have if s['attributes'].get('appEventAssetType') == at]
        ok = [s for s in mine if (s['attributes'].get('assetDeliveryState') or {}).get('state') in
              ('COMPLETE', 'UPLOAD_COMPLETE', 'AWAITING_UPLOAD')]
        bad = [s for s in mine if s not in ok]
        for s in bad:
            log(f"      ↻ {loc} {at} 실패본 삭제 {(s['attributes'].get('assetDeliveryState') or {}).get('errors')}")
            if not dry:
                call('DELETE', f"/appEventScreenshots/{s['id']}")
        if ok:
            log(f'      = {loc} {at} 이미 있음'); continue
        if dry:
            log(f"      (dry) {loc} {at} ← {os.path.basename(t[kind])}"); continue
        sid = upload(lid, t[kind], at)
        log(f"      {'✓' if sid else '✗'} {loc} {at} {os.path.basename(t[kind])}")


def wait_complete(loc_ids, tries=25, gap=15) -> bool:
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
            log(f'   ✓ 에셋 전부 COMPLETE ({i}회차)'); return True
        log(f'   {i}회차 대기: ' + ' | '.join(bad[:6]) + (' …' if len(bad) > 6 else ''))
        time.sleep(gap)
    return False


def find_event(app_id: str, ref: str):
    r = call('GET', f'/apps/{app_id}/appEvents?limit=200')
    for e in r.get('data', []):
        if e['attributes'].get('referenceName') == ref:
            return e
    return None


def submit(app_id: str, eid: str) -> None:
    """열린 초안 제출건이 있으면 재사용 → 항목 추가 → 제출."""
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
    items = call('GET', f'/reviewSubmissions/{sid}/items?include=appEvent&limit=50')
    has = False
    for it in items.get('data', []):
        d = ((it.get('relationships') or {}).get('appEvent') or {}).get('data')
        if d and d.get('id') == eid:
            has = True
    if not has:
        it = call('POST', '/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems',
            'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}},
                              'appEvent': {'data': {'type': 'appEvents', 'id': eid}}}}})
        if '__error__' in it:
            log('✗ 항목:', it['body'][:600]); return
    f = call('PATCH', f'/reviewSubmissions/{sid}',
             {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
    if '__error__' in f:
        log('✗ 제출:', f['body'][:400])
    else:
        log(f"   ✓ 심사 제출 {sid} {f['data']['attributes'].get('state')}")


def create(app_id: str, spec: dict, dry: bool = False, do_submit: bool = True) -> "str|None":
    spec = resolve_dates(spec)
    errs = validate(spec)
    if errs:
        log('⛔ 스펙 검사 실패:', ' · '.join(errs)); return None
    log(f"일정 {spec['publishStart']} / {spec['eventStart']} → {spec['eventEnd']}")

    ev = find_event(app_id, spec['ref'])
    attrs = {'referenceName': spec['ref'], 'badge': spec['badge'], 'deepLink': spec['deepLink'],
             'purpose': spec.get('purpose', 'ATTRACT_NEW_USERS'), 'primaryLocale': spec['primary'],
             'priority': spec.get('priority', 'HIGH'),
             'purchaseRequirement': spec.get('purchaseRequirement', 'NO_COST_ASSOCIATED')}
    if ev:
        eid, state = ev['id'], ev['attributes'].get('eventState')
        log(f"= 이벤트 이어 쓰기 {eid} [{state}]  ({spec['ref']})")
    else:
        if dry:
            log('(dry) 이벤트 생성', attrs); eid, state = None, None
        else:
            r = call('POST', '/appEvents', {'data': {'type': 'appEvents',
                'attributes': {**attrs, 'territorySchedules': []},
                'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}}}}})
            if '__error__' in r:
                log('✗ 이벤트 생성:', r['body'][:400]); return None
            eid, state = r['data']['id'], r['data']['attributes'].get('eventState')
            log(f"✓ 이벤트 {eid}  ({spec['ref']})")
    if state in DONE_STATES:
        log(f'   이미 {state} — 더 할 일 없음'); return eid

    have = {}
    if eid:
        for l in call('GET', f'/appEvents/{eid}/localizations?limit=50').get('data', []):
            have[l['attributes']['locale']] = l
    loc_ids = {}
    for loc, t in spec['locales'].items():
        body = {'name': t['name'], 'shortDescription': t['short'], 'longDescription': t['long']}
        if loc in have:
            lid = have[loc]['id']
            cur = have[loc]['attributes']
            if any(cur.get(k) != v for k, v in body.items()) and not dry:
                p = call('PATCH', f'/appEventLocalizations/{lid}', {'data': {'type': 'appEventLocalizations', 'id': lid, 'attributes': body}})
                log(f"   {'✓' if '__error__' not in p else '✗'} {loc} 문안 갱신")
            else:
                log(f'   = {loc} 문안 있음')
        elif dry:
            log(f"   (dry) {loc} 문안 ({len(t['name'])}/{len(t['short'])}/{len(t['long'])}자)"); lid = None
        else:
            r = call('POST', '/appEventLocalizations', {'data': {'type': 'appEventLocalizations',
                'attributes': {'locale': loc, **body},
                'relationships': {'appEvent': {'data': {'type': 'appEvents', 'id': eid}}}}})
            if '__error__' in r:
                log(f'   ✗ {loc} 문안:', r['body'][:250].replace('\n', ' ')); continue
            lid = r['data']['id']
            log(f"   ✓ {loc} 문안 ({len(t['name'])}/{len(t['short'])}/{len(t['long'])}자)")
        if lid:
            loc_ids[loc] = lid
            ensure_assets(lid, loc, t, dry)
        elif dry:
            log(f"      (dry) {loc} 카드·상세 ← {os.path.basename(t['card'])} · {os.path.basename(t['details'])}")
    if dry:
        log('(dry) 여기까지 — 쓰기 없음'); return eid
    if not loc_ids or not wait_complete(loc_ids):
        log('✗ 에셋 처리 미완 — 제출 보류(다시 돌리면 이어서 한다)'); return eid

    terr = territories(app_id)
    want = [{'territories': terr, 'publishStart': spec['publishStart'],
             'eventStart': spec['eventStart'], 'eventEnd': spec['eventEnd']}]
    s = call('PATCH', f'/appEvents/{eid}', {'data': {'type': 'appEvents', 'id': eid,
        'attributes': {**{k: v for k, v in attrs.items() if k != 'referenceName'}, 'territorySchedules': want}}})
    if '__error__' in s:
        log('✗ 일정:', s['body'][:400]); return eid
    log(f'   ✓ 일정 {len(terr)}개국  {spec["eventStart"]} → {spec["eventEnd"]}')
    if do_submit:
        submit(app_id, eid)
    else:
        log('   (--no-submit) 제출은 건너뜀')
    return eid


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    spec = json.load(open(args[1]))
    create(args[0], spec, dry='--dry-run' in sys.argv, do_submit='--no-submit' not in sys.argv)
