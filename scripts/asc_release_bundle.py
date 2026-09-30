#!/usr/bin/env python3
# ============================================================================
# asc_release_bundle — «다음 앱 버전»에 실을 스토어 자료(키워드·새로운 기능·기본 스크린샷·홍보문구)를
#   이미 만들어진 «편집 가능한» 버전에만 적용한다. 버전을 만들지도, 심사에 제출하지도 않는다.
# ----------------------------------------------------------------------------
# 왜: 키워드·whatsNew·스크린샷은 라이브 버전에서 409 다(빌드 게이트 — NEXT-VERSION-CHECKLIST.md).
#   준비물을 파일로 두고, 새 버전이 PREPARE_FOR_SUBMISSION 이 되는 순간 이 스크립트 한 번으로 밀어 넣는다.
#   (7/10 준비 → 7/29 제출 때 전달이 안 돼 한국어 키워드가 45/100 로 방치된 사고의 재발 방지)
#
# 안전장치:
#   · 대상은 versionString 이 정확히 같은 버전 하나 · 상태가 EDITABLE 이 아니면 아무것도 쓰지 않고 «대기»로 끝낸다
#   · 기본은 미리보기(쓰기 0). --apply 가 있어야 쓴다 · 심사 제출·버전 생성 코드는 «없다»
#   · 스크린샷은 번들에 적힌 로케일만 바꾼다(PPO 시험 중인 ko 는 번들에서 빼 두면 손대지 않는다)
#   · 파일이 하나라도 없으면 스크린샷 단계 전체를 멈춘다(--allow-missing 이면 빠진 장만 건너뛴다)
# 키워드는 정본 store-metadata/NEXT-BUILD-keywords.json 의 "signum/<locale>" 을 쓴다(asc-apply-next-keywords.py 와 같은 값).
#
# 사용: python3 scripts/asc_release_bundle.py <bundle.json> [--apply] [--variant A|B] [--order recommended|conservative]
#                                             [--only keywords,whatsnew,screenshots,promo] [--allow-missing]
#       점검: --preview-on 1.9.2  (라이브 버전 로케일로 미리보기만 — 경로·폴백·글자수 검사, 쓰기 불가)
# ============================================================================
import hashlib, json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

EDITABLE = ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KW_PATH = os.path.join(ROOT, 'store-metadata', 'NEXT-BUILD-keywords.json')
DISPLAY = 'APP_IPHONE_65'
MAX_PER_SET = 10          # App Store 스크린샷 세트 한 개에 들어가는 최대 장수(넘으면 409 SCREENSHOT_TOO_MANY)


def log(*a):
    print(*a, flush=True)


def opt(name, default=None):
    for i, a in enumerate(sys.argv):
        if a == f'--{name}' and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def find_version(app_id, want):
    vs = call('GET', f'/apps/{app_id}/appStoreVersions?limit=20').get('data', [])
    for v in vs:
        if v['attributes'].get('versionString') == want and v['attributes'].get('platform', 'IOS') == 'IOS':
            return v
    return None


def upload(set_id, path):
    blob = open(path, 'rb').read()
    r = call('POST', '/appScreenshots', {'data': {'type': 'appScreenshots',
        'attributes': {'fileSize': len(blob), 'fileName': os.path.basename(path)},
        'relationships': {'appScreenshotSet': {'data': {'type': 'appScreenshotSets', 'id': set_id}}}}})
    if '__error__' in r:
        log('      ✗ 예약', r['body'][:160].replace('\n', ' ')); return None
    sid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        q = urllib.request.Request(op['url'], data=blob[op['offset']:op['offset'] + op['length']], method=op['method'])
        for h in op.get('requestHeaders', []):
            q.add_header(h['name'], h['value'])
        urllib.request.urlopen(q).read()
    p = call('PATCH', f'/appScreenshots/{sid}', {'data': {'type': 'appScreenshots', 'id': sid,
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(blob).hexdigest()}}})
    return sid if '__error__' not in p else None


