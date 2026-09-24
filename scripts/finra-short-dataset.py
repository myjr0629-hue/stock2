# -*- coding: utf-8 -*-
"""
finra-short-dataset — FINRA «일일 공매도 거래량» 공개 파일로 대형주·ETF 의 공매도 비율 데이터셋(CSV + 설명 페이지)을 만든다.

★2026-09-24 확장(데이터셋 문 2번째): 구글 데이터셋 검색은 schema.org Dataset 이 붙은 GitHub Pages 를 계정 없이 색인한다
  ([[hf-dataset-is-the-door-to-google-dataset-search]]). 의회 거래 다음으로 «다크풀/공매도 비율»을 연다 — 앱의 다크풀 화면과 같은 원천.
원천: https://cdn.finra.org/equity/regsho/daily/CNMSshvolYYYYMMDD.txt (FINRA 가 받은 장외 보고 거래 — TRF·ADF·ORF 통합, 정규장)
  형식 «Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market» (소수점 주식 포함), 마지막 줄은 건수.
주의(페이지에 그대로 적는다): 공매도 «잔고»(short interest)가 아니다. 장외 거래의 절반 안팎은 유동성을 대는 시장조성자의
  공매도라 40~60%대가 보통이다 — 의미는 «그 종목 자신의 평균 대비 변화»에 있다.

사용: python3 scripts/finra-short-dataset.py [끝날짜 YYYYMMDD] [거래일 수=20] [출력 폴더=/tmp/ego/gh]
  → finra-short-volume-20d.csv · finra-short-volume.html 을 만든다. 올리기는 scripts/github-upload.mjs.
"""
import csv, datetime, html, io, json, os, sys, urllib.request

UNIVERSE = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'NFLX', 'AVGO',
            'MU', 'INTC', 'PLTR', 'COST', 'JPM', 'GS', 'BAC', 'WMT', 'NKE', 'DIS', 'BA', 'UBER', 'COIN', 'MSTR', 'SMCI',
            'ARM', 'TSM', 'ORCL', 'CRM', 'ADBE', 'SOFI', 'HOOD', 'RIVN', 'GME', 'AMC', 'SHOP', 'PYPL', 'XOM', 'CVX',
            'VLO', 'MPC', 'PSX', 'LLY', 'UNH', 'V']
BASE = 'https://myjr0629-hue.github.io/options-market-structure-daily'
APP = 'https://signumhq.com/app?from=github_pages'
UA = {'User-Agent': 'Mozilla/5.0 (research dataset builder; contact@signumhq.com)'}


# ★2026-09-24 한국어·일본어 페이지 — 앱이 ko·ja 를 지원하는데 데이터셋 문은 영어뿐이었다.
#   같은 표·같은 CSV, 설명만 현지어. 세 페이지를 hreflang 으로 서로 묶고 앱 링크에 &l= 을 붙인다.
HREFLANG = '\n'.join(
    f'<link rel="alternate" hreflang="{h}" href="{BASE}/finra-short-volume{s}.html">'
    for h, s in (('en', ''), ('ko', '-ko'), ('ja', '-ja'), ('x-default', '')))

