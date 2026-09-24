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
    print(json.dumps({'days': len(days), 'first': first, 'last': last, 'rows': len(rows), 'tickers': len(summ), 'csv': csv_name,
                      'top_gap': summ[:5], 'bottom_gap': summ[-3:]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
