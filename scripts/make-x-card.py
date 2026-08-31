#!/usr/bin/env python3
# ============================================================================
# make-x-card — X/소셜용 «가로» 데이터 카드. 폰 스크린샷을 목업으로 품는다.
#
# 왜 새로 만드는가 (2026-08-31 대표 지적, 실측으로 확인):
#   앱 실화면(460×1300, 1:2.8)을 그대로 X 에 붙였더니 타임라인 카드에서
#   **통째로 축소돼 티커도 숫자도 안 읽혔다.** X 카드는 가로형이라 세로로 긴
#   이미지는 폭이 아니라 «높이»에 맞춰 줄어든다. 종횡비가 근본 원인이다.
#
#   그래서 1200×675(16:9)로 만든다. 왼쪽에 «썸네일에서도 읽히는» 큰 숫자,
#   오른쪽에 폰 목업. 데이터도 보이고 앱도 보인다.
#
# 실행:
#   python3 scripts/make-x-card.py '<json>' <출력경로>
#   json: {kicker, ticker, big, bigUnit, bigLabel, sub, foot, shot, accent}
# ============================================================================
import json
import sys
import os
from PIL import Image, ImageDraw, ImageFilter

W, H = 1200, 675
BG = (7, 11, 20)
INK = (244, 241, 232)
DIM = (139, 146, 165)
FOOT = (96, 105, 122)

SFNS = '/System/Library/Fonts/SFNS.ttf'
# ⚠️ 한국어 폰트를 일본어에 쓰면 «満·価·体» 같은 한자가 두부(⊠)로 빠진다.
#    2026-08-31 실제로 일본어 카드가 이 상태로 만들어졌다. 언어별로 갈라야 한다.
GOTHIC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'          # 한국어
HIRAGINO = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'      # 일본어


