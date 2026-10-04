#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""x-reply-data — x_reply «데이터 한 줄»의 원천 계산 도구 (2026-10-04 21시 회차 신설 · 브라우저 없음 · 읽기 전용).

왜: 10/4 21시 X 답글 두 건의 숫자(재무부 곡선 변화·«역대» 순위·섹터 3분기 성적)를 즉석 파이썬으로 재계산했고 그 코드는 스크래치에만 있었다
    (MISTAKES #49 «로그에만 있는 요령은 첫 반복에 도구로»). 숫자는 손이 아니라 코드로 — 변화량·순위·«N 이후 최고»는 이 도구가 단언까지 한다.

사용:
  python3 scripts/x-reply-data.py ust [--from 2026-09-25] [--to 2026-10-02]
      재무부 «일별 par 곡선»(공식 CSV, 1990~)에서 2Y·10Y·30Y 수준·bp 변화·2s10s, 그리고 «to» 날짜 10년물이 «그 이전 마지막으로 이만큼 높았던 날»을 찍는다.
      (30년물은 2002-02~2006-02 구간이 재무부 곡선에 비어 있다 — «역대/N년 이후» 문장은 10년물·2년물에만 쓴다)
  python3 scripts/x-reply-data.py sectors [--from 2026-06-30] [--to 2026-09-30] [--week-from 2026-09-25] [--week-to 2026-10-02]
      SPDR 섹터 ETF 11개 + SPY·QQQ 의 «from→to 종가 수익률» 순위와 «주간(week)» 수익률(나스닥 historical·종가). 1위·꼴찌를 단언해 출력.
  python3 scripts/x-reply-data.py pairs --a SPY --b RSP [--a2 QQQ --b2 QQEW] --from 2025-12-31 --to 2026-10-02      (10/4 22시 신설)
      «시총가중 대 동일가중» 같은 두 ETF 의 구간 종가 수익률과 격차(%p)를 쌍마다 찍는다(집중도·쏠림 소재). 나스닥 historical·종가 · 휴장일은 직전 거래일.
  python3 scripts/x-reply-data.py corr --tickers SPY,QQQ,IWM,XLK,XLF,XLE [--days 120] [--to 2026-10-02]      (10/4 22시 신설)
      ETF 일간 수익률의 상관계수 행렬(최근 N 거래일·종가) — «포지션 수 제한 ≠ 위험 제한»(같이 움직이는 종목) 설명용. 표본 일수·기간을 같이 찍는다.
  python3 scripts/x-reply-data.py wlen "<답글 본문>"   (또는 wlen @파일경로)
      X 가중 글자 수(twitter-text v3: 0~4351·8192~8205·8208~8223·8242~8247 = 1, 그 밖 = 2 — 한글·일본어·→·유니코드 −·이모지는 2). 280 초과면 종료 1.
※ 10/4 22시 실측: 나스닥 historical 은 «최근 약 10개월»만 준다(2025-11 이전 구간은 행 0 — SPY·AAPL 2016~2025 전부 빈 응답). «N년 계절성»(예: 최근 20년 10월 수익률) 문장은 이 도구로 못 만든다 — stooq 는 JS 봇 검증(curl 불가)·FRED 는 접속 불가였다. 장기 통계는 원천을 먼저 확보한 뒤에만 쓴다.
주의: 날짜가 휴장일이면 «직전 거래일» 종가를 쓴다고 출력한다. 값은 «전부 종가 기준» — 글에 «종가»·«N일 마감»을 쓸 때 MISTAKES #36 대로 날짜를 함께 적는다.
"""
import argparse, csv, io, json, os, sys, time, urllib.request, datetime, concurrent.futures as cf

HOME = os.path.expanduser('~')
CACHE = HOME + '/signum-ego-io/x-data-cache'
os.makedirs(CACHE, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'}


def fetch(url, headers=None, tries=3, timeout=40):
    last = None
    for _ in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=headers or UA), timeout=timeout).read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1)
    raise RuntimeError('조회 실패 %s: %s' % (url[:90], last))


def ust_year(y):
    """재무부 일별 par 곡선 CSV — 지난 해는 영구 캐시, 올해는 3시간 캐시."""
    f = '%s/ust-%d.csv' % (CACHE, y)
    now_y = datetime.date.today().year
    if os.path.exists(f) and (y < now_y or time.time() - os.path.getmtime(f) < 3 * 3600):
        return open(f, encoding='utf-8').read()
    u = ('https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/%d/all'
         '?type=daily_treasury_yield_curve&field_tdr_date_value=%d&page&_format=csv' % (y, y))
    t = fetch(u).decode('utf-8-sig')
    open(f, 'w', encoding='utf-8').write(t)
    return t


def load_ust():
    rows = []
    with cf.ThreadPoolExecutor(5) as ex:
        for t in ex.map(ust_year, range(1990, datetime.date.today().year + 1)):
            for r in csv.DictReader(io.StringIO(t)):
                m, d, y = r['Date'].split('/')
                f = lambda k: float(r[k]) if r.get(k) not in (None, '') else None  # noqa: E731
                rows.append(('%s-%s-%s' % (y, m, d), f('2 Yr'), f('10 Yr'), f('30 Yr')))
    rows.sort()
    return rows


def at_or_before(rows, d):
    c = [r for r in rows if r[0] <= d]
    if not c:
        sys.exit('⛔ %s 이전 데이터 없음' % d)
    return c[-1]


def cmd_ust(a):
    rows = load_ust()
    to = at_or_before(rows, a.to or rows[-1][0])
    fr = at_or_before(rows, a.frm) if a.frm else rows[-6]
    print('재무부 par 곡선(공식 CSV) · %d행 %s~%s' % (len(rows), rows[0][0], rows[-1][0]))
    if fr[0] != (a.frm or fr[0]):
        print('  (from %s 는 휴장 — 직전 거래일 %s 사용)' % (a.frm, fr[0]))
    names = (('2Y', 1), ('10Y', 2), ('30Y', 3))
    for n, i in names:
        if fr[i] is None or to[i] is None:
            print('  %-3s 값 없음' % n); continue
        print('  %-3s %s %.2f%% -> %s %.2f%%  (%+d bp)' % (n, fr[0], fr[i], to[0], to[i], round((to[i] - fr[i]) * 100)))
    print('  2s10s %s %d bp -> %s %d bp' % (fr[0], round((fr[2] - fr[1]) * 100), to[0], round((to[2] - to[1]) * 100)))
    for n, i in (('2Y', 1), ('10Y', 2)):
        lv = to[i]
        prev = [r for r in rows if r[0] < to[0] and r[i] is not None and r[i] >= lv]
        mx = max((r for r in rows if r[0] <= to[0] and r[i] is not None), key=lambda r: r[i])
        print('  %s %.2f%% (%s): 이전에 이만큼 높았던 마지막 날 = %s' % (n, lv, to[0], ('%s (%.2f%%)' % (prev[-1][0], prev[-1][i])) if prev else '없음(1990 이후 최고)'))
        later = [r for r in rows if prev and r[0] > prev[-1][0] and r[0] <= to[0] and r[i] is not None]
        if prev and later:
            top = max(later, key=lambda r: r[i])
            print('      그 뒤 최고 종가 = %s %.2f%% %s' % (top[0], top[i], '(= to 날짜 자신)' if top[0] == to[0] else '(to 날짜보다 높은 날이 있다 — «최고» 문장 금지)'))
    print('  ※ 30년물 «역대» 문장 금지: 2002-02~2006-02 가 재무부 곡선에 비어 있다')


SECT = ['XLE', 'XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC']
NQ = {'User-Agent': UA['User-Agent'], 'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}


def etf(t, frm, to):
    u = 'https://api.nasdaq.com/api/quote/%s/historical?assetclass=etf&fromdate=%s&limit=400&todate=%s' % (t, frm, to)
    j = json.loads(fetch(u, NQ, timeout=30))
    # 나스닥 historical 은 «최근 약 10개월» 밖이면 data/tradesTable 이 null 이다(10/4 22시 실측) — 빈 dict 를 돌려 호출자가 «시세 없음»을 말하게 한다
    rows = (((j.get('data') or {}).get('tradesTable')) or {}).get('rows') or []
    out = {}
    for r in rows:
        m, d, y = r['date'].split('/')
        out['%s-%s-%s' % (y, m, d)] = float(r['close'].replace('$', '').replace(',', ''))
    return t, out


def cmd_sectors(a):
    lo = min(x for x in (a.frm, a.week_from) if x)
    start = (datetime.date.fromisoformat(lo) - datetime.timedelta(days=10)).isoformat()
    end = (datetime.date.fromisoformat(max(x for x in (a.to, a.week_to) if x)) + datetime.timedelta(days=3)).isoformat()
    tick = SECT + ['SPY', 'QQQ']
    data = {}
    with cf.ThreadPoolExecutor(5) as ex:
        for t, d in ex.map(lambda x: etf(x, start, end), tick):
            data[t] = d
    def px(t, d):
        c = [k for k in data[t] if k <= d]
        if not c:
            sys.exit('⛔ %s %s 이전 종가 없음' % (t, d))
        k = max(c)
        return k, data[t][k]
    def table(title, d0, d1):
        res = []
        for t in tick:
            k0, p0 = px(t, d0); k1, p1 = px(t, d1)
            res.append((t, (p1 / p0 - 1) * 100, k0, p0, k1, p1))
        print('%s  %s -> %s (종가)' % (title, res[0][2], res[0][4]))
        if any(r[2] != d0 or r[4] != d1 for r in res):
            print('  (휴장일은 직전 거래일 종가)')
        for t, r, k0, p0, k1, p1 in sorted(res, key=lambda x: -x[1]):
            print('  %-5s %+6.2f%%   %8.2f -> %8.2f' % (t, r, p0, p1))
        sec = sorted([r for r in res if r[0] in SECT], key=lambda x: -x[1])
        print('  ▶ 11개 섹터 1위 %s %+.1f%% · 2위 %s %+.1f%% · 꼴찌 %s %+.1f%% · 끝에서 둘째 %s %+.1f%%' % (sec[0][0], sec[0][1], sec[1][0], sec[1][1], sec[-1][0], sec[-1][1], sec[-2][0], sec[-2][1]))
    if a.frm and a.to:
        table('구간', a.frm, a.to)
    if a.week_from and a.week_to:
        table('주간', a.week_from, a.week_to)


def _close_at(data, d):
    """d 이하의 마지막 거래일 종가(휴장일은 직전 거래일)."""
    c = [k for k in data if k <= d]
    if not c:
        sys.exit('⛔ %s 이전 종가 없음' % d)
    k = max(c)
    return k, data[k]


def cmd_pairs(a):
    """같은 기간의 «A ETF 대 B ETF» 수익률·격차. --a/--b 가 필수, --a2/--b2 로 둘째 쌍."""
    pairs = [(a.a, a.b)]
    if a.a2 and a.b2:
        pairs.append((a.a2, a.b2))
    if not (a.frm and a.to):
        sys.exit('⛔ --from 과 --to 가 필요하다')
    start = (datetime.date.fromisoformat(a.frm) - datetime.timedelta(days=10)).isoformat()
    end = (datetime.date.fromisoformat(a.to) + datetime.timedelta(days=3)).isoformat()
    tick = sorted({t for p in pairs for t in p})
    data = {}
    with cf.ThreadPoolExecutor(4) as ex:
        for t, d in ex.map(lambda x: etf(x, start, end), tick):
            if not d:
                sys.exit('⛔ %s 시세 없음(나스닥 historical 은 최근 약 10개월만 준다)' % t)
            data[t] = d
    print('구간 %s -> %s (종가 · 나스닥 historical)' % (a.frm, a.to))
    holiday = False
    for x, y in pairs:
        k0, p0 = _close_at(data[x], a.frm); k1, p1 = _close_at(data[x], a.to)
        j0, q0 = _close_at(data[y], a.frm); j1, q1 = _close_at(data[y], a.to)
        if (k0, k1) != (j0, j1):
            sys.exit('⛔ %s·%s 기준일이 다르다: %s/%s vs %s/%s' % (x, y, k0, k1, j0, j1))
        holiday = holiday or (k0 != a.frm or k1 != a.to)
        rx = (p1 / p0 - 1) * 100; ry = (q1 / q0 - 1) * 100
        print('  %-5s %+6.2f%%  (%.2f -> %.2f, %s -> %s)' % (x, rx, p0, p1, k0, k1))
        print('  %-5s %+6.2f%%  (%.2f -> %.2f)' % (y, ry, q0, q1))
        print('  ▶ %s 가 %s 보다 %+.1f%%p (%s)' % (x, y, rx - ry, '앞선다' if rx > ry else '뒤진다'))
        # 글에는 «원값에서 한 번만 반올림한» 1자리를 쓴다 — 2자리 표시값을 다시 반올림하면 15.148→15.15→15.2 처럼 틀린다(10/4 22시 QQEW 실측)
        print('  ▶ 글용(원값에서 1자리): %s %+.1f%% · %s %+.1f%% · 격차 %.1f%%p' % (x, rx, y, ry, abs(rx - ry)))
    if holiday:
        print('  (휴장일은 직전 거래일 종가)')


def cmd_corr(a):
    """ETF 일간 수익률 상관계수 행렬 — 최근 N 거래일(종가→종가)."""
    tick = [t.strip().upper() for t in a.tickers.split(',') if t.strip()]
    to = a.to or datetime.date.today().isoformat()
    start = (datetime.date.fromisoformat(to) - datetime.timedelta(days=int(a.days * 1.7) + 15)).isoformat()
    end = (datetime.date.fromisoformat(to) + datetime.timedelta(days=3)).isoformat()
    data = {}
    with cf.ThreadPoolExecutor(4) as ex:
        for t, d in ex.map(lambda x: etf(x, start, end), tick):
            if not d:
                sys.exit('⛔ %s 시세 없음(나스닥 historical 은 최근 약 10개월만 준다)' % t)
            data[t] = d
    days = sorted(set.intersection(*[{k for k in data[t] if k <= to} for t in tick]))
    days = days[-(a.days + 1):]
    if len(days) < 30:
        sys.exit('⛔ 공통 거래일 %d 개 — 너무 적다' % len(days))
    rets = {t: [data[t][days[i + 1]] / data[t][days[i]] - 1 for i in range(len(days) - 1)] for t in tick}
    def pear(x, y):
        n = len(x); mx = sum(x) / n; my = sum(y) / n
        sxy = sum((u - mx) * (v - my) for u, v in zip(x, y)); sxx = sum((u - mx) ** 2 for u in x); syy = sum((v - my) ** 2 for v in y)
        return sxy / (sxx * syy) ** 0.5
    print('일간 수익률 상관계수 · %d 개 수익률(%s -> %s 종가) · 나스닥 historical' % (len(days) - 1, days[0], days[-1]))
    print('       ' + ' '.join('%6s' % t for t in tick))
    for x in tick:
        print('  %-5s' % x + ' '.join('%6.2f' % pear(rets[x], rets[y]) for y in tick))
    flat = sorted([(pear(rets[x], rets[y]), x, y) for i, x in enumerate(tick) for y in tick[i + 1:]], reverse=True)
    print('  ▶ 가장 높은 쌍 %s–%s %.2f · 가장 낮은 쌍 %s–%s %.2f' % (flat[0][1], flat[0][2], flat[0][0], flat[-1][1], flat[-1][2], flat[-1][0]))



def wlen(text):
    n = 0
    for ch in text:
        c = ord(ch)
        n += 1 if (c <= 4351 or 8192 <= c <= 8205 or 8208 <= c <= 8223 or 8242 <= c <= 8247) else 2
    return n


def cmd_wlen(a):
    t = a.text
    if t.startswith('@'):
        t = open(os.path.expanduser(t[1:]), encoding='utf-8').read().strip()
    n = wlen(t)
    print('길이 %d · 가중 %d/280%s' % (len(t), n, '' if n <= 280 else '  ⛔ 초과'))
    sys.exit(0 if n <= 280 else 1)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    u = sp.add_parser('ust'); u.add_argument('--from', dest='frm'); u.add_argument('--to'); u.set_defaults(fn=cmd_ust)
    s = sp.add_parser('sectors')
    s.add_argument('--from', dest='frm'); s.add_argument('--to'); s.add_argument('--week-from'); s.add_argument('--week-to'); s.set_defaults(fn=cmd_sectors)
    pr = sp.add_parser('pairs')
    pr.add_argument('--a', required=True); pr.add_argument('--b', required=True); pr.add_argument('--a2'); pr.add_argument('--b2')
    pr.add_argument('--from', dest='frm'); pr.add_argument('--to'); pr.set_defaults(fn=cmd_pairs)
    cr = sp.add_parser('corr')
    cr.add_argument('--tickers', required=True); cr.add_argument('--days', type=int, default=120); cr.add_argument('--to'); cr.set_defaults(fn=cmd_corr)
    w = sp.add_parser('wlen'); w.add_argument('text'); w.set_defaults(fn=cmd_wlen)
    args = ap.parse_args()
    args.fn(args)
