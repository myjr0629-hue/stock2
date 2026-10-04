#!/usr/bin/env python3
"""naver-public-para — 네이버 블로그 글의 «비로그인 공개 본문»을 지문으로 읽는다(수정 발행 전후 대조용).

사용: python3 scripts/naver-public-para.py <logNo> [--find '문단 첫 글자들'] [--save 파일.json] [--cmp 파일.json]
  · 로그인 없이 PostView.naver 를 가져와 제목·본문 문단 목록·이미지 수·앱 링크(from=naver_blog)·카테고리 번호·주제를 뽑는다.
  · --find: 그 글자로 시작하는 문단 전문을 출력한다(고친 문장이 공개에 보이는지).
  · --save: 지문(JSON)을 저장한다 · --cmp: 저장한 지문과 비교해 «바뀐 문단 번호»와 나머지 항목(제목·이미지·링크·카테고리·주제) 변화를 출력한다.
  · 읽기만 한다(클릭 없음) — 앱 링크를 «열지» 않는다(MISTAKES #51: 점검 클릭이 우리 클릭 카운터를 오염).
2026-10-04 신설 — MISTAKES #62 정정 후 «본문 문단 하나만 바뀌었다»를 증명하려고.
"""
import sys, re, json, html, hashlib, urllib.request

def fetch(log_no):
    url = f'https://blog.naver.com/PostView.naver?blogId=donneum&logNo={log_no}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache'})
    return urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')

def clean(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s)).replace('​', '')).strip()

def fingerprint(t):
    ps = [clean(p) for p in re.findall(r'<p[^>]*class="se-text-paragraph[^"]*"[^>]*>(.*?)</p>', t, flags=re.S)]
    ps = [p for p in ps if p]
    title = clean((re.findall(r'<meta property="og:title" content="(.*?)"', t) or [''])[0])
    imgs = len(re.findall(r'se-image-resource', t))
    links = sorted(set(re.findall(r'signumhq\.com/app[^"\'<> ]*from(?:=|&#x3D;|&amp;#x3D;)naver_blog[^"\'<> ]*', t)))
    cat = (re.search(r'blog2_series[\s\S]{0,300}?categoryNo=(\d+)', t) or re.search(r'categoryNo=(\d+)', t) or [None, ''])[1]
    m = re.search(r'var postTopics = (\{.*?\});', t)
    topic = ''
    try:
        topic = json.loads(m.group(1)).get('directory_name', '') if m else ''
    except Exception:
        pass
    return {
        'title': title, 'images': imgs, 'links': links, 'categoryNo': cat, 'topic': topic,
        'n': len(ps), 'paras': ps, 'hashes': [hashlib.md5(p.encode()).hexdigest()[:8] for p in ps],
    }

def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(2)
    log_no = a[0]
    opt = {}
    i = 1
    while i < len(a):
        if a[i] in ('--find', '--save', '--cmp') and i + 1 < len(a):
            opt[a[i]] = a[i + 1]; i += 2
        else:
            i += 1
    fp = fingerprint(fetch(log_no))
    print(f"logNo {log_no} · 제목 «{fp['title'][:40]}» · 문단 {fp['n']} · 이미지 {fp['images']} · 앱 링크 {len(fp['links'])} · 카테고리 {fp['categoryNo']} · 주제 {fp['topic']}")
    if '--find' in opt:
        hits = [(j, p) for j, p in enumerate(fp['paras']) if p.startswith(opt['--find'])]
        for j, p in hits:
            print(f'  [문단 {j}] {p}')
        if not hits:
            print('  (그 글자로 시작하는 문단 없음)')
    if '--save' in opt:
        json.dump(fp, open(opt['--save'], 'w'), ensure_ascii=False)
        print('지문 저장:', opt['--save'])
    if '--cmp' in opt:
        old = json.load(open(opt['--cmp']))
        changed = [j for j in range(max(len(old['paras']), len(fp['paras']))) if (old['paras'][j] if j < len(old['paras']) else None) != (fp['paras'][j] if j < len(fp['paras']) else None)]
        print('바뀐 문단 번호:', changed)
        for k in ('title', 'images', 'links', 'categoryNo', 'topic', 'n'):
            print(f"  {k}: {'동일' if old[k] == fp[k] else '변화 ' + str(old[k])[:60] + ' → ' + str(fp[k])[:60]}")

if __name__ == '__main__':
    main()
