# -*- coding: utf-8 -*-
"""
scripts/make-scroll-frames.py — Flow 스크롤 테스트용 «시작/끝 프레임» 합성

왜 필요한가
-----------
tall-*.png 는 1206x6638 (1:5.5) 이다. 이걸 그대로 Flow 에 주면 9:16 프레임에
욱여넣어 «찌그러진다». 그래서 폰 목업 안에 원본을 «무손실로» 박은 1080x1920
프레임을 미리 만들어 준다.

- 화면 안 내용은 원본 픽셀 그대로 (리샘플만, 재생성 없음)
- start = 이미지 맨 위 한 화면 / end = 정확히 한 화면 아래
- 두 장을 Flow 의 «첫 프레임 / 마지막 프레임» 에 넣으면 스크롤이 된다

실행:  python scripts/make-scroll-frames.py
"""
from PIL import Image, ImageDraw, ImageFilter
import os

SRC = 'E:/SIGNUM_UPLOAD/AD_OUTSOURCE/00_PHONE_CAPTURE/tall-command-ai.png'
OUT = 'E:/SIGNUM_UPLOAD/AD_OUTSOURCE/00_PHONE_CAPTURE/_flow_test'
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1920                 # 9:16 세로
SCREEN_W, SCREEN_H = 640, 1392    # 폰 «화면» (원본 1206x2622 와 같은 비율)
BEZEL = 20
BODY_W, BODY_H = SCREEN_W + BEZEL * 2, SCREEN_H + BEZEL * 2
BODY_X, BODY_Y = (W - BODY_W) // 2, 240
SCREEN_X, SCREEN_Y = BODY_X + BEZEL, BODY_Y + BEZEL
R_BODY, R_SCREEN = 62, 46

src = Image.open(SRC).convert('RGB')
# 원본 한 화면 높이 = 화면비를 그대로 되돌린 값
CROP_H = round(src.width * SCREEN_H / SCREEN_W)     # 1206 -> 2622
print(f'원본 {src.width}x{src.height}  ·  한 화면 = {CROP_H}px  ·  총 {src.height/CROP_H:.2f}화면')


def studio() -> Image.Image:
    """중간 톤 프리미엄 배경 — 짙은 남색→차콜에 쿨 키라이트."""
    bg = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(bg)
    top, bot = (52, 72, 104), (18, 25, 38)   # 중간 톤 — 어둡게 깔지 않는다
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(top[i] + (bot[i] - top[i]) * t) for i in range(3)))

    # 좌상단 쿨 키라이트
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([-420, -560, 900, 760], fill=185)
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    bg = Image.composite(Image.new('RGB', (W, H), (86, 132, 190)), bg, glow.point(lambda v: v // 2))

    # 우하단 앰버 림
    warm = Image.new('L', (W, H), 0)
    ImageDraw.Draw(warm).ellipse([560, 1180, 1500, 2120], fill=125)
    warm = warm.filter(ImageFilter.GaussianBlur(240))
    return Image.composite(Image.new('RGB', (W, H), (168, 118, 52)), bg, warm.point(lambda v: v // 3))


def frame(offset_y: int, name: str):
    """offset_y 만큼 아래로 내려간 지점의 한 화면을 폰에 박아 저장."""
    canvas = studio()

    # 폰 아래 «큰 소프트 섀도»
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).ellipse(
        [BODY_X - 90, BODY_Y + BODY_H - 40, BODY_X + BODY_W + 90, BODY_Y + BODY_H + 210], fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(70))
    canvas = Image.composite(Image.new('RGB', (W, H), (2, 4, 8)), canvas, sh)

    # 폰 몸체
    body = Image.new('L', (W, H), 0)
    ImageDraw.Draw(body).rounded_rectangle(
        [BODY_X, BODY_Y, BODY_X + BODY_W, BODY_Y + BODY_H], radius=R_BODY, fill=255)
    canvas = Image.composite(Image.new('RGB', (W, H), (10, 13, 20)), canvas, body)

    # 몸체 가장자리 하이라이트 (금속 림)
    rim = Image.new('L', (W, H), 0)
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle([BODY_X, BODY_Y, BODY_X + BODY_W, BODY_Y + BODY_H], radius=R_BODY, outline=190, width=3)
    canvas = Image.composite(Image.new('RGB', (W, H), (150, 178, 214)), canvas, rim.filter(ImageFilter.GaussianBlur(1)))

    # ★ 화면 — 원본을 «자르고 축소만» 한다. 색·글자 어떤 변형도 없다.
    box = src.crop((0, offset_y, src.width, offset_y + CROP_H)).resize(
        (SCREEN_W, SCREEN_H), Image.LANCZOS)
    mask = Image.new('L', (SCREEN_W, SCREEN_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SCREEN_W, SCREEN_H], radius=R_SCREEN, fill=255)
    canvas.paste(box, (SCREEN_X, SCREEN_Y), mask)

    p = os.path.join(OUT, name)
    canvas.save(p)
    print(f'  ✔ {name}  (원본 y {offset_y} ~ {offset_y + CROP_H})')


frame(0, 'flow-start.png')
frame(CROP_H, 'flow-end.png')          # 정확히 한 화면 아래
print(f'\n→ {OUT}')
