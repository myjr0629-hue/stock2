#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================================
# play-brand-rank — 「구글 플레이 브랜드 검색 순위」를 브라우저·계정 없이 잰다 (2026-10-05 16시 회차 확장)
# ----------------------------------------------------------------------------
#   python3 scripts/play-brand-rank.py [kr|us|jp|all] [--json]
#
# 왜: aso-brand-rank.py(10/5 13시)는 «앱스토어(iOS)»만 쟀다. 그런데 사람 클릭의 대부분은 안드로이드다
#   (리딤 코드 링크 사람 클릭 iOS 0·안드 9 · 키우기 채널의 폰 클릭도 안드가 다수) — 글을 본 안드 사람이
#   Play 검색창에 우리 이름을 쳤을 때 «우리가 1위로 뜨는가»는 한 번도 안 쟀다.
#   (연구 §4: 게시는 링크가 아니라 «브랜드 검색»으로 설치를 만든다. 브랜드 검색에서 샌 설치는 게시가 만든 설치다.)
#
# 무인증 공개 웹 2개(전부 읽기 전용 · 로그인·쿠키·제출 없음):
#   play.google.com/store/search?q=<질의>&c=apps&hl=<언어>&gl=<국가>  — 결과 HTML 에서 /store/apps/details?id=<패키지>
#       가 «처음 나온 순서»가 곧 검색 결과 순서다(10/5 16시 첫 실측: «robinhood» 질의 → com.robinhood.android 1위).
#   play.google.com/store/apps/details?id=<우리 패키지>&hl=&gl=      — 스토어별 «현지 앱 이름»(검색 카드에 보이는 값)
#
# 한계(알려진 것): 검색 광고 슬롯·개인화·기기별 순서는 반영하지 않는다(익명 웹 결과). 자동완성은 옛 엔드포인트
#   (market.android.com/suggest)가 404 라 재지 않는다. 판독 실패는 «0/없음»이 아니라 «판독 실패»로 적는다(MISTAKES #18).
# 양성 대조군(#75·#79): ① 파서 대조 = «robinhood» 질의에서 com.robinhood.android 가 1위여야 한다 ② 이름 대조 = 상세
#   페이지에서 읽은 «우리 현지 이름 그대로» 검색하면 우리가 상위 3 안에 보여야 한다. 하나라도 실패면 표를 믿지 않는다.
# 결과 JSON 은 ~/signum-ego-io/<KST 날짜>/play-brand-rank.json 에 덮어쓴다(저장소 밖 · all 실행만 — slot ⏱ 줄이 이 파일 시각을 읽는다).
# ============================================================================
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PKG = 'com.signumhq.app'  # SIGNUM HQ (Android)
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/124.0.0.0 Safari/537.36')

STORE = {  # (hl, gl, Accept-Language)
    'us': ('en', 'US', 'en-US,en;q=0.9'),
    'kr': ('ko', 'KR', 'ko-KR,ko;q=0.9'),
    'jp': ('ja', 'JP', 'ja-JP,ja;q=0.9'),
}

# aso-brand-rank.py 와 «같은 질의»를 쓴다 — 아이폰·안드로이드 표를 나란히 비교하려면 질의가 같아야 한다.
TERMS = {
    'us': ['SIGNUM HQ', 'SIGNUM', 'SIGNUM PRO', 'signumhq', 'SIGNUM stock', 'SIGNUM options', 'SIGNUM HQ stock market'],
    'kr': ['SIGNUM HQ', 'SIGNUM', 'SIGNUM PRO', '시그넘', '시그넘 HQ', 'SIGNUM 미국주식', 'SIGNUM 옵션'],
    'jp': ['SIGNUM HQ', 'SIGNUM', 'SIGNUM PRO', 'シグナム', 'シグナム HQ', 'SIGNUM 米国株', 'SIGNUM 決算'],
}
# «signum» 한 단어는 다른 회사(월렛·전자서명 앱 등)도 든다 — 우리 이름의 «signum hq»·현지 음차가 든 질의만 «브랜드 질의»로 센다
BRAND_WORDS = ('signum hq', '시그넘', 'シグナム')
DELAY = 1.2  # 초 — 검색 한 번이 ~1MB 라 천천히


