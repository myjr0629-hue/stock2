#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================================
# web-brand-rank — 「웹 검색 브랜드 순위」를 브라우저·계정 없이 잰다 (2026-10-05 19시 회차 확장)
# ----------------------------------------------------------------------------
#   python3 scripts/web-brand-rank.py [naver|yahoojp|bing|all] [--json]
#
# 왜: 연구 §4 — 게시는 링크가 아니라 «브랜드 검색»으로 설치를 만든다. 앱스토어(aso-brand-rank.py)와 Play
#   (play-brand-rank.py)는 쟀지만, 글을 본 사람이 «웹 검색창»에 우리 이름을 쳤을 때(한국=네이버 · 일본=야후재팬 ·
#   영어권 AI 검색의 바탕=빙) 우리 사이트·스토어 등록정보가 보이는지는 한 번도 안 쟀다.
#
# 무인증 공개 결과 페이지 3곳(로그인·쿠키·제출 없음 · 질의당 1회 · 1.5초 간격 · 전부 합쳐 약 20회):
#   네이버(통합검색 · KR) · 야후재팬(JP) — 기본(all). 빙(US·영어)은 명시 실행만: 쿠키 없는 비브라우저 요청에 무관한 결과를
#   돌려줘 양성 대조군이 실패한다(10/5 실측) — 봇 판별은 우회하지 않는다.
#   구글도 재지 않는다 — 봇 판독 장벽이 있어 우회하지 않는다(이 도구 범위 밖).
#
# 순위 정의: 결과 HTML 의 바깥 링크(href)를 «처음 나온 순서»로 세어, 엔진 자체 도메인을 뺀 «고유 도메인» 순위.
#   우리 표면 = signumhq.com · Play 등록정보(id=com.signumhq.app) · 앱스토어 등록정보(id6783130444).
#   (play-brand-rank.py 와 같은 «첫 등장 순서» 방식 — 검색 광고·개인화·지역은 반영하지 않는다. 이 맥(한국 IP)의 익명 결과다.)
#
# 양성 대조군(MISTAKES #75·#79·#96): ① 파서 대조 = 확실한 질의(네이버 «쿠팡»→coupang.com · 야후재팬 «ユニクロ»→uniqlo.com ·
#   빙 «github»→github.com)가 상위 3 안에 나와야 한다 ② 도메인 대조 = «signumhq.com» 질의에서 우리 사이트가 상위 3 안.
#   파서 대조가 하나라도 실패면 그 엔진 표는 믿지 않는다 · 판독 실패는 «없음»이 아니라 «판독 실패»로 적는다(#18).
# 결과 JSON: ~/signum-ego-io/<KST 날짜>/web-brand-rank.json (저장소 밖 · all 실행만 — slot ⏱ 줄이 이 파일 시각을 읽는다).
# ============================================================================
import base64
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/124.0.0.0 Safari/537.36')
PLAY_ID = 'id=com.signumhq.app'
APPSTORE_ID = 'id6783130444'
DELAY = 1.5  # 초 — 사람이 검색하듯 천천히
MIN_BODY = 20000  # 이보다 작으면 결과 페이지가 아니라 차단·동의·오류 화면으로 본다(우회하지 않고 «판독 실패»)

