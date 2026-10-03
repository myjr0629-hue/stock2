# -*- coding: utf-8 -*-
"""
hf-congress-readme — HF 데이터셋(eunhoon/us-congress-stock-trades) README 의 «기간»과 «상위 10 표»를 새 종목별 JSON 으로 갱신한다.
사용: python3 scripts/hf-congress-readme.py <congress-by-ticker-90d.json> <옛 README.md(HF raw)> <새 README.md>
  옛 README 는 `curl https://huggingface.co/datasets/eunhoon/us-congress-stock-trades/raw/main/README.md` 로 받는다.
  올리기는 scripts/hf-datasets-upload.mjs (README.md + CSV + JSON 세 파일을 같이).
"""
import json, re, sys
j = json.load(open(sys.argv[1], encoding='utf-8'))
old = open(sys.argv[2], encoding='utf-8').read()
rows = j['tickers']
def money(v):
    s = '+' if v >= 0 else '−'; a = abs(v)
    return f"{s}${a/1e6:.2f}M" if a >= 1e5 else f"{s}${a/1e3:.0f}K"
top = sorted(rows, key=lambda r: -abs(r['net_estimate_usd']))[:10]
tbl = ['| Ticker | Buys | Sells | Net (est.) | Members | Last trade |', '|---|---|---|---|---|---|']
for r in top:
    m = str(r['distinct_members']) + ('' if r.get('rows_complete') else '+')
    tbl.append(f"| {r['ticker']} | {r['buys']} | {r['sells']} | {money(r['net_estimate_usd'])} | {m} | {r['last_transaction']} |")
new, n = re.subn(r'for the 90 days ending \d{4}-\d{2}-\d{2}', 'for the 90 days ending ' + j['generated'][:10], old, count=1)
assert n == 1, '기간 문장을 못 찾았다'
pat = re.compile(r'(## Top 10 by estimated net flow\n\n)(\|.*\n)+', re.M)
assert pat.search(new), '상위 10 표를 못 찾았다'
new = pat.sub(lambda m: m.group(1) + '\n'.join(tbl) + '\n', new, count=1)
open(sys.argv[3], 'w', encoding='utf-8').write(new)
print('기간 끝', j['generated'][:10], '· 행', j.get('coverage', {}).get('row_count'), '· 상위10', ','.join(r['ticker'] for r in top))
