#!/usr/bin/env python3
# ============================================================================
# make-short — 1080×1920 세로 숏폼(YouTube Shorts / Reels / TikTok) 생성기
#
# 왜 새로 만드나 (2026-08-31):
#   숏폼은 **팔로워가 0이어도 알고리즘이 배포하는 유일한 채널**이다. X 는
#   팔로워 4명에게만 먼저 보여준다(실측 글당 1~4 조회). 유입을 만들려면
#   여기밖에 없다. 유튜브는 대표가 윈도우에서 운영하므로, 나는 «파일»까지
#   만들어 바탕화면에 놓고 대표는 올리기만 한다.
#
# ⚠️ 과거 리모션 영상이 실패한 두 가지를 구조적으로 막는다:
#   ① 이미지 레이어 0개  → 앱 실화면을 반드시 넣는다(scene.shot)
#   ② 평균 밝기 5.2/255, 컷 0회 → **발행 전 검수 게이트**에서 밝기·컷·프레임
#      수를 재고, 미달이면 파일을 남기지 않는다.
#
# 실행: python3 scripts/make-short.py <scenes.json> <out.mp4>
# ============================================================================
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FPS = 30
BG = (7, 11, 20)
INK = (244, 241, 232)
DIM = (150, 158, 176)

SFNS = '/System/Library/Fonts/SFNS.ttf'
GOTHIC = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
FFMPEG = os.path.join(os.path.dirname(__file__), '..', 'node_modules', 'ffmpeg-static', 'ffmpeg')

# 검수 하한 — 이 아래면 저장하지 않는다
MIN_BRIGHTNESS = 22      # 과거 실패작이 5.2 였다
MIN_CUTS = 3
MIN_SECONDS = 8


def has_cjk(s):
    return any('぀' <= c <= '鿿' or '가' <= c <= '힯' for c in s)


def font(size, weight='Heavy', cjk=False):
    if cjk:
        try:
            return ImageFont.truetype(GOTHIC, size, index=6)
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


def wrap(draw, s, f, max_w):
    words, lines, cur = s.split(' '), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if draw.textlength(t, font=f) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def render_scene(sc, t):
    """
    t = 0..1 (장면 내 진행도). 반환: RGB 이미지.
    ★ 모든 장면이 «움직여야» 한다 — 정지 이미지 연속은 숏폼에서 즉시 이탈된다.
    """
    accent = tuple(sc.get('accent', [79, 209, 232]))
    img = Image.new('RGB', (W, H), BG)

    glow = Image.new('RGB', (W, H), BG)
    gd = ImageDraw.Draw(glow)
    # 글로우가 천천히 움직여 «살아 있는» 배경이 된다
    cy = H * (0.20 + 0.10 * t)
    gd.ellipse([-W * 0.35, cy - H * 0.30, W * 1.35, cy + H * 0.30],
               fill=(int(accent[0] * 0.22), int(accent[1] * 0.22), int(accent[2] * 0.24)))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(160)), 0.95)

    d = ImageDraw.Draw(img)
    PAD = 84
    ease = 1 - (1 - t) ** 3          # 시작이 빠르고 끝이 느린 감속
    y = 250

    if sc.get('kicker'):
        fk = font(38, 'Bold', has_cjk(sc['kicker']))
        d.ellipse([PAD, y + 8, PAD + 20, y + 28], fill=accent)
        d.text((PAD + 40, y - 2), sc['kicker'].upper(), font=fk, fill=accent)
        y += 92

    if sc.get('ticker'):
        ft = font(150, 'Black')
        d.text((PAD - 8, y), sc['ticker'], font=ft, fill=INK)
        y += 200

    if sc.get('big'):
        # 숫자가 «세어 올라간다» — 시선이 숫자에 붙는다
        try:
            target = float(str(sc['big']).replace(',', ''))
            shown = target * min(1.0, ease * 1.15)
            txt = f"{shown:,.1f}" if '.' in str(sc['big']) else f"{int(shown):,}"
        except Exception:
            txt = str(sc['big'])
        fb = font(230, 'Black')
        d.text((PAD - 10, y), txt, font=fb, fill=accent)
        bw = d.textlength(txt, font=fb)
        if sc.get('bigUnit'):
            fu = font(96, 'Bold')
            d.text((PAD - 10 + bw + 18, y + 118), sc['bigUnit'], font=fu, fill=accent)
        y += 300

    if sc.get('lines'):
        for i, ln in enumerate(sc['lines']):
            fl = font(sc.get('lineSize', 54), 'Bold', has_cjk(ln))
            for row in wrap(d, ln, fl, W - PAD * 2):
                d.text((PAD - 4, y), row, font=fl, fill=INK if i == 0 else DIM)
                y += int(fl.size * 1.32)
            y += 16

    shot = sc.get('shot')
    if shot and os.path.exists(shot):
        scr = Image.open(shot).convert('RGB')
        box_w = W - PAD * 2 - 120
        ratio = box_w / scr.width
        scr = scr.resize((box_w, int(scr.height * ratio)), Image.LANCZOS)
        # 위에서 아래로 천천히 흐른다 — 앱을 «쓰는 것»처럼 보인다
        # 푸터가 있으면 폰이 그 위에서 멈춰야 한다 — 겹치면 둘 다 못 읽는다
        avail = H - y - (210 if sc.get('foot') else 90)
        if avail > 200:
            span = max(0, scr.height - avail)
            top = int(span * ease)
            crop = scr.crop((0, top, scr.width, min(scr.height, top + avail)))
            card = Image.new('RGB', (crop.width + 12, crop.height + 12), (150, 158, 172))
            card.paste(crop, (6, 6))
            img.paste(card, (PAD + 54, y))

    if sc.get('foot'):
        ff = font(38, 'Semibold', has_cjk(sc['foot']))
        d.text((PAD - 4, H - 132), sc['foot'], font=ff, fill=DIM)

    return img


