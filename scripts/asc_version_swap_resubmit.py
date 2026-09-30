#!/usr/bin/env python3
# ============================================================================
# asc_version_swap_resubmit — 심사 «대기» 중인 버전의 빌드를 갈아 끼워 다시 제출한다(메타데이터 보강 포함).
# ----------------------------------------------------------------------------
# 왜 (2026-09-30): 1.10.0(빌드 14)이 WAITING_FOR_REVIEW 인 사이 위젯 결함(가격이 벽을 넘으면 지도 가림·맥스페인 ±20%)을 고쳤다.
#   승인 뒤 1.10.1 로 한 번 더 심사받는 대신, 아직 심사가 시작되지 않았으니 제출을 취소하고 빌드 15로 바꿔 한 번에 낸다.
#   제출 취소(PATCH reviewSubmissions canceled:true)는 즉시 PREPARE_FOR_SUBMISSION 으로 돌린다(9/29 CPP 에서 실측).
#
# 단계(각각 따로 돌릴 수 있다 — 기본은 미리보기, --apply 가 있어야 쓴다):
#   cancel  — 제출건 취소 → 버전이 편집 가능 상태가 될 때까지 기다린다
#   meta    — appInfoLocalization(이름·부제) 고치기/새로 만들기 · 새 로케일의 appStoreVersionLocalization 만들기(설명·URL 은 copyFrom 복사)
#             (키워드·새로운 기능·홍보문구·스크린샷은 그다음 asc_release_bundle.py --apply 가 채운다)
#   build   — 빌드(buildNumber) 처리 완료(VALID)를 기다려 버전에 연결
#   submit  — 제출건(READY_FOR_REVIEW 재사용 또는 새로)에 버전 + CPP 버전을 넣는다(제출은 이벤트까지 넣은 뒤 --final 로)
#   final   — 제출건을 submitted:true 로
# 사용: python3 scripts/asc_version_swap_resubmit.py <plan.json> <단계> [--apply]
# ============================================================================
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

EDITABLE = ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY')


def log(*a):
    print(*a, flush=True)


def ok(r):
    return '__error__' not in r


def err(r):
    return f"✗ {r.get('__error__')} {r.get('body', '')[:500]}"


def version(p):
    return call('GET', f"/appStoreVersions/{p['versionId']}?include=build")


def editable_app_info(p):
    """버전과 함께 심사로 가는 appInfo(라이브 READY_FOR_SALE 이 아닌 쪽)."""
    for ai in call('GET', f"/apps/{p['appId']}/appInfos").get('data', []):
        st = ai['attributes'].get('appStoreState') or ai['attributes'].get('state')
        if st != 'READY_FOR_SALE':
            return ai['id'], st
    return None, None


def step_cancel(p, apply):
    sid = p['cancelSubmissionId']
    s = call('GET', f'/reviewSubmissions/{sid}')
    st = s.get('data', {}).get('attributes', {}).get('state')
    log(f'제출건 {sid} 상태 {st}')
    if st in ('COMPLETE', 'CANCELING') or st is None:
        log('   취소할 것 없음'); return
    if st == 'IN_REVIEW':
        log('   ⚠ 이미 심사 중 — 취소하면 심사가 중단된다. 멈춘다(판단 필요)'); return
    if not apply:
        log('   (미리보기) canceled:true 를 보낼 것'); return
    r = call('PATCH', f'/reviewSubmissions/{sid}', {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'canceled': True}}})
    log('   ✓ 취소 요청' if ok(r) else err(r))
    for _ in range(40):
        v = version(p)['data']['attributes']['appStoreState']
        if v in EDITABLE:
            log(f'   ✓ 버전 상태 {v}'); return
        time.sleep(6)
    log('   ⚠ 버전이 아직 편집 가능 상태가 아니다')


def step_meta(p, apply):
    aid, st = editable_app_info(p)
    log(f'appInfo {aid} [{st}]')
    locs = {l['attributes']['locale']: l for l in call('GET', f'/appInfos/{aid}/appInfoLocalizations?limit=50').get('data', [])}
    base = locs[p['copyFrom']]['attributes']
    for lc, want in p['appInfoLocalizations'].items():
        for k, lim in (('name', 30), ('subtitle', 30)):
            if len(want[k]) > lim:
                log(f'   ⛔ {lc} {k} {len(want[k])}>{lim}자'); return
        if lc in locs:
            cur = locs[lc]['attributes']
            diff = {k: v for k, v in want.items() if cur.get(k) != v}
            log(f"   {lc} 이름·부제 {'그대로' if not diff else diff}")
            if apply and diff:
                r = call('PATCH', f"/appInfoLocalizations/{locs[lc]['id']}", {'data': {'type': 'appInfoLocalizations', 'id': locs[lc]['id'], 'attributes': diff}})
                log('      ✓' if ok(r) else '      ' + err(r))
        else:
            attrs = dict(locale=lc, name=want['name'], subtitle=want['subtitle'], privacyPolicyUrl=base.get('privacyPolicyUrl'))
            log(f'   {lc} appInfoLocalization 새로: {want}')
            if apply:
                r = call('POST', '/appInfoLocalizations', {'data': {'type': 'appInfoLocalizations', 'attributes': attrs,
                          'relationships': {'appInfo': {'data': {'type': 'appInfos', 'id': aid}}}}})
                log('      ✓' if ok(r) else '      ' + err(r))
    vlocs = {l['attributes']['locale']: l for l in call('GET', f"/appStoreVersions/{p['versionId']}/appStoreVersionLocalizations?limit=50").get('data', [])}
    vb = vlocs[p['copyFrom']]['attributes']
    for lc in p.get('newVersionLocales', []):
        if lc in vlocs:
            # appInfoLocalization 을 새로 만들면 애플이 버전 로케일을 «빈 채로» 자동으로 만든다(9/30 실측) → 비어 있는 칸만 채운다
            cur = vlocs[lc]['attributes']
            need = {k: vb[k] for k in ('description', 'supportUrl', 'marketingUrl') if vb.get(k) and not cur.get(k)}
            log(f"   {lc} 버전 로케일 있음{' — 빈 칸 채움 ' + str(list(need)) if need else ''}")
            if apply and need:
                r = call('PATCH', f"/appStoreVersionLocalizations/{vlocs[lc]['id']}", {'data': {'type': 'appStoreVersionLocalizations', 'id': vlocs[lc]['id'], 'attributes': need}})
                log('      ✓' if ok(r) else '      ' + err(r))
            continue
        attrs = {k: vb.get(k) for k in ('description', 'supportUrl', 'marketingUrl', 'promotionalText', 'whatsNew') if vb.get(k)}
        attrs['locale'] = lc
        log(f"   {lc} 버전 로케일 새로(설명 {len(attrs.get('description', ''))}자 등 {p['copyFrom']} 복사)")
        if apply:
            r = call('POST', '/appStoreVersionLocalizations', {'data': {'type': 'appStoreVersionLocalizations', 'attributes': attrs,
                      'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': p['versionId']}}}}})
            log('      ✓' if ok(r) else '      ' + err(r))


