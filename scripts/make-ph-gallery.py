#!/usr/bin/env python3
# ============================================================================
# make-ph-gallery — Product Hunt 갤러리용 «가로» 이미지 생성 (1270x760)
# ----------------------------------------------------------------------------
# 왜 따로 만드나:
#   우리 스토어 자산은 1080x1920 세로다. PH 갤러리는 가로 카드라 세로를 넣으면
#   좌우가 통째로 빈 레터박스가 되고, 첫 장은 «링크 공유 시 소셜 프리뷰»로도
#   쓰이기 때문에 여기서 대충 하면 트위터/슬랙 카드까지 같이 망가진다.
#
# 구성: 브랜드 그라디언트 + 좌측 카피 + 우측 실기기 화면(라운드+그림자, 하단 블리드)
#   · 화면은 광고를 이미 제거한 _raw 캡처를 쓴다 (960x1679)
#   · aggregate 문구·수치는 실제 값만 쓴다 (595 티커는 실측 커버리지)
# ============================================================================
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'promo-shots', '_raw')
OUT = os.path.join(ROOT, 'promo-shots', 'ph')
os.makedirs(OUT, exist_ok=True)

W, H = 1270, 760

# 앱별 팔레트 — 각 앱의 «실제 화면 색»에서 뽑았다. 셋을 같은 색으로 내면
# 스토어에서 서로 다른 앱으로 안 읽힌다.
THEMES = {
    'uc':     dict(top=(11, 107, 87),  bot=(9, 46, 34),   glow=(26, 150, 118),
                   fg=(255,255,255), dim=(168,214,200), accent=(255,197,87), chip=(112,168,148), foot=(129,176,161)),
    'signum': dict(top=(13, 27, 42),   bot=(5, 10, 18),   glow=(22, 58, 84),
                   fg=(255,255,255), dim=(150,171,192), accent=(64, 224, 208), chip=(58,92,120),  foot=(110,130,152)),
    'wim':    dict(top=(91, 75, 232),  bot=(38, 24, 110),  glow=(126, 110, 255),
                   fg=(255,255,255), dim=(199,193,247), accent=(255,201,84), chip=(139,128,236), foot=(163,155,225)),
}
TH = THEMES['uc']
BG_TOP, BG_BOT = TH['top'], TH['bot']
FG, DIM, ACCENT = TH['fg'], TH['dim'], TH['accent']

SFNS = '/System/Library/Fonts/SFNS.ttf'
from PIL import ImageFont