def _get(url, accept_lang):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': accept_lang})
    return urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')


def _retry(fn, tries=2):
    """한 번 실패하면 3초 뒤 한 번 더 — 그래도 실패면 예외를 그대로 올린다(판독 실패로 적는다)."""
    last = None
    for _ in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — 네트워크·HTTP·파싱 전부 «판독 실패»로 모은다
            last = e
            time.sleep(3)
    raise last


def search(term, cc):
    """질의 → 결과 패키지 목록(처음 나온 순서, 중복 제거). 0건이면 «파서·응답 이상»으로 예외."""
    hl, gl, al = STORE[cc]
    u = f'https://play.google.com/store/search?q={urllib.parse.quote(term)}&c=apps&hl={hl}&gl={gl}'
    page = _retry(lambda: _get(u, al))
    ids, seen = [], set()
    for m in re.finditer(r'/store/apps/details\?id=([A-Za-z0-9_.]+)', page):
        if m.group(1) not in seen:
            seen.add(m.group(1))
            ids.append(m.group(1))
    if not ids:
        raise RuntimeError('결과 패키지 0건(응답 이상)')
    return ids


def local_name(cc):
    """우리 Play 등록정보의 현지 이름 — <title> 에서 « - Google Play …» 꼬리를 뗀다."""
    hl, gl, al = STORE[cc]
    u = f'https://play.google.com/store/apps/details?id={PKG}&hl={hl}&gl={gl}'
    page = _retry(lambda: _get(u, al))
    m = re.search(r'<title[^>]*>([^<]*)</title>', page)
    if not m:
        return None
    t = html.unescape(m.group(1)).strip()
    return re.split(r'\s+[-–]\s+(?:Apps on Google Play|Google Play)', t)[0].strip() or None


def judge(rank):
    if rank is None:
        return '✗'
    return '✓' if rank == 1 else ('▲' if rank <= 3 else '△')


def run_cc(cc):
    out = {'cc': cc, 'name': None, 'rows': [], 'control': None, 'fail': []}
    try:
        out['name'] = local_name(cc)
    except Exception as e:  # noqa: BLE001
        out['fail'].append(f'현지 이름 판독 실패: {str(e)[:60]}')
    time.sleep(DELAY)
    if out['name']:  # 이름 대조 — 우리 현지 이름 그대로 검색하면 우리가 상위 3 에 보여야 한다
        try:
            ids = search(out['name'], cc)
            rk = ids.index(PKG) + 1 if PKG in ids else None
            out['control'] = {'term': out['name'], 'n': len(ids), 'rank': rk, 'ok': rk is not None and rk <= 3}
        except Exception as e:  # noqa: BLE001
            out['fail'].append(f'이름 대조 판독 실패: {str(e)[:60]}')
        time.sleep(DELAY)
    for t in TERMS[cc]:
        row = {'term': t, 'brand': any(w in t.lower() for w in BRAND_WORDS)}
        try:
            ids = search(t, cc)
            row['n'] = len(ids)
            row['rank'] = ids.index(PKG) + 1 if PKG in ids else None
            row['top3'] = ids[:3]
        except Exception as e:  # noqa: BLE001
            row['error'] = '판독 실패: ' + str(e)[:50]
        out['rows'].append(row)
        time.sleep(DELAY)
    return out


