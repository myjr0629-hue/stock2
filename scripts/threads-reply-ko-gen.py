#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Threads 한국어 답글(종목 1개 · 만기 옵션 지도 · 링크 없음) 작업 파일 생성기 — threads_reply_kr 레인.

왜 (2026-10-05 07시 회차): 10/4 18시 회차의 생성기(th-qqq-reply-gen.py)는 «QQQ·SPY 하드코딩 + 홈 폴더 임시 파일»이라 다음 회차가 다른 종목으로
  쓰려면 새로 짜야 했다(MISTAKES #49 — 되풀이되는 일은 첫 반복에 도구로). 종목·글·이미지만 바꿔 같은 검증 사슬을 태운다.

게시 직전 재검증(전부 통과해야 /tmp/ego/thr-task.json 을 «방금» 쓴다 — 어긋나면 종료 1 → `&&` 로 이어진 발행기가 돌지 않는다·MISTAKES #52):
  ① 구조 게이트(나스닥 전체 체인과 대조) ✓ + 만기 일치 + 맥스페인·콜월·풋플로어 일치
  ② 나스닥 일별 시세 «종가»(게이트의 S 는 마지막 시세라 종가가 아니다 — MISTAKES #36·#81) + 전일비
  ③ 앱 API(화면이 보여 주는 값) — 맥스페인이 게이트와 같고 감마 플립 값이 있다
  ④ 열어 본 이미지의 숫자(--expect 종가,맥스페인,감마플립)와 위 값이 같다(MISTAKES #38·#50 — 이미지는 «열어서» 읽은 값으로 단언)
  ⑤ 본문: 링크·예측·권유·프리미엄 칸 언급 없음 · 500자 이내

사용:
  python3 scripts/threads-reply-ko-gen.py --ticker MU --post https://www.threads.com/@user/post/ID --image crop-ko-MU.png \\
      --expect 1074.89,1015,1100 --label 마이크론 --intro '마이크론 얘기가 나와서 옵션 쪽 숫자를 하나 보탭니다.' \\
      [--asset stocks|etf] [--expiry 2026-10-09] [--week 이번|다음] [--check-only] \\
  && bash scripts/ego-run.sh scripts/threads-reply.mjs 240
옵션 --check-only 면 파일을 쓰지 않는다(본문만 출력). 시험: 같은 인자로 QQQ 를 돌려 10/4 18시 회차 본문과 같은 숫자가 나오는지 본다.
"""
import argparse, datetime, json, os, re, subprocess, sys, urllib.request, zoneinfo

REPO = os.path.expanduser('~/.gemini/antigravity/scratch/stock2')
NQ_HEADERS = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}
WD = ['월', '화', '수', '목', '금', '토', '일']


def die(msg):
    print('⛔', msg)
    sys.exit(1)


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': 'Mozilla/5.0 (SIGNUM check)'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')


def fmt(v):
    v = float(v)
    return f'{int(v):,}' if v.is_integer() else f'{v:,.2f}'.rstrip('0').rstrip('.')


ap = argparse.ArgumentParser()
ap.add_argument('--ticker', required=True)
ap.add_argument('--post', required=True, help='답글을 달 Threads 글 주소')
ap.add_argument('--image', required=True, help='열어서 확인한 앱 화면(crop-flow-card 결과)')
ap.add_argument('--expect', required=True, help='이미지에서 «읽은» 값 종가,맥스페인,감마플립 (예: 1074.89,1015,1100)')
ap.add_argument('--label', required=True, help='본문에 쓸 한국어 이름(예: 마이크론)')
ap.add_argument('--intro', required=True, help='부모 글과 이어지는 첫 문장(예측·권유 금지)')
ap.add_argument('--asset', default='stocks', choices=['stocks', 'etf'])
ap.add_argument('--expiry', default='2026-10-09')
ap.add_argument('--week', default='이번', choices=['이번', '다음'])
ap.add_argument('--check-only', action='store_true')
A = ap.parse_args()
T = A.ticker.upper()
try:
    exp_close, exp_mp, exp_gf = [float(x) for x in A.expect.split(',')]
except Exception:
    die('--expect 는 종가,맥스페인,감마플립 세 숫자(쉼표) — 열어 본 이미지에서 읽은 값')

# ① 구조 게이트
r = subprocess.run(['node', f'{REPO}/scripts/audit-structure-vs-nasdaq.js', T], capture_output=True, text=True, cwd=REPO, timeout=170)
print(r.stdout.strip().splitlines()[-4:] if r.stdout else r.stderr[-300:])
if r.returncode != 0:
    die(f'{T} 구조 게이트 실패 — 게시하지 않는다')
m = re.search(rf'✓ {T}\s+(\d{{4}}-\d{{2}}-\d{{2}}) S=([\d.]+) · 맥스페인 ([\d.]+)/([\d.]+) · 풋콜 [\d.]+/[\d.]+ · 콜월 ([\d.]+)/([\d.]+) · 풋플로어 ([\d.]+)/([\d.]+) .*?예상 변동 ±([\d.]+)%', r.stdout)
if not m:
    die(f'{T} 게이트 출력 해석 실패(✓ 아님 — △·✗ 종목은 수치를 게시하지 않는다)')
exp, S, mp, mp_nq, cw, cw_nq, pf, pf_nq, em = m.groups()
if exp != A.expiry or mp != mp_nq or cw != cw_nq or pf != pf_nq:
    die(f'{T} 만기/값 불일치 {m.groups()}')
mp, cw, pf = float(mp), float(cw), float(pf)

# ② 종가 — 나스닥 일별 시세(가장 최근 완료된 두 거래일)
et = datetime.datetime.now(zoneinfo.ZoneInfo('America/New_York'))
frm = (et - datetime.timedelta(days=12)).strftime('%Y-%m-%d')
to = et.strftime('%Y-%m-%d')
h = json.loads(get(f'https://api.nasdaq.com/api/quote/{T}/historical?assetclass={A.asset}&fromdate={frm}&limit=10&todate={to}', NQ_HEADERS))
rows = (h.get('data') or {}).get('tradesTable', {}).get('rows') or []
if len(rows) < 2:
    die(f'{T} 나스닥 historical 행 {len(rows)}개 — assetclass({A.asset}) 확인')
parsed = []
for x in rows:
    mm, dd, yy = x['date'].split('/')
    parsed.append((datetime.date(int(yy), int(mm), int(dd)), float(x['close'].replace('$', '').replace(',', ''))))
parsed.sort(reverse=True)
(d2, c2), (d1, c1) = parsed[0], parsed[1]
if d2 == et.date() and et.hour < 17:
    die('오늘 장이 아직 끝나지 않았다 — 종가가 아니다')
chg = (c2 / c1 - 1) * 100
print(f'{T} 종가 {d2} {c2} · 직전 {d1} {c1} · 등락 {chg:+.2f}%')

# ③ 앱 API
j = json.loads(get(f'https://www.signumhq.com/api/live/options/structure?t={T}'))
d = j.get('data') or j
if d.get('maxPain') is None or float(d['maxPain']) != mp or d.get('gammaFlipLevel') is None or d.get('expiration') != A.expiry:
    die(f"앱 값 불일치 maxPain {d.get('maxPain')} gammaFlip {d.get('gammaFlipLevel')} 만기 {d.get('expiration')}")
gf = float(d['gammaFlipLevel'])

# ④ 이미지에서 읽은 값과 같은가
if abs(c2 - exp_close) > 0.005 or mp != exp_mp or gf != exp_gf:
    die(f'이미지(열어 읽은 값 {exp_close}·{exp_mp}·{exp_gf})와 지금 값(종가 {c2}·맥스페인 {mp}·감마 플립 {gf})이 다르다 — 이미지를 새로 찍어 다시 열어 본다')
if not os.path.exists(A.image):
    die('이미지 없음 ' + A.image)

mp_gap = (c2 / mp - 1) * 100   # 앱 카드의 «괴리»와 같은 정의(종가 ÷ 맥스페인 − 1)
gf_gap = (c2 / gf - 1) * 100   # 앱 카드의 «상회/하회 (%)» 와 같은 정의(종가 ÷ 감마 플립 − 1)
mp_dir = '위' if mp_gap >= 0 else '아래'
gf_dir = '위' if gf_gap >= 0 else '아래'
dlabel = ('지난 ' if d2.weekday() == 4 else '') + f'{WD[d2.weekday()]}요일({d2.month}/{d2.day})'
exp_d = datetime.date.fromisoformat(A.expiry)
elabel = f'{A.week} 주 {WD[exp_d.weekday()]}요일({exp_d.month}/{exp_d.day})'

text = (
    # 조사(은/는·으로/로)는 앞말의 받침에 따라 달라 숫자·티커 뒤에서 틀리기 쉽다(10/4 본문 «$749.58으로») → «의 … 종가는 …였고» 로 조사를 받침과 무관한 말만 쓴다
    f"{A.intro} {A.label}({T})의 {dlabel} 종가는 ${c2:,.2f}({chg:+.2f}%)였고, {elabel} 만기 옵션 지도는 이렇습니다.\n"
    f"- 맥스페인 ${fmt(mp)} — 만기 때 옵션 가치 합이 가장 작아지는 행사가. 종가는 그보다 {abs(mp_gap):.2f}% {mp_dir}\n"
    f"- 감마 플립 ${fmt(gf)} — 딜러의 헤지 방향이 바뀌는 경계. 종가는 그보다 {abs(gf_gap):.2f}% {gf_dir}\n"
    f"- 콜월 ${fmt(cw)} · 풋플로어 ${fmt(pf)} — 위쪽 콜·아래쪽 풋 미결제약정이 가장 많은 행사가\n"
    f"- 옵션이 가격에 반영한 일주일 변동폭 ±{em}%\n"
    "방향을 알려 주는 숫자가 아니라 «포지션이 몰린 가격대» 지도입니다.\n"
    "출처: SIGNUM HQ 옵션 플로우(나스닥 옵션 체인과 대조)"
)

# ⑤ 단언
assert 'http' not in text and 'signumhq.com' not in text, '링크가 들어갔다'
assert not re.search(r'오를|내릴|사라|팔라|매수|매도 추천|전망|상승 예상|하락 예상|수익|보장', text), '예측·권유 표현'
assert '프리미엄' not in text, '프리미엄 칸 언급 금지(정의 필요)'
assert len(text) <= 490, f'글자 수 {len(text)} — Threads 500자 한도'
print('---- 본문 ----')
print(text)
print('--------------', len(text), '자')
if A.check_only:
    print('CHECK_ONLY — 파일 안 씀')
    sys.exit(0)
D = os.path.expanduser('~/signum-ego-io/' + datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d'))
os.makedirs(D, exist_ok=True)
tf = f'{D}/th-reply-ko-{T}.txt'
open(tf, 'w', encoding='utf-8').write(text)
os.makedirs('/tmp/ego', exist_ok=True)
json.dump({'post': A.post, 'file': tf, 'image': A.image, 'mark': A.intro}, open('/tmp/ego/thr-task.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('작업 파일 새로 씀: /tmp/ego/thr-task.json', datetime.datetime.now().strftime('%H:%M:%S'))