def replace_set(loc_id, loc, files, apply, allow_missing):
    """세트 내용을 files(순서대로)로 바꾼다: 새 장 올림 → COMPLETE → 순서 → 번들에 없는 옛 장 삭제."""
    missing = [f for f in files if not os.path.exists(f)]
    if missing and not allow_missing:
        log(f'   ⛔ {loc} 파일 없음 {len(missing)}장 — 스크린샷 단계 중단: ' + ', '.join(os.path.basename(m) for m in missing))
        return False
    files = [f for f in files if os.path.exists(f)]
    sets = call('GET', f'/appStoreVersionLocalizations/{loc_id}/appScreenshotSets?limit=20').get('data', [])
    st = next((s for s in sets if s['attributes'].get('screenshotDisplayType') == DISPLAY), None)
    if not st:
        log(f'   {loc} {DISPLAY} 세트 없음 → 새로 만든다' if apply else f'   (dry) {loc} {DISPLAY} 세트 생성')
        if not apply:
            return True
        r = call('POST', '/appScreenshotSets', {'data': {'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': DISPLAY},
             'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': loc_id}}}}})
        if '__error__' in r:
            log('   ✗ 세트 생성', r['body'][:200]); return False
        st = r['data']
    old = call('GET', f"/appScreenshotSets/{st['id']}/appScreenshots?limit=20").get('data', [])
    have = {d['attributes']['fileName']: d['id'] for d in old}
    names = [os.path.basename(f) for f in files]
    to_upload = [f for f in files if os.path.basename(f) not in have]
    stale = [d for d in old if d['attributes']['fileName'] not in names]
    # ★2026-09-30 실측(it 로케일): 새 장을 먼저 올리면 옛 6 + 새 5 = 11장 → 409 STATE_ERROR.SCREENSHOT_TOO_MANY(세트 한도 10).
    #   편집 가능한 «새 버전» 세트만 다루므로(라이브 버전은 main() 이 막는다) 한도를 넘으면 번들에 없는 옛 장을 먼저 지운다.
    delete_first = len(old) + len(to_upload) > MAX_PER_SET
    log(f"   {loc}: 지금 {len(old)}장 → 번들 {len(files)}장  {names}"
        + (f"  (옛 {len(stale)}장 먼저 삭제: {len(old)}+{len(to_upload)}>{MAX_PER_SET})" if delete_first else ''))
    if not apply:
        return True
    if delete_first:
        for d in stale:
            r = call('DELETE', f"/appScreenshots/{d['id']}")
            log(f"      − 옛 장(먼저) {d['attributes']['fileName']}{'' if '__error__' not in r else ' ✗ ' + r['body'][:120]}")
    for f in files:
        if os.path.basename(f) in have:
            continue
        log(f"      {'✓' if upload(st['id'], f) else '✗'} {os.path.basename(f)}")
    for i in range(20):
        cur = call('GET', f"/appScreenshotSets/{st['id']}/appScreenshots?limit=20").get('data', [])
        pend = [d['attributes']['fileName'] for d in cur if d['attributes']['fileName'] in names
                and (d['attributes'].get('assetDeliveryState') or {}).get('state') != 'COMPLETE']
        if not pend:
            break
        log(f'      대기 {i + 1}: {pend}'); time.sleep(15)
    cur = call('GET', f"/appScreenshotSets/{st['id']}/appScreenshots?limit=20").get('data', [])
    by = {d['attributes']['fileName']: d['id'] for d in cur}
    for d in cur:                                   # 번들에 없는 옛 장은 «새 버전 세트에서만» 지운다
        if d['attributes']['fileName'] not in names:
            call('DELETE', f"/appScreenshots/{d['id']}")
            log(f"      − 옛 장 {d['attributes']['fileName']}")
    want = [by[n] for n in names if n in by]
    call('PATCH', f"/appScreenshotSets/{st['id']}/relationships/appScreenshots",
         {'data': [{'type': 'appScreenshots', 'id': x} for x in want]})
    log('      ↕ 순서 맞춤')
    return True


