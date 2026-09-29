#!/usr/bin/env python3
# ============================================================================
# asc_nomination — App Store «피처링 추천(Featuring Nominations)»을 API 로 만든다·제출한다·이어서 한다.
# ----------------------------------------------------------------------------
# 왜: 애플 편집팀에 «직접» 추천하는 무료 창구(PLATFORM-PLAYBOOK §16). 인앱 이벤트를 붙이면 타이밍 훅이 생긴다.
#
# API (2026-09-30 애플 문서 JSON 으로 확인 — developer.apple.com/tutorials/data/documentation/appstoreconnectapi/…):
#   POST /v1/nominations
#     attributes(필수) name · description · type(APP_LAUNCH | APP_ENHANCEMENTS | NEW_CONTENT) · publishStartDate · submitted
#     attributes(선택) publishEndDate · deviceFamilies(IPHONE…) · locales(기존 제출건 형식 'EN-US','JA','KO')
#                      · supplementalMaterialsUris(최대 5) · hasInAppEvents · launchInSelectMarketsFirst · preOrderEnabled · notes
#     relationships  relatedApps(필수, apps) · inAppEvents(appEvents) · supportedTerritories(territories, 'KOR','JPN'…)
#   GET  /v1/nominations?filter[state]=SUBMITTED|DRAFT  — filter[state] 가 없으면 400
#   PATCH /v1/nominations/{id} {submitted:true}
# 애플 도움말(Nominate your app for featuring): 최소 3주 전 제출 권장 · 인앱 이벤트는 «승인 또는 게시» 상태여야 붙는다
#   · 제출 뒤에는 유형·관련 앱만 못 바꾼다(나머지는 수정 가능) → 이벤트 승인 후 이 스크립트를 다시 돌리면 이벤트를 붙인다.
#
# «이어서 하기»: 같은 name 의 추천이 있으면 새로 만들지 않고 이어 쓴다(초안이면 제출, 제출본이면 이벤트만 붙인다).
# 한도(9/30 실측): description 1000자(넘으면 400) · 보충 자료 URL 5개.
# 사용: python3 scripts/asc_nomination.py <스펙.json> [--dry-run]
# ============================================================================
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

ATTACHABLE = {'ACCEPTED', 'APPROVED', 'PUBLISHED'}


def log(*a):
    print(*a, flush=True)


def find(name):
    for st in ('DRAFT', 'SUBMITTED'):
        for n in call('GET', f'/nominations?filter[state]={st}&limit=200').get('data', []):
            if n['attributes'].get('name') == name:
                return n, st
    return None, None


def event_ids(app_id, refs):
    """referenceName → (id, state). 승인·게시된 것만 붙일 수 있다."""
    out = []
    evs = call('GET', f'/apps/{app_id}/appEvents?limit=200').get('data', [])
    for ref in refs:
        e = next((x for x in evs if x['attributes'].get('referenceName') == ref), None)
        if not e:
            log(f'   ! 이벤트 없음: {ref}'); continue
        out.append((e['id'], e['attributes'].get('eventState'), ref))
    return out


def main(spec, dry):
    app = spec['relatedApps'][0]
    evs = event_ids(app, spec.get('inAppEventRefs', []))
    attach = [e for e in evs if e[1] in ATTACHABLE]
    wait = [e for e in evs if e[1] not in ATTACHABLE]
    for e in wait:
        log(f'   … 이벤트 {e[2]} ({e[0]}) 는 아직 {e[1]} — 승인 뒤 다시 돌리면 붙인다')
    attrs = {k: spec[k] for k in ('name', 'description', 'type', 'publishStartDate', 'publishEndDate', 'deviceFamilies',
                                   'locales', 'supplementalMaterialsUris', 'hasInAppEvents', 'launchInSelectMarketsFirst',
                                   'preOrderEnabled', 'notes') if k in spec}
    if len(attrs.get('supplementalMaterialsUris') or []) > 5:
        log('⛔ 보충 자료 URL 은 최대 5개'); return
    if len(attrs.get('description') or '') > 1000:   # 9/30 실측: 400 "The maximum allowable limit is '1000'"
        log(f"⛔ description {len(attrs['description'])}자 > 1000"); return
    rel = {'relatedApps': {'data': [{'type': 'apps', 'id': a} for a in spec['relatedApps']]}}
    if spec.get('territories'):
        rel['supportedTerritories'] = {'data': [{'type': 'territories', 'id': t} for t in spec['territories']]}
    if attach:
        rel['inAppEvents'] = {'data': [{'type': 'appEvents', 'id': e[0]} for e in attach]}

    n, st = find(spec['name'])
    if dry:
        log('(dry) 기존:', (n or {}).get('id'), st)
        log('(dry) attributes', json.dumps(attrs, ensure_ascii=False)[:600])
        log('(dry) relationships', json.dumps(rel)[:400]); return
    if not n:
        r = call('POST', '/nominations', {'data': {'type': 'nominations',
                                                   'attributes': {**attrs, 'submitted': False},
                                                   'relationships': rel}})
        if '__error__' in r:
            log('✗ 추천 생성:', r['__error__'], r['body'][:900]); return
        n, st = r['data'], 'DRAFT'
        log(f"✓ 추천 초안 {n['id']}  {attrs['name']}")
    else:
        log(f"= 추천 이어 쓰기 {n['id']} [{st}]")
        if attach:
            p = call('PATCH', f"/nominations/{n['id']}", {'data': {'type': 'nominations', 'id': n['id'],
                                                                     'relationships': {'inAppEvents': rel['inAppEvents']}}})
            log(f"   {'✓' if '__error__' not in p else '✗'} 이벤트 붙이기 {[e[2] for e in attach]}" +
                ('' if '__error__' not in p else ' ' + p['body'][:400]))
    if st == 'DRAFT':
        s = call('PATCH', f"/nominations/{n['id']}", {'data': {'type': 'nominations', 'id': n['id'],
                                                                 'attributes': {'submitted': True}}})
        if '__error__' in s:
            log('✗ 제출:', s['__error__'], s['body'][:600]); return
        log(f"✓ 추천 제출 {n['id']} state={s['data']['attributes'].get('state')}")
    got = call('GET', f"/nominations/{n['id']}?include=inAppEvents,supportedTerritories,relatedApps")
    a = (got.get('data') or {}).get('attributes', {})
    relg = (got.get('data') or {}).get('relationships', {})
    log('   확인:', a.get('state'), a.get('type'), a.get('publishStartDate'), '→', a.get('publishEndDate'),
        '| 국가', [x['id'] for x in (relg.get('supportedTerritories') or {}).get('data', [])],
        '| 이벤트', [x['id'] for x in (relg.get('inAppEvents') or {}).get('data', [])])


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(json.load(open(args[0])), dry='--dry-run' in sys.argv)
