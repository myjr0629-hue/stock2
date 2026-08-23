#!/usr/bin/env python3
# x-watermark — 캡처 하단에 «앱 이름 + 무료 + 링크» 한 줄을 박는다.
# 본문에 URL 을 반복해서 넣으면 X 어뷰징 봇이 섀도우밴을 걸기 때문에
# 링크는 반드시 이미지 «안»으로 들어간다. (2026-08-23)
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
MARK = {
    ("signum", "en"): ("SIGNUM HQ", "Free · App Store & Google Play · signumhq.com/app"),
    ("signum", "ja"): ("SIGNUM HQ", "完全無料 · App Store / Google Play · signumhq.com/app"),
    ("signum", "ko"): ("SIGNUM HQ", "무료 · 앱스토어 / 구글플레이 · signumhq.com/app"),
    ("uc", "en"): ("Undercurrent", "Free · App Store & Google Play · signumhq.com/app-uc"),
    ("uc", "ja"): ("Undercurrent", "完全無料 · App Store / Google Play · signumhq.com/app-uc"),
    ("uc", "ko"): ("Undercurrent", "무료 · 앱스토어 / 구글플레이 · signumhq.com/app-uc"),
}

src, dst, app, loc = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
im = Image.open(src).convert("RGB")
w, h = im.size
bar = int(w * 0.115)
base = im.crop((0, h - 6, w, h)).resize((1, 1)).getpixel((0, 0))
canvas = Image.new("RGB", (w, h + bar), base)
canvas.paste(im, (0, 0))
d = ImageDraw.Draw(canvas)
d.line([(int(w * 0.05), h + 1), (w - int(w * 0.05), h + 1)], fill=(255, 255, 255), width=2)
name, sub = MARK[(app, loc)]
f1 = ImageFont.truetype(FONT, int(w * 0.040))
f2 = ImageFont.truetype(FONT, int(w * 0.027))
# 두부글자 방지 — 이 폰트로 못 그리는 글자가 있으면 즉시 실패시킨다
for t in (name, sub):
    if any(f1.getmask(ch).getbbox() is None and ch.strip() for ch in t):
        raise SystemExit(f"font cannot render: {t}")
d.text((int(w * 0.05), h + int(bar * 0.20)), name, font=f1, fill=(255, 255, 255))
d.text((int(w * 0.05), h + int(bar * 0.58)), sub, font=f2, fill=(150, 165, 185))
canvas.save(dst, optimize=True)
