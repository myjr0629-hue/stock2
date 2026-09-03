#!/usr/bin/env python3
# ============================================================================
# aso-demand-scan — 「사람이 실제로 치는 말」 × 「그 자리가 비었는가」를 한 표로.
# ----------------------------------------------------------------------------
#   python3 scripts/aso-demand-scan.py [로케일…]        (기본: kr jp us)
#
# 왜 새로 만들었나 (2026-09-03 대표 지적: "조사를 더 해서 하던지 그랬어야지"):
#   기존 aso-opportunity-scan.py 는 **경쟁 강도만** 잰다. 자기 주석에도
#   «이건 검색량이 아니다»라고 써 있는데 그걸 알고도 그 숫자만 보고 단어를 골랐다.
#   그래서 「경쟁이 없다」= 「아무도 안 찾는다」인 말(맥스페인·다크풀)을 이름에 넣었다.
#
#   진짜 검색량은 Apple Search Ads 인기도 점수인데 그건 «캠페인을 만들어야»
#   보인다(=광고 계정에 과금 객체 생성). 대신 애플이 무료로 흘리는 신호가 있다:
#
#     App Store 검색창 자동완성 = MZSearchHints
#     → 애플이 **실제 검색 빈도순으로** 정렬해 돌려준다.
#
#   그래서 두 축을 곱한다:
#     수요  = 씨앗어를 넣었을 때 자동완성에 «몇 번째로» 뜨는가 (안 뜨면 수요 없음)
#     경쟁  = 그 말로 검색했을 때 상위 5개 앱 평점수의 «중앙값»
#
#   판정은 이 둘의 조합이다. 경쟁만 보면 「아무도 안 찾는 빈 자리」에 이름을 건다.
#
# ⚠️ 자동완성에는 «검색어»와 «앱 이름»이 섞여 나온다(인기 앱은 이름 자체가 힌트가 된다).
#    앱 이름은 공략어가 아니므로 걸러낸다 — 다만 «경쟁사 이름»으로는 따로 보고한다.
# ============================================================================
import json
import os
import plistlib
import statistics
import sys
import time
import urllib.parse
import urllib.request

OURS = {6783130444: 'SIGNUM', 6788779895: 'UC', 6794356135: 'WIM'}

# 스토어프론트 ID — 자동완성은 이 헤더가 없으면 미국 결과를 준다.
STORE = {
    'us': ('143441-1,29', 'en-US'),
    'kr': ('143466-2,29', 'ko-KR'),
    'jp': ('143462-1,29', 'ja-JP'),
    'de': ('143443-2,29', 'de-DE'),
    'tw': ('143470-2,29', 'zh-TW'),
}

# 씨앗어 — 「우리 앱이 실제로 하는 일」의 일상어 뿌리만 넣는다.
# 전문어(맥스페인·감마·다크풀)는 씨앗에 넣지 않는다. 자동완성이 비면 수요가 없다는 뜻이고,
# 그건 이미 실측으로 확인됐다.
SEEDS = {
    'kr': ['미국주식', '해외주식', '주식', '증시', '실적', '어닝', '프리마켓', '애프터',
           '나스닥', '테슬라', '엔비디아', '배당', '주가 알림', '시황', '종목', '서학',
           '주식 뉴스', '주식 캘린더', '무료 주식', '주식 공부', '경제'],
    'jp': ['米国株', '株', '決算', 'プレマーケット', '時間外', 'ナスダック', 'テスラ',
           'エヌビディア', '配当', '株価 アラート', '相場', '銘柄', '株 ニュース',
           '決算 カレンダー', '無料 株', '株 勉強', '経済', '新NISA'],
    'us': ['stocks', 'stock market', 'earnings', 'premarket', 'after hours', 'nasdaq',
           'tesla', 'nvidia', 'dividend', 'stock alerts', 'market news', 'options',
           'free stocks', 'stock calendar', 'investing', 'day trading', 'ticker'],
    'de': ['aktien', 'us aktien', 'börse', 'quartalszahlen', 'nasdaq', 'tesla',
           'dividende', 'aktien news', 'investieren'],
    'tw': ['美股', '股票', '財報', '盤前', '那斯達克', '特斯拉', '股息', '股市新聞', '投資'],
}

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_aso-demand-cache.json')


def _get(url: str, sf: str, lang: str, ua: str) -> bytes:
    req = urllib.request.Request(url, headers={
        'User-Agent': ua, 'X-Apple-Store-Front': sf, 'Accept-Language': lang})
    return urllib.request.urlopen(req, timeout=25).read()


