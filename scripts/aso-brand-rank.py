#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================================
# aso-brand-rank — 「브랜드 검색 순위」를 브라우저·계정 없이 잰다 (2026-10-05 13시 회차 확장)
# ----------------------------------------------------------------------------
#   python3 scripts/aso-brand-rank.py [kr|us|jp|all] [--json]
#
# 왜: 연구(10/4 성장 효과 연구 §4)·ASC 14일 실측 — 게시는 링크가 아니라 «브랜드 검색»으로
#   설치를 만든다(다운로드 30 중 27 = App Store Search · 웹 리퍼러 1). 그런데 aso-thin-door·
#   aso-demand-scan 은 «일반 키워드»만 재서, 글을 본 사람이 앱스토어에서 우리 이름을 쳤을 때
#   «우리가 1위로 뜨는가»는 한 번도 안 쟀다. 브랜드 검색에서 샌 설치는 게시가 만든 설치다.
#
# 무인증 공개 API 3개(전부 읽기 전용):
#   itunes.apple.com/search   — 질의별 결과 순서(우리 앱 순위)
#   itunes.apple.com/lookup   — 스토어별 현지 앱 이름·평점 수·버전(검색 카드에 보이는 값)
#   MZSearchHints             — 검색창 자동완성(접두어를 치면 우리 이름이 뜨는가)
#
# 한계(가설 아님, 알려진 것): search API 순서는 기기 앱스토어 검색 순서와 «거의» 같지만 개인화·
#   광고(검색 결과 맨 위 광고 슬롯)는 반영하지 않는다. 광고 슬롯은 «순위»가 아니라 별개다.
# 판독 실패는 «0 / 없음»이 아니라 «판독 실패»로 적는다(MISTAKES #18) · 양성 대조군 =
#   lookup 으로 얻은 «우리 현지 이름 그대로» 검색 → 못 찾으면 도구/응답 이상(#75·#79).
# 결과 JSON 은 ~/signum-ego-io/<KST 날짜>/aso-brand-rank.json 에 덮어쓴다(저장소 밖 · all 실행만 — 한 스토어 시험은 aso-brand-rank-<cc>.json).
# ============================================================================
import datetime
import json
import os
import plistlib
import sys
import time
import urllib.parse
import urllib.request

APP = 6783130444  # SIGNUM HQ
OURS = {6783130444: 'SIGNUM', 6788779895: 'UC', 6794356135: 'WIM'}

STORE = {  # 자동완성·검색은 이 스토어프론트 헤더가 있어야 그 나라 결과를 준다
    'us': ('143441-1,29', 'en-US'),
    'kr': ('143466-2,29', 'ko-KR'),
    'jp': ('143462-1,29', 'ja-JP'),
}

# 글을 본 사람이 «앱스토어 검색창에 실제로 칠 만한» 이름 변형만 넣는다 — «SIGNUM PRO» 는 리딤 B 글(th-ja-b10·x-jp-b-main·th-ko-b10 등)이 쓰는 표기
TERMS = {
    'us': ['SIGNUM HQ', 'SIGNUM', 'SIGNUM PRO', 'signumhq', 'SIGNUM stock', 'SIGNUM options', 'SIGNUM HQ stock market'],
    'kr': ['SIGNUM HQ', 'SIGNUM', 'SIGNUM PRO', '시그넘', '시그넘 HQ', 'SIGNUM 미국주식', 'SIGNUM 옵션'],
    'jp': ['SIGNUM HQ', 'SIGNUM', 'SIGNUM PRO', 'シグナム', 'シグナム HQ', 'SIGNUM 米国株', 'SIGNUM 決算'],
}
PREFIX = {  # 자동완성 접두어 — 이름을 «다 치기 전에» 우리가 뜨는가
    'us': ['sign', 'signum', 'signum h'],
    'kr': ['signum', '시그', '시그넘'],
    'jp': ['signum', 'シグナ', 'シグナム'],
}
# «signum» 한 단어는 다른 회사(Signum International AG 등)도 든다 — 우리 이름의 «signum hq» 로 판정(첫 실행에서 오탐 확인)
BRAND_WORDS = ('signum hq', '시그넘 hq', 'シグナム hq', '시그넘', 'シグナム')
LIMIT = 50


def _get(url, cc, ua):
    sf, lang = STORE[cc]
    req = urllib.request.Request(url, headers={
        'User-Agent': ua, 'X-Apple-Store-Front': sf, 'Accept-Language': lang})
    return urllib.request.urlopen(req, timeout=25).read()


def _retry(fn, tries=2):
    """한 번 실패하면 3초 뒤 한 번 더 — 그래도 실패면 예외를 그대로 올린다(판독 실패로 적는다)."""
    last = None
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — 네트워크·HTTP·파싱 전부 «판독 실패»로 모은다
            last = e
            time.sleep(3)
    raise last


def lookup(cc):
    u = f'https://itunes.apple.com/lookup?id={APP}&country={cc}'
    d = json.loads(_retry(lambda: _get(u, cc, 'signumhq-aso-probe/1.0')).decode('utf-8'))
    res = d.get('results') or []
    if not res:
        return None
    a = res[0]
    return {'name': a.get('trackName'), 'ratings': a.get('userRatingCount'),
            'avg': a.get('averageUserRating'), 'version': a.get('version')}


def search(term, cc):
    u = (f'https://itunes.apple.com/search?term={urllib.parse.quote(term)}'
         f'&country={cc}&entity=software&limit={LIMIT}')
    d = json.loads(_retry(lambda: _get(u, cc, 'signumhq-aso-probe/1.0')).decode('utf-8'))
    return d.get('results') or []


