# -*- coding: utf-8 -*-
"""GitHub awesome-list PR 상태 읽기 — 관리자 댓글·닫힘·병합을 «회차가 직접» 본다 (2026-10-05 15시 회차 신설 · MISTAKES #97)

왜: wilsonfreitas/awesome-quant #648(★29.5K) 에 관리자가 9/12 22:30(UTC) «무료 등급 증빙 요청» 리뷰 댓글을 남겼는데 23일 동안 아무도 읽지 않았다 —
    channels.json 노트가 «4건 전부 open·지적사항 0» 이었고 새 댓글을 읽는 도구가 없었다. jplock #128 은 10/4 17:47 UTC 에 «established fintech
    companies 만» 이라며 닫혔는데 그것도 기록에 없었다. 열려 있는 외부 PR 은 «내가 안 보면 아무도 안 본다».
사용: python3 scripts/github-pr-status.py            (전체: 열림·병합·닫힘 + 답 필요 줄)
      python3 scripts/github-pr-status.py --brief    (cycle-orient 용 — 한 줄씩, «답 필요»만 앞에)
      python3 scripts/github-pr-status.py --fresh    (캐시 무시)
      python3 scripts/github-pr-status.py --selftest (판정 로직 양성·음성 대조군 6개 — 네트워크 없음)
읽기 전용 · 공개 API(비로그인, 시간당 60회 한도 — PR 7건이면 한 번에 약 15회라 20분 캐시 ~/signum-ego-io/gh-pr-status-cache.json).
한도·네트워크 실패는 «판독 실패»로 적는다 — «없음·0» 으로 적지 않는다(MISTAKES #18·#45).
답 필요 = 열린 PR 에서 «사람(봇 제외)이 쓴 내 계정 아닌» 마지막 댓글·리뷰가 내 마지막 댓글보다 늦거나, 내 댓글이 아예 없는데 남의 글이 있을 때.
답하는 도구: scripts/ego/github-pr-comment.mjs (로그인 세션 · 줄바꿈은 insertText 의 \\n · 작업 파일 gh-comment-task.json).
"""
import datetime
import json
import os
import re
import sys
import urllib.request

ME = 'myjr0629-hue'
HDR = {'User-Agent': 'signum-gh-status', 'Accept': 'application/vnd.github+json'}
CACHE = os.path.expanduser('~/signum-ego-io/gh-pr-status-cache.json')
TTL_MIN = 20


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def kst(iso):
    d = datetime.datetime.strptime(iso, '%Y-%m-%dT%H:%M:%SZ') + datetime.timedelta(hours=9)
    return d.strftime('%m-%d %H:%M')


def clip(t, n):
    t = re.sub(r'\s+', ' ', t or '').strip()
    return t if len(t) <= n else t[: n - 1] + '…'


def needs(ev, status):
    """(답 필요, 사람 글 목록, 내 글 목록) — ev = [(ISO 시각, 작성자, 본문, 종류)]"""
    ev = sorted(ev)
    humans = [e for e in ev if e[1] != ME and not e[1].endswith('[bot]')]
    mine = [e for e in ev if e[1] == ME]
    return bool(humans) and (not mine or humans[-1][0] > mine[-1][0]) and status == '열림', humans, mine


def selftest():
    """양성·음성 대조군(MISTAKES #75·#96 — 새 판정기는 «이미 아는 정답»으로 먼저 시험한다)"""
    t = lambda s, o: '2026-09-%02dT00:00:00Z' % s  # noqa: E731
    cases = [
        ('관리자 글 뒤 내 답 없음 → 필요', [(t(12, 0), 'maint', 'x', 'comment')], '열림', True),
        ('내 답이 더 늦다 → 불필요', [(t(12, 0), 'maint', 'x', 'comment'), (t(13, 0), ME, 'y', 'comment')], '열림', False),
        ('내 답 뒤 관리자 재질문 → 필요', [(t(12, 0), 'maint', 'x', 'comment'), (t(13, 0), ME, 'y', 'comment'), (t(14, 0), 'maint', 'z', 'review')], '열림', True),
        ('봇 글만 → 불필요', [(t(12, 0), 'github-actions[bot]', 'x', 'comment')], '열림', False),
        ('닫힌 PR 은 답 대상 아님', [(t(12, 0), 'maint', 'x', 'comment')], '닫힘', False),
        ('댓글 없음 → 불필요', [], '열림', False),
    ]
    bad = 0
    for name, ev, st, want in cases:
        got = needs(ev, st)[0]
        print(('✓ ' if got == want else '✗ ') + name + ' (기대 %s · 결과 %s)' % (want, got))
        bad += got != want
    print('자체 시험 %d/%d 통과' % (len(cases) - bad, len(cases)))


