#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""awesome-list README 에 «한 줄» 끼워 넣은 사본을 만든다 (2026-10-05 19시 회차 신설 · 읽기 전용 — 네트워크는 GitHub 공개 API 만)

왜: 외부 awesome-list PR 은 «상류 README 를 그대로 받아 한 줄만 더한 파일»을 내 포크에 올리는 방식이다(9/11 awesome-quant #648 — 내 토큰이
    stock2 전용이라 API 로 fork·branch 가 안 돼 브라우저 «Upload files» 경로). 그 «파일 만들기»를 손으로 하면 상류가 그 사이 바뀌었을 때 남의 변경을
    되돌리거나(줄바꿈·끝 개행 포함) 앵커를 잘못 잡는다 → 도구로 고정한다(MISTAKES #49 «되풀이되는 확인은 첫 반복에 도구로»).

사용: python3 scripts/awesome-readme-add.py <owner/repo> --after '<앵커 줄 앞부분>' --line '<새 줄>' --out <저장 경로> [--section '## Data Source']
      python3 scripts/awesome-readme-add.py --selftest        (네트워크 없음 — 양성·음성 대조군 8개)

검사(하나라도 어긋나면 종료 1 — 파일을 쓰지 않는다):
  ① 앵커가 «정확히 1줄»에만 있다  ② 새 줄의 URL 이 README 에 아직 없다(중복 등재 방지)  ③ 출력 = 원본 + «정확히 +1줄·−0줄»
  ④ 줄바꿈(CRLF/LF)·끝 개행·BOM 유지  ⑤ 새 줄 URL 에 추적 파라미터(utm_·?from=·&from=·ref=)가 없다(많은 목록이 거부 — #648 의 규칙)
  ⑥ --section 을 주면 앵커가 그 «## 절» 안에 있다
출력: 저장 경로(= 상류 파일명 그대로 — 포크에 «Upload files» 로 올릴 때 이름이 같아야 덮어쓴다) · 상류 파일 blob sha(올리기 직전 다시 돌려 같은 값인지 비교 —
      다르면 상류가 바뀐 것이니 «다시 만들어서» 올린다) · 변경 줄 번호.
PR 만들기 전 눈으로 확인할 것: base 저장소가 «상류»인가(처음엔 내 포크의 main 으로 잡혔다 — compare/<기본브랜치>...<내계정>:<저장소>:<브랜치> 로 다시 열어 고정).
"""
import argparse
import base64
import difflib
import json
import re
import sys
import urllib.request

HDR = {'User-Agent': 'signum-awesome-add', 'Accept': 'application/vnd.github+json'}
TRACKING = ('utm_', '?from=', '&from=', 'ref=')


def insert_line(txt, anchor, new_line, section=None):
    """순수 함수 — (새 본문, 삽입된 줄 번호(1부터)) | ValueError. txt 는 str(개행 변환 안 된 원문)."""
    crlf = '\r\n' in txt
    lines = txt.split('\n')                       # CRLF 면 줄 끝에 \r 이 남는다 — 아래에서 같은 방식으로 맞춘다
    hits = [i for i, l in enumerate(lines) if l.rstrip('\r').startswith(anchor)]
    if len(hits) != 1:
        raise ValueError('앵커가 %d줄에 있다(정확히 1줄이어야 한다): %r' % (len(hits), anchor))
    urls = re.findall(r'\((https?://[^)\s]+)\)', new_line) or re.findall(r'(https?://\S+)', new_line)
    if not urls:
        raise ValueError('새 줄에 URL 이 없다')
    for u in urls:
        if any(t in u for t in TRACKING):
            raise ValueError('추적 파라미터가 있는 URL: %s' % u)
        if u.rstrip('/') in txt:
            raise ValueError('이미 README 에 있는 URL: %s' % u)
    if section is not None:
        sec = None
        for l in lines[: hits[0]]:
            if l.startswith('## '):
                sec = l.rstrip('\r').strip()
        if sec != section.strip():
            raise ValueError('앵커가 «%s» 절이 아니라 «%s» 절 안에 있다' % (section.strip(), sec))
    i = hits[0]
    ins = new_line.rstrip('\r\n') + ('\r' if crlf else '')
    out = lines[: i + 1] + [ins] + lines[i + 1:]
    new_txt = '\n'.join(out)
    d = [x for x in difflib.unified_diff(txt.split('\n'), new_txt.split('\n'), lineterm='', n=0) if not x.startswith(('---', '+++', '@@'))]
    plus = sum(1 for x in d if x.startswith('+'))
    minus = sum(1 for x in d if x.startswith('-'))
    if (plus, minus) != (1, 0):
        raise ValueError('diff 가 +1/−0 이 아니다: +%d/−%d' % (plus, minus))
    return new_txt, i + 2


def selftest():
    base = '# T\n\n## A\n- [x](https://a.example/x) - x\n\n## Data Source\n- [Helium](https://h.example/) - h\n- [Other](https://o.example/) - o\n\n## Z\n- [z](https://z.example/) - z\n'
    new = '- [Mine](https://github.com/me/repo) - free daily JSON.'
    cases = []

    def ok(name, f, want):
        try:
            got = f()
            res = want is True
        except ValueError as e:
            got = str(e)
            res = isinstance(want, str) and want in got
        print(('✓ ' if res else '✗ ') + name + ('' if res else '  → ' + str(got)[:120]))
        cases.append(res)

    ok('양성: 앵커 뒤에 정확히 +1줄', lambda: (insert_line(base, '- [Helium]', new, '## Data Source')[0].count('\n') == base.count('\n') + 1), True)
    ok('양성: 삽입 위치는 앵커 바로 다음 줄', lambda: insert_line(base, '- [Helium]', new)[0].split('\n')[7] == new, True)
    ok('양성: CRLF 유지(새 줄도 \\r\\n)', lambda: insert_line(base.replace('\n', '\r\n'), '- [Helium]', new)[0].count('\r\n') == base.count('\n') + 1, True)
    ok('음성: 앵커 없음', lambda: insert_line(base, '- [Nope]', new), '0줄')
    ok('음성: 앵커 둘(모호) — «- [» 는 여러 줄', lambda: insert_line(base, '- [', new), '줄에 있다')
    ok('음성: 이미 있는 URL', lambda: insert_line(base, '- [Helium]', '- [Dup](https://h.example) - d'), '이미 README')
    ok('음성: 추적 파라미터', lambda: insert_line(base, '- [Helium]', '- [T](https://t.example/?utm_source=x) - t'), '추적 파라미터')
    ok('음성: 다른 절의 앵커', lambda: insert_line(base, '- [x]', new, '## Data Source'), '절 안에')
    bad = cases.count(False)
    print('자체 시험 %d/%d 통과' % (len(cases) - bad, len(cases)))
    sys.exit(1 if bad else 0)


def main():
    if '--selftest' in sys.argv:
        return selftest()
    ap = argparse.ArgumentParser()
    ap.add_argument('repo')
    ap.add_argument('--after', required=True)
    ap.add_argument('--line', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--section')
    a = ap.parse_args()
    req = urllib.request.Request('https://api.github.com/repos/%s/readme' % a.repo, headers=HDR)
    meta = json.loads(urllib.request.urlopen(req, timeout=30).read().decode('utf-8'))
    raw = base64.b64decode(meta['content'])
    bom = raw.startswith(b'\xef\xbb\xbf')
    txt = raw.decode('utf-8-sig')
    try:
        new_txt, lineno = insert_line(txt, a.after, a.line, a.section)
    except ValueError as e:
        print('⛔ ' + str(e))
        sys.exit(1)
    out = new_txt.encode('utf-8')
    if bom:
        out = b'\xef\xbb\xbf' + out
    open(a.out, 'wb').write(out)
    print('✓ %s/%s 사본 저장 → %s' % (a.repo, meta['name'], a.out))
    print('  상류 파일 blob sha: %s  (올리기 직전 다시 돌려 같은 값인지 확인 — 다르면 상류가 바뀐 것이니 다시 만든다)' % meta['sha'])
    print('  삽입 줄 번호: %d · 원본 %d바이트 → %d바이트 · 줄바꿈 %s · diff +1/−0 확인' % (lineno, len(raw), len(out), 'CRLF' if '\r\n' in txt else 'LF'))
    print('  포크에 «Upload files» 로 올릴 때 파일 이름은 «%s» 그대로여야 한다. PR 만들기 전 base 가 상류인지 눈으로 확인.' % meta['name'])


main()
