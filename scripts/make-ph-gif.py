#!/usr/bin/env python3
# ============================================================================
# make-ph-gif — PH 갤러리 «첫 장»을 움직이게 (1270x760 애니 GIF)
# ----------------------------------------------------------------------------
# 왜 이게 치트키인가:
#   PH 갤러리/썸네일은 GIF 를 받고 피드에서 hover 하면 재생된다.
#   그런데 거의 모든 런치가 정지 이미지만 올린다 — 움직이는 카드 하나는
#   같은 줄의 다른 제품들 사이에서 확실히 눈을 끈다.
#
# 모션은 «진짜»여야 한다:
#   스크롤 프레임을 뽑아봤더니 앱이 리렌더하며 위치를 되돌려 14프레임이
#   전부 맨 위였다(픽셀 차이는 났지만 «움직인» 게 아니었다).
#   그래서 «탭 전환»을 쓴다 — 화면이 확실히 다르고, 프레임마다
#   다른 기능을 보여주므로 데모로서도 낫다.
#
# 레이아웃은 정적 카드와 «같은 모듈»(ph_layout)을 쓴다. 첫 장만 디자인이
# 다르면 나머지 3장과 따로 놀아 대충 만든 묶음처럼 보인다.
# ============================================================================
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import ph_layout as L

ROOT, RAW, W, H, S = L.ROOT, L.RAW, L.W, L.H, 2

SCREENS = {
    # 채도·밝기 실측으로 «화려한 순»
    'uc':     ['uc-home-en.png', 'uc-diverge-en.png', 'uc-whales-en.png', 'uc-stories-en.png'],
    'signum': ['signum-flow-en.png', 'signum-intel-en.png', 'signum-guardian-en.png'],
    'wim':    ['wim-home-en.png', 'wim-quiz-en.png', 'wim-library-en.png'],
}
COPY = {
    'uc':     ('Undercurrent', 'The money behind the news',
               'Every headline, next to what the money did — read by AI, in English, Korean or Japanese.',
               [('Off-exchange · COIN','62%'), ('Off-exchange · INTC','59%'), ('Editions a day','2–3')]),
    'signum': ('SIGNUM HQ', 'See what the desks see',
               'Max pain, gamma flip, dark pool and whale flow — with an AI brief after every US close.',
               [('NVDA max pain','$210'), ('Gamma flip','$185'), ('Total premium','$9.6M')]),
    'wim':    ("Why'd It Move?", "Today's market, as a 30-second lesson",
               'One US stock that actually moved, its real 5-minute bars, and an AI answer for why.',
               [("Tonight's stock",'MRNA'), ('Move','±8.9%'), ('Time to play','3 min')]),
}

def build(app):
    kicker, head, sub, floats = COPY[app]
    shots = [os.path.join(RAW, n) for n in SCREENS[app]]
    shots = [p for p in shots if os.path.exists(p)]
    if len(shots) < 2:
        print(f'✗ {app}: 화면 부족'); return

    probe = Image.open(shots[0])
    base, box, fboxes = L.build_base(app, kicker, head, sub, probe.size, floats=floats, S=S)
    x, y, ph_w, ph_h, r = box
    mask = L.rounded((ph_w, ph_h), r)
    screens = [L.grade(Image.open(p).convert('RGB').resize((ph_w, ph_h), Image.LANCZOS)) for p in shots]

    def place(im):
        f = base.copy()
        f.paste(im, (x, y), mask)
        f = L.paste_floats(f, app, box, fboxes, S=S)
        return f.resize((W, H), Image.LANCZOS)      # 슈퍼샘플링 축소

    XF = 3
    seq, durs = [], []
    n = len(screens)
    for i in range(n):
        cur, nxt = screens[i], screens[(i+1) % n]
        seq.append(place(cur)); durs.append(1600)   # 읽을 시간
        for k in range(1, XF+1):
            seq.append(place(Image.blend(cur, nxt, k/(XF+1)))); durs.append(70)

    out = os.path.join(ROOT, 'promo-shots', 'ph', '' if app == 'uc' else app, '0-hero.gif')
    os.makedirs(os.path.dirname(out), exist_ok=True)

    # ⚠️ PH 상한 2MB. 추정하지 말고 저장해보고 색 수를 낮춰가며 «실제 크기»로 맞춘다.
    for colors in (128, 96, 80, 64, 48):
        pal = seq[0].quantize(colors=colors, method=Image.MEDIANCUT)
        seq_p = [f.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for f in seq]
        seq_p[0].save(out, save_all=True, append_images=seq_p[1:], duration=durs,
                      loop=0, optimize=True, disposal=1)
        kb = os.path.getsize(out) // 1024
        if kb <= 1900: break
    warn = '  ⚠ 상한 초과' if kb > 2000 else ''
    print(f'✓ {app}: {out.split("promo-shots/")[1]}  {len(seq_p)}프레임  {colors}색  {kb}KB{warn}')

for a in (sys.argv[1:] or ['uc']):
    build(a)
