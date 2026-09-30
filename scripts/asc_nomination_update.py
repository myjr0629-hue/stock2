#!/usr/bin/env python3
# ============================================================================
# asc_nomination_update — 제출된 피처링 추천의 설명·메모·날짜를 고치고(유형·관련 앱은 제출 뒤 변경 불가),
#   승인·게시된 인앱 이벤트를 붙인다. 이름이 바뀐 추천도 id 로 다룬다(asc_nomination.py 는 «이름»으로 이어 쓴다).
# 한도(9/30 실측): description 1000자 · notes 500자 · PATCH 에 submitted(또는 archived) 값이 반드시 있어야 한다(없으면 400 REQUIRED).
# 사용: python3 scripts/asc_nomination_update.py <스펙.json> [--dry-run]
#   스펙: {"id": "...", "description"?: "...", "notes"?: "...", "publishStartDate"?: "...", "publishEndDate"?: "...",
#          "attach_event_refs"?: ["referenceName", ...], "appId"?: "6783130444"}
# ============================================================================
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call
ATTACHABLE = {'ACCEPTED', 'APPROVED', 'PUBLISHED'}

def main(spec, dry):
    nid = spec['id']
    cur = call('GET', f'/nominations/{nid}')
    if '__error__' in cur:
        print('✗ 추천 조회', cur['__error__'], cur['body'][:300]); return
    st = cur['data']['attributes'].get('state')
    attrs = {k: spec[k] for k in ('description', 'notes', 'publishStartDate', 'publishEndDate') if k in spec}
    if len(attrs.get('description') or '') > 1000: print('⛔ description > 1000'); return
    if len(attrs.get('notes') or '') > 500: print('⛔ notes > 500'); return
    evs = call('GET', f"/apps/{spec.get('appId', '6783130444')}/appEvents?limit=200").get('data', [])
    attach, wait = [], []
    for ref in spec.get('attach_event_refs', []):
        e = next((x for x in evs if x['attributes'].get('referenceName') == ref), None)
        if not e: wait.append((ref, '없음')); continue
        (attach if e['attributes'].get('eventState') in ATTACHABLE else wait).append((ref, e['id'] if e['attributes'].get('eventState') in ATTACHABLE else e['attributes'].get('eventState')))
    print(f'■ {nid} [{st}] 고칠 칸 {list(attrs)} · 붙일 이벤트 {attach} · 대기 {wait}')
    if dry: return
    if attrs:
        r = call('PATCH', f'/nominations/{nid}', {'data': {'type': 'nominations', 'id': nid, 'attributes': {**attrs, 'submitted': st == 'SUBMITTED'}}})
        print('  ', '✓ 속성' if '__error__' not in r else '✗ 속성 ' + r['body'][:300])
    if attach:
        r = call('PATCH', f'/nominations/{nid}', {'data': {'type': 'nominations', 'id': nid, 'attributes': {'submitted': True},
                  'relationships': {'inAppEvents': {'data': [{'type': 'appEvents', 'id': x[1]} for x in attach]}}}})
        print('  ', '✓ 이벤트' if '__error__' not in r else '✗ 이벤트 ' + r['body'][:300])
    a = call('GET', f'/nominations/{nid}?include=inAppEvents')['data']
    print('   확인:', a['attributes'].get('state'), a['attributes'].get('publishStartDate'), '→', a['attributes'].get('publishEndDate'),
          '| 설명', len(a['attributes'].get('description') or ''), '| 이벤트', [x['id'] for x in (a.get('relationships', {}).get('inAppEvents') or {}).get('data', [])])

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(json.load(open(args[0])), '--dry-run' in sys.argv)
