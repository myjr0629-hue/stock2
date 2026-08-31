#!/usr/bin/env python3
# ============================================================================
# make-appreel — 1080×1920 «밝은» 세로 릴. 앱 실화면 «녹화»를 폰 목업에 넣는다.
#
# 왜 새로 만드나 (2026-08-31 대표 지적 3건):
#   ① 「틱톡에서 조회수 폭발하는 영상」 — 정지 카드 슬라이드쇼는 피드에서 넘겨진다.
#      그래서 앱을 이미지가 아니라 «움직이는 화면»으로 넣는다(make-appreel-capture).
#   ② 「너무 어둡게만 만들지 말고」 — 배경을 밝게 간다. 어두운 건 앱 화면뿐이고,
#      그게 밝은 바탕 위에서 오히려 주목을 받는다.
#   ③ 「앱이 잘리게 캡쳐 되는 것도 피해야」 — 폰은 «기기 전체»가 프레임 안에
#      들어온다. 잘라서 키우지 않는다.
#
# 락인 구조: 순위 카운트다운(3위→2위→1위). 1위를 보려고 끝까지 본다.
#
# 실행: python3 scripts/make-appreel.py <spec.json> <out.mp4>
# ============================================================================
import json, os, shutil, subprocess, sys, tempfile, math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30
# 밝은 팔레트 — 대표 지적: 생성물을 어둡게 만들지 말 것
BG_TOP = (248, 250, 253)
BG_BOT = (223, 232, 243)
INK = (14, 20, 32)
DIM = (96, 108, 128)
TEAL = (10, 116, 148)
AMBER = (176, 122, 12)
BEZEL = (22, 28, 40)

SFNS = '/System/Library/Fonts/SFNS.ttf'
GOTHIC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
HIRA = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
FFMPEG = os.path.join(os.path.dirname(__file__), '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')

MIN_BRIGHTNESS = 60      # 밝은 릴이므로 하한을 올린다
MIN_CUTS = 3
MIN_SECONDS = 8

PHONE_H = 1250           # 기기 «전체»가 들어가는 최대 높이(잘라서 키우지 않는다)


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


def bg_base():
    """밝은 그라데이션 + 은은한 브랜드 블롭. 매 프레임 다시 그리면 느리므로 한 번만."""
    img = Image.new('RGB', (W, H), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(
            int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
            int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
            int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)))
    blob = Image.new('RGB', (W, H), (0, 0, 0))
    bd = ImageDraw.Draw(blob)
    bd.ellipse([-260, -320, 720, 520], fill=(40, 120, 150))
    bd.ellipse([560, 1180, 1480, 2060], fill=(28, 96, 130))
    blob = blob.filter(ImageFilter.GaussianBlur(180))
    return Image.blend(img, Image.blend(img, blob, 0.18), 0.55)


BASE = None
LOGO = None
# 세 앱 — 이름·링크·아이콘이 각자 다르다
BRANDS = {
    'signum': {'name': 'SIGNUM HQ', 'link': 'signumhq.com/app', 'icon': 'signum.png'},
    'uc': {'name': 'Undercurrent', 'link': 'signumhq.com/app-uc', 'icon': 'uc.png'},
    'wim': {'name': "Why'd It Move?", 'link': 'signumhq.com/app-wim', 'icon': 'wim.png'},
}
BRAND = BRANDS['signum']


