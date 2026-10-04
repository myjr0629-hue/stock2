#!/usr/bin/env python3
# naver-overlap-check — 네이버 글 작업 파일(naver-task.json)이 «같은 날 앞선 글과 틀 문장을 반복하는지» 검사한다. (2026-10-04 신설)
# 왜: 네이버는 하루 3편을 같은 틀(종목만 바꾼 «맥스페인 $X — 감마 플립 $Y …»)로 올려 왔다. 10/4 META·GOOGL 글은 도입·화면 시각 설명·용어 정의·마무리 문장이
#   거의 그대로였고, 같은 틀의 반복은 네이버의 유사 문서 판정·독자 이탈에 불리하다(대표 10/4 지시: «틀 문장이 겹치지 않게»).
# 방법: 제목·intro·rest(공백 제거) 를 오늘·어제 폴더의 다른 naver-task*.json 과 견줘 «N자 이상 같은 덩어리»(기본 16자)를 센다.
#   푸터·링크·태그는 정해진 문구라 제외. 같은 파일(자기 자신)·같은 내용의 «발행 완료본»(naver-task.published*)은 건너뛴다.
# 사용: python3 scripts/naver-overlap-check.py [작업파일=오늘 naver-task.json] [--min=16] [--max=4]
#   종료코드 0 = 통과(또는 비교 대상 없음) · 1 = 겹침 덩어리가 --max 를 넘음(틀 문장을 바꿔 다시 쓴다) · 2 = 작업 파일 읽기 실패
import sys, os, json, glob, difflib, datetime

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[1:] if a.startswith('--') and '=' in a}
MIN = int(opt.get('--min', 16)); MAX = int(opt.get('--max', 4))
home = os.path.expanduser('~/signum-ego-io')
kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
today = kst.strftime('%Y-%m-%d'); yday = (kst - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
target = os.path.abspath(os.path.expanduser(args[0])) if args else os.path.join(home, today, 'naver-task.json')

def load(path):
    return json.load(open(path, encoding='utf-8'))
def body(d):
    return ''.join(([d.get('title', '')] + list(d.get('intro', [])) + list(d.get('rest', [])))).replace(' ', '').replace('\n', '')

try:
    mine_d = load(target); mine = body(mine_d)
except Exception as e:
    print('⛔ 작업 파일을 읽지 못했다:', target, str(e)[:80]); sys.exit(2)

others = []
for day in (today, yday):
    for p in sorted(glob.glob(os.path.join(home, day, 'naver-task*.json'))):
        if os.path.abspath(p) == target: continue
        try: d = load(p); b = body(d)
        except Exception: continue
        if b == mine: continue   # 같은 글의 사본(발행 완료본·초안 복사)은 비교 대상 아님
        if d.get('image') and d.get('image') == mine_d.get('image'): continue   # 같은 화면(=같은 종목·같은 글)의 초안·옛 판본도 건너뛴다
        others.append((p, b))

worst = 0
for p, b in others:
    sm = difflib.SequenceMatcher(None, mine, b, autojunk=False)
    blocks = [mine[m.a:m.a + m.size] for m in sm.get_matching_blocks() if m.size >= MIN]
    worst = max(worst, len(blocks))
    print(f'  {os.path.relpath(p, home)}: {MIN}자 이상 같은 덩어리 {len(blocks)}' + (' → ' + ' | '.join(x[:24] for x in blocks[:3]) if blocks else ''))
if not others:
    print('  비교 대상 없음(오늘·어제 다른 naver-task*.json 이 없다) — 통과')
if worst > MAX:
    print(f'⛔ 틀 문장 겹침 — 같은 덩어리 {worst}개(허용 {MAX}). 도입·화면 시각 설명·용어 정의·마무리 문장을 이 종목에 맞게 다시 쓴다(숫자 정의는 그 칸의 코드를 읽고 — MISTAKES #62).')
    sys.exit(1)
print(f'✓ 틀 문장 겹침 통과(최대 {worst}개 ≤ {MAX})')