def collect():
    res = get('https://api.github.com/search/issues?q=author:%s+type:pr&per_page=50&sort=updated' % ME)
    rows = []
    for it in res.get('items', []):
        repo = it['repository_url'].split('/repos/')[-1]
        n = it['number']
        merged = bool((it.get('pull_request') or {}).get('merged_at'))
        status = '병합' if merged else ('닫힘' if it['state'] == 'closed' else '열림')
        ev = []   # (시각, 작성자, 본문, 종류)
        if it.get('comments', 0) > 0:
            for c in get(it['comments_url'] + '?per_page=100'):
                ev.append((c['created_at'], c['user']['login'], c.get('body') or '', 'comment'))
        if status == '열림':   # 리뷰·줄 댓글은 issue 댓글 수에 안 잡힌다 — 열린 PR 만 추가로 읽는다
            for rv in get('https://api.github.com/repos/%s/pulls/%d/reviews?per_page=100' % (repo, n)):
                if rv.get('body'):
                    ev.append((rv['submitted_at'], rv['user']['login'], rv['body'], 'review'))
            for rc in get('https://api.github.com/repos/%s/pulls/%d/comments?per_page=100' % (repo, n)):
                ev.append((rc['created_at'], rc['user']['login'], rc.get('body') or '', 'line'))
        need, humans, mine = needs(ev, status)
        rows.append({'repo': repo, 'n': n, 'status': status, 'title': it['title'], 'updated': it['updated_at'], 'url': it['html_url'],
                     'ncom': len(ev), 'need': need,
                     'last_other': ({'at': humans[-1][0], 'who': humans[-1][1], 'kind': humans[-1][3], 'text': clip(humans[-1][2], 160)} if humans else None),
                     'last_mine': ({'at': mine[-1][0]} if mine else None)})
    return {'at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'rows': rows}


def load(fresh):
    try:
        if not fresh and os.path.exists(CACHE):
            age = (datetime.datetime.now().timestamp() - os.path.getmtime(CACHE)) / 60
            if age < TTL_MIN:
                return json.load(open(CACHE, encoding='utf-8')), True
    except Exception:  # noqa: BLE001
        pass
    data = collect()
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(data, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    except Exception:  # noqa: BLE001
        pass
    return data, False


def main():
    if '--selftest' in sys.argv:
        return selftest()
    brief = '--brief' in sys.argv
    try:
        data, cached = load('--fresh' in sys.argv)
    except Exception as e:  # noqa: BLE001
        print('판독 실패 — GitHub 공개 API: %s (한도·네트워크 — «PR 이 조용하다»는 뜻이 아니다)' % clip(str(e), 120))
        return
    rows = data['rows']
    cnt = {k: sum(1 for r in rows if r['status'] == k) for k in ('열림', '병합', '닫힘')}
    print('GitHub PR(%s · 공개 API) %d건 — 열림 %d · 병합 %d · 닫힘 %d · 판독 %s KST%s' % (
        ME, len(rows), cnt['열림'], cnt['병합'], cnt['닫힘'], kst(data['at']), ' (캐시)' if cached else ''))
    need = [r for r in rows if r['need']]
    for r in need:
        o = r['last_other']
        print('  ⚠ 답 필요 %s#%d — %s %s(%s) «%s» · 내 마지막 답: %s → %s' % (
            r['repo'], r['n'], o['who'], kst(o['at']), o['kind'], o['text'], kst(r['last_mine']['at']) if r['last_mine'] else '없음', r['url']))
    if not need:
        print('  (답이 필요한 열린 PR 없음 — 사람 댓글이 없거나 내가 마지막으로 답했다)')
    for r in rows:
        if r['need']:
            continue
        line = '  %s %s#%d · 댓글 %d · 갱신 %s' % (r['status'], r['repo'], r['n'], r['ncom'], kst(r['updated'])[:5])
        if r['status'] != '열림' and r['last_other']:
            line += ' — %s: «%s»' % (r['last_other']['who'], clip(r['last_other']['text'], 90))
        elif r['status'] == '열림' and r['last_other'] and not brief:
            line += ' — 마지막 남의 글 %s %s «%s»(내가 답함)' % (r['last_other']['who'], kst(r['last_other']['at']), clip(r['last_other']['text'], 70))
        print(line)


main()