def parser_control():
    """파서 대조 — «robinhood» 질의에서 com.robinhood.android 가 1위여야 한다(검색 HTML 모양이 바뀌면 여기서 걸린다)."""
    try:
        ids = search('robinhood', 'us')
        return {'term': 'robinhood', 'n': len(ids), 'top1': ids[0], 'ok': ids[0] == 'com.robinhood.android'}
    except Exception as e:  # noqa: BLE001
        return {'term': 'robinhood', 'ok': False, 'error': '판독 실패: ' + str(e)[:50]}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    as_json = '--json' in sys.argv
    which = args[0].lower() if args else 'all'
    ccs = list(STORE) if which == 'all' else [which]
    if any(c not in STORE for c in ccs):
        print('사용: play-brand-rank.py [kr|us|jp|all] [--json]')
        return 2
    pc = parser_control()
    time.sleep(DELAY)
    results = [run_cc(c) for c in ccs]
    kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    brand_rows = [w for r in results for w in r['rows'] if w.get('brand') and 'error' not in w]
    summary = {'brand_queries': len(brand_rows), 'brand_first': sum(1 for w in brand_rows if w['rank'] == 1),
               'brand_top3': sum(1 for w in brand_rows if w['rank'] and w['rank'] <= 3),
               'brand_missing': sum(1 for w in brand_rows if w['rank'] is None)}
    meta = {'at_kst': kst.strftime('%Y-%m-%d %H:%M'), 'pkg': PKG, 'parser_control': pc, 'summary': summary, 'results': results}
    try:
        d = os.path.expanduser('~/signum-ego-io/' + kst.strftime('%Y-%m-%d'))
        os.makedirs(d, exist_ok=True)
        # 전체 실행만 «주간 일정 시계»(slot ⏱ 줄이 이 파일 시각을 읽는다)를 갱신한다 — 한 스토어만 돌린 시험은 따로 저장
        fn = 'play-brand-rank.json' if which == 'all' else f'play-brand-rank-{which}.json'
        with open(os.path.join(d, fn), 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
    except Exception:  # noqa: BLE001 — 저장 실패가 판독을 막지 않는다
        pass
    if as_json:
        print(json.dumps(meta, ensure_ascii=False, indent=1))
        return 0
    print(f'Play 브랜드 검색 순위 — SIGNUM HQ({PKG}) · {meta["at_kst"]} KST · 무인증 웹 검색(익명 · 광고 슬롯·개인화 미반영)\n')
    bad = 0
    print('파서 대조군(«robinhood» → com.robinhood.android 1위): ' + ('통과' if pc.get('ok') else f'⚠ 실패 — {pc.get("error") or pc.get("top1")} · 아래 표를 믿지 말 것'))
    bad += 0 if pc.get('ok') else 1
    print()
    for r in results:
        print(f'■ {r["cc"].upper()} — 현지 이름 «{r["name"]}»')
        for f in r['fail']:
            print('   ⚠', f)
        c = r['control']
        if c:
            print(f'   이름 대조군(현지 이름 그대로 검색): 순위 {c["rank"]} / 결과 {c["n"]} → ' + ('통과' if c['ok'] else '⚠ 실패 — 도구·응답 이상 의심, 아래 표를 믿지 말 것'))
            bad += 0 if c['ok'] else 1
        print('   질의                       결과  우리   상위 3(패키지)')
        for w in r['rows']:
            if 'error' in w:
                print(f'   {w["term"]:<26} {w["error"]}')
                continue
            rk = f'#{w["rank"]}' if w['rank'] else '—'
            tag = '·브랜드' if w['brand'] else ''
            print(f'   {judge(w["rank"])} {w["term"]:<24} {w["n"]:>4}  {rk:<5} ' + ' | '.join(w['top3']) + f'  {tag}')
        print()
    s = summary
    print(f'브랜드 질의 {s["brand_queries"]}개 중 1위 {s["brand_first"]} · 상위 3 이내 {s["brand_top3"]} · 못 찾음 {s["brand_missing"]}')
    print('✓=1위 ▲=2~3위 △=4위 이하 ✗=결과 밖 · «—»=밖이지 «0»이 아님 · «SIGNUM» 한 단어 질의는 다른 회사 앱도 들어 브랜드 질의에서 뺀다')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
