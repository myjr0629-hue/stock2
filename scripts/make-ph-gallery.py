#!/usr/bin/env python3
# ============================================================================
# make-ph-gallery — PH 갤러리 정적 카드 (1270x760). 레이아웃은 ph_layout 공용.
# ----------------------------------------------------------------------------
# 카피 원칙 (금융 앱):
#   · 화면에 «실제로 떠 있는» 수치만 쓴다. 지어낸 숫자·성과·후기는 넣지 않는다.
#     (스토어 심사·PH 댓글·유사투자자문 어느 쪽에서도 그대로 리스크가 된다)
#   · 대신 «무료 / 계정 불필요 / 커버리지 / 3개 언어» 처럼 사실이면서 강한 것을 크게 쓴다.
# ============================================================================
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import ph_layout as L

W, H, S = L.W, L.H, 2

def card(app, raw_name, kicker, head, sub, out_name, chips=None, foot=None, floats=None):
    probe = Image.open(os.path.join(L.RAW, raw_name)) if raw_name else None
    base, box, fb = L.build_base(app, kicker, head, sub,
                                 probe.size if probe else (1, 1), floats=floats, S=S,
                                 chips=chips, foot=foot, has_phone=bool(raw_name))
    if box:
        x, y, pw, ph, r = box
        im = L.grade(Image.open(os.path.join(L.RAW, raw_name)).convert('RGB').resize((pw, ph), Image.LANCZOS))
        base.paste(im, (x, y), L.rounded((pw, ph), r))
        base = L.paste_floats(base, app, box, fb, S=S)
    out = os.path.join(L.ROOT, 'promo-shots', 'ph', '' if app == 'uc' else app, out_name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    base.resize((W, H), Image.LANCZOS).save(out, 'PNG', optimize=True)
    print(f'  {out_name}  {os.path.getsize(out)//1024}KB')

APP = sys.argv[1] if len(sys.argv) > 1 else 'uc'
print(f'Product Hunt 갤러리 [{APP}] (1270x760, {S}x 슈퍼샘플링)')

if APP == 'uc':
    card(APP, 'uc-home-en.png', 'Undercurrent', 'The money behind the news',
         'Every headline, next to what institutional money actually did on that ticker.',
         '1-hero.png', floats=[('Off-exchange · COIN','62%'), ('Off-exchange · INTC','59%'), ('Editions / day','2–3')])
    card(APP, 'uc-diverge-en.png', 'AI analysis', 'When news and money split, an AI calls it',
         'Every divergence is written up by AI, then checked three days later — and the running tally stays on screen.',
         '2-divergence.png', floats=[('Money was right','36'), ('News was right','42'), ('Draw','62')])
    card(APP, 'uc-whales-en.png', 'Whale radar', 'See the size that never hit a lit exchange',
         'Dark pool share per ticker, next to the story that moved it.',
         '3-flow.png', floats=[('COIN off-exch','62%'), ('INTC off-exch','59%'), ('HOOD off-exch','55%')])
    card(APP, None, "What's inside", 'Every US name people actually trade.',
         'Dark pool, gamma and whale flow on every one — refreshed all session, in 3 languages.', '4-coverage.png',
         chips=['AI money reads','Dark pool share','Max pain','Gamma exposure','Call wall / put floor','Put-call ratio','Whale radar','Divergence'],
         foot='Information and education only — not investment advice.')

elif APP == 'signum':
    card(APP, 'signum-flow-en.png', 'Options flow', 'See what the desks see',
         'Max pain, gamma flip, dealer positioning and options premium — per ticker, every US session.',
         '1-hero.png', floats=[('NVDA max pain','$210'), ('Gamma flip','$185'), ('Total premium','$9.6M')])
    card(APP, 'signum-intel-en.png', 'AI analysis', 'An AI reads the tape after every close',
         'Ten US sectors, leaders and laggards, and what actually drove the session — written for you in English, Korean or Japanese.',
         '2-intel.png', floats=[('Sectors briefed','10'), ('Key names','70'), ('Languages','3')])
    card(APP, 'signum-guardian-en.png', 'Guardian', 'One number for where risk sits',
         'Momentum, participation and price trend read together — the regime before you pick a name.',
         '3-guardian.png', floats=[('RLSI','49'), ('VIX','15.1'), ('Fear & Greed','55')])
    card(APP, None, "What's inside", 'The whole US options picture, on your phone.',
         'Max pain, gamma flip, dark pool and sweeps on every name — all session, in 3 languages.', '4-coverage.png',
         chips=['AI sector briefs','Dark pool share','Max pain','Gamma exposure','Gamma flip','Call wall','Whale index','Unusual sweeps','IV skew'],
         foot='Information and education only — not investment advice.')

elif APP == 'wim':
    card(APP, 'wim-home-en.png', "Why'd It Move?", "Today's market, as a 30-second lesson",
         'Every night, one US stock that actually moved — and the real 5-minute bars behind it.',
         '1-hero.png', floats=[("Tonight's stock",'MRNA'), ('Move','±8.9%'), ('Time to play','3 min')])
    card(APP, 'wim-quiz-en.png', 'AI analysis', 'Real move. Real chart. One question.',
         'MRNA swung 8.9%. Analyst action? Sector rotation? Pick one — then an AI explains what actually did it.',
         '2-quiz.png', floats=[('Real 5-min bars','Yes'), ('Answer','AI-written'), ('Languages','3')])
    card(APP, 'wim-library-en.png', 'Library', "A concept library, live on tonight's stock",
         'RSI, VWAP, trend phase, short interest — each showing the actual number, not a definition.',
         '3-library.png', floats=[('RSI · MRNA','58'), ('Short interest','5.8%'), ('Concepts','Live')])
    card(APP, None, "What's inside", 'Three minutes a night.',
         'English, Korean and Japanese. iOS and Android. No paywall, no sign-up.', '4-coverage.png',
         chips=['AI explanations','Real market data','Charts','Institutional flow','Dark pool','Macro','Short interest'],
         foot='Education only — not investment advice.')
