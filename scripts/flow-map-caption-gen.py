#!/usr/bin/env python3
"""옵션 지도 캡션 생성기(한국어·일본어 — --lang ja) — 게시 직전 «재검증 + 숫자 단언 + 작업 파일 방금 새로 쓰기» 를 한 도구로.

왜 만들었나(2026-10-04 19시 회차): 같은 모양의 생성기(th-orcl-gen.py·th-qqq-reply-gen.py·ig-tqqq-gen.py)를 회차마다 홈 폴더(~/Documents/signum-work)에
  새로 복사해 고쳐 썼다. 저장소 밖이라 맥이 날아가면 같이 사라지고, 복사할 때마다 «게이트 ✓ 확인·종가 대조·앱 API 대조·이미지 숫자 단언» 중
  하나가 빠질 수 있다(MISTAKES #49 «로그에만 있는 검증 요령은 첫 반복에 도구로»). 이 파일이 그 정본이다.

하는 일(하나라도 어긋나면 종료 1 → `&&` 로 이어진 발행기가 돌지 않는다):
  ① audit-structure-vs-nasdaq.js <종목>[,<비교 종목>] → «✓» 아니면 중단(✗·△ 종목의 수치는 게시 금지)
  ② 나스닥 일별 시세(stocks → 안 나오면 etf)에서 «마지막 두 거래일» 종가·등락 — 게이트의 S 는 시간외 마지막 값이라 종가가 아니다(MISTAKES #36)
  ③ 우리 앱 API(/api/live/options/structure) 맥스페인이 게이트와 같은지 + 감마 플립 읽기
  ④ --expect(이미지를 «열어서» 읽은 맥스페인,감마플립,종가)와 실제 값이 같은지 단언 — 이미지 숫자 ≠ 글 숫자면 중단
  ⑤ 본문 단언: 링크 없음·프리미엄 칸 언급 없음·예측/권유 표현 없음, 정의 문장은 앞 회차(ORCL·TQQQ)가 쓴 검증된 문구 그대로
  ⑥ --channel instagram → 캡션 파일 + /tmp/ego/ig-task.json 을 «방금» 씀 · --channel text → 캡션 파일만(Threads 등 다른 채널에 붙여 쓸 때)

사용:
  python3 scripts/flow-map-caption-gen.py TQQQ --image ~/signum-ego-io/2026-10-04/shots-ig1/ig-tqqq-ko-crop.png \
      --expect 75,83,81.01 --label 'TQQQ(나스닥100 3배 레버리지 ETF)' --vs QQQ --lev 3 --channel instagram --out-dir ~/signum-ego-io/2026-10-04 \
      && bash scripts/ego-run.sh scripts/instagram-post.mjs 420        # 발행기와는 반드시 && 로 이어 쓴다(MISTAKES #52)
  --check-only 면 파일을 쓰지 않고 캡션만 찍는다(시험용).
  일본어(10/4 20시): `--lang ja --label 'テスラ(TSLA)'` + 이미지는 `make-x-shot.js signum ja flow <티커>` → `crop-flow-card.py … signum ja`(칩 행 종목도 일본어는 기본 상자). 정의 문구는 Threads 일본어 COST 글(10/4 13:05)과 같다.
이미지는 `python3 scripts/crop-flow-card.py <make-x-shot 캡처> <out.png> signum ko` 로 자른 뒤 «열어서» 숫자를 읽는다(MISTAKES #9·#38·#50).
"""
import argparse, datetime, json, os, re, subprocess, sys, urllib.request

HOME = os.path.expanduser('~')
REPO = os.path.join(HOME, '.gemini/antigravity/scratch/stock2')
WD = '월화수목금토일'
WDJ = '月火水木金土日'


