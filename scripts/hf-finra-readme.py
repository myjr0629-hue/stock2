# -*- coding: utf-8 -*-
"""
hf-finra-readme — HF 데이터셋(eunhoon/us-finra-short-volume) README 를 FINRA 일별 공매도 CSV 에서 «생성»한다(10/4 신설).
사용: python3 scripts/hf-finra-readme.py <finra-short-volume-20d.csv> <새 README.md>
  CSV 는 scripts/finra-short-dataset.py 가 만든 것(github Pages 와 같은 파일). 표(최신일 vs 자기 20일 평균 격차 상위 10)는 CSV 에서 다시 계산한다
  — 올린 GitHub 페이지(finra-short-volume.html)와 같은 방식(일별 비율의 단순 평균)이라 두 곳 숫자가 byte 단위로 같다.
  올리기는 scripts/hf-datasets-upload.mjs (README.md + CSV + 앱 화면 PNG 를 같이 — 앱 화면은 README 와 같은 폴더에 둔다).
  한계 문장(«공매도 잔고 아님·자기 평균 대비 변화가 신호») 은 빼지 않는다 — 10/4 확장 티켓의 필수 조건.
"""
import csv, collections, sys

src, dst = sys.argv[1], sys.argv[2]
rows = list(csv.DictReader(open(src, encoding='utf-8')))
dates = sorted({r['date'] for r in rows})
first, last = dates[0], dates[-1]
by = collections.defaultdict(list)
for r in rows:
    by[r['symbol']].append(r)
gaps = []
for s, l in by.items():
    cur = [r for r in l if r['date'] == last]
    if not cur:
        continue
    avg = sum(float(r['short_ratio_pct']) for r in l) / len(l)
    c = cur[0]
    gaps.append((float(c['short_ratio_pct']) - avg, s, float(c['short_ratio_pct']), avg, float(c['total_volume'])))
gaps.sort(key=lambda g: -g[0])
tbl = ['| Ticker | Short ratio (%s) | 20-day avg | Gap (pp) | Off-exchange volume |' % last, '|---|---|---|---|---|']
for g, s, ratio, avg, tv in gaps[:10]:
    tbl.append('| %s | %.1f%% | %.1f%% | %+.1f | %.1fM |' % (s, ratio, avg, g, tv / 1e6))
n_tk, n_rows = len(by), len(rows)

readme = f"""---
license: cc-by-4.0
pretty_name: FINRA Daily Short Sale Volume Ratio (49 US large caps and ETFs, last 20 trading days)
language:
- en
tags:
- finance
- stocks
- short-selling
- short-volume
- finra
- off-exchange
- dark-pool
- us-stocks
size_categories:
- n<1K
configs:
- config_name: short_volume
  data_files: finra-short-volume-20d.csv
---

# FINRA Daily Short Sale Volume Ratio — {n_tk} US large caps and ETFs, last 20 trading days

Daily short sale volume for {n_tk} widely traded US stocks and ETFs, for the 20 trading days from {first} to {last}
({n_rows} rows), taken from the FINRA Reg SHO daily short sale volume files (consolidated file) and compiled by SIGNUM HQ.

**What this is, and what it is not.** `short_ratio_pct` = ShortVolume / TotalVolume of the trades reported to FINRA facilities
(off-exchange: TRF, ADF, ORF) during regular hours. Exchange-executed volume is not in these files.
It is **not short interest** (open short positions). A large share of off-exchange short sales comes from market makers
supplying liquidity, so ratios around 40-60% are normal. The useful signal is a ticker moving away from **its own** average,
which is what the table below ranks.

## Files

| File | What it holds |
|---|---|
| `finra-short-volume-20d.csv` | One row per ticker per trading day: date, symbol, short_volume, short_exempt_volume, total_volume, short_ratio_pct |

## Latest day vs each ticker's own 20-day average (top 10 gaps)

{chr(10).join(tbl)}

The 20-day average is the simple mean of the daily ratios. The off-exchange volume is the day's total reported to FINRA facilities.

## Source, caveats, license

- Source: FINRA Reg SHO daily short sale volume files (public), compiled by SIGNUM HQ.
- Short sale volume is not short interest, and one day's ratio says little by itself. This is research data, not investment advice.
- License: CC BY 4.0 for this compilation; the underlying data is published by FINRA. Refreshed weekly.
  Also published, with Korean and Japanese pages, at https://myjr0629-hue.github.io/options-market-structure-daily/finra-short-volume.html

The free SIGNUM HQ app for iOS and Android shows each ticker's off-exchange volume and short-sale activity next to max pain,
gamma exposure and the call wall / put floor, the kind of view that usually sits behind $50-99/month terminals:
https://signumhq.com/app?from=hf_datasets

![Off-exchange volume and short sale board in the SIGNUM HQ app](app-offexchange-board.png)
"""
open(dst, 'w', encoding='utf-8').write(readme)
print('기간', first, '→', last, '· 종목', n_tk, '· 행', n_rows, '· 상위10', ','.join(g[1] for g in gaps[:10]))
