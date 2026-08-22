#!/usr/bin/env python3
# ============================================================================
# ph_layout — PH 카드 «공용» 레이아웃 (정적 PNG 와 애니 GIF 가 같은 그림을 쓴다)
# ----------------------------------------------------------------------------
# 왜 공용인가: 갤러리 첫 장(GIF)만 디자인이 다르면 나머지 3장과 따로 놀아
# 「대충 만든 묶음」처럼 보인다. 배경·그리드·카피·플로팅 칩을 한 곳에서 그린다.
# ============================================================================
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'promo-shots', '_raw')
W, H = 1270, 760
SFNS = '/System/Library/Fonts/SFNS.ttf'

THEMES = {
    # 2026-08-22 대표 지적 「물빠진색」 반영 — 채도를 올린 중간톤으로 통일.
    # 너무 어두우면 피드에서 검은 사각형, 너무 옅으면 힘이 없다. 그 사이를 잡는다.
    'uc':     dict(top=(6,138,105),   bot=(5,62,46),    glow=(46,196,150),
                   fg=(255,255,255), dim=(186,229,214), accent=(255,199,74),
                   chip=(120,196,168), foot=(150,200,180), grid=(255,255,255,13)),
    'signum': dict(top=(10,116,140),  bot=(6,44,66),    glow=(72,206,224),
                   fg=(255,255,255), dim=(178,220,232), accent=(120,240,225),
                   chip=(110,196,214), foot=(150,200,214), grid=(255,255,255,13)),
    'wim':    dict(top=(112,88,255),  bot=(44,26,132),  glow=(160,140,255),
                   fg=(255,255,255), dim=(214,208,255), accent=(255,205,92),
                   chip=(165,150,255), foot=(186,178,240), grid=(255,255,255,14)),
}

def grade(im, sat=1.35, con=1.12, bri=1.06):
    """앱 스크린샷 «프로모 그레이딩» — 광고에서 표준으로 쓰는 채도·대비 상향.
    UI 원본은 절제된 색이라 카드에 얹으면 흐려 보인다(대표 반복 지적).
    수치를 바꾸는 게 아니라 «보이는 톤»만 올린다 — 화면 내용은 그대로다."""
    im = ImageEnhance.Color(im).enhance(sat)
    im = ImageEnhance.Contrast(im).enhance(con)
    im = ImageEnhance.Brightness(im).enhance(bri)
    return im


def sf(size, weight='Heavy'):
    f = ImageFont.truetype(SFNS, size)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f

def vgrad(size, top, bot):
    w, h = size
    g = Image.new('RGB', (1, h)); px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(round(top[i] + (bot[i]-top[i])*t) for i in range(3))
    return g.resize((w, h), Image.BILINEAR)

def rounded(size, r):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,size[0]-1,size[1]-1], radius=r, fill=255)
    return m

def wrap(d, text, font, max_w):
    words, lines, cur = text.split(), [], ''
    for w_ in words:
        t = (cur + ' ' + w_).strip()
        if d.textlength(t, font=font) <= max_w: cur = t
        else:
            if cur: lines.append(cur)
            cur = w_
    if cur: lines.append(cur)
    return lines

def _grid(size, rgba, step):
    lay = Image.new('RGBA', size, (0,0,0,0)); d = ImageDraw.Draw(lay)
    for x in range(0, size[0], step): d.line([(x,0),(x,size[1])], fill=rgba, width=1)
    for y in range(0, size[1], step): d.line([(0,y),(size[0],y)], fill=rgba, width=1)
    return lay