ENGINES = {
    'naver': {
        'label': '네이버(KR)',
        'url': 'https://search.naver.com/search.naver?query={q}',
        'lang': 'ko-KR,ko;q=0.9',
        'internal': ('naver.com', 'pstatic.net', 'naver.net', 'naver.jp', 'navercorp.com'),
        'kind': 'href',
        # blog.naver.com 은 «엔진 내부 도메인»이라 순위 계산에서 빠진다 → 내 블로그(원장 PUBLISH-LEDGER 의 naver_blog URL 아이디) 글이
        #   결과 페이지에 몇 개 보이는지를 따로 센다(블로그·카페·지식iN 영역 포함 — 순위가 아니라 «노출 수»).
        'own_paths': ('blog.naver.com/donneum', 'm.blog.naver.com/donneum'),
        'queries': ['SIGNUM HQ', '시그넘 HQ', 'SIGNUM 미국주식', 'SIGNUM PRO'],
        # «소재 질의» — 브랜드가 아니라 우리 블로그 글 제목의 «뜻·읽는 법» 꼬리 질의(얇은 문). 10/5 19시 첫 실측: 꼬리 질의 2개에서 내 글 2편씩이
        #   첫 화면 블로그 결과의 전부였고, 머리 질의(맥스페인 뜻 16·다크풀 공매도 7 = 남의 블로그)에는 없었다. 주 1회 추적한다.
        'topic_queries': ['맥스페인 콜월 풋플로어 뜻', '감마 플립 다크풀 비중 뜻', '맥스페인 뜻', '다크풀 공매도'],
        'parser_control': ('쿠팡', 'coupang.com'),
    },
    'yahoojp': {
        'label': '야후재팬(JP)',
        'url': 'https://search.yahoo.co.jp/search?p={q}',
        'lang': 'ja-JP,ja;q=0.9',
        'internal': ('yahoo.co.jp', 'yimg.jp', 'yahoo.com', 'yahooapis.jp'),
        'kind': 'href',
        # 일본 쪽 «내 글»: note(note.com/signumhq)·X 일본·Threads 일본 계정 — 결과 페이지에 보이는 고유 글 수(순위 아님)
        'own_paths': ('note.com/signumhq', 'x.com/signumhq_jp', 'threads.com/@signumhq_official', 'threads.net/@signumhq_official'),
        # «소재 질의» — 우리 일본어 페이지·note 글의 «とは» 꼬리 질의(얇은 문). 10/5 19시 첫 실측 후 주 1회 추적.
        'topic_queries': ['マックスペイン とは', 'ダークプール 米国株 とは', 'ガンマフリップ とは'],
        'queries': ['SIGNUM HQ', 'シグナム HQ', 'SIGNUM 米国株', 'SIGNUM PRO'],
        'parser_control': ('ユニクロ', 'uniqlo.com'),
    },
    'bing': {
        # ★10/5 실측: 쿠키 없는 비브라우저 요청에는 «무관한 결과»를 돌려준다(github → residentevil.shop · «SIGNUM HQ» → WageWorks·valantic
        #   등 URL 변수 3종 모두) = 봇 의심 시 결과를 뭉개는 것으로 추정. 봇 판별 우회는 금지라 «all» 에서 뺀다(명시 실행만 · 대조 실패면 표 불신).
        'skip_all': True,
        'label': '빙(US·영어)',
        'url': 'https://www.bing.com/search?q={q}&setlang=en&cc=us',
        'lang': 'en-US,en;q=0.9',
        'internal': ('bing.com', 'microsoft.com', 'msn.com'),
        'kind': 'bing',
        'queries': ['SIGNUM HQ', 'SIGNUM HQ app', 'SIGNUM HQ options flow', 'SIGNUM PRO'],
        'parser_control': ('github', 'github.com'),
    },
}
DOMAIN_CONTROL = 'signumhq.com'


def _get(url, lang):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': lang})
    body = urllib.request.urlopen(req, timeout=25).read().decode('utf-8', 'replace')
    if len(body) < MIN_BODY:
        raise RuntimeError('결과 페이지가 아니다(본문 %d자 — 차단·동의·오류 화면 추정, 우회하지 않는다)' % len(body))
    return body


def _blocked(ex):
    """403·429 = 엔진이 «그만 두드려라»라고 알리는 신호 — 재시도·우회 없이 그 엔진은 이번 실행에서 멈춘다."""
    return isinstance(ex, urllib.error.HTTPError) and ex.code in (403, 429)


def _retry(fn, tries=2):
    last = None
    for _ in range(tries):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 — 네트워크·HTTP·파싱 전부 «판독 실패»로 모은다
            if _blocked(e):
                raise  # 429·403 은 재시도하면 더 두드리는 것이다(10/5 19시: 15분에 야후재팬 약 55회 → 429)
            last = e
            time.sleep(3)
    raise last


def _dom(href):
    n = urllib.parse.urlparse(href).netloc.lower().split(':')[0]
    for p in ('www.', 'm.'):
        if n.startswith(p):
            n = n[len(p):]
    return n


def _is_internal(dom, internal):
    return any(dom == i or dom.endswith('.' + i) for i in internal)


def _ours(href):
    h = href.lower()
    d = _dom(h)
    if d == 'signumhq.com' or d.endswith('.signumhq.com'):
        return 'signumhq.com'
    if 'play.google.com' in d and PLAY_ID in h:
        return 'Play(우리)'
    if 'apps.apple.com' in d and APPSTORE_ID in h:
        return 'AppStore(우리)'
    return None


def _bing_decode(h):
    """빙은 결과 링크를 bing.com/ck/a?…&u=a1<base64url> 로 감싼다 — 실제 주소로 푼다."""
    h = html.unescape(h)
    m = re.search(r'[?&]u=a1([A-Za-z0-9_\-]+)', h)
    if not m:
        return h
    s = m.group(1)
    s += '=' * (-len(s) % 4)
    try:
        return base64.urlsafe_b64decode(s).decode('utf-8', 'replace')
    except Exception:  # noqa: BLE001
        return h


def _links(body, kind):
    if kind == 'bing':
        raw = re.findall(r'<li class="b_algo"[^>]*>.*?<h2[^>]*><a[^>]*href="([^"]+)"', body, flags=re.S)
        return [_bing_decode(h) for h in raw]
    return [html.unescape(h) for h in re.findall(r'href=["\'](https?://[^"\']+)["\']', body)]