def font(size, weight='Heavy', cjk=False):
    """영문은 SF Pro(가변). CJK 는 has_cjk() 가 준 언어표로 폰트를 고른다."""
    from PIL import ImageFont
    if cjk:
        path, idx = (HIRAGINO, 0) if cjk == 'ja' else (GOTHIC, 6)
        try:
            return ImageFont.truetype(path, size, index=idx)
        except Exception:
            pass
    try:
        f = ImageFont.truetype(SFNS, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        return f
    except Exception:
        return ImageFont.load_default()


def has_cjk(s):
    """'ko' / 'ja' / '' 를 돌려준다. 한글이 있으면 한국어, 가나·한자면 일본어."""
    if any('가' <= c <= '힯' for c in s):
        return 'ko'
    if any('ぁ' <= c <= 'ヿ' or '一' <= c <= '鿿' for c in s):
        return 'ja'
    return ''


def text(d, xy, s, f, fill):
    d.text(xy, s, font=f, fill=fill)


def phone_mockup(shot_path, box_w, box_h):
    """
    앱 캡처를 «물건처럼 보이는» 폰 목업으로 감싼다.
    밝은 티타늄 테 + 검은 베젤이 있어야 사람이 폰으로 인식한다
    (make-phone-frames.py 에서 배운 것: 테·화면·배경 밝기가 같으면 폰이 안 보인다).
    """
    scr = Image.open(shot_path).convert('RGB')

    bezel = 14
    radius = 46
    inner_w = box_w - bezel * 2
    inner_h = box_h - bezel * 2

    # ⚠️ 「위에서 62%만 자르고 폭에 맞춰 축소」였더니 화면이 프레임보다 짧아
    #    폰 아래쪽이 통째로 검게 비었다(첫 렌더에서 실측). 프레임 «종횡비»로
    #    위에서부터 잘라내야 화면이 정확히 꽉 찬다. 위쪽을 쓰는 이유는 그대로다 —
    #    히어로와 핵심 카드가 거기 있고, 아래로 갈수록 글자가 작아 카드에서 안 읽힌다.
    crop_h = min(scr.height, int(scr.width * inner_h / inner_w))
    scr = scr.crop((0, 0, scr.width, crop_h))
    scr = scr.resize((inner_w, inner_h), Image.LANCZOS)

    body = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    # 티타늄 테
    bd.rounded_rectangle([0, 0, box_w - 1, box_h - 1], radius=radius, fill=(148, 156, 170, 255))
    # 검은 베젤
    bd.rounded_rectangle([5, 5, box_w - 6, box_h - 6], radius=radius - 5, fill=(9, 10, 14, 255))

    screen = Image.new('RGBA', (inner_w, inner_h), (9, 10, 14, 255))
    screen.paste(scr, (0, 0))
    mask = Image.new('L', (inner_w, inner_h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, inner_w - 1, inner_h - 1], radius=radius - 14, fill=255)
    body.paste(screen, (bezel, bezel), mask)

    # 옆면 버튼 — 있으면 «폰»으로 읽힌다
    bd = ImageDraw.Draw(body)
    bd.rounded_rectangle([-2, 150, 3, 210], radius=3, fill=(168, 176, 190, 255))
    bd.rounded_rectangle([box_w - 4, 175, box_w + 1, 275], radius=3, fill=(168, 176, 190, 255))
    return body


def main():
    cfg = json.loads(sys.argv[1])
    out = sys.argv[2]
    accent = tuple(cfg.get('accent', [79, 209, 232]))

    img = Image.new('RGB', (W, H), BG)

    # 악센트 글로우 — 평평한 검정 배경은 X 타임라인에서 «죽은» 사각형으로 보인다
    glow = Image.new('RGB', (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.52, -260, W * 1.25, H * 0.85],
               fill=(int(accent[0] * 0.20), int(accent[1] * 0.20), int(accent[2] * 0.22)))
    gd.ellipse([-320, H * 0.55, W * 0.42, H * 1.5], fill=(12, 20, 34))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(120)), 0.95)

    d = ImageDraw.Draw(img)
    PAD = 64

    # 상단 킥커
    kick = cfg['kicker'].upper()
    fk = font(24, 'Bold', has_cjk(kick))
    d.ellipse([PAD, 62, PAD + 13, 75], fill=accent)
    text(d, (PAD + 26, 56), kick, fk, accent)

    # 티커 — 썸네일에서 가장 먼저 읽혀야 하는 것
    ft = font(104, 'Black')
    text(d, (PAD - 5, 96), cfg['ticker'], ft, INK)

    # 큰 숫자 + 단위
    fb = font(150, 'Black')
    bx = PAD - 6
    by = 216
    text(d, (bx, by), cfg['big'], fb, accent)
    bw = d.textlength(cfg['big'], font=fb)
    if cfg.get('bigUnit'):
        fu = font(64, 'Bold')
        text(d, (bx + bw + 12, by + 74), cfg['bigUnit'], fu, accent)

    # 큰 숫자가 «무엇»인지 — 이게 없으면 숫자가 자랑으로만 읽힌다
    lsize = 30
    fl = font(lsize, 'Semibold', has_cjk(cfg['bigLabel']))
    while lsize > 19 and d.textlength(cfg['bigLabel'], font=fl) > W - PAD - 440:
        lsize -= 1
        fl = font(lsize, 'Semibold', has_cjk(cfg['bigLabel']))
    text(d, (PAD - 3, by + 176), cfg['bigLabel'], fl, DIM)

    # 기준선 한 줄 — 우리 차별점.
    # 폰 목업과 겹치면 둘 다 못 읽으므로 폭에 맞춰 자동으로 줄인다.
    COL = W - PAD - 440   # 폰과 40px 여백을 남긴다(첫 렌더에서 5px 까지 붙었다)
    size = 31
    fs = font(size, 'Bold', has_cjk(cfg['sub']))
    while size > 19 and d.textlength(cfg['sub'], font=fs) > COL:
        size -= 1
        fs = font(size, 'Bold', has_cjk(cfg['sub']))
    text(d, (PAD - 3, by + 224), cfg['sub'], fs, INK)

    # 푸터
    ff = font(23, 'Semibold', has_cjk(cfg['foot']))
    text(d, (PAD - 3, H - 62), cfg['foot'], ff, FOOT)

    # 폰 목업 — 아래로 흘려보내 «떠 있는» 느낌을 준다
    shot = cfg.get('shot')
    if shot and os.path.exists(shot):
        pw, ph = 344, 700
        phone = phone_mockup(shot, pw, ph)
        px, py = W - pw - 66, 74
        shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).rounded_rectangle(
            [px + 16, py + 26, px + pw + 16, py + ph + 26], radius=46, fill=(0, 0, 0, 190))
        shadow = shadow.filter(ImageFilter.GaussianBlur(26))
        img.paste(Image.alpha_composite(img.convert('RGBA'), shadow).convert('RGB'), (0, 0))
        img.paste(phone, (px, py), phone)

    img.save(out, 'PNG')
    print(out)


if __name__ == '__main__':
    main()
