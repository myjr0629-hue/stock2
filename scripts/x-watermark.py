#!/usr/bin/env python3
# x-watermark — 캡처 하단에 «앱 이름 + 무료 + 링크» 한 줄을 박는다.
# 본문에 URL 을 반복해서 넣으면 X 어뷰징 봇이 섀도우밴을 걸기 때문에
# 링크는 반드시 이미지 «안»으로 들어간다. (2026-08-23)
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
MARK = {
    # **앱 링크를 쓴다.** `/app`·`/app-uc`·`/app-wim` 은 UA 로 분기하는 스마트링크다
    # (안드로이드→Play + install referrer, iOS→App Store). 홈페이지로 보내면 «직접 유입»이
    # 한 단계 새므로 로케일 페이지를 쓰지 말 것.
    # ⚠️ curl 로 테스트하면 늘 App Store 로 가서 «iOS 전용»으로 오판한다
    # (2026-08-24 실제로 오판해 /ja 로 바꾼 적 있음). 반드시 Android UA 를 지정해 검증할 것.
    ("signum", "en"): ("SIGNUM HQ", "Free · App Store & Google Play · signumhq.com/app"),
    ("signum", "ja"): ("SIGNUM HQ", "完全無料 · App Store / Google Play · signumhq.com/app"),
    ("signum", "ko"): ("SIGNUM HQ", "무료 · 앱스토어 / 구글플레이 · signumhq.com/app"),
    ("uc", "en"): ("Undercurrent", "Free · App Store & Google Play · signumhq.com/app-uc"),
    ("uc", "ja"): ("Undercurrent", "完全無料 · App Store / Google Play · signumhq.com/app-uc"),
    ("uc", "ko"): ("Undercurrent", "무료 · 앱스토어 / 구글플레이 · signumhq.com/app-uc"),
    ("wim", "en"): ("Why'd It Move?", "Free · App Store & Google Play · signumhq.com/app-wim"),
    ("wim", "ja"): ("Why'd It Move?", "完全無料 · App Store / Google Play · signumhq.com/app-wim"),
    ("wim", "ko"): ("Why'd It Move?", "무료 · 앱스토어 / 구글플레이 · signumhq.com/app-wim"),
}

src, dst, app, loc = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
im = Image.open(src).convert("RGB")
w, h = im.size
bar = int(w * 0.115)
base = im.crop((0, h - 6, w, h)).resize((1, 1)).getpixel((0, 0))
canvas = Image.new("RGB", (w, h + bar), base)
canvas.paste(im, (0, 0))
d = ImageDraw.Draw(canvas)
# 배경 밝기에 따라 글자색을 뒤집는다.
# (UC 는 밝은 테마라 하단이 흰색 — 흰 글씨를 쓰면 워터마크가 통째로 안 보인다. 2026-08-23 실측)
lum = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2]
dark_bg = lum < 128
fg = (255, 255, 255) if dark_bg else (17, 24, 39)
sub_fg = (150, 165, 185) if dark_bg else (90, 100, 115)
rule = (255, 255, 255) if dark_bg else (200, 206, 215)
d.line([(int(w * 0.05), h + 1), (w - int(w * 0.05), h + 1)], fill=rule, width=2)
name, sub = MARK[(app, loc)]
f1 = ImageFont.truetype(FONT, int(w * 0.040))
f2 = ImageFont.truetype(FONT, int(w * 0.027))
# 두부글자 방지 — 이 폰트로 못 그리는 글자가 있으면 즉시 실패시킨다
for t in (name, sub):
    if any(f1.getmask(ch).getbbox() is None and ch.strip() for ch in t):
        raise SystemExit(f"font cannot render: {t}")
d.text((int(w * 0.05), h + int(bar * 0.20)), name, font=f1, fill=fg)
d.text((int(w * 0.05), h + int(bar * 0.58)), sub, font=f2, fill=sub_fg)
canvas.save(dst, optimize=True)