def rank(engine, query):
    """(우리 표면 순위·키 | None, 상위 도메인 6, 전체 고유 도메인 수, 내 블로그 글 노출 수) — 판독 실패는 예외."""
    e = ENGINES[engine]
    body = _retry(lambda: _get(e['url'].format(q=urllib.parse.quote_plus(query)), e['lang']))
    links = _links(body, e['kind'])
    own = {re.sub(r'[?#].*$', '', h.lower()) for h in links if any(p in h.lower() for p in e.get('own_paths', ()))}
    keys, ours_hit = [], None
    for h in links:
        d = _dom(h)
        if not d or _is_internal(d, e['internal']):
            continue
        o = _ours(h)
        k = o or d
        if k not in keys:
            keys.append(k)
            if o and ours_hit is None:
                ours_hit = (len(keys), o)
    return ours_hit, keys[:6], len(keys), len(own)


def verdict(hit):
    if hit is None:
        return '첫 페이지에 우리 표면 없음'
    r = hit[0]
    return '1위' if r == 1 else ('상위3' if r <= 3 else ('10위 안' if r <= 10 else '밖'))


def _engine_complete(r):
    return bool(r.get('parser_ok')) and not r.get('blocked') and all(
        row.get('verdict') != '판독 실패' and not str(row.get('verdict', '')).startswith('건너뜀') for row in r.get('rows', []))


def _load_reusable():
    """오늘·어제 폴더의 partial 기록에서 «6시간 안 · 완전한» 엔진 결과만 재사용한다(이미 두드린 엔진을 다시 두드리지 않는다)."""
    ok = {}
    for off in (1, 0):  # 최신(오늘)이 어제를 덮는다
        dd = (datetime.datetime.utcnow() + datetime.timedelta(hours=9 - 24 * off)).strftime('%Y-%m-%d')
        fp = os.path.join(_outdir(dd), 'web-brand-rank-partial.json')
        try:
            if os.path.exists(fp) and time.time() - os.path.getmtime(fp) < 6 * 3600:
                for en, r in json.load(open(fp, encoding='utf-8')).get('engines', {}).items():
                    if _engine_complete(r):
                        ok[en] = r
        except Exception:  # noqa: BLE001
            pass
    return ok


