# -*- coding: utf-8 -*-
"""
scripts/make-phone-frames.py — «물리적인» 폰 목업 프레임 생성

왜 다시 만드는가 (2026-08-19 실측)
-----------------------------------
1차 목업은 폰 몸체가 RGB(12,15,22) 였다. 앱 화면도 거의 검정, 배경도 짙은 남색이라
«폰의 윤곽»이 세 겹 모두 같은 밝기였다. Flow 에 넣었더니 2초 만에 폰을 버리고
화면만 프레임 끝까지 채웠다 — 「폰인지 뭔지 모르는」 그림이 나온 원인이다.

그래서 폰을 «물건»으로 만든다.
  · 밝은 티타늄 프레임 (화면·배경과 밝기 차이를 크게)
  · 프레임과 화면 사이 «검은 베젤»
  · 옆면 버튼 (볼륨·전원) — 이게 있으면 사람도 모델도 폰으로 인식한다
  · 유리 반사 sheen · 진한 접지 그림자
  · 사방에 배경 여백 — 실루엣이 배경에서 떨어져 보이게

스크롤용은 두 종류를 만든다.
  scroll-*   한 화면 이동 (시덴스·긴 클립용)
  scrollh-*  «반 화면» 이동 (Flow 4초용 — 짧게 가야 화면을 지어내지 않는다)

실행:  python scripts/make-phone-frames.py
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, shutil

CAP = 'E:/SIGNUM_UPLOAD/AD_OUTSOURCE/00_PHONE_CAPTURE'
ROOT = 'E:/SIGNUM_UPLOAD/AD_OUTSOURCE/03_AD_CLIPS'
FRAMES = os.path.join(ROOT, 'frames')
SCREENS = os.path.join(ROOT, 'screens')
for d in (FRAMES, SCREENS, os.path.join(ROOT, 'brand')):
    os.makedirs(d, exist_ok=True)

W, H = 1080, 1920
APP_W = 620                                   # 앱 콘텐츠 폭
APP_H = round(APP_W * 2622 / 1206)            # 원본 비율 그대로 → 1348
STATUS_H = 70
SCREEN_W, SCREEN_H = APP_W, STATUS_H + APP_H  # 620 x 1418
BEZEL = 11                                    # 화면을 감싸는 검은 테
METAL = 15                                    # 그 바깥 금속 프레임
PAD = BEZEL + METAL
BODY_W, BODY_H = SCREEN_W + PAD * 2, SCREEN_H + PAD * 2
BODY_X, BODY_Y = (W - BODY_W) // 2, (H - BODY_H) // 2 - 30
SCREEN_X, SCREEN_Y = BODY_X + PAD, BODY_Y + PAD
R_BODY, R_SCREEN = 74, 56
CROP_H = round(1206 * APP_H / APP_W)          # 원본에서 «한 화면» = 2622


def font(sz):
    for p in ('C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        try:
            return ImageFont.truetype(p, sz)
        except OSError:
            continue
    return ImageFont.load_default()


def vgrad(size, c0, c1, horizontal=False):
    """선형 그라디언트 이미지."""
    w, h = size
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    n = w if horizontal else h
    for i in range(n):
        t = i / max(1, n - 1)
        c = tuple(round(c0[k] + (c1[k] - c0[k]) * t) for k in range(3))
        d.line([(i, 0), (i, h)] if horizontal else [(0, i), (w, i)], fill=c)
    return img


def studio(tone='mid'):
    top, bot, key, warm = {
        'mid':   ((52, 72, 104), (18, 25, 38), 185, 125),
        'light': ((214, 226, 242), (168, 186, 210), 120, 70),
        'deep':  ((22, 30, 44), (6, 9, 14), 120, 90),
    }[tone]
    bg = vgrad((W, H), top, bot)
    g = Image.new('L', (W, H), 0)
    ImageDraw.Draw(g).ellipse([-420, -560, 900, 760], fill=key)
    g = g.filter(ImageFilter.GaussianBlur(220))
    bg = Image.composite(Image.new('RGB', (W, H), (86, 132, 190)), bg, g.point(lambda v: v // 2))
    a = Image.new('L', (W, H), 0)
    ImageDraw.Draw(a).ellipse([560, 1180, 1500, 2120], fill=warm)
    a = a.filter(ImageFilter.GaussianBlur(240))
    return Image.composite(Image.new('RGB', (W, H), (168, 118, 52)), bg, a.point(lambda v: v // 3))


def status_bar(canvas, clock='7:16'):
    d = ImageDraw.Draw(canvas)
    cx = SCREEN_X + SCREEN_W // 2
    d.rounded_rectangle([cx - 60, SCREEN_Y + 15, cx + 60, SCREEN_Y + 49], radius=17, fill=(0, 0, 0))
    d.text((SCREEN_X + 40, SCREEN_Y + 21), clock, font=font(25), fill=(255, 255, 255))
    rx = SCREEN_X + SCREEN_W - 36
    d.rounded_rectangle([rx - 43, SCREEN_Y + 24, rx, SCREEN_Y + 43], radius=5, outline=(232, 232, 238), width=2)
    d.rounded_rectangle([rx - 40, SCREEN_Y + 27, rx - 16, SCREEN_Y + 40], radius=3, fill=(232, 232, 238))
    d.rounded_rectangle([rx + 2, SCREEN_Y + 30, rx + 5, SCREEN_Y + 37], radius=2, fill=(190, 190, 196))
    wx = rx - 64
    for i, r in enumerate((16, 10, 4)):
        d.arc([wx - r, SCREEN_Y + 38 - r, wx + r, SCREEN_Y + 38 + r], 205, 335,
              fill=(232, 232, 238), width=3 if i < 2 else 4)
    sx = rx - 112
    for i in range(4):
        hh = 7 + i * 5
        d.rounded_rectangle([sx + i * 10, SCREEN_Y + 42 - hh, sx + i * 10 + 6, SCREEN_Y + 42],
                            radius=2, fill=(232, 232, 238))


def side_buttons(canvas):
    """옆면 버튼 — «물건»으로 읽히게 하는 가장 강한 단서."""
    d = ImageDraw.Draw(canvas)
    metal_hi, metal_lo = (196, 208, 224), (108, 120, 138)
    L, R = BODY_X, BODY_X + BODY_W
    # 왼쪽: 무음 스위치 + 볼륨 업/다운
    for y0, hgt in ((BODY_Y + 250, 52), (BODY_Y + 340, 96), (BODY_Y + 456, 96)):
        d.rounded_rectangle([L - 7, y0, L + 2, y0 + hgt], radius=4, fill=metal_lo)
        d.rounded_rectangle([L - 7, y0, L - 3, y0 + hgt], radius=3, fill=metal_hi)
    # 오른쪽: 전원
    d.rounded_rectangle([R - 2, BODY_Y + 400, R + 7, BODY_Y + 545], radius=4, fill=metal_lo)
    d.rounded_rectangle([R + 3, BODY_Y + 400, R + 7, BODY_Y + 545], radius=3, fill=metal_hi)


def glass_sheen(canvas):
    """유리 반사 — 화면 위 대각선 하이라이트. «유리 뒤에 화면이 있다»는 신호."""
    sheen = Image.new('L', (W, H), 0)
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(SCREEN_X - 40, SCREEN_Y - 40),
                (SCREEN_X + SCREEN_W * 0.62, SCREEN_Y - 40),
                (SCREEN_X - 40, SCREEN_Y + SCREEN_H * 0.52)], fill=46)
    sheen = sheen.filter(ImageFilter.GaussianBlur(46))
    clip = Image.new('L', (W, H), 0)
    ImageDraw.Draw(clip).rounded_rectangle(
        [SCREEN_X, SCREEN_Y, SCREEN_X + SCREEN_W, SCREEN_Y + SCREEN_H], radius=R_SCREEN, fill=255)
    sheen = Image.composite(sheen, Image.new('L', (W, H), 0), clip)
    return Image.composite(Image.new('RGB', (W, H), (226, 238, 255)), canvas, sheen)


def build(src_png, out_name, offset_y=0, tone='mid'):
    src = Image.open(os.path.join(CAP, src_png)).convert('RGB')
    canvas = studio(tone)

    # ① 접지 그림자 — 진하게, 아래로 치우치게
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).ellipse(
        [BODY_X - 110, BODY_Y + BODY_H - 30, BODY_X + BODY_W + 110, BODY_Y + BODY_H + 230], fill=175)
    canvas = Image.composite(Image.new('RGB', (W, H), (2, 3, 7)), canvas,
                             sh.filter(ImageFilter.GaussianBlur(78)))

    # ② 금속 프레임 — «밝게». 화면(검정)·배경(남색)과 밝기 차이를 크게 벌린다
    body = Image.new('L', (W, H), 0)
    ImageDraw.Draw(body).rounded_rectangle(
        [BODY_X, BODY_Y, BODY_X + BODY_W, BODY_Y + BODY_H], radius=R_BODY, fill=255)
    metal = vgrad((W, H), (206, 218, 234), (96, 108, 126), horizontal=True)
    canvas = Image.composite(metal, canvas, body)

    # ③ 프레임 안쪽 검은 베젤
    bez = Image.new('L', (W, H), 0)
    ImageDraw.Draw(bez).rounded_rectangle(
        [BODY_X + METAL, BODY_Y + METAL, BODY_X + BODY_W - METAL, BODY_Y + BODY_H - METAL],
        radius=R_BODY - METAL, fill=255)
    canvas = Image.composite(Image.new('RGB', (W, H), (8, 9, 12)), canvas, bez)

    # ④ 화면 바탕
    scr = Image.new('L', (W, H), 0)
    ImageDraw.Draw(scr).rounded_rectangle(
        [SCREEN_X, SCREEN_Y, SCREEN_X + SCREEN_W, SCREEN_Y + SCREEN_H], radius=R_SCREEN, fill=255)
    canvas = Image.composite(Image.new('RGB', (W, H), (7, 10, 16)), canvas, scr)

    # ⑤ ★ 앱 화면 — 자르고 축소만. 재생성 없음.
    oy = max(0, min(offset_y, src.height - CROP_H))
    box = src.crop((0, oy, src.width, oy + CROP_H)).resize((APP_W, APP_H), Image.LANCZOS)
    canvas.paste(box, (SCREEN_X, SCREEN_Y + STATUS_H))

    # ⑥ 화면 밖으로 삐져나온 부분을 베젤 색으로 정리 (아래 둥근 모서리)
    inv = Image.new('L', (W, H), 0)
    ImageDraw.Draw(inv).rounded_rectangle(
        [SCREEN_X, SCREEN_Y, SCREEN_X + SCREEN_W, SCREEN_Y + SCREEN_H], radius=R_SCREEN, fill=255)
    canvas = Image.composite(canvas, Image.new('RGB', (W, H), (8, 9, 12)),
                             Image.composite(inv, Image.new('L', (W, H), 0), body))

    status_bar(canvas)
    side_buttons(canvas)
    canvas = glass_sheen(canvas)

    canvas.save(os.path.join(FRAMES, out_name))
    print(f'  ✔ {out_name:30s} (원본 y {oy} ~ {oy + CROP_H})')


PICK = [
    ('cap-dash.png',             'iphone-00-dash'),
    ('cap-command-overview.png', 'iphone-01-metrics'),
    ('cap-command-ai.png',       'iphone-02-ai'),
    ('cap-guardian.png',         'iphone-03-gauge'),
    ('cap-flow.png',             'iphone-04-flow'),
    ('cap-intel.png',            'iphone-05-sector'),
]
SCROLL = [
    ('tall-dash.png',             'scroll-dash'),
    ('tall-command-ai.png',       'scroll-ai'),
    ('tall-command-overview.png', 'scroll-metrics'),
    ('tall-flow.png',             'scroll-flow'),
]

print('\n[정지 화면]')
for src, name in PICK:
    build(src, f'{name}.png')

print('\n[스크롤 — 한 화면 이동 (시덴스·긴 클립용)]')
for src, name in SCROLL:
    build(src, f'{name}-start.png', 0)
    build(src, f'{name}-end.png', CROP_H)

print('\n[스크롤 — «반 화면» 이동 (Flow 4초용)]')
for src, name in SCROLL:
    build(src, f'{name.replace("scroll-", "scrollh-")}-start.png', 0)
    build(src, f'{name.replace("scroll-", "scrollh-")}-end.png', CROP_H // 2)

print('\n[원본 화면 복사]')
for src, _ in PICK:
    shutil.copy(os.path.join(CAP, src), os.path.join(SCREENS, src))

print(f'\n→ {ROOT}')