def hints(term: str, cc: str) -> list:
    """애플 검색창 자동완성. 반환 순서 = 검색 인기순."""
    sf, lang = STORE[cc]
    u = ('https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints'
         f'?clientApplication=Software&term={urllib.parse.quote(term)}')
    try:
        d = plistlib.loads(_get(u, sf, lang, 'iTunes/12.9 (Macintosh; OS X 10.15)'))
    except Exception:
        return []
    return [h.get('term', '') for h in d.get('hints', []) if h.get('term')]


def compete(term: str, cc: str) -> dict:
    """그 말로 검색했을 때 상위 5개 평점수 중앙값 + 우리 순위."""
    u = (f'https://itunes.apple.com/search?term={urllib.parse.quote(term)}'
         f'&country={cc}&entity=software&limit=25')
    try:
        d = json.loads(_get(u, STORE[cc][0], STORE[cc][1], 'Mozilla/5.0'))
    except Exception:
        return {}
    res = d.get('results', [])
    if not res:
        return {}
    return {
        'med': int(statistics.median([a.get('userRatingCount', 0) for a in res[:5]])),
        'top': res[0].get('trackName', '')[:34],
        'mine': {OURS[a['trackId']]: i for i, a in enumerate(res, 1) if a['trackId'] in OURS},
    }


# 검색어로서 «너무 길다»의 기준은 언어마다 다르다. 독일어는 합성어라 원래 길고,
# 한중일은 한 글자가 한 단어 몫을 한다. 하나의 숫자로 자르면 진짜 검색어까지 버린다
# (2026-09-03: 22자 고정이라 DE·TW 후보가 0개로 나왔다 — «수요 없음»이 아니라 «못 쟀음»이었다).
MAX_QUERY_LEN = {'ja': 14, 'zh': 12, 'ko': 16, 'de': 34, 'vi': 34}


def is_app_name(t: str, cc: str = 'us') -> bool:
    """자동완성에 섞여 나온 «앱 이름»을 걸러낸다."""
    if any(ch in t for ch in (':', '–', '—', '｜', '|')):
        return True
    if ' - ' in t or ' – ' in t:
        return True
    lang = STORE.get(cc, ('', 'en'))[1].split('-')[0]
    return len(t) > MAX_QUERY_LEN.get(lang, 28)


def verdict(med: int) -> str:
    if med <= 100:
        return '★★즉시'
    if med <= 1000:
        return '★가능'
    if med <= 10000:
        return '△해볼만'
    return '불가'


def main() -> None:
    ccs = [a for a in sys.argv[1:] if a in STORE] or ['kr', 'jp', 'us']
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    out = {}

    for cc in ccs:
        seen, rows, brands = {}, [], []
        for seed in SEEDS[cc]:
            for rank, h in enumerate(hints(seed, cc), 1):
                if is_app_name(h, cc):
                    brands.append(h)
                    continue
                # 같은 말이 여러 씨앗에서 뜨면 «가장 앞선 순위»를 쓴다.
                if h not in seen or rank < seen[h]:
                    seen[h] = rank
            time.sleep(0.25)

        for term, drank in sorted(seen.items(), key=lambda x: x[1]):
            key = f'{cc}|{term}'
            c = cache.get(key) or compete(term, cc)
            if not c:
                continue
            cache[key] = c
            time.sleep(0.25)
            rows.append({'term': term, 'demand': drank, **c})

        out[cc] = rows
        print(f'\n{"=" * 104}\n{cc.upper()}  —  후보 {len(rows)}개  (수요=자동완성 순위, 낮을수록 많이 찾음)')
        print(f'{"검색어":<28} {"수요":>4} {"경쟁중앙값":>10} {"판정":<8} {"우리":<18} 1위앱')
        print('─' * 104)
        for r in rows:
            mine = ','.join(f'{k}={v}' for k, v in r['mine'].items()) or '—'
            print(f'{r["term"]:<28} {r["demand"]:>4} {r["med"]:>10,} {verdict(r["med"]):<8} {mine:<18} {r["top"]}')

        top = sorted({b for b in brands})[:12]
        if top:
            print(f'\n  [경쟁 앱 이름 — 자동완성에 뜨는 것] {" · ".join(top[:8])}')

    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    dst = os.path.join(os.path.dirname(CACHE), '_aso-demand-result.json')
    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n→ {dst}')


if __name__ == '__main__':
    main()
