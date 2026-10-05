#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""redeem-b-lint — 리딤 B 글(일회용 번호가 본문에 든 글) «게시 직전» 검사. 읽기 전용·브라우저 없음. 2026-10-05 23시 회차 신설(MISTAKES #109).

왜: 10/5 23시 준비 회차가 템플릿으로 블루스키·X 미국 본문을 만들다가 «템플릿이 규칙을 못 지킨다»를 손으로 세 번 발견했다 —
  ① x-us-b-main.tpl 마지막 줄이 «#stocks» → x-post.mjs 가 «글 끝이 #해시태그» 로 거부(10/5 05시 가드 이후 템플릿이 고쳐지지 않았다)
  ② 블루스키·X 템플릿에 «안드로이드 Play 코드 준비 중(앱은 무료)» 고지가 없다(지시서 «고지 필수(본문 안)»)
  ③ 채널 글자 한도(블루스키 300·X 가중 280)는 번호 장수·고지 줄을 더하면 템플릿 길이표(268~289)와 달라진다.
  → 사람이 «소리 내어 읽기»로 잡던 것을 도구로 한 번에 본다(번호는 «<번호>» 로 가려 출력 — 공개 저장소·보고서에 번호를 쓰지 않는다).
사용: python3 scripts/redeem-b-lint.py <채널> <본문.txt> [--reply]     채널 = bluesky | x_us | x_jp | threads | ih
  --reply = 같은 글 «추가 N장» 이어쓰기 답글 — 안드로이드 고지는 원글(본문)에 있으니 요구하지 않는다(글자 한도 때문에 답글엔 못 넣는다)
종료코드: 0 통과 · 1 실패 있음(경고만이면 0) · 2 사용법
"""
import re, sys

LIMITS = {'bluesky': ('글자', 300), 'x_us': ('X가중', 280), 'x_jp': ('X가중', 280), 'threads': ('글자', 500), 'ih': (None, None)}
CODE = re.compile(r'\b[A-Z0-9]{18}\b')
BANNED = re.compile(r'(후기|별점|리뷰|\breviews?\b|\bratings?\b|レビュー|評価|댓글 ?달면|팔로우하면|리포스트하면|follow (?:me )?to|retweet to|RT to|フォロー(?:して|で)|限定.{0,3}今日|only today|오늘만|선착순 ?\d+ ?명 ?남)', re.I)
RENEW = re.compile(r'(auto-?renews?|자동 ?갱신|自動更新)', re.I)
ANDROID = re.compile(r'(Android codes (?:coming )?soon|Android code[s]? (?:are )?coming|안드로이드는 Play 코드 준비 중|Android版コードは準備中|Android.{0,40}app (?:itself )?is free)', re.I)
CTA = re.compile(r'(Reply with the #|쓰신 번호는 댓글로|使った番号は返信)', re.I)


def xw(t):  # x-post.mjs 와 같은 가중 계산(링크 23자 · 범위 밖 문자 2자)
    t = re.sub(r'(https?://)?[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?', lambda m: '\0' * 23 if ('.' in m.group(0) and re.search(r'[a-z]{2,}', m.group(0), re.I)) else m.group(0), t, flags=re.I)
    n = 0
    for ch in t:
        c = ord(ch)
        n += 1 if (c <= 4351 or 8192 <= c <= 8205 or 8208 <= c <= 8223 or 8242 <= c <= 8247) else 2
    return n


def main():
    reply = '--reply' in sys.argv
    args = [a for a in sys.argv[1:] if a != '--reply']
    if len(args) != 2 or args[0] not in LIMITS:
        print(__doc__.split('사용:')[1].split('종료코드')[0].strip()); sys.exit(2)
    ch, path = args[0], args[1]
    t = open(path, encoding='utf-8').read().strip()
    fails, warns = [], []
    kind, lim = LIMITS[ch]
    if kind == '글자':
        n = len(t)
        if n > lim: fails.append(f'{kind} {n} > {lim}')
        elif n > lim - 3: warns.append(f'{kind} {n}/{lim} — 여유 3자 미만')
    elif kind == 'X가중':
        n = xw(t)
        if n > lim: fails.append(f'{kind} {n} > {lim}')
        elif n > lim - 3: warns.append(f'{kind} {n}/{lim} — 여유 3자 미만')
        tail = t.split('\n')[-1].strip()
        if re.search(r'(^|\s)[#@][^\s#@]+$', tail): fails.append('글 끝이 #해시태그·@멘션 — x-post.mjs 가 거부한다(자동완성이 게시를 삼킨다 · 태그는 문장 중간으로)')
    codes = CODE.findall(t)
    if ch != 'ih' or codes:
        if not codes: fails.append('일회용 번호(18자) 가 본문에 없다')
        if len(set(codes)) != len(codes): fails.append('같은 번호가 본문에 두 번 있다')
    if not RENEW.search(t): fails.append('자동 갱신 고지가 «무료» 문장 안에 없다(auto-renews / 자동 갱신 / 自動更新)')
    if not reply and not ANDROID.search(t): fails.append('«안드로이드는 Play 코드 준비 중(앱은 무료)» 고지가 본문에 없다(지시서 «고지 필수(본문 안)»)')
    if not CTA.search(t): fails.append('«쓰신 번호는 댓글로» CTA 가 없다')
    m = BANNED.search(t)
    if m: fails.append(f'금지 표현: «{m.group(0)}» (교환형·후기·별점·가짜 희소성)')
    if not reply and 'SIGNUM HQ' not in t: fails.append('앱 이름이 «SIGNUM HQ» 풀네임이 아니다')
    if re.search(r'(?<!HQ )SIGNUM PRO', re.sub(r'"[^"\n]*"', '', t)): fails.append('«SIGNUM PRO» 표기 — 10/5 18시 이후 «SIGNUM HQ PRO» (큰따옴표로 «인용»한 검색어 변형은 제외)')
    if ch in ('bluesky', 'x_us', 'x_jp') and re.search(r'https?://', t): fails.append('X·블루스키 본문은 번호만(링크 없음 — 지시서 §10)')
    if ch == 'ih':
        k = len(re.findall(r'https://www\.signumhq\.com/app\?from=indiehackers', t))
        if k != 1: fails.append(f'IH 본문의 from=indiehackers 링크가 {k}회(정확히 1회여야 ih-post-fill 이 통과한다)')
    shown = CODE.sub('<번호>', t)
    print(f'[{ch}] {path.split("/")[-1]} · 번호 {len(codes)}장 · ' + (f'{kind} {xw(t) if kind == "X가중" else len(t)}/{lim}' if kind else f'글자 {len(t)}'))
    for w in warns: print('  △', w)
    for f in fails: print('  ✗', f)
    if not fails: print('  ✓ 통과' + (' (경고 있음)' if warns else ''))
    sys.exit(1 if fails else 0)


main()
