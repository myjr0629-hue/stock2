#!/usr/bin/env python3
# ============================================================================
# compose-promo-shots — 앱 실화면 캡처를 스토어급 프로모 이미지로 합성
# ----------------------------------------------------------------------------
# 왜 합성인가: 뷰포트 통짜 캡처는 ①하단 요소가 잘리고 ②캡션이 콘텐츠를 밀어내며
# ③광고 앵커가 화면을 덮는다. 실측으로 세 가지를 다 겪었다(v1).
# 여기서는 «광고를 제거한 깨끗한 앱 화면»만 받아서
#   브랜드 그라디언트 캔버스 + 캡션 + 라운드 코너 + 테두리 + 그림자 + 하단 페이드
# 로 조립한다. 하단 페이드가 스크롤 절단면을 «의도된 마감»으로 바꾼다.
# ============================================================================
import json, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

GOTHIC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'   # idx 6 = Bold (한·일·영 커버)
SFNS = '/System/Library/Fonts/SFNS.ttf'                  # 영문 전용 Heavy


def load_font(loc: str, size: int):
    """영문은 SF Pro Heavy, 한/일은 Apple SD Gothic Neo Bold."""
    if loc == 'en':
        try:
            f = ImageFont.truetype(SFNS, size)
            f.set_variation_by_name('Heavy')
            return f
        except Exception:
            pass
    return ImageFont.truetype(GOTHIC, size, index=6)


def vgradient(size, top_rgb, bottom_rgb):
    """세로 그라디언트 — 캔버스 배경."""
    w, h = size
    grad = Image.new('RGB', (1, h))
    px = grad.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top_rgb[i] + (bottom_rgb[i] - top_rgb[i]) * t) for i in range(3))
    return grad.resize((w, h), Image.BILINEAR)


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def bottom_fade(img, fade_px, to_rgb, solid_px=0):
    """스크롤 절단면을 캔버스 배경색으로 녹인다.

    solid_px: 맨 아래 이 높이만큼은 «완전 불투명»으로 덮는다. 탭바 아래로
    스크롤 콘텐츠가 비쳐 보이던 문제(2026-08-22 실측)를 여기서 막는다.
    """
    w, h = img.size
    overlay = Image.new('RGB', (w, fade_px), tuple(to_rgb))
    mask = Image.new('L', (1, fade_px))
    mp = mask.load()
    grad_px = max(1, fade_px - solid_px)
    for y in range(fade_px):
        if y >= grad_px:
            mp[0, y] = 255                      # 완전 불투명 구간
        else:
            mp[0, y] = round(255 * (y / grad_px) ** 1.9)
    img.paste(overlay, (0, h - fade_px), mask.resize((w, fade_px), Image.BILINEAR))
    return img


def draw_caption(canvas, text, loc, fg, zone_h):
    """캡션 2줄 — '|' 구분. 폭에 맞춰 자동 축소."""
    lines = [s.strip() for s in text.split('|') if s.strip()]
    d = ImageDraw.Draw(canvas)
    max_w = canvas.width - 130
    size = 62
    while size > 30:
        font = load_font(loc, size)
        widths = [d.textbbox((0, 0), ln, font=font)[2] for ln in lines]
        if max(widths) <= max_w:
            break
        size -= 2
    font = load_font(loc, size)
    lh = round(size * 1.28)
    total = lh * len(lines)
    y = round((zone_h - total) / 2) + 4
    for ln in lines:
        bbox = d.textbbox((0, 0), ln, font=font)
        x = round((canvas.width - bbox[2]) / 2) - bbox[0]
        d.text((x, y), ln, font=font, fill=tuple(fg))
        y += lh


def compose(raw_path, out_path, caption, loc, cfg):
    cw, ch = cfg['canvas']['w'], cfg['canvas']['h']
    aw, ah = cfg['appSize']['w'], cfg['appSize']['h']
    top, bot = cfg['bg'][0], cfg['bg'][1]

    canvas = vgradient((cw, ch), top, bot)
    zone_h = ch - ah - 60          # 캡션 영역 = 캔버스 - 앱 - 하단여백
    draw_caption(canvas, caption, loc, cfg['fg'], zone_h)

    app = Image.open(raw_path).convert('RGB')
    if app.size != (aw, ah):
        app = app.resize((aw, ah), Image.LANCZOS)
    # 페이드 없음: 캡처 단계에서 탭바를 바닥에 밀착시켜 절단면 자체를 없앴다.
    # (페이드를 걸면 탭바 라벨까지 씻겨나간다 — 2026-08-22 실측)

    radius = 34
    mask = rounded_mask((aw, ah), radius)
    ax, ay = round((cw - aw) / 2), zone_h

    # 드롭 섀도 — 앱 화면을 캔버스에서 띄운다
    shadow = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [ax, ay + 10, ax + aw, ay + ah + 10], radius=radius, fill=(0, 0, 0, 130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), shadow).convert('RGB')

    canvas.paste(app, (ax, ay), mask)

    # 얇은 하이라이트 테두리 — 화면 경계를 또렷하게
    ImageDraw.Draw(canvas, 'RGBA').rounded_rectangle(
        [ax, ay, ax + aw - 1, ay + ah - 1], radius=radius,
        outline=(255, 255, 255, 46), width=2)

    canvas.save(out_path, optimize=True)
    return canvas.size


def main():
    cfg = json.load(open(sys.argv[1]))
    made = 0
    for item in cfg['spec']:
        if not os.path.exists(item['raw']):
            print(f"  ✗ raw 없음 {item['raw']}")
            continue
        size = compose(item['raw'], item['out'], item['caption'], item['loc'], cfg)
        kb = round(os.path.getsize(item['out']) / 1024)
        print(f"  ✓ {os.path.basename(item['out']):44s} {size[0]}x{size[1]}  {kb}KB")
        made += 1
    print(f"\n합성 완료: {made}장")


if __name__ == '__main__':
    main()