def _outdir(kst):
    return os.environ.get('WEB_BRAND_RANK_DIR') or os.path.expanduser('~/signum-ego-io/%s' % kst)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    want = args[0] if args else 'all'
    as_json = '--json' in sys.argv
    engines = [k for k, v in ENGINES.items() if not v.get('skip_all')] if want == 'all' else [want]
    # 가드: 주간 도구다 — 6시간 안에 «완전한» 기록이 있으면 다시 두드리지 않는다(--force 로만). 10/5 19시: 개발 중 반복 실행으로 야후재팬 429.
    if want == 'all' and not as_json and '--force' not in sys.argv:
        for off in (0, 1):
            dd = (datetime.datetime.utcnow() + datetime.timedelta(hours=9 - 24 * off)).strftime('%Y-%m-%d')
            fp = os.path.join(_outdir(dd), 'web-brand-rank.json')
            if os.path.exists(fp) and time.time() - os.path.getmtime(fp) < 6 * 3600:
                print('· 이미 %d분 전에 실행했다(%s) — 주 1회 도구라 다시 두드리지 않는다. 꼭 필요하면 --force' % ((time.time() - os.path.getmtime(fp)) / 60, fp))
                return 0
    if any(x not in ENGINES for x in engines):
        print('사용: web-brand-rank.py [naver|yahoojp|bing|all] [--json]')
        return 2
    out = {'at': datetime.datetime.now().isoformat(timespec='seconds'), 'engines': {}}
    reuse = _load_reusable() if (want == 'all' and not as_json and '--force' not in sys.argv) else {}
    for en in engines:
        e = ENGINES[en]
        if en in reuse:
            out['engines'][en] = reuse[en]
            print('· %s — 6시간 안의 완전한 기록을 재사용한다(다시 두드리지 않는다)' % e['label'])
            continue
        res = {'label': e['label'], 'controls': {}, 'rows': [], 'blocked': None}
        # ① 파서 대조(확실한 질의) ② 도메인 대조(우리 도메인 질의)
        q, want_dom = e['parser_control']
        try:
            _, top, _n, _o = rank(en, q)
            res['controls']['parser'] = {'query': q, 'expect': want_dom, 'top': top[:3], 'ok': want_dom in top[:3]}
        except Exception as ex:  # noqa: BLE001
            res['controls']['parser'] = {'query': q, 'expect': want_dom, 'error': str(ex)[:90], 'ok': False}
            if _blocked(ex):
                res['blocked'] = str(ex)[:60]
        time.sleep(DELAY)
        if not res['blocked']:
            try:
                hit, top, _n, _o = rank(en, DOMAIN_CONTROL)
                res['controls']['domain'] = {'query': DOMAIN_CONTROL, 'rank': hit[0] if hit else None, 'top': top[:3],
                                             'ok': bool(hit and hit[0] <= 3)}
            except Exception as ex:  # noqa: BLE001
                res['controls']['domain'] = {'query': DOMAIN_CONTROL, 'error': str(ex)[:90], 'ok': False}
                if _blocked(ex):
                    res['blocked'] = str(ex)[:60]
            time.sleep(DELAY)
        for qy, kind in [(x, '브랜드') for x in e['queries']] + [(x, '소재') for x in e.get('topic_queries', [])]:
            row = {'query': qy, 'kind': kind}
            if res['blocked']:
                row['verdict'] = '건너뜀(%s)' % res['blocked']
                res['rows'].append(row)
                continue
            try:
                hit, top, n, own = rank(en, qy)
                row.update({'ours_rank': hit[0] if hit else None, 'ours_key': hit[1] if hit else None,
                            'verdict': verdict(hit), 'top': top, 'unique_domains': n})
                if e.get('own_paths'):
                    row['own_posts'] = own
            except Exception as ex:  # noqa: BLE001
                row.update({'verdict': '판독 실패', 'error': str(ex)[:90]})
                if _blocked(ex):
                    res['blocked'] = str(ex)[:60]
            res['rows'].append(row)
            time.sleep(DELAY)
        res['parser_ok'] = bool(res['controls'].get('parser', {}).get('ok'))
        out['engines'][en] = res
    if as_json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
    else:
        for en, res in out['engines'].items():
            c = res['controls']
            p, d = c.get('parser', {}), c.get('domain', {})
            print('\n── %s ── 파서 대조 «%s»→%s %s · 도메인 대조 «%s» %s' % (
                res['label'], p.get('query'), p.get('expect'),
                ('통과' if p.get('ok') else '실패(' + (p.get('error') or '상위 %s' % p.get('top')) + ')'),
                d.get('query'), ('우리 %s위 통과' % d.get('rank') if d.get('ok') else
                                 ('실패(' + (d.get('error') or ('우리 순위 %s · 상위 %s' % (d.get('rank'), d.get('top')))) + ')'))))
            if res.get('blocked'):
                print('   ⚠ 엔진이 한도를 알렸다(%s) — 이 엔진은 이번 실행에서 멈췄다(재시도·우회 없음 · 한참 뒤에 다시).' % res['blocked'])
            elif not res['parser_ok']:
                print('   ⚠ 파서 대조 실패 — 이 엔진 표는 믿지 않는다(#75).')
            for r in res['rows']:
                r['query'] = ('[소재] ' if r.get('kind') == '소재' else '') + r['query']
                if r.get('verdict') == '판독 실패':
                    print('   %-22s 판독 실패: %s' % (r['query'], r.get('error')))
                    continue
                if str(r.get('verdict', '')).startswith('건너뜀'):
                    print('   %-22s %s' % (r['query'], r['verdict']))
                    continue
                ours = ('%s %d위' % (r['ours_key'], r['ours_rank'])) if r.get('ours_rank') else '—'
                blog = (' · 내 글 %d개 노출' % r['own_posts']) if 'own_posts' in r else ''
                print('   %-22s %-14s %-20s 상위: %s%s' % (r['query'], r['verdict'], ours, ' > '.join(r['top'][:5]), blog))
    # 저장(all 실행만 — 부분 실행이 slot 일정을 지우지 않게)
    if want == 'all' and not as_json:
        complete = all(_engine_complete(r) for r in out['engines'].values())
        try:
            kst = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime('%Y-%m-%d')
            d = _outdir(kst)
            os.makedirs(d, exist_ok=True)
            name = 'web-brand-rank.json' if complete else 'web-brand-rank-partial.json'
            with open(os.path.join(d, name), 'w', encoding='utf-8') as f:
                json.dump(out, f, ensure_ascii=False, indent=1)
            print('\n· 결과 저장: %s/%s%s' % (d.replace(os.path.expanduser('~'), '~'), name,
                  '' if complete else '  ← 일부 엔진 판독 실패·중단 — 주간 기록(web-brand-rank.json)은 갱신하지 않았다(slot 일정은 그대로)'))
        except Exception as ex:  # noqa: BLE001
            print('· 결과 저장 실패(표는 위에 있다): %s' % str(ex)[:80])
    return 0


if __name__ == '__main__':
    sys.exit(main())
