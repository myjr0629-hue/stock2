#!/usr/bin/env python3
# crop-flow-card — make-x-shot 의 «옵션 플로우» 전체 캡처(1380×2822)에서 «카드 머리~KPI 타일»만 잘라 워터마크 띠를 붙인다.
# 왜(2026-10-04 09시): 회차마다 손으로 잘랐다(검색창·종목 칩·하트·탭 행·AI 해석 문구·하단 배너 제외 — MISTAKES #38·#41).
#   영어 화면은 검색창 아래 설명이 두 줄이라 카드가 ≈41px 아래에서 시작한다 → 로케일별 기본 상자.
# 사용: python3 scripts/crop-flow-card.py <in.png> <out.png> <signum> <en|ko|ja> [x0,y0,x1,y1]
# 자른 뒤에는 반드시 «열어서» 종목명·값·잠금·가림을 눈으로 확인한다(파일명은 증거가 아니다 — #50).
import sys, subprocess, os, tempfile
from PIL import Image
src, dst, app, loc = sys.argv[1:5]
BOX = {'en': (80, 596, 1300, 1555), 'ko': (80, 555, 1300, 1514), 'ja': (80, 555, 1300, 1514)}
box = tuple(int(v) for v in sys.argv[5].split(',')) if len(sys.argv) > 5 else BOX[loc]
im = Image.open(src).convert('RGB')
crop = im.crop(box)
tmp = tempfile.mktemp(suffix='.png')
crop.save(tmp)
subprocess.check_call([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'x-watermark.py'), tmp, dst, app, loc])
os.unlink(tmp)
print(dst, Image.open(dst).size)
