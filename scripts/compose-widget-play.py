#!/usr/bin/env python3
# 안드로이드 위젯 실사진(코디네이터 adb 캡처, widget-crop-<loc>.png 1080x1290) → Play 폰 스크린샷 1080x1920(기존 5장과 같은 캡션 양식)
import importlib.machinery, os
from PIL import Image, ImageDraw, ImageFilter
cps = importlib.machinery.SourceFileLoader('cps', os.path.expanduser('~/signum-worktrees/store-growth/scripts/compose-promo-shots.py')).load_module()
CAP = {'ko': '홈 화면에서|내 종목을 한눈에', 'en': 'Your watchlist|on your home screen', 'ja': 'ホーム画面で|マイ銘柄をひと目で'}
BG = ([14, 42, 60], [5, 10, 20])
for loc, cap in CAP.items():
    bad = cps.missing_glyphs(cap, loc)
    assert not bad, (loc, bad)
    W, H = 1080, 1920
    canvas = cps.vgradient((W, H), BG[0], BG[1])
    src = Image.open(os.path.expanduser(f'~/signum-ego-io/widget/widget-crop-{loc}.png')).convert('RGB')
    ww = 1000; wh = round(src.height * ww / src.width)
    app = src.resize((ww, wh), Image.LANCZOS)
    cap_h = 200; gap = 40
    top = (H - (cap_h + gap + wh)) // 2
    # 캡션: 위쪽 cap_h 영역 안에서 가운데
    zone = Image.new('RGB', (W, cap_h))
    zone.paste(canvas.crop((0, top, W, top + cap_h)))
    cps.draw_caption(zone, cap, loc, [255, 255, 255], cap_h)
    canvas.paste(zone, (0, top))
    ax, ay = (W - ww) // 2, top + cap_h + gap
    radius = 34
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([ax, ay + 10, ax + ww, ay + wh + 10], radius=radius, fill=(0, 0, 0, 130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), shadow).convert('RGB')
    canvas.paste(app, (ax, ay), cps.rounded_mask((ww, wh), radius))
    ImageDraw.Draw(canvas, 'RGBA').rounded_rectangle([ax, ay, ax + ww - 1, ay + wh - 1], radius=radius, outline=(255, 255, 255, 46), width=2)
    out = os.path.expanduser(f'~/signum-ego-io/store/play-shots/p0930-{loc}-W-widget.png')
    canvas.save(out, optimize=True)
    print(loc, canvas.size, round(os.path.getsize(out) / 1024), 'KB', out)
