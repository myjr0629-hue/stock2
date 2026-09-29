#!/usr/bin/env python3
# ============================================================================
# compose-widget-media — 홈 화면 위젯 «실화면 캡처»(시뮬레이터 1206x2622)로 스토어 이미지를 만든다.
# ----------------------------------------------------------------------------
# 만드는 것(로케일마다):
#   raw/widget-home-<loc>.png     1104x2301 — 기본 스크린샷 합성용(compose-promo-shots.py 의 raw, 상태 막대만 뺀 홈 화면)
#   raw/widget-home-play-<loc>.png 960x1649 — Play 폰 스크린샷 합성용(위에서부터 자름)
#   preview/widget-cut-<loc>.png  잘라낸 대형 위젯(투명 모서리) — 이벤트 카드·상세·Play 대표 이미지는 이걸로
#                                 `KINDS=wcard,wdetail,wfeature node scripts/compose-event-media.cjs` 가 만든다(앱 하트 SVG 그대로).
# 규칙(애플 공식): 이벤트 이미지에 테두리·그라디언트·글자·로고 금지 → 단색 남색(#070C17) + 위젯 실화면 + 앱 하트 버튼.
# 위젯은 캡처에서 «잘라낸다» — 배경화면·다른 앱 아이콘은 이벤트 이미지에 들어가지 않는다.
# 게이트: 캡처 속 종목은 9/30 나스닥 체인 대조 «통과» 종목만(NVDA·META·AMZN·GOOGL·PLTR 등). 실패 8종목
#   (MU·TSLA·AAPL·AMD·SPY·MSFT·IWM·ORCL) 수치가 보이는 캡처는 쓰지 않는다 — 사람이 미리보기로 확인한다.
# 위젯 상자: --box x0,y0,x1,y1(픽셀) 로 준다. 없으면 «저채도·어두운 사각형»을 자동으로 찾고, 실패하면
#   iPhone 17 Pro 첫 줄 대형 위젯 기본값(80,266,1127,1366 — 9/30 위젯 에이전트 캡처 실측)을 쓴다.
# 사용: python3 scripts/compose-widget-media.py <홈캡처.png> <loc> <출력폴더> [--box x0,y0,x1,y1] [--status 150]
# ============================================================================
import os, sys
from PIL import Image, ImageDraw

DEFAULT_BOX = (80, 266, 1127, 1366)


def auto_box(im):
    """저채도·어두운 픽셀(위젯 바탕)이 절반 넘는 행·열의 범위 — 파란 배경화면과 구분된다."""
    W, H = im.size
    px = im.load()
    def widgety(p):
        mx, mn = max(p), min(p)
        return (mx - mn) < 45 and (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) < 95
    rows = [y for y in range(160, H // 2, 4) if sum(widgety(px[x, y]) for x in range(0, W, 8)) > (W // 8) * 0.55]
    if not rows:
        return None
    y0, y1 = rows[0], rows[-1]
    mid = (y0 + y1) // 2
    cols = [x for x in range(0, W, 2) if sum(widgety(px[x, y]) for y in range(y0, y1, 8)) > ((y1 - y0) // 8) * 0.6]
    if not cols:
        return None
    return (cols[0], y0, cols[-1], y1 + 4)


def cut_widget(im, box, radius=66):
    w = im.crop(box).convert('RGBA')
    m = Image.new('L', w.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w.size[0] - 1, w.size[1] - 1], radius=radius, fill=255)
    w.putalpha(m)
    return w


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src, loc, out = args[0], args[1], args[2]
    opt = {sys.argv[i][2:]: sys.argv[i + 1] for i in range(len(sys.argv) - 1) if sys.argv[i].startswith('--')}
    im = Image.open(src).convert('RGB')
    if im.size != (1206, 2622):
        print(f'! 캡처 크기 {im.size} — iPhone 17 Pro(1206x2622) 기준 좌표라 상자를 --box 로 주는 것이 안전')
    if 'box' in opt:
        box = tuple(int(v) for v in opt['box'].split(','))
    else:
        box = auto_box(im) or DEFAULT_BOX
    print('위젯 상자', box, f'{box[2] - box[0]}x{box[3] - box[1]}')
    for sub in ('raw', 'preview'):
        os.makedirs(os.path.join(out, sub), exist_ok=True)

    # ① 기본 스크린샷 raw(1104x2301): 상태 막대만 빼고(기본 150px) 높이 맞춤 → 가운데 폭 자르기
    top = int(opt.get('status', 150))
    body = im.crop((0, top, im.size[0], im.size[1]))
    f = 2301 / body.size[1]
    body = body.resize((round(body.size[0] * f), 2301), Image.LANCZOS)
    cx = (body.size[0] - 1104) // 2
    body.crop((cx, 0, cx + 1104, 2301)).save(os.path.join(out, 'raw', f'widget-home-{loc}.png'))
    # ①-b Play 폰 스크린샷 raw(960x1649 — make-promo-shots play 규격): 폭 맞춤 후 위에서부터 자른다(위젯은 위쪽, 독은 잘려 나간다)
    pb = im.crop((0, top, im.size[0], im.size[1]))
    fp = 960 / pb.size[0]
    pb = pb.resize((960, round(pb.size[1] * fp)), Image.LANCZOS).crop((0, 0, 960, 1649))
    pb.save(os.path.join(out, 'raw', f'widget-home-play-{loc}.png'))

    wid = cut_widget(im, box)
    # 미리보기(사람 확인용): 잘라낸 위젯
    wid.save(os.path.join(out, 'preview', f'widget-cut-{loc}.png'))
    print('✓', loc, '→ raw/widget-home · preview/widget-cut 저장 — preview 로 게이트 종목·잘림을 눈으로 확인할 것')
    print('  다음: KINDS=wcard,wdetail,wfeature node scripts/compose-event-media.cjs', os.path.join(out, 'preview'), '<출력폴더>', loc)


if __name__ == '__main__':
    main()
