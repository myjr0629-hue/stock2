#!/usr/bin/env python3
# ============================================================================
# make-note-header — note/블로그용 «가로» 헤더 카드 (1280×670).
#
# 왜: note 기사는 헤더 이미지 유무로 노출이 크게 갈린다. 세로 릴 렌더러
# (make-appreel)는 1080×1920 이라 그대로 못 쓴다. 같은 팔레트·같은 규율
# (숫자는 오늘값·평소값·배수를 «함께») 로 가로판을 만든다.
#
# 실행: python3 scripts/make-note-header.py <spec.json> <out.png>
# ============================================================================
import json, sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 670
BG_TOP, BG_BOT = (247, 250, 253), (222, 231, 243)
INK, DIM, TEAL, AMBER = (14, 20, 32), (104, 115, 135), (10, 116, 148), (176, 122, 12)
SFNS = '/System/Library/Fonts/SFNS.ttf'
GOTHIC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
HIRA = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'

def script_of(s):
    if any('가' <= c <= '힯' for c in s): return 'ko'
    if any('ぁ' <= c <= 'ヿ' or '一' <= c <= '鿿' for c in s): return 'ja'
    return ''

def font(size, weight='Heavy', s=''):
    if s == 'ja':
        try: return ImageFont.truetype(HIRA, size, index=0)
        except Exception: pass
    if s == 'ko':
        try: return ImageFont.truetype(GOTHIC, size, index=6)
        except Exception: pass
    f = ImageFont.truetype(SFNS, size)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f

def main():
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    out = sys.argv[2]
    img = Image.new('RGB', (W, H), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)))
    # 대각 광택 — 밋밋함 방지
    sh = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sh).polygon([(-200, 300), (W + 200, -120), (W + 200, 60), (-200, 520)], fill=26)
    img.paste(Image.new('RGB', (W, H), (255, 255, 255)), (0, 0), sh.filter(ImageFilter.GaussianBlur(60)))
    d = ImageDraw.Draw(img)

    PAD = 62
    ttl = spec['title']; ts = script_of(ttl)
    d.rounded_rectangle([PAD, 62, PAD + 10, 62 + 46], radius=5, fill=AMBER)
    d.text((PAD + 26, 60), ttl, font=font(40, 'Black', ts), fill=INK)
    sub = spec.get('sub', '')
    if sub:
        d.text((PAD + 26, 116), sub, font=font(24, 'Semibold', script_of(sub)), fill=DIM)

    y = 186
    for row in spec['rows'][:5]:
        tick = row['ticker']
        d.text((PAD, y), tick, font=font(46, 'Black'), fill=INK)
        tw = d.textlength(tick, font=font(46, 'Black'))
        lab = row.get('label', '')
        if lab:
            d.text((PAD + tw + 18, y + 14), lab, font=font(24, 'Bold', script_of(lab)), fill=DIM)
        val = row['value']; vs = script_of(val)
        vf = font(40, 'Black', vs)
        vw = d.textlength(val, font=vf)
        d.text((W - PAD - vw, y + 2), val, font=vf, fill=TEAL if row.get('up', True) else AMBER)
        y += 74
        d.line([PAD, y - 14, W - PAD, y - 14], fill=(212, 221, 234), width=2)

    foot = spec.get('foot', 'signumhq.com/app')
    d.text((PAD, H - 62), foot, font=font(26, 'Bold'), fill=DIM)
    note = spec.get('note', '')
    if note:
        nf = font(22, 'Semibold', script_of(note))
        d.text((W - PAD - d.textlength(note, font=nf), H - 60), note, font=nf, fill=DIM)
    img.save(out, quality=95)
    print(out, img.size)

main()