def sf(size, weight='Heavy'):
    f = ImageFont.truetype(SFNS, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f

def vgrad(size, top, bot):
    w, h = size
    g = Image.new('RGB', (1, h)); px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return g.resize((w, h), Image.BILINEAR)

def rounded(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=r, fill=255)
    return m

def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w_
    if cur: lines.append(cur)
    return lines

def card(raw_name, kicker, head, sub, out_name, chips=None, foot=None):
    canvas = vgrad((W, H), TH['top'], TH['bot'])

    # 은은한 방사형 하이라이트 — 평평한 그라디언트에 깊이를 준다
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W*0.52, -H*0.35, W*1.25, H*0.95], fill=64)
    canvas.paste(Image.new('RGB', (W, H), TH['glow']), (0, 0), glow.filter(ImageFilter.GaussianBlur(150)))

    # ── 기기 화면 (우측, 하단으로 흘려보낸다)
    if raw_name:
        shot = Image.open(os.path.join(RAW, raw_name)).convert('RGB')
        # 화면 «전체»가 들어가도록 높이를 맞춘다. 탭바가 캔버스 밖으로 반쯤
        # 잘리면 «블리드»가 아니라 «실수»로 보인다(2026-08-22 육안 검증).
        ph_h = 640
        ph_w = round(ph_h * shot.width / shot.height)
        shot = shot.resize((ph_w, ph_h), Image.LANCZOS)
        r = 28
        shot.putalpha(rounded((ph_w, ph_h), r))
        x, y = W - 96 - ph_w, (H - ph_h) // 2

        sh = Image.new('RGBA', (ph_w + 130, ph_h + 130), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([65, 65, ph_w + 65, ph_h + 65], radius=r, fill=(0, 0, 0, 120))
        sh = sh.filter(ImageFilter.GaussianBlur(34))
        canvas.paste(sh, (x - 65, y - 45), sh)
        canvas.paste(shot, (x, y), shot)

        edge = Image.new('RGBA', (ph_w, ph_h), (0, 0, 0, 0))
        ImageDraw.Draw(edge).rounded_rectangle([0, 0, ph_w-1, ph_h-1], radius=r, outline=(255, 255, 255, 58), width=2)
        canvas.paste(edge, (x, y), edge)
        text_w = x - 96 - 84
    else:
        text_w = W - 200

    # ── 카피 (좌측)
    d = ImageDraw.Draw(canvas)
    px = 84
    f_kick = sf(23, 'Bold'); f_head = sf(62, 'Heavy'); f_sub = sf(27, 'Medium')

    head_lines = wrap(d, head, f_head, text_w)
    sub_lines = wrap(d, sub, f_sub, text_w)
    block_h = 34 + 22 + len(head_lines) * 74 + 20 + len(sub_lines) * 40
    y = (H - block_h) // 2

    d.text((px, y), kicker.upper(), font=f_kick, fill=TH['accent'])
    y += 34 + 22
    for ln in head_lines:
        d.text((px, y), ln, font=f_head, fill=TH['fg']); y += 74
    y += 20
    for ln in sub_lines:
        d.text((px, y), ln, font=f_sub, fill=TH['dim']); y += 40

    # 지표 칩 — «무엇이 들어있는지»를 말이 아니라 목록으로 보여준다
    if chips:
        y += 26
        f_chip = sf(23, 'Semibold')
        cx = px
        for c in chips:
            tw = d.textlength(c, font=f_chip)
            cw, ch = tw + 34, 46
            if cx + cw > px + text_w:
                cx = px; y += ch + 12
            d.rounded_rectangle([cx, y, cx + cw, y + ch], radius=23,
                                fill=None, outline=TH['chip'], width=2)
            d.text((cx + 17, y + 10), c, font=f_chip, fill=TH['fg'])
            cx += cw + 12
        y += 46
    if foot:
        y += 30
        d.text((px, y), foot, font=sf(20, 'Regular'), fill=TH['foot'])

    os.makedirs(OUT, exist_ok=True)
    canvas.save(os.path.join(OUT, out_name), 'PNG', optimize=True)
    print(f'  {out_name}  {canvas.size}  {os.path.getsize(os.path.join(OUT, out_name))//1024}KB')

import sys
APP = sys.argv[1] if len(sys.argv) > 1 else 'uc'
TH = THEMES[APP]
OUT = os.path.join(ROOT, 'promo-shots', 'ph', APP)
print(f'Product Hunt 갤러리 [{APP}] (1270x760)')
if APP == 'wim':
    card('wim-home-en.png', "Why'd It Move?",
         "Today's market, as a 30-second lesson",
         'Every night, one US stock that actually moved that day — and the real 5-minute bars behind it.',
         '1-hero.png')
    card('wim-quiz-en.png', 'The question',
         'Real move. Real chart. One question.',
         'MRNA swung 8.9%. Analyst action? Sector rotation? Pick one, then find out what actually did it.',
         '2-quiz.png')
    card('wim-library-en.png', 'Library',
         "A concept library, live on tonight's stock",
         'RSI, VWAP, trend phase, short interest — basics through desk-grade, each showing the actual number for the stock in question.',
         '3-library.png')
    card(None, 'Free, no account',
         'Three minutes a night.',
         'English, Korean and Japanese. iOS and Android. No paywall, no sign-up.',
         '4-coverage.png',
         chips=['Real market data', 'Charts', 'Institutional flow', 'Macro', 'News reading'],
         foot='Education only — not investment advice.')
    raise SystemExit(0)

if APP == 'signum':
    card('signum-dash-en.png', 'SIGNUM HQ',
         'Institutional market data, without the terminal',
         'Dark pool share, options positioning and dealer gamma for US equities — free, refreshed through every session.',
         '1-hero.png')
    card('signum-guardian-en.png', 'Guardian',
         'One number for where risk sits',
         'RLSI reads momentum, participation and price trend together, so you see the regime before you see a ticker.',
         '2-guardian.png')
    card('signum-flow-en.png', 'Options flow',
         'Max pain, gamma flip, premium — per ticker',
         'NVDA at $214.72 with max pain at $210 and $9.6M of premium: the whole options picture on one screen.',
         '3-flow.png')
    card(None, 'Free, no account',
         'Ten US sectors. Every session.',
         'English, Korean and Japanese. iOS and Android. No paywall, no sign-up.',
         '4-coverage.png',
         chips=['Dark pool share', 'Max pain', 'Gamma exposure', 'Call wall',
                'Unusual sweeps', 'IV skew', 'AI sector briefs'],
         foot='Information and education only — not investment advice.')
    raise SystemExit(0)

card('uc-home-en.png', 'Undercurrent',
     'The money behind the news',
     'Every headline, paired with what institutional money actually did on that ticker that session.',
     '1-hero.png')
card('uc-diverge-en.png', 'Divergence',
     'When news and money split, we keep score',
     'Every divergence gets checked three days later, and the running tally stays on screen. Money 36, news 42, draw 62 — as of this morning.',
     '2-divergence.png')
card('uc-whales-en.png', 'Whale radar',
     'How much traded off-exchange',
     'The share of volume that never touched a lit exchange, per ticker, next to the story that moved it.',
     '3-flow.png')
card(None, 'Free, no account',
     '595 US tickers. 2–3 editions a day.',
     'English, Korean and Japanese. iOS and Android. No paywall, no sign-up.',
     '4-coverage.png',
     chips=['Dark pool share', 'Max pain', 'Call wall / put floor',
            'Put-call ratio', 'Gamma exposure', 'Options flow'],
     foot='Information and education only — not investment advice.')
