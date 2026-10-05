# -*- coding: utf-8 -*-
"""회차 시작 «읽기 묶음» — 지시서 1) «최소로 읽기»를 호출 한 번으로 (2026-10-05 14시 회차 신설 · MISTAKES #95·#96 연장)

왜: 회차마다 MISTAKES «규칙» 열(awk)·RUNBOOK §1·§2·§4(sed)·HANDOFF 부록 B(40KB 라 한도에 걸림)·OUTREACH-LOG 마지막 2회차(12KB)를
    따로 읽느라 호출이 8~10번 들었다(10/5 14시 회차 실측). 읽기 단계가 길수록 «게시 전에 45분»이 줄어든다.
사용: python3 scripts/cycle-orient.py            (기본: 규칙 마지막 30개 · 로그 2회차 · 출력 ≈ 14KB(바이트 — 한글은 3바이트))
      python3 scripts/cycle-orient.py --rules 999   (규칙 전부)   --logs 3   (회차 3개)
읽기 전용 — 아무것도 고치지 않는다. 한글 슬라이스는 파이썬 문자 단위(셸 cut -c 금지 — MISTAKES #72).
"""
import datetime
import os
import re
import subprocess
import sys

ROOT = os.path.expanduser('~/.gemini/antigravity/scratch/stock2')
WORK = os.path.expanduser('~/Documents/signum-work')


def arg(name, default):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            try:
                return int(sys.argv[i + 1])
            except ValueError:
                pass
    return default


def rd(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return f.read().decode('utf-8', errors='replace')


def clip(t, n):
    t = re.sub(r'\s+', ' ', t).strip()
    return t if len(t) <= n else t[: n - 1] + '…'


def head(title):
    print('\n━━ ' + title + ' ━━')


# ① 시각 · 잠금 · 엔진
now = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
head('① 시각·잠금·엔진')
print('KST ' + now.strftime('%Y-%m-%d %H:%M:%S') + '  (시각은 이 줄로만 적는다 — MISTAKES #4·#96)')
lock = os.path.join(WORK, '.cycle.lock')
if os.path.exists(lock):
    age = (datetime.datetime.now().timestamp() - os.path.getmtime(lock)) / 60
    with open(lock, 'rb') as f:
        print('잠금 있음 %.0f분 전 · %s → 70분 안이면 «앞 사이클 진행 중 — 건너뜀»' % (age, clip(f.read().decode('utf-8', 'replace'), 80)))
else:
    print('잠금 없음 → 시작 시각을 .cycle.lock 에 쓴다')
try:
    ps = subprocess.run("ps -axo pid,etime,command | grep 'ego-browser nodejs' | grep -v grep", shell=True, capture_output=True, text=True).stdout.strip().splitlines()
    print('ego 스크립트 %d개%s' % (len(ps), (' — ' + ' / '.join(clip(x, 50) for x in ps[:3])) if ps else ''))
except Exception as e:  # noqa: BLE001
    print('ps 실패', e)
try:
    wd = os.path.expanduser('~/Library/Logs/signum-cycle-watchdog.log')
    with open(wd, 'rb') as f:
        print('감시: ' + ' | '.join(f.read().decode('utf-8', 'replace').strip().splitlines()[-2:]))
except Exception as e:  # noqa: BLE001
    print('감시 로그 읽기 실패', e)

# ② MISTAKES «규칙» 열
head('② 실수 기록부 «규칙» 열 (마지막 %d개 · 120자까지 — 전문은 --wide)' % arg('--rules', 30))
rows = []
for line in rd('.agent/MISTAKES-LOG.md').splitlines():
    m = re.match(r'^\|\s*(\d+)\s*\|', line)
    if not m:
        continue
    cells = line.rstrip().rstrip('|').split('|')
    rule = cells[-1] if len(cells) >= 5 else ''
    rows.append((int(m.group(1)), rule.replace('**', '')))
nrule = arg('--rules', 30)
WIDE = '--wide' in sys.argv
print('(총 %d개 · 번호 %d~%d)' % (len(rows), rows[0][0], rows[-1][0]))
for num, rule in rows[-nrule:]:
    print('%d: %s' % (num, clip(rule, 600 if WIDE else 120)))

# ③ RUNBOOK 안전선·시간대
head('③ RUNBOOK §2 안전선 · 시간대 규칙')
rb = rd('.agent/marketing/RUNBOOK.md')
m = re.search(r'## 2\. 절대 지키는 안전선\s*(.+?)\n---', rb, re.S)
print(clip(m.group(1), 900) if m else '(§2 못 찾음)')
m = re.search(r'### 시간대 규칙[^\n]*\n(.+?)\n\n', rb, re.S)
if m:
    for t in m.group(1).splitlines():
        if t.startswith('|') and not t.startswith('|---') and '채널' not in t:
            print('  ' + clip(t, 140))

# ④ OUTREACH-LOG 마지막 회차들
nlog = arg('--logs', 2)
head('④ OUTREACH-LOG 마지막 %d회차 (머리줄 · «남은 캡·다음» · 표 채널명)' % nlog)
log = rd('.agent/marketing/OUTREACH-LOG.md')
secs = re.split(r'(?m)^## ', log)[1:]
for sec in secs[-nlog:]:
    lines = sec.splitlines()
    print('## ' + clip(lines[0], 380))
    nxt = [ln for ln in lines if ln.startswith('**남은 캡')]
    if nxt:
        print('   ' + clip(nxt[0], 460))
    chans = []
    for ln in lines:
        if ln.startswith('|') and not ln.startswith('|---') and not ln.startswith('| 채널'):
            c = ln.split('|')
            if len(c) > 3:
                chans.append(clip(c[1], 26))
    if chans:
        print('   표 채널: ' + ' · '.join(chans[:10]))

# ⑤ HANDOFF 부록 B 발행기 표(첫 칸만)
head('⑤ HANDOFF 부록 B — 명령 첫 칸만(전체는 grep -n "부록 B" 로 위치 → sed)')
ho = rd('.agent/marketing/HANDOFF.md')
i = ho.find('## 부록 B')
cnt = 0
if i >= 0:
    for ln in ho[i:].splitlines():
        if ln.startswith('| `') and cnt < 45:
            first = ln.split('|')[1].strip()
            print('  ' + clip(first, 80))
            cnt += 1
print('(부록 B 명령 %d줄 표시)' % cnt)
