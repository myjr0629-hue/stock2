#!/usr/bin/env python3
# ============================================================================
# make-x-reply-shots — X(트위터) 댓글에 붙일 폰 스크린샷을 만든다.
# ----------------------------------------------------------------------------
# 왜 워터마크인가 (2026-08-23 대표 지시 + 실제 X 정책):
#   댓글 본문에 스토어 URL 을 반복해서 넣으면 X 어뷰징 봇이 섀도우밴을 건다.
#   섀도우밴은 «내 화면에는 정상, 남 화면에는 안 보임» 이라 알아채기도 어렵다.
#   그래서 링크는 이미지 «안에» 넣고 본문에는 안 넣는다.
#
# 원본: promo-shots/*-1080x1920.png (실제 앱 화면 · 실제 데이터)
# 출력: ~/Desktop/X 댓글용 이미지 <날짜>/
# ============================================================================
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont

SRC = os.path.join(os.path.dirname(__file__), "..", "promo-shots")
FONT_UNI = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

# 앱별 워터마크 문구 — 로케일마다 «검색되는 말»로 다르게 쓴다
MARK = {
    "signum": {
        "en": ("SIGNUM HQ", "Free  ·  App Store & Google Play  ·  signumhq.com/app"),
        "ja": ("SIGNUM HQ", "完全無料  ·  App Store / Google Play  ·  signumhq.com/app"),
        "ko": ("SIGNUM HQ", "무료  ·  앱스토어 / 구글플레이  ·  signumhq.com/app"),
    },
    "uc": {
        "en": ("Undercurrent", "Free  ·  App Store & Google Play  ·  signumhq.com/app-uc"),
        "ja": ("Undercurrent", "完全無料  ·  App Store / Google Play  ·  signumhq.com/app-uc"),
        "ko": ("Undercurrent", "무료  ·  앱스토어 / 구글플레이  ·  signumhq.com/app-uc"),
    },
}
BAR_H = 132


def band_color(im):
    """이미지 하단 색을 그대로 이어받아 «붙인 티»가 안 나게 한다."""
    w, h = im.size
    px = im.crop((0, h - 6, w, h)).resize((1, 1)).getpixel((0, 0))
    return px


def build(path, app, loc, outdir):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    base = band_color(im)
    canvas = Image.new("RGB", (w, h + BAR_H), base)
    canvas.paste(im, (0, 0))
    d = ImageDraw.Draw(canvas)
    # 얇은 구분선 — 워터마크가 화면의 일부처럼 보이지 않게
    d.line([(56, h + 1), (w - 56, h + 1)], fill=(255, 255, 255, 40), width=2)
    name, sub = MARK[app][loc]
    f1 = ImageFont.truetype(FONT_UNI, 44)
    f2 = ImageFont.truetype(FONT_UNI, 30)
    d.text((56, h + 26), name, font=f1, fill=(255, 255, 255))
    d.text((56, h + 80), sub, font=f2, fill=(150, 165, 185))
    out = os.path.join(outdir, f"{app}-{loc}-" + os.path.basename(path).replace("-1080x1920", ""))
    canvas.save(out, optimize=True)
    return out


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else "2026-08-23"
    outdir = os.path.expanduser(f"~/Desktop/X 댓글용 이미지 {date}")
    os.makedirs(outdir, exist_ok=True)
    n = 0
    for p in sorted(glob.glob(os.path.join(SRC, "*-1080x1920.png"))):
        b = os.path.basename(p)
        app = "signum" if b.startswith("signum") else "uc" if b.startswith("uc") else None
        if not app:
            continue
        loc = b.split("-")[-2]
        if loc not in MARK[app]:
            continue
        build(p, app, loc, outdir)
        n += 1
    print(f"{n}장 생성 -> {outdir}")


if __name__ == "__main__":
    main()