L10N = {
    'ko': {
        'title': '미국 대형주·ETF 공매도 거래 비율(FINRA) — {n}종목, 최근 {d}거래일',
        'desc': 'FINRA 공개 파일로 계산한 미국 대형주·ETF {n}종목의 일별 공매도 거래 비율({first}~{last}). 마지막 날 비율과 종목별 평균의 차이. 공매도 잔고가 아닙니다. CSV 제공.',
        'meta': '{last} 기준 · 원천: FINRA Reg SHO 일일 공매도 거래량(통합 파일) · 정리: SIGNUM HQ',
        'h_what': '이 숫자가 뜻하는 것 — 그리고 뜻하지 않는 것',
        'li': ['<b>공매도 비율</b> = FINRA 보고 시설(TRF·ADF·ORF)에 보고된 <b>장외 거래</b> 중 공매도로 표시된 거래량 ÷ 전체 거래량(정규장). 거래소에서 체결된 물량은 들어 있지 않습니다.',
               '<b>공매도 잔고(short interest)가 아닙니다.</b> 장외 공매도의 상당수는 시장조성자가 유동성을 대는 과정의 매도라서 40~60%대가 보통입니다.',
               '의미 있는 신호는 그 종목이 <b>자기 평균</b>에서 벗어나는 변화입니다 — 아래 표는 마지막 날을 그 차이 순으로 정렬했습니다.'],
        'h_table': '마지막 날({last}) vs 종목별 {d}거래일 평균',
        'th': ['종목', '공매도 비율', '{d}일 평균', '차이(%p)', '장외 거래량'],
        'h_dl': '내려받기',
        'dl': '— 종목·날짜별 한 줄: date, symbol, short_volume, short_exempt_volume, total_volume, short_ratio_pct. 이 정리본은 CC BY 4.0, 원자료는 FINRA 가 공개합니다.',
        'h_app': '옵션 포지션과 나란히 보기',
        'app': '무료 앱 SIGNUM HQ 는 종목마다 이 장외 공매도 비율을 맥스페인·감마 노출·콜월/풋플로어와 함께 보여줍니다 — 보통 월 $50~99 유료 단말에서 보는 화면입니다.',
        'foot': '영어판: <a href="finra-short-volume.html">English</a> · 일본어판: <a href="finra-short-volume-ja.html">日本語</a> · 연구용 데이터이며 투자 권유가 아닙니다.',
    },
    'ja': {
        'title': '米国大型株・ETFの空売り比率(FINRA)— {n}銘柄・直近{d}営業日',
        'desc': 'FINRAの公開ファイルから算出した米国大型株・ETF {n}銘柄の日次空売り比率({first}〜{last})。最終日の比率と各銘柄の平均との差。空売り残高ではありません。CSVあり。',
        'meta': '{last}時点 · 出典:FINRA Reg SHO 日次空売り出来高(統合ファイル) · 作成:SIGNUM HQ',
        'h_what': 'この数字が示すもの・示さないもの',
        'li': ['<b>空売り比率</b> = FINRAの報告施設(TRF・ADF・ORF)に報告された<b>取引所外の取引</b>のうち空売りとされた出来高 ÷ 総出来高(通常取引時間)。取引所で約定した出来高は含まれません。',
               '<b>空売り残高(short interest)ではありません。</b>取引所外の空売りの多くはマーケットメイカーが流動性を供給する際の売りで、40〜60%台が普通です。',
               '意味のあるシグナルは、その銘柄が<b>自分自身の平均</b>から離れる変化です — 下の表は最終日をその差の順に並べています。'],
        'h_table': '最終日({last})と各銘柄の{d}営業日平均',
        'th': ['銘柄', '空売り比率', '{d}日平均', '差(pt)', '取引所外出来高'],
        'h_dl': 'ダウンロード',
        'dl': '— 銘柄・日付ごとに1行:date, symbol, short_volume, short_exempt_volume, total_volume, short_ratio_pct。この整理版は CC BY 4.0、元データは FINRA が公開しています。',
        'h_app': 'オプションのポジションと並べて見る',
        'app': '無料アプリ SIGNUM HQ は銘柄ごとにこの取引所外の空売り比率を、マックスペイン・ガンマエクスポージャー・コールウォール/プットフロアと一緒に表示します — 通常は月額$50〜99の有料端末で見る画面です。',
        'foot': '英語版:<a href="finra-short-volume.html">English</a> · 韓国語版:<a href="finra-short-volume-ko.html">한국어</a> · 研究用データであり、投資助言ではありません。',
    },
}


def write_localized(out, lang, summ, days, first, last, csv_name, ld_en):
    t = L10N[lang]
    n, d = len(summ), len(days)
    fmt = lambda s: s.format(n=n, d=d, first=first, last=last)
    name = fmt(t['title'])
    app = f'{APP}&l={lang}'
    ld = dict(ld_en, name=name, description=fmt(t['desc']), url=f'{BASE}/finra-short-volume-{lang}.html', inLanguage=lang)
    tr = '\n'.join(
        f'<tr><td>{html.escape(x["s"])}</td><td>{x["latest"]:.1f}%</td><td>{x["avg"]:.1f}%</td>'
        f'<td class="{"up" if x["delta"] > 0 else "dn"}">{x["delta"]:+.1f}</td><td>{x["vol_m"]:.1f}M</td></tr>' for x in summ)
    th = ''.join(f'<th>{fmt(h)}</th>' for h in t['th'])
    lis = '\n'.join(f'<li>{li}</li>' for li in t['li'])
    page = f'''<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(name)}</title>
<meta name="description" content="{html.escape(fmt(t['desc']))}">
<link rel="canonical" href="{BASE}/finra-short-volume-{lang}.html">
{HREFLANG}
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
<style>
:root{{--ink:#15202b;--mute:#5b6b7a;--line:#dde3ea;--up:#b42318;--dn:#0b6e4f;--bg:#fbfcfd}}
body{{font:16px/1.65 -apple-system,"Apple SD Gothic Neo","Hiragino Sans","Noto Sans KR","Noto Sans JP",Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);max-width:860px;margin:0 auto;padding:24px 16px}}
h1{{font-size:1.4rem;line-height:1.35;text-wrap:balance}} p,li{{max-width:68ch}} .mute{{color:var(--mute)}}
table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;margin:12px 0}} th,td{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:right}}
th:first-child,td:first-child{{text-align:left}} .up{{color:var(--up)}} .dn{{color:var(--dn)}} .wrap{{overflow-x:auto}}
</style>
</head>
<body>
<h1>{html.escape(name)}</h1>
<p class="mute">{fmt(t['meta'])}</p>
<h2>{t['h_what']}</h2>
<ul>
{lis}
</ul>
<h2>{fmt(t['h_table'])}</h2>
<div class="wrap"><table>
<thead><tr>{th}</tr></thead>
<tbody>
{tr}
</tbody></table></div>
<h2>{t['h_dl']}</h2>
<p><a href="{csv_name}">{csv_name}</a> {t['dl']}</p>
<h2>{t['h_app']}</h2>
<p>{t['app']} <a href="{app}">{app}</a></p>
<p class="mute">{t['foot']}</p>
</body>
</html>
'''
    with open(os.path.join(out, f'finra-short-volume-{lang}.html'), 'w', encoding='utf-8') as f:
        f.write(page)