def main():
    spec = json.load(open(sys.argv[1], encoding='utf-8'))
    out = sys.argv[2]
    tmp = tempfile.mkdtemp(prefix='short-')
    try:
        idx = 0
        cuts = 0
        bright_sum = 0.0
        for si, sc in enumerate(spec['scenes']):
            n = int(round(sc.get('seconds', 3) * FPS))
            if si:
                cuts += 1
            for k in range(n):
                im = render_scene(sc, k / max(1, n - 1))
                # 장면 첫 4프레임은 어둡게 시작해 «컷»이 눈에 잡히게
                if k < 4:
                    im = Image.blend(Image.new('RGB', (W, H), BG), im, 0.35 + 0.65 * (k / 4))
                im.save(os.path.join(tmp, f'{idx:05d}.png'))
                if idx % 15 == 0:
                    g = im.convert('L').resize((64, 114))
                    bright_sum += sum(g.getdata()) / (64 * 114)
                idx += 1

        seconds = idx / FPS
        samples = max(1, len(range(0, idx, 15)))
        brightness = bright_sum / samples

        # ── 발행 전 검수 게이트 ───────────────────────────────────────────
        problems = []
        if brightness < MIN_BRIGHTNESS:
            problems.append(f'평균 밝기 {brightness:.1f} < {MIN_BRIGHTNESS}')
        if cuts < MIN_CUTS:
            problems.append(f'컷 {cuts} < {MIN_CUTS}')
        if seconds < MIN_SECONDS:
            problems.append(f'길이 {seconds:.1f}s < {MIN_SECONDS}s')
        if problems:
            print('[검수 실패] ' + ' · '.join(problems) + ' — 저장하지 않는다', file=sys.stderr)
            sys.exit(2)

        subprocess.run([
            os.path.abspath(FFMPEG), '-y', '-framerate', str(FPS),
            '-i', os.path.join(tmp, '%05d.png'),
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
        ], check=True, capture_output=True)
        print(f'{out}  ({seconds:.1f}s · {idx}프레임 · 컷 {cuts} · 평균밝기 {brightness:.1f})')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
