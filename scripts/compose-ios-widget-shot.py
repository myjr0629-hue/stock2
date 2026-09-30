#!/usr/bin/env python3
# iOS 위젯 실캡처(시뮬레이터 simctl, ios-widget-{medium,small}-<loc>.png) → App Store 스크린샷 1242x2688
#   다른 5장(compose-promo-shots)과 같은 캔버스·캡션 양식. 홈 화면 통캡처는 시스템 글자가 한국어라(시뮬레이터 로케일) en·ja 에 못 쓴다
#   → 위젯만 잘라(배경화면 모서리 제거) 중형·소형을 세로로 놓는다. 글자·숫자는 실캡처 그대로(지어낸 값 없음).
# 사용: python3 scripts/compose-ios-widget-shot.py <loc...>
import importlib.machinery, os, sys
from PIL import Image, ImageDraw, ImageFilter
HERE = os.path.dirname(os.path.abspath(__file__))
cps = importlib.machinery.SourceFileLoader('cps', os.path.join(HERE, 'compose-promo-shots.py')).load_module()
SRC = os.path.expanduser('~/Documents/signum-work/2026-09-30/widget-shots')
OUT = os.path.expanduser('~/Documents/signum-work/2026-09-30/store-1.10.0/screenshots')
CAP = {  # .agent/marketing/store-surfaces/release-1.10.0/screenshot-captions.json «widget»
    'en': "Right on your home screen,|prices and options levels",
    'ja': "ホーム画面でそのまま|マイ銘柄の株価とオプションレベル",
    'ko': "홈 화면에서 바로|내 종목 가격과 옵션 레벨",
}
BG = ([14, 42, 60], [5, 10, 20]); FG = [255, 255, 255]
W, H, APP_H = 1242, 2688, 2301


def widget(path):
    """위젯 바탕(짙은 무채색)의 경계로 잘라 배경화면(파랑·초록) 모서리를 없앤다."""
    im = Image.open(path).convert('RGB'); w, h = im.size; px = im.load()
    dark = lambda p: max(p) < 90 and max(p) - min(p) < 45
    xs = [x for x in range(w) if dark(px[x, h // 2])]; ys = [y for y in range(h) if dark(px[w // 2, y])]
    return im.crop((min(xs), min(ys), max(xs) + 1, max(ys) + 1))


def place(canvas, img, x, y, radius):
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([x, y + 12, x + img.width, y + img.height + 12], radius=radius, fill=(0, 0, 0, 140))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(24))).convert('RGB')
    canvas.paste(img, (x, y), cps.rounded_mask(img.size, radius))
    ImageDraw.Draw(canvas, 'RGBA').rounded_rectangle([x, y, x + img.width - 1, y + img.height - 1], radius=radius, outline=(255, 255, 255, 40), width=2)
    return canvas


def compose(loc):
    cap = CAP[loc]
    bad = cps.missing_glyphs(cap, loc)
    if bad: raise SystemExit(f'✗ {loc} 폰트에 없는 글자 {bad}')
    canvas = cps.vgradient((W, H), BG[0], BG[1])
    zone_h = H - APP_H - 60                      # 다른 5장과 같은 캡션 높이(327)
    cps.draw_caption(canvas, cap, loc, FG, zone_h)
    med = widget(f'{SRC}/ios-widget-medium-{loc}.png'); sm = widget(f'{SRC}/ios-widget-small-{loc}.png')
    mw = 1104; med = med.resize((mw, round(med.height * mw / med.width)), Image.LANCZOS)
    sw = 640; sm = sm.resize((sw, round(sm.height * sw / sm.width)), Image.LANCZOS)
    gap = 110; block = med.height + gap + sm.height
    top = zone_h + (APP_H - block) // 2          # 캡션 아래 남는 자리의 가운데
    r_med = round(64 * mw / 1043); r_sm = round(64 * sw / 487)   # 위젯 모서리(캡처 기준 약 64px)
    canvas = place(canvas, med, (W - mw) // 2, top, r_med)
    canvas = place(canvas, sm, (W - sw) // 2, top + med.height + gap, r_sm)
    out = f'{OUT}/{loc}/widget-{loc}-1242x2688.png'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.save(out, optimize=True)
    print(f'  ✓ {out}  {canvas.size}  {round(os.path.getsize(out) / 1024)}KB')


for loc in (sys.argv[1:] or ['en', 'ja']):
    compose(loc)
