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


def render(sc, t):
    global BASE, LOGO
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