def hints(term, cc):
    u = ('https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints'
         f'?clientApplication=Software&term={urllib.parse.quote(term)}')
    d = plistlib.loads(_retry(lambda: _get(u, cc, 'iTunes/12.9 (Macintosh; OS X 10.15)')))
    return [h.get('term', '') for h in d.get('hints', []) if h.get('term')]


def judge(rank):
    if rank is None:
        return '✗'
    return '✓' if rank == 1 else ('▲' if rank <= 3 else '△')


def run_cc(cc):
    out = {'cc': cc, 'lookup': None, 'rows': [], 'hints': [], 'control': None, 'fail': []}
    try:
        out['lookup'] = lookup(cc)
    except Exception as e:  # noqa: BLE001
        out['fail'].append(f'lookup 판독 실패: {str(e)[:60]}')
    # 양성 대조군 — 우리 현지 이름 그대로 검색하면 우리가 보여야 한다
    if out['lookup'] and out['lookup'].get('name'):
        try:
            res = search(out['lookup']['name'], cc)
            ids = [a['trackId'] for a in res]
            rk = ids.index(APP) + 1 if APP in ids else None
            out['control'] = {'term': out['lookup']['name'], 'n': len(res), 'rank': rk,
                              'ok': rk is not None and rk <= 3}
        except Exception as e:  # noqa: BLE001
            out['fail'].append(f'양성 대조군 판독 실패: {str(e)[:60]}')
        time.sleep(0.6)
    for t in TERMS[cc]:
        row = {'term': t}
        try:
            res = search(t, cc)
            ids = [a['trackId'] for a in res]
            row['n'] = len(res)
            row['rank'] = ids.index(APP) + 1 if APP in ids else None
            row['others'] = {OURS[i]: ids.index(i) + 1 for i in OURS if i != APP and i in ids}
            row['top3'] = [(a.get('trackName') or '')[:30] for a in res[:3]]
        except Exception as e:  # noqa: BLE001
            row['error'] = '판독 실패: ' + str(e)[:50]
        out['rows'].append(row)
        time.sleep(0.6)
    for p in PREFIX[cc]:
        h = {'prefix': p}
        try:
            lst = hints(p, cc)
            h['hints'] = lst[:6]
            h['brand_at'] = next((i + 1 for i, x in enumerate(lst) if any(w in x.lower() for w in BRAND_WORDS)), None)
        except Exception as e:  # noqa: BLE001
            h['error'] = '판독 실패: ' + str(e)[:50]
        out['hints'].append(h)
        time.sleep(0.6)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    as_json = '--json' in sys.argv
    which = args[0].lower() if args else 'all'
    ccs = list(STORE) if which == 'all' else [which]
    if any(c not in STORE for c in ccs):
        print('사용: aso-brand-rank.py [kr|us|jp|all] [--json]')
        return 2
    results = [run_cc(c) for c in ccs]
    kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    meta = {'at_kst': kst.strftime('%Y-%m-%d %H:%M'), 'app': APP, 'results': results}
    try:
        d = os.path.expanduser('~/signum-ego-io/' + kst.strftime('%Y-%m-%d'))
        os.makedirs(d, exist_ok=True)
        # 전체 실행만 «주간 일정 시계»(slot ⏱ 줄이 이 파일 시각을 읽는다)를 갱신한다 — 한 스토어만 돌린 시험은 따로 저장
        fn = 'aso-brand-rank.json' if which == 'all' else f'aso-brand-rank-{which}.json'
        with open(os.path.join(d, fn), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
    except Exception:  # noqa: BLE001 — 저장 실패가 판독을 막지 않는다
        pass
    if as_json:
        print(json.dumps(meta, ensure_ascii=False, indent=1))
        return 0
    print(f'브랜드 검색 순위 — SIGNUM HQ({APP}) · {meta["at_kst"]} KST · 무인증 search/lookup/자동완성 · limit {LIMIT}\n')
    bad = 0
    for r in results:
        lk = r['lookup'] or {}
        print(f'■ {r["cc"].upper()} — 현지 이름 «{lk.get("name")}» · 평점 {lk.get("ratings")}건(평균 {lk.get("avg")}) · v{lk.get("version")}')
        for f in r['fail']:
            print('   ⚠', f)
        c = r['control']
        if c:
            print(f'   양성 대조군(현지 이름 그대로 검색): 순위 {c["rank"]} / 결과 {c["n"]} → ' + ('통과' if c['ok'] else '⚠ 실패 — 도구·응답 이상 의심, 아래 표를 믿지 말 것'))
            bad += 0 if c['ok'] else 1
        print('   질의                       결과  우리   다른 우리앱   상위 3')
        for w in r['rows']:
            if 'error' in w:
                print(f'   {w["term"]:<26} {w["error"]}')
                continue
            oth = ','.join(f'{k}#{v}' for k, v in w['others'].items()) or '—'
            rk = f'#{w["rank"]}' if w['rank'] else '—'
            print(f'   {judge(w["rank"])} {w["term"]:<24} {w["n"]:>4}  {rk:<5} {oth:<12} ' + ' | '.join(w['top3']))
        for h in r['hints']:
            if 'error' in h:
                print(f'   자동완성 «{h["prefix"]}» {h["error"]}')
                continue
            at = f'우리 브랜드 {h["brand_at"]}번째' if h['brand_at'] else '브랜드 안 뜸'
            print(f'   자동완성 «{h["prefix"]}» → {at}: ' + ' / '.join(h['hints'][:5]))
        print()
    print('✓=1위 ▲=2~3위 △=4위 이하 ✗=상위 %d 밖 · 광고 슬롯·개인화는 반영 안 됨 · «—»=밖이지 «0»이 아님' % LIMIT)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
