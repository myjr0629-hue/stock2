#!/usr/bin/env python3
# ============================================================================
# asc_offer_codes — SIGNUM PRO 구독 «오퍼 코드»(리딤코드)를 ASC API 로 발급한다.
#
# 왜 (2026-09-28 대표 지시): «리딤코드는 완벽하게 계획 … 니가 통제해서 할수있는 부분은 완벽하게 전부 통제».
#   계획서: .agent/marketing/research/REDEEM-PLAN-2026-09-28.md (3절 설계 · 11절 통제 지도)
#
# ⚠ 오퍼는 한 번 만들면 «지울 수 없다»(허용 동작: CREATE·GET·UPDATE — 9/23 실측). 그래서 기본은 dry-run 이다.
#   발급은 대표 승인(«이 조건으로 발급해») 뒤에만, 환경변수 CEO_APPROVED=1 과 --create 를 «둘 다» 줘야 나간다.
#
# 사용:
#   python3 scripts/asc_offer_codes.py                       # dry-run: 175개국 가격점 조회 → 페이로드 저장·요약(발급 없음)
#   CEO_APPROVED=1 python3 scripts/asc_offer_codes.py --create-offer
#   CEO_APPROVED=1 python3 scripts/asc_offer_codes.py --custom WEBPRO:300:2026-10-31 THREADSPRO:50:2026-10-31
#   CEO_APPROVED=1 python3 scripts/asc_offer_codes.py --one-time 100:2026-10-31      # 번호 목록 CSV 저장
# ============================================================================
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_client import call

SUB_ID = '6786909663'   # com.signumhq.app.pro.monthly (SIGNUM Pro Monthly, APPROVED, ONE_MONTH) — 9/29 조회
OFFER = {                # REDEEM-PLAN 3절 확정안
    'name': 'SIGNUM PRO 1 Month Free (Launch)',
    'customerEligibilities': ['NEW', 'EXPIRED'],
    'offerEligibility': 'REPLACE_INTRO_OFFERS',
    'offerMode': 'FREE_TRIAL',
    'duration': 'ONE_MONTH',
    'numberOfPeriods': 1,
}
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.agent', 'product', 'redeem')


def current_price_points():
    """구독의 «현재» 국가별 가격점 — FREE_TRIAL 오퍼도 국가별 가격점 관계가 필수다(9/23 실측)."""
    out, cursor = {}, None
    while True:
        path = f'/subscriptions/{SUB_ID}/prices?include=territory,subscriptionPricePoint&limit=200'
        if cursor:
            path += f'&cursor={cursor}'
        r = call('GET', path)
        if '__error__' in r:
            sys.exit(f'가격 조회 실패: {r}')
        for p in r['data']:
            rel = p['relationships']
            terr = rel['territory']['data']['id']
            # 시작일이 미래인 예약 가격은 건너뛴다(현재 가격만)
            if p['attributes'].get('startDate'):
                continue
            out[terr] = rel['subscriptionPricePoint']['data']['id']
        cursor = (r.get('meta', {}).get('paging') or {}).get('nextCursor')
        if not cursor:
            break
    return out


def offer_payload(points):
    inc, refs = [], []
    for i, (terr, pp) in enumerate(sorted(points.items())):
        lid = f'${{p{i}}}'
        refs.append({'type': 'subscriptionOfferCodePrices', 'id': lid})
        inc.append({'type': 'subscriptionOfferCodePrices', 'id': lid, 'relationships': {
            'territory': {'data': {'type': 'territories', 'id': terr}},
            'subscriptionPricePoint': {'data': {'type': 'subscriptionPricePoints', 'id': pp}}}})
    return {'data': {'type': 'subscriptionOfferCodes', 'attributes': OFFER, 'relationships': {
        'subscription': {'data': {'type': 'subscriptions', 'id': SUB_ID}},
        'prices': {'data': refs}}}, 'included': inc}


def need_approval():
    if os.environ.get('CEO_APPROVED') != '1':
        sys.exit('⛔ 발급은 대표 승인 뒤에만 — CEO_APPROVED=1 이 없다(오퍼는 지울 수 없다)')


def existing_offer_id():
    r = call('GET', f'/subscriptions/{SUB_ID}/offerCodes?limit=50')
    for o in r.get('data', []):
        if o['attributes'].get('name') == OFFER['name']:
            return o['id']
    return None


def main():
    args = sys.argv[1:]
    os.makedirs(OUT_DIR, exist_ok=True)
    points = current_price_points()
    payload = offer_payload(points)
    with open(os.path.join(OUT_DIR, 'offer-payload.json'), 'w') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f'국가별 현재 가격점 {len(points)}개 · 오퍼 «{OFFER["name"]}» · 기존 같은 이름 오퍼: {existing_offer_id() or "없음"}')
    print('페이로드 저장:', os.path.relpath(os.path.join(OUT_DIR, 'offer-payload.json')))
    if not args:
        print('dry-run 끝 — 발급 없음')
        return
    need_approval()
    if '--create-offer' in args:
        if existing_offer_id():
            sys.exit('⛔ 같은 이름 오퍼가 이미 있다 — 중복 생성 금지')
        r = call('POST', '/subscriptionOfferCodes', payload)
        print('오퍼 생성:', json.dumps(r, ensure_ascii=False)[:500])
        return
    oid = existing_offer_id()
    if not oid:
        sys.exit('⛔ 오퍼가 아직 없다 — 먼저 --create-offer')
    if '--custom' in args:
        for spec in args[args.index('--custom') + 1:]:
            if spec.startswith('--'):
                break
            code, n, exp = spec.split(':')
            r = call('POST', '/subscriptionOfferCodeCustomCodes', {'data': {'type': 'subscriptionOfferCodeCustomCodes',
                'attributes': {'customCode': code, 'numberOfCodes': int(n), 'expirationDate': exp},
                'relationships': {'offerCode': {'data': {'type': 'subscriptionOfferCodes', 'id': oid}}}}})
            print(f'맞춤 코드 {code}×{n}(만료 {exp}):', 'OK' if '__error__' not in r else r)
    if '--one-time' in args:
        n, exp = args[args.index('--one-time') + 1].split(':')
        r = call('POST', '/subscriptionOfferCodeOneTimeUseCodes', {'data': {'type': 'subscriptionOfferCodeOneTimeUseCodes',
            'attributes': {'numberOfCodes': int(n), 'expirationDate': exp},
            'relationships': {'offerCode': {'data': {'type': 'subscriptionOfferCodes', 'id': oid}}}}})
        print(f'일회용 코드 {n}장(만료 {exp}):', 'OK' if '__error__' not in r else r)
        # 번호 목록은 발급 처리 뒤 values 로 내려받는다(비동기일 수 있어 다음 실행에서 받는다)


if __name__ == '__main__':
    main()
