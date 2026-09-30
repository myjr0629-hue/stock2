# -*- coding: utf-8 -*-
"""네이버 블로그(donneum) 카테고리·주제 감사 — 브라우저 없음·비로그인 (2026-09-30, HANDOFF §4 0-za)

왜: 발행기가 카테고리를 고르지 않아 9/21~9/30 금융 글 23편이 첫 칸 «여행»·주제 없음으로 올라가 있었다
    (네이버 주제 피드 «비즈니스·경제»에 한 번도 못 들어감). 발행기는 이제 투자·비즈니스·경제를 강제하지만,
    «조용히 틀리는» 종류라 매 발행 뒤·주 1회 이 감사로 다시 잰다.

사용: python3 scripts/naver-blog-audit.py [--since 2026-09-18] [--json 출력.json]
  · 공개 API(m.blog.naver.com/api/blogs/donneum/post-list)로 전 카테고리 글을 읽고,
  · since 이후 글마다 PostView 의 categoryNo·var postTopics.directory_name 을 확인한다.
  · 투자(7)·비즈니스·경제가 아닌 글이 있으면 목록을 찍고 종료 코드 1 → 고치기: scripts/naver-blog-recategorize.mjs
"""
import json, re, sys, time, datetime, urllib.request

BLOG, WANT_CAT, WANT_TOPIC = 'donneum', '7', '비즈니스·경제'
M = {'Referer': f'https://m.blog.naver.com/{BLOG}', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'}
PC = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}


def get(url, headers):
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25).read().decode('utf-8', 'ignore')


def main():
    args = sys.argv[1:]
    since = args[args.index('--since') + 1] if '--since' in args else '2026-09-18'
    out = args[args.index('--json') + 1] if '--json' in args else None
    cats = json.loads(get(f'https://m.blog.naver.com/api/blogs/{BLOG}/category-list', M))['result']['mylogCategoryList']
    print('카테고리 글 수:', ', '.join(f"{c['categoryName']}({c['categoryNo']}) {c['postCnt']}" for c in cats))
    t0 = datetime.datetime.fromisoformat(since).timestamp() * 1000
    posts = []
    for c in cats:
        for p in range(1, 10):
            items = json.loads(get(f'https://m.blog.naver.com/api/blogs/{BLOG}/post-list?categoryNo={c["categoryNo"]}&itemCount=30&page={p}', M)).get('result', {}).get('items', [])
            posts += [x for x in items if (x.get('addDate') or 0) >= t0]
            if len(items) < 30 or (items and (items[-1].get('addDate') or 0) < t0):
                break
    bad, rows = [], []
    for x in sorted(posts, key=lambda x: -(x.get('addDate') or 0)):
        n = str(x['logNo'])
        s = get(f'https://blog.naver.com/PostView.naver?blogId={BLOG}&logNo={n}', PC)
        cat = (re.search(r'blog2_series[\s\S]{0,300}?categoryNo=(\d+)', s) or re.search(r'categoryNo=(\d+)', s) or [None, None])[1]  # 글 위 카테고리 링크
        t = re.search(r'var postTopics = (\{.*?\});', s)
        topic = (json.loads(t.group(1)) if t else {}).get('directory_name') or ''
        r = {'logNo': n, 'date': datetime.datetime.fromtimestamp(x['addDate'] / 1000).strftime('%m-%d %H:%M'), 'categoryNo': cat, 'topic': topic,
             'title': (x.get('titleWithInspectMessage') or '')[:50]}
        rows.append(r)
        if cat != WANT_CAT or topic != WANT_TOPIC:
            bad.append(r)
        time.sleep(0.3)
    print(f'{since} 이후 {len(rows)}편 · 투자·비즈니스·경제 아님 {len(bad)}편')
    for r in bad:
        print('  ✗', r['date'], r['logNo'], f"cat={r['categoryNo']} topic={r['topic'] or '(없음)'}", r['title'])
    if out:
        json.dump({'at': datetime.datetime.now().isoformat(timespec='minutes'), 'rows': rows, 'bad': bad}, open(out, 'w'), ensure_ascii=False, indent=1)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