def rounded_shadow(size, radius, blur=34, spread=16):
    w, h = size
    sh = Image.new('L', (w + blur * 4, h + blur * 4), 0)
    ImageDraw.Draw(sh).rounded_rectangle(
        [blur * 2 - spread // 2, blur * 2 - spread // 2 + 10, blur * 2 + w + spread // 2, blur * 2 + h + spread // 2 + 10],
        radius=radius + spread // 2, fill=105)
    return sh.filter(ImageFilter.GaussianBlur(blur))


def paste_phone(img, shot):
    """기기 «전체»를 넣는다. 잘라서 키우지 않는다(대표 지적)."""
    ratio = PHONE_H / shot.height
    pw = int(shot.width * ratio)
    scr = shot.resize((pw, PHONE_H), Image.LANCZOS)
    bez = 13
    fw, fh = pw + bez * 2, PHONE_H + bez * 2
    x = (W - fw) // 2
    y = 578

    sh = rounded_shadow((fw, fh), 52)
    img.paste((188, 198, 214), (x - sh.width // 2 + fw // 2, y - sh.height // 2 + fh // 2), sh)

    frame = Image.new('RGB', (fw, fh), BEZEL)
    mask = Image.new('L', (fw, fh), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, fw - 1, fh - 1], radius=52, fill=255)
    inner = Image.new('L', (pw, PHONE_H), 0)
    ImageDraw.Draw(inner).rounded_rectangle([0, 0, pw - 1, PHONE_H - 1], radius=40, fill=255)
    frame.paste(scr, (bez, bez), inner)
    img.paste(frame, (x, y), mask)
    return y + fh


def money(v):
    """$123.4M 처럼 사람이 읽는 표기. 자릿수를 속이지 않는다."""
    v = float(v)
    for cut, suf in ((1e9, 'B'), (1e6, 'M'), (1e3, 'K')):
        if abs(v) >= cut:
            return f"${v/cut:,.1f}{suf}"
    return f"${v:,.0f}"


def render_card(sc, t):
    """
    랭킹 카드.

    [2026-09-01 대표 지적 4건 — 전부 이 함수에서 처리]
      ① 「어떤 랭킹인지 들어오는 것이 없다」 → 매 컷 상단에 랭킹 제목 띠.
      ② 「해당 티커의 심볼을 정확하게」 → 종목 «로고»를 넣는다(글자 말고).
      ③ 「배경이 너무 밋밋하다, 프리미엄하게」 → 종목 로고를 거대하게 흐린 뒤
         배경에 깔고 대각 광택을 얹는다. 카드마다 배경이 달라진다.
      ④ 「위아래를 붙이면 폰에서 안 보인다」 → 세로영상 «안전영역» 규격을 지킨다.
         상180 / 하400 / 좌60 / 우180 (YouTube Shorts·TikTok 둘 다 만족하는 값).
         이전 판은 헤더 y=74, 하단 링크 y=1812 로 양쪽 다 금지구역에 있었다.
    """
    SAFE_T, SAFE_B, SAFE_L, SAFE_R = 180, 400, 60, 180
    RIGHT = W - SAFE_R              # 콘텐츠 오른쪽 한계(버튼열을 피한다)
    img = BASE.copy()
    ease = 1 - (1 - t) ** 3
    accent = AMBER if sc.get('accent') == 'amber' else TEAL

    # ── 배경: 종목 로고를 크게 흐려 깐다 ──────────────────────────────
    lg = sc.get('_logo')
    if lg is not None:
        S2 = 980
        big = lg.resize((S2, S2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
        # ⚠️ 그냥 붙이면 «사각형»이 그대로 보인다(NVDA 초록 타일이 블록으로 남았다).
        #    원형으로 부드럽게 사라지게 만든다.
        fade = Image.new('L', (S2, S2), 0)
        ImageDraw.Draw(fade).ellipse([S2 * 0.12, S2 * 0.12, S2 * 0.88, S2 * 0.88], fill=255)
        fade = fade.filter(ImageFilter.GaussianBlur(110))
        al = big.split()[3]
        al = Image.eval(Image.merge('L', (al,)).point(lambda v: v), lambda v: v)
        comb = Image.new('L', (S2, S2))
        comb.paste(al, (0, 0))
        comb = Image.composite(comb, Image.new('L', (S2, S2), 0), fade)
        comb = comb.point(lambda v: int(v * 0.16))
        # 채도를 낮춰 배경이 «색 블록»으로 튀지 않게 한다
        rgb = Image.blend(big.convert('RGB'), big.convert('L').convert('RGB'), 0.45)
        rgb.putalpha(Image.composite(comb, Image.new('L', (S2, S2), 0), fade))
        img.paste(rgb, (W - 520, 640), rgb)

        # 종목 «대표색» 색조 — 카드마다 배경이 달라진다(NVDA 초록·TSLA 빨강…).
        # 밝기는 유지한 채 색만 얹어야 글자가 죽지 않는다.
        try:
            sm = lg.resize((24, 24), Image.LANCZOS)
            px = [p2 for p2 in sm.convert('RGBA').getdata() if p2[3] > 140]
            # 흰색·검정에 가까운 화소는 «브랜드색»이 아니다 — 빼고 평균낸다.
            px = [p2 for p2 in px if not (p2[0] > 232 and p2[1] > 232 and p2[2] > 232)
                  and not (p2[0] < 26 and p2[1] < 26 and p2[2] < 26)]
            if px:
                cr = sum(p2[0] for p2 in px) // len(px)
                cg = sum(p2[1] for p2 in px) // len(px)
                cb = sum(p2[2] for p2 in px) // len(px)
                wash = Image.new('L', (W, H), 0)
                ImageDraw.Draw(wash).ellipse([W - 760, -420, W + 420, 760], fill=64)
                img.paste(Image.new('RGB', (W, H), (cr, cg, cb)), (0, 0),
                          wash.filter(ImageFilter.GaussianBlur(150)))
        except Exception:
            pass
    # 대각 광택 — 밋밋함을 없애는 최소 장치
    sheen = Image.new('L', (W, H), 0)
    ImageDraw.Draw(sheen).polygon([(-200, 520), (W + 200, -240), (W + 200, 130), (-200, 900)], fill=30)
    img.paste(Image.new('RGB', (W, H), (255, 255, 255)), (0, 0), sheen.filter(ImageFilter.GaussianBlur(70)))
    d = ImageDraw.Draw(img)

    y = SAFE_T

    # ── ① 랭킹 제목 ────────────────────────────────────────────────────
    rk = sc.get('ranking')
    if rk:
        rs = script_of(rk)
        rf = font(44, 'Black', rs)
        d.rounded_rectangle([SAFE_L, y, SAFE_L + 12, y + 56], radius=6, fill=accent)
        d.text((SAFE_L + 30, y + 2), rk, font=rf, fill=INK)
        if sc.get('rankingSub'):
            sb = sc['rankingSub']
            d.text((SAFE_L + 30, y + 62), sb, font=font(28, 'Semibold', script_of(sb)), fill=DIM)
        y += 132

    # ── ② 순위 배지 + 로고 + 심볼 ──────────────────────────────────────
    x = SAFE_L
    if sc.get('rank'):
        rf = font(84, 'Black')
        rtxt = sc['rank']
        rw = d.textlength(rtxt, font=rf)
        d.rounded_rectangle([x, y, x + int(rw) + 48, y + 112], radius=24, fill=accent)
        d.text((x + 24, y + 2), rtxt, font=rf, fill=(255, 255, 255))
        x += int(rw) + 48
        if sc.get('rankUnit'):
            u = sc['rankUnit']
            d.text((x + 14, y + 44), u, font=font(40, 'Bold', script_of(u)), fill=DIM)
            x += 14 + int(d.textlength(u, font=font(40, 'Bold', script_of(u))))
    if lg is not None:
        mark = lg.resize((112, 112), Image.LANCZOS)
        img.paste(mark, (RIGHT - 112, y), mark)
    y += 140

    sym = sc.get('symbol')
    if sym:
        size = 168 if len(sym) <= 4 else 132
        sf = font(size, 'Black')
        while d.textlength(sym, font=sf) > RIGHT - SAFE_L and size > 80:
            size -= 8; sf = font(size, 'Black')
        d.text((SAFE_L - 8, y), sym, font=sf, fill=INK)
        y += int(size * 1.10)

    # ── 가격 + 등락 ────────────────────────────────────────────────────
    if sc.get('price'):
        pf = font(72, 'Black')
        d.text((SAFE_L - 4, y), sc['price'], font=pf, fill=INK)
        pw = d.textlength(sc['price'], font=pf)
        chg = sc.get('change')
        if chg:
            up = not str(chg).startswith('-')
            col = (10, 132, 96) if up else (198, 48, 48)
            cf = font(46, 'Black')
            cw = d.textlength(chg, font=cf)
            d.rounded_rectangle([SAFE_L + pw + 22, y + 10, SAFE_L + pw + 22 + cw + 38, y + 76],
                                radius=18, fill=(226, 244, 236) if up else (252, 232, 232))
            d.text((SAFE_L + pw + 41, y + 17), chg, font=cf, fill=col)
        y += 106

    # ── ③ 자세한 자료 표기 ─────────────────────────────────────────────
    for row in sc.get('stats', []):
        lab, val = row.get('l', ''), row.get('v', '')
        d.text((SAFE_L, y + 6), lab, font=font(34, 'Bold', script_of(lab)), fill=DIM)
        vf = font(44, 'Black', script_of(val))
        vw = d.textlength(val, font=vf)
        d.text((RIGHT - vw, y), val, font=vf, fill=INK)
        y += 64
        d.line([SAFE_L, y - 10, RIGHT, y - 10], fill=(214, 222, 234), width=2)

    # ── 콜/풋 막대 — 비율은 «항상» 참이어야 한다 ──────────────────────
    sp = sc.get('split')
    if sp:
        cw_, pw_ = float(sp.get('call', 0)), float(sp.get('put', 0))
        tot = cw_ + pw_
        if tot > 0:
            y += 18
            bw = RIGHT - SAFE_L
            # 폭에만 ease 를 곱하면 도중에 «틀린 비율»이 화면에 뜬다. 비율은
            # 고정하고 막대 전체를 펼친다.
            rev = max(24, int(bw * ease))
            cx = int(rev * (cw_ / tot))
            d.rounded_rectangle([SAFE_L, y, SAFE_L + bw, y + 44], radius=14, fill=(232, 238, 247))
            if cx > 8: d.rounded_rectangle([SAFE_L, y, SAFE_L + cx, y + 44], radius=14, fill=TEAL)
            if rev - cx > 8: d.rounded_rectangle([SAFE_L + cx, y, SAFE_L + rev, y + 44], radius=14, fill=AMBER)
            y += 56
            cl = sp.get('callLabel', '')
            d.text((SAFE_L, y), cl, font=font(28, 'Bold', script_of(cl)), fill=TEAL)
            rl = sp.get('putLabel', '')
            rlf = font(28, 'Bold', script_of(rl))
            d.text((RIGHT - d.textlength(rl, font=rlf), y), rl, font=rlf, fill=AMBER)
            y += 52

    # ── 자막 높이를 «먼저» 잰다 ────────────────────────────────────────
    # 그리는 순서는 사다리가 먼저지만, 자리를 먼저 잡지 않으면 자막이 사다리를
    # 덮는다(실제로 5행이 가려졌다). 남는 높이를 사다리에 배분한다.
    cap = sc.get('caption')
    cap_lines, cap_font, cap_h = [], None, 0
    if cap:
        cs = script_of(cap)
        cap_font = font(38, 'Bold', cs)
        words = list(cap) if cs else cap.split(' ')
        joiner = '' if cs else ' '
        cur = ''
        for w_ in words:
            trial = (cur + joiner + w_) if cur else w_
            if d.textlength(trial, font=cap_font) > RIGHT - SAFE_L - 36 and cur:
                cap_lines.append(cur); cur = w_
            else:
                cur = trial
        if cur: cap_lines.append(cur)
        cap_lines = cap_lines[:2]
        cap_h = 30 + len(cap_lines) * int(cap_font.size * 1.30)

    BRAND_H = 76
    floor_y = H - SAFE_B - BRAND_H - cap_h - 14   # 사다리가 넘으면 안 되는 선

    # ── 순위 사다리 ────────────────────────────────────────────────────
    lad = sc.get('ladder')
    if lad:
        y += 12
        # 행 높이를 «남은 공간»에서 역산한다. 데이터가 늘어도 겹치지 않는다.
        row_h = int(max(44, min(60, (floor_y - y - 24) / max(1, len(lad)))))
        d.rounded_rectangle([SAFE_L - 14, y, RIGHT + 14, y + 24 + len(lad) * row_h], radius=22,
                            fill=(255, 255, 255), outline=(222, 230, 241), width=2)
        ly = y + 16
        for it in lad:
            on = bool(it.get('on'))
            # ⚠️ 폰트에 언어 힌트를 안 주면 한글(「배」)이 라틴 폰트로 떨어져
            #    textlength 가 실제보다 짧게 나오고, 우측 정렬한 값이 화면 밖으로
            #    밀려 글자가 잘린다(실제로 「2.1배」가 「2.1▤」로 잘렸다).
            _rs = script_of(str(it.get('s', '')) + str(it.get('v', '')))
            _rsz = int(row_h * 0.63) if on else int(row_h * 0.55)
            rowf = font(_rsz, 'Black' if on else 'Bold', _rs)
            col = INK if on else (150, 160, 178)
            if on:
                d.rounded_rectangle([SAFE_L - 6, ly - 7, RIGHT + 6, ly + row_h - 11], radius=14, fill=(236, 244, 249))
            d.text((SAFE_L + 8, ly), str(it.get('r', '')), font=rowf, fill=accent if on else (186, 194, 208))
            # 아직 공개 안 한 상위는 가린다 — 다 보여주면 카운트다운이 성립하지 않는다.
            if it.get('hide'):
                d.text((SAFE_L + 62, ly), '— — —', font=rowf, fill=(206, 214, 226))
            else:
                d.text((SAFE_L + 62, ly), str(it.get('s', '')), font=rowf, fill=col)
                v = str(it.get('v', ''))
                d.text((RIGHT - 8 - d.textlength(v, font=rowf), ly), v, font=rowf, fill=col)
            ly += row_h
        y = ly + 18

    # ── 자막 — 안전영역 «안», 브랜드 줄 «위»에 고정 ────────────────────
    if cap_lines:
        by = H - SAFE_B - BRAND_H - cap_h
        d.rounded_rectangle([SAFE_L - 14, by, RIGHT + 14, by + cap_h], radius=20, fill=(18, 26, 40))
        ty = by + 15
        for ln in cap_lines:
            d.text((SAFE_L + 4, ty), ln, font=cap_font, fill=(255, 255, 255))
            ty += int(cap_font.size * 1.30)

    # 브랜드는 안전영역 하단 «바로 위»에 — 잘리지 않는 마지막 줄
    if LOGO is not None:
        by2 = H - SAFE_B - 62
        img.paste(LOGO, (SAFE_L, by2), LOGO)
        d.text((SAFE_L + 74, by2 - 2), BRAND['name'], font=font(28, 'Bold', script_of(BRAND['name'])), fill=INK)
        d.text((SAFE_L + 74, by2 + 30), BRAND['link'], font=font(23, 'Semibold'), fill=DIM)
    return img


def render(sc, t):
    global BASE, LOGO
    if sc.get('mode') == 'card':
        return render_card(sc, t)
    img = BASE.copy()
    d = ImageDraw.Draw(img)
    PAD = 76
    ease = 1 - (1 - t) ** 3
    accent = AMBER if sc.get('accent') == 'amber' else TEAL

    # 브랜드 — 로고는 매 장면에 있다(대표 지적: 로고도 사용).
    # ⚠️ 앱이 셋이다. 하드코딩하면 UC·WIM 영상에 SIGNUM 이 박힌다.
    if LOGO is not None:
        img.paste(LOGO, (PAD, 74), LOGO)
        d.text((PAD + 78, 88), BRAND['name'], font=font(34, 'Bold', script_of(BRAND['name'])), fill=INK)
        d.text((PAD + 78, 128), BRAND['link'], font=font(25, 'Semibold'), fill=DIM)

    y = 210

    if sc.get('rank'):
        r = 44
        d.ellipse([PAD, y, PAD + r * 2, y + r * 2], fill=accent)
        rf = font(50, 'Black')
        rw = d.textlength(sc['rank'], font=rf)
        d.text((PAD + r - rw / 2, y + 16), sc['rank'], font=rf, fill=(255, 255, 255))
        d.text((PAD + r * 2 + 26, y + 4), '위', font=font(40, 'Bold', 'ko'), fill=DIM)
        if sc.get('ticker'):
            d.text((PAD + r * 2 + 92, y - 8), sc['ticker'], font=font(66, 'Black'), fill=INK)
        if sc.get('kor'):
            d.text((PAD + r * 2 + 96, y + 74), sc['kor'], font=font(28, 'Bold', 'ko'), fill=DIM)
        y += 128
    elif sc.get('kicker'):
        d.ellipse([PAD, y + 12, PAD + 18, y + 30], fill=accent)
        d.text((PAD + 36, y), sc['kicker'], font=font(36, 'Bold', script_of(sc['kicker'])), fill=accent)
        y += 82

    if sc.get('big'):
        try:
            target = float(str(sc['big']).replace(',', '').lstrip('+-'))
            sign = '-' if str(sc['big']).startswith('-') else ('+' if str(sc['big']).startswith('+') else '')
            shown = target * min(1.0, ease * 1.2)
            txt = f"{sign}{shown:,.1f}" if '.' in str(sc['big']) else f"{sign}{int(shown):,}"
        except Exception:
            txt = str(sc['big'])
        bf = font(sc.get('bigSize', 130), 'Black')
        d.text((PAD - 6, y), txt, font=bf, fill=accent)
        bw = d.textlength(txt, font=bf)
        if sc.get('bigUnit'):
            # ⚠️ 단위에도 한글이 온다(「억달러」). script 힌트를 안 주면 라틴 폰트로
            #    떨어져 두부(⊠)가 박힌다 — 2026-08-31 UC 영상에서 실제로 났다.
            us = script_of(sc['bigUnit'])
            uf = font(56 if us else 72, 'Bold', us)
            d.text((PAD - 6 + bw + 14, y + (86 if us else 74)), sc['bigUnit'], font=uf, fill=accent)
        y += int(bf.size * 1.10)

    # 랭크 블록(130px)+big(150px)이 이미 y 를 많이 먹는다. 폰이 578 에서 시작하므로
    # 줄이 두 개 넘으면 겹친다 — 실제로 겹쳤다. 남은 공간만큼만 그린다.
    _lines = [x for x in sc.get('lines', []) if x]
    if sc.get('rank') and len(_lines) > 1:
        _lines = _lines[:1]
    for i, ln in enumerate(_lines):
        lf = font(sc.get('lineSize', 46), 'Bold', script_of(ln))
        d.text((PAD - 2, y), ln, font=lf, fill=INK if i == 0 else DIM)
        y += int(lf.size * 1.34)

    frames = sc.get('_frames')
    if frames:
        k = min(len(frames) - 1, int(t * (len(frames) - 1)))
        paste_phone(img, frames[k])

    if sc.get('foot'):
        ff = font(36, 'Bold', script_of(sc['foot']))
        fw_ = d.textlength(sc['foot'], font=ff)
        d.text(((W - fw_) / 2, H - 118), sc['foot'], font=ff, fill=DIM)
    return img


def main():
    global BASE, LOGO, BRAND
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    out = sys.argv[2]
    BRAND = BRANDS.get(spec.get('app', 'signum'), BRANDS['signum'])
    BASE = bg_base()
    lp = os.path.join(os.path.dirname(__file__), '..', 'public', 'app-icons', BRAND['icon'])
    if os.path.exists(lp):
        LOGO = Image.open(lp).convert('RGBA').resize((62, 62), Image.LANCZOS)

    for sc in spec['scenes']:
        # 종목 로고 — 심볼 옆의 마크이자 «배경»의 재료다(대표: 배경이 밋밋하다).
        lp2 = sc.get('logo')
        if lp2 and os.path.exists(lp2):
            try:
                sc['_logo'] = Image.open(lp2).convert('RGBA')
            except Exception:
                sc['_logo'] = None
        dirp = sc.get('frames')
        if dirp and os.path.isdir(dirp):
            files = sorted(f for f in os.listdir(dirp) if f.endswith('.png'))
            sc['_frames'] = [Image.open(os.path.join(dirp, f)).convert('RGB') for f in files]

    tmp = tempfile.mkdtemp(prefix='reel-')
    try:
        idx, cuts, bright = 0, 0, 0.0
        for si, sc in enumerate(spec['scenes']):
            n = int(round(sc.get('seconds', 3) * FPS))
            if si: cuts += 1
            for k in range(n):
                im = render(sc, k / max(1, n - 1))
                if k < 3:
                    im = Image.blend(Image.new('RGB', (W, H), BG_TOP), im, 0.5 + 0.5 * (k / 3))
                im.save(os.path.join(tmp, f'{idx:05d}.png'))
                if idx % 30 == 0:
                    g = im.convert('L').resize((96, 170))
                    bright += sum(g.getdata()) / (96 * 170)
                idx += 1
        secs = idx / FPS
        avg = bright / max(1, (idx // 30) + 1)
        if avg < MIN_BRIGHTNESS or cuts < MIN_CUTS or secs < MIN_SECONDS:
            print(f'[검수 실패] 밝기 {avg:.1f} 컷 {cuts} 길이 {secs:.1f}s — 저장하지 않는다.', file=sys.stderr)
            sys.exit(3)
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS),
                        '-i', os.path.join(tmp, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                        '-crf', '19', '-movflags', '+faststart', out], check=True)
        print(f'{out}  ({secs:.1f}s · {idx}프레임 · 컷 {cuts} · 평균밝기 {avg:.1f})')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


main()