def build_base(app, kicker, head, sub, probe_size, floats=None, S=2,
               chips=None, foot=None, has_phone=True):
    """배경 + 그리드 + 카피 + (기기 그림자) + 플로팅 칩까지 그린 «2배» 캔버스와
    기기 좌표를 돌려준다. 기기 이미지는 호출자가 프레임마다 붙인다."""
    TH = THEMES[app]
    cw, ch = W*S, H*S
    canvas = vgrad((cw, ch), TH['top'], TH['bot'])
    glow = Image.new('L', (cw, ch), 0)
    ImageDraw.Draw(glow).ellipse([cw*0.52, -ch*0.35, cw*1.25, ch*0.95], fill=64)
    canvas.paste(Image.new('RGB', (cw, ch), TH['glow']), (0,0), glow.filter(ImageFilter.GaussianBlur(150*S)))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), _grid((cw,ch), TH['grid'], 44*S)).convert('RGB')

    box = None
    if has_phone:
        pw0, ph0 = probe_size
        ph_h = 690*S; ph_w = round(ph_h * pw0 / ph0); r = 28*S
        x, y = cw - 74*S - ph_w, (ch - ph_h)//2
        # 기기 뒤 «발광 오브» — 평평한 배경에 화려함과 깊이를 준다.
        orb = Image.new('L', (cw, ch), 0)
        ImageDraw.Draw(orb).ellipse([x-150*S, y-90*S, x+ph_w+150*S, y+ph_h+90*S], fill=110)
        canvas.paste(Image.new('RGB', (cw, ch), TH['accent']), (0,0),
                     orb.filter(ImageFilter.GaussianBlur(110*S)))
        sh = Image.new('RGBA', (ph_w+130*S, ph_h+130*S), (0,0,0,0))
        ImageDraw.Draw(sh).rounded_rectangle([65*S,65*S,ph_w+65*S,ph_h+65*S], radius=r, fill=(0,0,0,150))
        sh = sh.filter(ImageFilter.GaussianBlur(34*S))
        canvas.paste(sh, (x-65*S, y-45*S), sh)
        box = (x, y, ph_w, ph_h, r)
        text_w = x - 60*S - 76*S
    else:
        x = cw; text_w = cw - 200*S

    d = ImageDraw.Draw(canvas); px_ = 76*S
    f_lab, f_val = sf(17*S,'Semibold'), sf(30*S,'Heavy')
    fboxes = []
    if floats:
        for lab, val in floats:
            wpx = int(max(d.textlength(lab.upper(), font=f_lab), d.textlength(val, font=f_val)) + 46*S)
            fboxes.append((lab, val, wpx))
        text_w = min(text_w, x - max(b[2] for b in fboxes) + 46*S - px_ - 34*S)

    f_k, f_h, f_s = sf(23*S,'Bold'), sf(60*S,'Heavy'), sf(26*S,'Medium')
    hl, sl = wrap(d, head, f_h, text_w), wrap(d, sub, f_s, text_w)
    badge_h = 52*S
    yy = (ch - (badge_h + 26*S + 34*S + 18*S + len(hl)*72*S + 18*S + len(sl)*38*S))//2

    # ── 배지 2개 = 소구점 1·2순위 (2026-08-22 확정한 메시지 틀)
    #   ① 무료·계정 불필요  ② AI가 분석한다
    #   그때그때 카피를 고치지 말고 «틀»을 카드마다 똑같이 얹는다(대표 지적).
    f_b = sf(24*S,'Heavy')
    bx = px_
    for i, bt in enumerate(('FREE · NO ACCOUNT', 'AI ANALYSIS')):
        bw = int(d.textlength(bt, font=f_b)) + 44*S
        if i == 0:
            d.rounded_rectangle([bx, yy, bx+bw, yy+badge_h], radius=badge_h//2, fill=TH['accent'])
            d.text((bx+22*S, yy+12*S), bt, font=f_b, fill=(12,28,24))
        else:
            d.rounded_rectangle([bx, yy, bx+bw, yy+badge_h], radius=badge_h//2,
                                fill=None, outline=TH['accent'], width=3*S)
            d.text((bx+22*S, yy+12*S), bt, font=f_b, fill=TH['accent'])
        bx += bw + 14*S
    yy += badge_h + 26*S

    d.text((px_, yy), kicker.upper(), font=f_k, fill=TH['accent']); yy += 52*S
    for ln in hl: d.text((px_, yy), ln, font=f_h, fill=TH['fg']); yy += 72*S
    yy += 18*S
    for ln in sl: d.text((px_, yy), ln, font=f_s, fill=TH['dim']); yy += 38*S

    if chips:
        yy += 26*S; f_c = sf(23*S,'Semibold'); cx = px_
        for c in chips:
            tw = d.textlength(c, font=f_c); wpx, hpx = tw + 34*S, 46*S
            if cx + wpx > px_ + text_w: cx = px_; yy += hpx + 12*S
            d.rounded_rectangle([cx, yy, cx+wpx, yy+hpx], radius=23*S, fill=None, outline=TH['chip'], width=2*S)
            d.text((cx + 17*S, yy + 10*S), c, font=f_c, fill=TH['fg']); cx += wpx + 12*S
        yy += 46*S
    if foot:
        yy += 30*S
        d.text((px_, yy), foot, font=sf(20*S,'Regular'), fill=TH['foot'])

    return canvas, box, fboxes

def paste_floats(canvas, app, box, fboxes, S=2):
    """플로팅 칩은 «기기 위»에 그려야 하므로 기기 합성 뒤에 부른다."""
    if not fboxes or not box: return canvas
    TH = THEMES[app]; x, y, ph_w, ph_h, r = box
    f_lab, f_val = sf(17*S,'Semibold'), sf(30*S,'Heavy')
    fy = y + 70*S
    for lab, val, wpx in fboxes:
        bx = x - wpx + 46*S
        ci = Image.new('RGBA', (wpx, 84*S), (0,0,0,0)); cd = ImageDraw.Draw(ci)
        # 칩은 «불투명»이어야 한다. 반투명으로 뒀더니 다크 테마에서 기기 화면이
        # 비쳐 라벨이 흐려졌다(2026-08-22 육안 확인). 밝은 테마=흰 카드,
        # 어두운 테마=그라디언트 하단색을 진하게 깐 카드.
        if TH['fg'][0] < 128:
            fill = (255,255,255,242)
        else:
            b = TH['bot']; fill = (max(0,b[0]-6), max(0,b[1]-6), max(0,b[2]-6), 246)
        cd.rounded_rectangle([0,0,wpx-1,84*S-1], radius=18*S, fill=fill, outline=(*TH['chip'],190), width=2*S)
        cd.text((22*S, 14*S), lab.upper(), font=f_lab, fill=(*TH['accent'],255))
        cd.text((22*S, 40*S), val, font=f_val, fill=(*TH['fg'],255))
        csh = Image.new('RGBA', (wpx+40*S, 84*S+40*S), (0,0,0,0))
        ImageDraw.Draw(csh).rounded_rectangle([20*S,20*S,wpx+20*S,84*S+20*S], radius=18*S, fill=(0,0,0,90))
        csh = csh.filter(ImageFilter.GaussianBlur(14*S))
        canvas.paste(csh, (bx-20*S, fy-14*S), csh)
        canvas.paste(ci, (bx, fy), ci)
        fy += 106*S
    return canvas