def fetch_day(d):
    url = f'https://cdn.finra.org/equity/regsho/daily/CNMSshvol{d:%Y%m%d}.txt'
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception:
        return None  # 주말·휴장·미게시


def main():
    end = datetime.datetime.strptime(sys.argv[1], '%Y%m%d').date() if len(sys.argv) > 1 else datetime.date.today()
    n_days = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    out = sys.argv[3] if len(sys.argv) > 3 else '/tmp/ego/gh'
    os.makedirs(out, exist_ok=True)
    rows, days, d, tries = [], [], end, 0
    want = set(UNIVERSE)
    while len(days) < n_days and tries < n_days * 2 + 10:
        tries += 1
        if d.weekday() < 5:
            txt = fetch_day(d)
            if txt and txt.startswith('Date|Symbol'):
                days.append(d)
                for line in txt.splitlines()[1:]:
                    p = line.split('|')
                    if len(p) < 6 or p[1] not in want:
                        continue
                    sv, sx, tv = float(p[2]), float(p[3]), float(p[4])
                    if tv <= 0:
                        continue
                    rows.append({'date': f'{d:%Y-%m-%d}', 'symbol': p[1], 'short_volume': round(sv),
                                 'short_exempt_volume': round(sx), 'total_volume': round(tv),
                                 'short_ratio_pct': round(sv / tv * 100, 2)})
        d -= datetime.timedelta(days=1)
    if not days:
        sys.exit('FINRA 파일을 하나도 못 받았다')
    days.sort()
    rows.sort(key=lambda r: (r['date'], r['symbol']))
    first, last = f'{days[0]:%Y-%m-%d}', f'{days[-1]:%Y-%m-%d}'
    csv_name = f'finra-short-volume-{len(days)}d.csv'
    with open(os.path.join(out, csv_name), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    # 종목별 요약: 마지막 날 비율 · 기간 평균 · 차이(%p) · 마지막 날 장외 거래량
    by = {}
    for r in rows:
        by.setdefault(r['symbol'], []).append(r)
    summ = []
    for s, rs in by.items():
        rs.sort(key=lambda r: r['date'])
        latest = rs[-1]
        if latest['date'] != last:
            continue
        avg = sum(r['short_ratio_pct'] for r in rs) / len(rs)
        summ.append({'s': s, 'latest': latest['short_ratio_pct'], 'avg': round(avg, 1),
                     'delta': round(latest['short_ratio_pct'] - avg, 1), 'vol_m': round(latest['total_volume'] / 1e6, 1), 'n': len(rs)})
    summ.sort(key=lambda x: -x['delta'])

    name = f'FINRA Daily Short Sale Volume Ratio — {len(summ)} US large caps & ETFs, last {len(days)} trading days'
    desc = (f'Daily short sale volume, short-exempt volume and total volume reported to FINRA facilities (TRF, ADF, ORF — off-exchange trades, '
            f'regular hours) for {len(summ)} widely held US stocks and ETFs, {first} to {last}, with the short volume ratio '
            f'(ShortVolume / TotalVolume). Compiled from FINRA\'s public Reg SHO daily files (consolidated CNMS file). '
            f'This is traded volume flagged short, not short interest. Research data; not investment advice.')
    ld = {
        '@context': 'https://schema.org/', '@type': 'Dataset', 'name': name, 'description': desc,
        'url': f'{BASE}/finra-short-volume.html', 'sameAs': 'https://github.com/myjr0629-hue/options-market-structure-daily',
        'license': 'https://creativecommons.org/licenses/by/4.0/', 'isAccessibleForFree': True,
        'creator': {'@type': 'Organization', 'name': 'SIGNUM HQ', 'url': 'https://signumhq.com'},
        'isBasedOn': 'https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files',
        'temporalCoverage': f'{first}/{last}',
        'keywords': ['short volume', 'short sale volume', 'dark pool', 'off-exchange', 'FINRA', 'Reg SHO', 'short ratio', 'stocks', 'ETF'],
        'variableMeasured': ['short_volume', 'short_exempt_volume', 'total_volume', 'short_ratio_pct'],
        'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'text/csv', 'contentUrl': f'{BASE}/{csv_name}'}],
    }
    tr = '\n'.join(
        f'<tr><td>{html.escape(x["s"])}</td><td>{x["latest"]:.1f}%</td><td>{x["avg"]:.1f}%</td>'
        f'<td class="{"up" if x["delta"] > 0 else "dn"}">{x["delta"]:+.1f}</td><td>{x["vol_m"]:.1f}M</td></tr>' for x in summ)
    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(name)} (open dataset)</title>