def main():
    bundle_path = [a for a in sys.argv[1:] if not a.startswith('--') and a.endswith('.json')][0]
    b = json.load(open(bundle_path, encoding='utf-8'))
    apply = '--apply' in sys.argv
    variant = opt('variant', b.get('whatsNew', {}).get('default_variant', 'A'))
    order_key = opt('order', 'recommended')
    only = set((opt('only') or 'keywords,whatsnew,screenshots,promo').split(','))
    allow_missing = '--allow-missing' in sys.argv
    app_id, want = b['appId'], b['versionString']
    probe = opt('preview-on')          # 점검용: 라이브 버전의 로케일로 «미리보기만» 돌려 경로·폴백을 검사한다(쓰기 금지)
    if probe:
        if apply:
            log('⛔ --preview-on 은 --apply 와 같이 쓸 수 없다'); return
        want = probe

    v = find_version(app_id, want)
    if not v:
        log(f'⏸ {want} 버전이 아직 없다 — 이 스크립트는 버전을 만들지 않는다(릴리스 절차가 만든 뒤 다시 실행)'); return
    state = v['attributes'].get('appStoreState') or v['attributes'].get('state')
    if state not in EDITABLE and not probe:
        log(f'⏸ {want} 상태 {state} — 편집 불가(라이브·심사 중이면 409). 쓰지 않는다'); return
    log(f"■ {want} [{state}] {'적용' if apply else '미리보기'} · whatsNew {variant} · 순서 {order_key}")
    locs = {l['attributes']['locale']: l for l in
            call('GET', f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations?limit=50").get('data', [])}

    if 'keywords' in only:
        plan = json.load(open(KW_PATH, encoding='utf-8'))
        for lc, lo in sorted(locs.items()):
            k = plan.get(f'signum/{lc}')
            if not k:
                continue
            new, old = k['keywords'], lo['attributes'].get('keywords') or ''
            if len(new) > 100:
                log(f'   ⛔ 키워드 {lc} {len(new)}>100'); continue
            log(f"   키워드 {lc}: {'그대로' if new == old else f'{len(old)}→{len(new)}자'}")
            if apply and new != old:
                r = call('PATCH', f"/appStoreVersionLocalizations/{lo['id']}", {'data': {'type': 'appStoreVersionLocalizations',
                     'id': lo['id'], 'attributes': {'keywords': new}}})
                log(f"      {'✓' if '__error__' not in r else '✗ ' + r['body'][:160]}")

    if 'whatsnew' in only:
        wn = b['whatsNew']['variants'][variant]
        for lc, lo in sorted(locs.items()):
            text = wn.get(lc) or wn.get(b['whatsNew'].get('fallback', {}).get(lc, 'en-US'))
            if not text:
                continue
            old = lo['attributes'].get('whatsNew') or ''
            log(f"   새로운 기능 {lc}: {'그대로' if text == old else text[:48] + '…'}")
            if apply and text != old:
                r = call('PATCH', f"/appStoreVersionLocalizations/{lo['id']}", {'data': {'type': 'appStoreVersionLocalizations',
                     'id': lo['id'], 'attributes': {'whatsNew': text}}})
                log(f"      {'✓' if '__error__' not in r else '✗ ' + r['body'][:160]}")

    if 'promo' in only and b.get('promotionalText'):
        for lc, lo in sorted(locs.items()):
            text = b['promotionalText'].get(lc) or b['promotionalText'].get(b.get('promoFallback', {}).get(lc, 'en-US'))
            if not text or len(text) > 170:
                continue
            old = lo['attributes'].get('promotionalText') or ''
            log(f"   홍보문구 {lc}: {'그대로' if text == old else f'{len(text)}자'}")
            if apply and text != old:
                call('PATCH', f"/appStoreVersionLocalizations/{lo['id']}", {'data': {'type': 'appStoreVersionLocalizations',
                     'id': lo['id'], 'attributes': {'promotionalText': text}}})

    if 'screenshots' in only:
        sc = b['screenshots']
        order = sc['orders'][order_key]
        for lc, src in sc['locales'].items():        # 번들에 적힌 로케일만(ko 는 PPO 보류안이면 여기 없다)
            if lc not in locs:
                continue
            files = [os.path.join(sc['root'], src, f'{k}-{src}-1242x2688.png') for k in order]
            if not replace_set(locs[lc]['id'], lc, files, apply, allow_missing):
                log('   ⛔ 스크린샷 단계 중단'); break
    log('끝 — 심사 제출은 이 스크립트가 하지 않는다(릴리스 절차·대표 승인)')


if __name__ == '__main__':
    main()