def die(msg):
    print('⛔', msg)
    sys.exit(1)


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {'User-Agent': 'Mozilla/5.0 (SIGNUM check)'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')


ap = argparse.ArgumentParser()
ap.add_argument('ticker')
ap.add_argument('--image', required=True)
ap.add_argument('--expect', required=True, help='이미지에서 읽은 맥스페인,감마플립,종가 (예: 75,83,81.01)')
ap.add_argument('--label', help='문장에 쓸 이름(예: "TQQQ(나스닥100 3배 레버리지 ETF)", "오라클(ORCL)") — 조사 없이 쓴다. 기본은 티커')
ap.add_argument('--vs', help='변동폭을 견줄 종목(예: QQQ) — 같은 게이트에서 ✓ 여야 한다')
ap.add_argument('--lev', type=float, help='--vs 대비 기대 배수(예: 3) — 실제 비율이 ±7% 안이어야 «약 N배» 문장을 쓴다')
ap.add_argument('--channel', choices=['instagram', 'text', 'threads'], default='text', help='threads = 일본어 Threads 글(링크 있는 형식 — 10/4 13:05 COST 글과 같은 모양) + <out-dir>/th-task.json 작성. --lang ja 와 --link-tag 필요')
ap.add_argument('--link-tag', help='--channel threads 의 스마트링크 from= 태그(예: threads_jp) → https://www.signumhq.com/app?from=<태그>&l=ja')
ap.add_argument('--lang', choices=['ko', 'ja'], default='ko', help='캡션 언어(10/4 20시 일본어 추가 — Threads 일본어·인스타 일본어에 같은 단언을 태운다). 이미지도 같은 언어 화면(make-x-shot … ja flow)이어야 한다')
ap.add_argument('--out-dir', default=os.path.join(HOME, 'signum-ego-io', datetime.date.today().isoformat()))
ap.add_argument('--check-only', action='store_true')
a = ap.parse_args()
if a.channel == 'threads' and not (a.lang == 'ja' and a.link_tag):
    die('--channel threads 는 지금 일본어만(--lang ja)이고 --link-tag 가 필요하다(예: --link-tag threads_jp)')
T = a.ticker.upper()
label = a.label or T
try:
    exp_mp, exp_gf, exp_close = [float(x) for x in a.expect.split(',')]
except ValueError:
    die('--expect 는 «맥스페인,감마플립,종가» 숫자 셋')
if not os.path.exists(os.path.expanduser(a.image)):
    die('이미지 없음 ' + a.image)
img = os.path.expanduser(a.image)

# ① 구조 게이트
names = [T] + ([a.vs.upper()] if a.vs else [])
r = subprocess.run(['node', f'{REPO}/scripts/audit-structure-vs-nasdaq.js', ','.join(names)], capture_output=True, text=True, cwd=REPO, timeout=170)
print((r.stdout or r.stderr).strip().splitlines()[-6:])
for n in names:
    if not re.search(rf'^✓ {re.escape(n)}\s', r.stdout, re.M):
        die(f'구조 게이트 {n} 가 ✓ 가 아니다 — 게시하지 않는다')
PAT = r'^✓ NAME\s+(\d{4}-\d{2}-\d{2}) S=([\d.]+) · 맥스페인 ([\d.]+)/([\d.]+) · 풋콜 [\d.]+/[\d.]+ · 콜월 ([\d.]+)/([\d.]+) · 풋플로어 ([\d.]+)/([\d.]+) .*?예상 변동 ±([\d.]+)%'
m = re.search(PAT.replace('NAME', re.escape(T)), r.stdout, re.M)
if not m:
    die('게이트 출력 해석 실패')
exp, S, mp, mp_nq, cw, cw_nq, pf, pf_nq, em = m.groups()
if mp != mp_nq or cw != cw_nq or pf != pf_nq:
    die(f'게이트 값 불일치 {m.groups()}')
exp_d = datetime.date.fromisoformat(exp)
em_vs = None
if a.vs:
    mq = re.search(PAT.replace('NAME', re.escape(a.vs.upper())), r.stdout, re.M)
    if not mq or mq.group(1) != exp:
        die('비교 종목 게이트 해석 실패/만기 다름')
    em_vs = mq.group(9)

# ② 종가 — 나스닥 일별 시세, 마지막 두 거래일
hdr = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Origin': 'https://www.nasdaq.com', 'Referer': 'https://www.nasdaq.com/'}
today = datetime.date.today()
rows = []
for ac in ('stocks', 'etf'):
    try:
        h = json.loads(get(f'https://api.nasdaq.com/api/quote/{T}/historical?assetclass={ac}&fromdate={(today - datetime.timedelta(days=14)).isoformat()}&limit=15&todate={today.isoformat()}', hdr))
        rows = (h.get('data') or {}).get('tradesTable', {}).get('rows') or []
    except Exception as e:  # 한 분류가 실패하면 다른 분류로
        print('historical', ac, '실패:', str(e)[:60])
    if rows:
        break
if len(rows) < 2:
    die('나스닥 일별 시세를 못 읽었다')
px = sorted(((datetime.datetime.strptime(x['date'], '%m/%d/%Y').date(), float(x['close'].replace('$', '').replace(',', ''))) for x in rows))
(d1, c1), (d2, c2) = px[-2], px[-1]
chg = (c2 / c1 - 1) * 100
print(f'종가 {d2} {c2} · 직전 {d1} {c1} · 등락 {chg:+.2f}% · 게이트 S(시간외 마지막) {S}')
if (today - d2).days > 5:
    die(f'마지막 거래일 {d2} 이 너무 오래됐다')

# ③ 앱 API
j = json.loads(get(f'https://www.signumhq.com/api/live/options/structure?t={T}'))
d = j.get('data') or j
gf, mp_app = d.get('gammaFlipLevel'), d.get('maxPain')
if mp_app is None or gf is None or float(mp_app) != float(mp):
    die(f'앱 값 불일치 maxPain {mp_app} gammaFlip {gf} (게이트 {mp})')
mp_n, gf_n, cw_n, pf_n = float(mp), float(gf), float(cw), float(pf)
fmt = lambda v: (f'{v:g}')  # 75.0 -> 75, 62.5 -> 62.5

# ④ 이미지 숫자 단언
if (mp_n, gf_n, c2) != (exp_mp, exp_gf, exp_close):
    die(f'이미지(--expect {a.expect}) 와 실제 값이 다르다: 맥스페인 {mp_n} · 감마플립 {gf_n} · 종가 {c2} — 이미지를 새로 찍어야 한다')

mp_gap, gf_gap = abs(c2 - mp_n) / mp_n * 100, abs(c2 - gf_n) / gf_n * 100
# «이번 주/다음 주» 는 월요일 시작 주의 차이로 정한다(10/4 20시 수정 — 옛 코드는 «남은 일수 3~10 이면 무조건 다음 주» 라서 월~수요일에 이번 주 금요일 만기를 «다음 주»로 썼다)
mon = lambda d: d - datetime.timedelta(days=d.weekday())
wk = (mon(exp_d) - mon(today)).days // 7
JA = a.lang == 'ja'
if JA:
    mp_dir, gf_dir = ('下' if c2 < mp_n else '上'), ('下' if c2 < gf_n else '上')
    last_lbl = f'{WDJ[d2.weekday()]}曜({d2.month}/{d2.day})'
    exp_lbl = (({0: '今週', 1: '来週'}.get(wk, '')) if exp_d.weekday() == 4 else '') + f'{WDJ[exp_d.weekday()]}曜({exp_d.month}/{exp_d.day})'
else:
    mp_dir, gf_dir = ('아래' if c2 < mp_n else '위'), ('아래' if c2 < gf_n else '위')
    last_lbl = f'{WD[d2.weekday()]}요일({d2.month}/{d2.day})'
    if (today - d2).days >= 2:
        last_lbl = '지난 ' + last_lbl
    exp_lbl = (({0: '이번 주 ', 1: '다음 주 '}.get(wk, '')) if exp_d.weekday() == 4 else '') + f'{WD[exp_d.weekday()]}요일({exp_d.month}/{exp_d.day})'
ratio_ok = None
if a.vs and a.lev:
    ratio = float(em) / float(em_vs)
    if abs(ratio / a.lev - 1) > 0.07:
        die(f'변동폭 비율 {ratio:.2f} 가 기대 {a.lev:g}배와 다르다 — «약 N배» 문장을 쓸 수 없다')
    ratio_ok = True

# ⑤ 본문(정의 문장은 앞 회차 글에서 검증된 문구 그대로 — 한국어: ORCL·TQQQ / 일본어: Threads 일본어 COST 글)
if JA and a.channel == 'threads':
    # 10/4 13:05 Threads 일본어 COST 글(th-ja-1305-cost.txt)과 같은 모양 — 글머리 ・ · 전각 콜론 · 링크 줄 · 주제 태그 1개
    body = [
        f"{label}は{last_lbl}、{chg:+.2f}%の${c2:.2f}で引けました。{exp_lbl}満期のオプション地図はこうなっています。",
        f"・マックスペイン${fmt(mp_n)}：満期時にオプション買い手の損失が最大になる価格。終値はそれより約{mp_gap:.1f}%{mp_dir}",
        f"・ガンマフリップ${fmt(gf_n)}：ディーラーのヘッジの向きが変わる境目。終値はそれより約{gf_gap:.1f}%{gf_dir}",
        f"・コールウォール${fmt(cw_n)}／プットフロア${fmt(pf_n)}：上側のコール、下側のプットの建玉が最も多い価格",
        f"・オプションが織り込む1週間の変動幅 ±{em}%",
        "",
        "有料の端末で月$50〜99かかるこの地図を、無料で見られるアプリはこちら↓",
        f"https://www.signumhq.com/app?from={a.link_tag}&l=ja",
        "#米国株",
    ]
elif JA:
    body = [
        f"{label}は{last_lbl}、{chg:+.2f}%の${c2:.2f}で引けました。{exp_lbl}満期のオプション地図はこうなっています。",
        "",
        f"マックスペイン${fmt(mp_n)} — 満期時にオプション買い手の損失が最大になる価格。終値はそれより約{mp_gap:.1f}%{mp_dir}",
        f"ガンマフリップ${fmt(gf_n)} — ディーラーのヘッジの向きが変わる境目。終値はそれより約{gf_gap:.1f}%{gf_dir}",
        f"コールウォール${fmt(cw_n)} · プットフロア${fmt(pf_n)} — 上側のコール、下側のプットの建玉が最も多い価格",
        f"オプションが織り込む1週間の変動幅 ±{em}%",
        "",
    ]
    line = "こうした価格帯は、満期週にチャートを読むときの目安としてよく使われます。"
    if ratio_ok:
        line += f" 参考までに、同じ満期の{a.vs.upper()}の1週間の変動幅は±{em_vs}%で、{T}(±{em}%)はその約{a.lev:g}倍です。原指数の日次リターンの{a.lev:g}倍を目指す商品の構造が、オプション価格にもそのまま表れています。"
    body += [line, ""]
    body += [
        "SIGNUM HQアプリの「オプション・フロー」画面では、銘柄ごとにこの地図を、月$50〜99の有料端末なしで無料で見られます(iPhone・Android)。",
        "",
        f"{last_lbl}終値ベース · 予測や投資勧誘ではなく、データ画面です。",
        "リンクはプロフィール(bio)にあります · signumhq.com/app",
        "",
        f"#SIGNUMHQ #{T} #米国株 #米国株投資 #オプション #マックスペイン",
    ]
else:
    body = [
        f"{last_lbl} {label} 종가는 ${c2:.2f}, 전 거래일 대비 {chg:+.2f}%였습니다. {exp_lbl} 만기 옵션 지도는 이렇습니다.",  # 조사(이/가)가 필요 없는 문장 — 라벨이 무엇이든 맞다
        "",
        f"맥스페인 ${fmt(mp_n)} — 만기 때 옵션 가치 합이 가장 작아지는 행사가. 종가는 그보다 {mp_gap:.1f}% {mp_dir}",
        f"감마 플립 ${fmt(gf_n)} — 딜러의 헤지 방향이 바뀌는 경계. 종가는 그보다 {gf_gap:.1f}% {gf_dir}",
        f"콜월 ${fmt(cw_n)} · 풋플로어 ${fmt(pf_n)} — 위쪽 콜·아래쪽 풋 미결제약정이 가장 많은 행사가",
        f"옵션이 가격에 반영한 일주일 변동폭 ±{em}%",
        "",
    ]
    line = "이런 가격대는 만기 주간에 차트를 읽을 때 자주 쓰는 기준선입니다."
    if ratio_ok:
        line += f" 참고로 같은 만기 {a.vs.upper()}의 일주일 변동폭은 ±{em_vs}%로, {T}(±{em}%)는 그 약 {a.lev:g}배입니다. 기초지수 일간 수익률의 {a.lev:g}배를 추종하는 상품 구조가 옵션 가격에도 그대로 나타납니다."
    body += [line, ""]
    body += [
        "SIGNUM HQ 앱의 «옵션 플로우» 화면에서는 종목마다 이 지도를 월 $50~99짜리 유료 단말 없이 무료로 볼 수 있습니다(아이폰·안드로이드).",
        "",
        f"{WD[d2.weekday()]}요일({d2.month}/{d2.day}) 종가 기준 · 예측이나 투자 권유가 아닌 데이터 화면입니다.",
        "링크는 프로필(bio)에 있습니다 · signumhq.com/app",
        "",
        f"#SIGNUMHQ #{T} #미국주식 #서학개미 #옵션 #맥스페인 #미국증시 #주식공부",
    ]
text = '\n'.join(body) + '\n'
if a.channel == 'threads':
    assert text.count('http') == 1 and f'https://www.signumhq.com/app?from={a.link_tag}&l=ja' in text, '링크는 스마트링크 정확히 1개여야 한다'
    assert len(text) <= 500, f'Threads 500자 초과 {len(text)}'
else:
    assert 'http' not in text, '링크가 들어갔다'
if JA:
    assert 'プレミアム' not in text, '프리미엄 칸을 언급하면 정의(순 프리미엄 = 콜−풋)를 써야 한다'
    assert not re.search(r'上がる|下がる|上昇しそう|下落しそう|買い(?!手)|売り(?!手)|おすすめ|オススメ|推奨|有望|急騰|急落|見通し|予想|狙い目|チャンス|儲|必ず|間違いない', text), '예측·권유 표현'
    assert text.count('月$50〜99') == 1
else:
    assert '프리미엄' not in text.replace('월 $50~99', ''), '프리미엄 칸을 언급하면 정의(순 프리미엄 = 콜−풋)를 써야 한다'
    assert not re.search(r'오를|내릴|사라|팔라|매수|매도 추천|전망|상승 ?여력|하락 ?여력|급등|급락|추천', text), '예측·권유 표현'
assert text.count('signumhq.com/app') == 1
print('---- 캡션 ----')
print(text)
print('--------------', len(text), '자')
if a.check_only:
    print('CHECK_ONLY — 파일 안 씀')
    sys.exit(0)

os.makedirs(os.path.expanduser(a.out_dir), exist_ok=True)
tf = os.path.join(os.path.expanduser(a.out_dir), f'caption-{T.lower()}-{a.lang}.txt')
open(tf, 'w', encoding='utf-8').write(text)
if a.channel == 'threads':
    tj = os.path.join(os.path.expanduser(a.out_dir), 'th-task.json')
    json.dump({'file': tf, 'image': img, 'mark': text.split('\n')[0][:20]}, open(tj, 'w'), ensure_ascii=False)
    print('작업 파일 새로 씀:', tj, datetime.datetime.now().strftime('%H:%M:%S'), '→ 발행: bash scripts/ego-run.sh scripts/threads-post.mjs 420 (반드시 && 로 이어 쓴다)')
elif a.channel == 'instagram':
    os.makedirs('/tmp/ego', exist_ok=True)
    json.dump({'image': img, 'caption_file': tf, 'mark': text.split('\n')[0][:40]}, open('/tmp/ego/ig-task.json', 'w'), ensure_ascii=False)
    print('작업 파일 새로 씀: /tmp/ego/ig-task.json', datetime.datetime.now().strftime('%H:%M:%S'))
else:
    print('캡션 파일:', tf)