<meta name="description" content="FINRA short sale volume ratio for {len(summ)} US large caps and ETFs, {first} to {last}: latest ratio vs each ticker's own average. CSV, CC BY 4.0. Not short interest.">
<link rel="canonical" href="{BASE}/finra-short-volume.html">
{HREFLANG}
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
<style>
:root{{--ink:#15202b;--mute:#5b6b7a;--line:#dde3ea;--up:#b42318;--dn:#0b6e4f;--bg:#fbfcfd}}
body{{font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg);max-width:860px;margin:0 auto;padding:24px 16px}}
h1{{font-size:1.45rem;line-height:1.3;text-wrap:balance}} p,li{{max-width:68ch}} .mute{{color:var(--mute)}}
table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;margin:12px 0}} th,td{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:right}}
th:first-child,td:first-child{{text-align:left}} .up{{color:var(--up)}} .dn{{color:var(--dn)}} .wrap{{overflow-x:auto}}
</style>
</head>
<body>
<h1>{html.escape(name)}</h1>
<p class="mute">Snapshot through {last} · source: FINRA Reg SHO daily short sale volume (consolidated file) · compiled by SIGNUM HQ</p>
<h2>What this is — and what it is not</h2>
<ul>
<li><b>Short ratio</b> = ShortVolume ÷ TotalVolume of trades <b>reported to FINRA facilities</b> (off-exchange: TRF, ADF, ORF) during regular hours. Exchange-executed volume is not in these files.</li>
<li>It is <b>not short interest</b> (open short positions). A large share of off-exchange short sales comes from market makers supplying liquidity, so ratios around 40–60% are normal.</li>
<li>The useful signal is a ticker moving away from <b>its own</b> average — the table below ranks the latest day by that gap.</li>
</ul>
<h2>Latest day ({last}) vs each ticker's {len(days)}-day average</h2>
<div class="wrap"><table>
<thead><tr><th>Ticker</th><th>Short ratio</th><th>{len(days)}-day avg</th><th>Gap (pp)</th><th>Off-exchange volume</th></tr></thead>
<tbody>
{tr}
</tbody></table></div>
<h2>Download</h2>
<p><a href="{csv_name}">{csv_name}</a> — one row per ticker per day: date, symbol, short_volume, short_exempt_volume, total_volume, short_ratio_pct. License: CC BY 4.0 for this compilation; the underlying data is published by FINRA.</p>
<h2>See it next to options positioning</h2>
<p>The free SIGNUM HQ app shows this off-exchange short ratio for each ticker alongside max pain, gamma exposure and the call wall / put floor — the kind of view that usually sits behind $50–99/month terminals. <a href="{APP}">{APP}</a></p>
<p class="mute">Also in this repository: <a href="congress.html">US Congress stock trades (90 days)</a> · <a href="./">daily options market structure snapshots</a>. Research data; not investment advice.</p>
</body>
</html>
'''
    with open(os.path.join(out, 'finra-short-volume.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    for lang in ('ko', 'ja'):
        write_localized(out, lang, summ, days, first, last, csv_name, ld)
    print(json.dumps({'days': len(days), 'first': first, 'last': last, 'rows': len(rows), 'tickers': len(summ), 'csv': csv_name,
                      'top_gap': summ[:5], 'bottom_gap': summ[-3:]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