def find_build(p):
    r = call('GET', f"/builds?filter[app]={p['appId']}&filter[version]={p['buildNumber']}&filter[preReleaseVersion.version]={p['versionString']}&limit=3")
    d = r.get('data') or []
    return d[0] if d else None


def step_build(p, apply):
    b = None
    for i in range(60):
        b = find_build(p)
        st = b and b['attributes'].get('processingState')
        if st == 'VALID':
            break
        if st in ('FAILED', 'INVALID'):
            log(f'   ✗ 빌드 {st}'); return
        if i == 0:
            log(f'   빌드 {p["buildNumber"]} 처리 대기({st or "아직 안 보임"})…')
        time.sleep(30)
    if not b or b['attributes'].get('processingState') != 'VALID':
        log('   ⚠ 30분 안에 VALID 가 안 됐다'); return
    log(f"   ✓ 빌드 {p['buildNumber']} VALID {b['id']} (암호화 {b['attributes'].get('usesNonExemptEncryption')})")
    cur = (version(p).get('data', {}).get('relationships', {}).get('build', {}).get('data') or {}).get('id')
    if cur == b['id']:
        log('   이미 연결됨'); return
    if apply:
        r = call('PATCH', f"/appStoreVersions/{p['versionId']}/relationships/build", {'data': {'type': 'builds', 'id': b['id']}})
        log('   ✓ 버전에 빌드 연결' if ok(r) else '   ' + err(r))
    else:
        log(f'   (미리보기) 빌드 {cur} → {b["id"]}')


def open_submission(p, apply):
    subs = call('GET', f"/reviewSubmissions?filter[app]={p['appId']}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW&limit=5").get('data') or []
    if subs:
        return subs[0]['id']
    if not apply:
        return None
    r = call('POST', '/reviewSubmissions', {'data': {'type': 'reviewSubmissions', 'attributes': {'platform': 'IOS'},
             'relationships': {'app': {'data': {'type': 'apps', 'id': p['appId']}}}}})
    return r['data']['id'] if ok(r) else log(err(r))


def step_submit(p, apply):
    sid = open_submission(p, apply)
    log(f'제출건 {sid or "(새로 만들 것)"}')
    have = set()
    if sid:
        for it in call('GET', f'/reviewSubmissions/{sid}/items?limit=50').get('data', []):
            for rel, d in (it.get('relationships') or {}).items():
                if isinstance(d, dict) and isinstance(d.get('data'), dict):
                    have.add(d['data']['id'])
    for rel, typ, rid in (('appStoreVersion', 'appStoreVersions', p['versionId']),
                          ('appCustomProductPageVersion', 'appCustomProductPageVersions', p.get('cppVersionId'))):
        if not rid:
            continue
        if rid in have:
            log(f'   {rel} 이미 들어 있음'); continue
        log(f'   + {rel} {rid}')
        if apply and sid:
            r = call('POST', '/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems',
                     'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}},
                                       rel: {'data': {'type': typ, 'id': rid}}}}})
            log('      ✓' if ok(r) else '      ' + err(r))


def step_final(p, apply):
    sid = open_submission(p, False)
    if not sid:
        log('열린 제출건 없음'); return
    items = call('GET', f'/reviewSubmissions/{sid}/items?limit=50').get('data', [])
    log(f'제출건 {sid} 항목 {len(items)}개')
    if apply:
        r = call('PATCH', f'/reviewSubmissions/{sid}', {'data': {'type': 'reviewSubmissions', 'id': sid, 'attributes': {'submitted': True}}})
        log(f"   ✓ 제출 {r['data']['attributes'].get('state')}" if ok(r) else '   ' + err(r))


if __name__ == '__main__':
    plan = json.load(open(sys.argv[1], encoding='utf-8'))
    step = sys.argv[2]
    apply = '--apply' in sys.argv
    {'cancel': step_cancel, 'meta': step_meta, 'build': step_build, 'submit': step_submit, 'final': step_final}[step](plan, apply)
