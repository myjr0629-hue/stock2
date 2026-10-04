#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""reddit-pending-check — 올린 레딧 댓글이 «로그인 없는 독자»(익명 RSS)에게 보이는지 «한 번에» 다시 본다
(2026-10-04 22시 회차 신설 · 브라우저 없음 · 읽기 전용).

왜: 레딧 댓글은 «작성자 시야»에 정상이어도 스팸필터에 가려질 수 있다(MISTAKES #33). 익명 시야 확인 수단은 스레드 RSS 뿐인데 레딧이 요청을 429 로 막아
    (10/4 22:36 — 내가 같은 호스트를 몇 분 간격으로 여러 경로로 되풀이 조회), «안 보인다»와 «판정 불가»가 섞였다(MISTAKES #70).
    그래서 점검 대상을 파일에 등록해 두고 «스레드당 1회·간격을 두고» 한 번에 읽는다. 429 가 나면 그 뒤 요청을 멈추고 «판정 불가»로 적는다.

사용: python3 scripts/reddit-pending-check.py [--gap 30] [--wait0 0] [--only pending|control]  (전체 6건 ≈ 3~4분)
등록: .agent/marketing/reddit-pending.json 의 entries — {kind: pending(공개 미확인 의심)|control(과거 정상 게시된 대조군), sub, thread, comment, at, note}
      새 공개 미확인이 생기면(발행기 «작성자에게만 보인다») 같은 파일에 pending 한 줄을 더한다.
판정: ✅ 보임(댓글 id 가 RSS 에 있음) · ✗ 안 보임(RSS 200 인데 없음) · ? 판정 불가(429·오류 — «안 보인다»로 읽지 않는다)
해석: 대조군이 «보임» 이고 의심 건이 «안 보임» → 최근 댓글만 가려진다(계정 단위 필터 가능성↑). 대조군도 «안 보임» → RSS 한계(스레드가 커서 잘림·삭제)를 먼저 의심(MISTAKES #45).
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = ROOT + '/.agent/marketing/reddit-pending.json'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'


def rss(thread):
    req = urllib.request.Request('https://www.reddit.com/comments/%s/.rss?limit=500' % thread, headers={'User-Agent': UA})
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception as e:  # noqa: BLE001
        return 0, str(e)[:80]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gap', type=float, default=30.0, help='요청 사이 간격(초) — 기본 30(10/4 실측: 레딧은 약 분당 2회를 넘으면 429)')
    ap.add_argument('--wait0', type=float, default=0.0, help='첫 요청 전 대기(초) — 방금 429 를 맞았으면 60 이상')
    ap.add_argument('--only', choices=['pending', 'control'])
    a = ap.parse_args()
    reg = json.load(open(REG, encoding='utf-8'))
    ents = [e for e in reg['entries'] if not a.only or e['kind'] == a.only]
    stop = False
    res = []
    for i, e in enumerate(ents):
        if stop:
            res.append((e, '? 미조회(앞에서 429 — 요청 중단)', None)); continue
        if i:
            time.sleep(a.gap)
        elif a.wait0:
            time.sleep(a.wait0)
        st, body = rss(e['thread'])
        if st == 429:   # 429 는 «판정 불가»다 — 60초 쉬고 한 번만 다시 시도, 그래도 429 면 멈춘다
            time.sleep(60)
            st, body = rss(e['thread'])
        if st == 200:
            n = body.count('<entry>')
            found = ('/' + e['comment'] + '/') in body or ('t1_' + e['comment']) in body
            res.append((e, '✅ 보임' if found else '✗ 안 보임', n))
        else:
            res.append((e, '? 판정 불가(HTTP %s)' % st, None))
            if st == 429:
                stop = True
    print('익명 RSS 점검 · 스레드당 1회 · 간격 %.0f초 · %s' % (a.gap, time.strftime('%Y-%m-%d %H:%M:%S')))
    for e, v, n in res:
        print('  [%-7s] r/%-15s 스레드 %-8s 댓글 %-8s %s%s · %s' % (e['kind'], e['sub'], e['thread'], e['comment'], v, ' · RSS 항목 %d' % n if n is not None else '', e.get('at', '')))
    sus = [v for e, v, n in res if e['kind'] == 'pending']
    ctl = [v for e, v, n in res if e['kind'] == 'control']
    def cnt(lst, k):
        return sum(1 for v in lst if v.startswith(k))
    print('요약: 의심 건 보임 %d · 안 보임 %d · 판정 불가 %d / 대조군 보임 %d · 안 보임 %d · 판정 불가 %d' % (cnt(sus, '✅'), cnt(sus, '✗'), cnt(sus, '?'), cnt(ctl, '✅'), cnt(ctl, '✗'), cnt(ctl, '?')))
    if cnt(sus, '✗') and cnt(ctl, '✅'):
        print('→ 대조군은 보이는데 최근 댓글만 가려진다 — 계정 단위 필터 가능성(미확인 가설). 같은 댓글을 더 올리지 않는다.')
    elif cnt(sus, '✗') and cnt(ctl, '✗') and not cnt(ctl, '✅'):
        print('→ 대조군도 안 보인다 — RSS 한계(스레드가 커서 잘림·삭제)를 먼저 의심한다(검사기부터 의심 — MISTAKES #45).')
    elif cnt(sus, '✅') and not cnt(sus, '✗'):
        print('→ 의심 건이 보인다 — 늦게 풀렸다(모드 승인 등). 게이트 해제를 검토한다.')
    elif cnt(sus, '?') or cnt(ctl, '?'):
        print('→ 판정 불가가 있다 — 나중에 다시(레딧 429 는 «안 보인다»가 아니다).')
    sys.exit(0)


if __name__ == '__main__':
    main()
