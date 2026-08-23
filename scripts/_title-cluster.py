# -*- coding: utf-8 -*-
# ============================================================================
# _title-cluster — 제목을 «내가 미리 떠올린 패턴» 없이 군집화한다
# ----------------------------------------------------------------------------
# ⛔ 왜 필요한가 (2026-08-23)
#   지금까지 제목 분석을 «정규식» 으로 했다 (vs · Why · 랭킹 · 유명인…).
#   그건 «내가 미리 생각해낸 것만» 검정한다. 내가 못 떠올린 패턴은 영원히 안 보인다.
#   임베딩 군집은 그 제약이 없다 — 제목끼리의 의미 거리로 스스로 묶인다.
#
# 하는 일
#   ① 신규채널 쇼츠 제목을 다국어 임베딩으로 벡터화
#   ② KMeans 로 군집
#   ③ 군집별 «자기 채널 대비 배수» 중앙값과 폭발률을 잰다
#   ④ 이긴 군집의 대표 제목을 뽑아 «무엇인지» 사람이 읽게 한다
#
# ⛔ 주의: 군집은 «상관» 이지 «원인» 이 아니다. 큰 채널이 특정 군집에 몰려 있으면
#   그 채널 덕인지 그 유형 덕인지 못 가른다. 그래서 채널별 정규화(배수)를 쓰고,
#   군집마다 «몇 개 채널에서 왔는지» 를 같이 찍는다. 한 채널이 과반이면 신호가 아니다.
#
# 사용: python scripts/_title-cluster.py [군집수=24] [--jp]
# ============================================================================
import io, json, sys, statistics, collections

# ⛔ Windows 기본 콘솔은 cp949 라 박스문자·일본어가 터진다. UTF-8 로 강제한다.
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

K = 24
POOL = '.agent/_newpool.json'
LABEL = 'US/EN'
for a in sys.argv[1:]:
    if a == '--jp':
        POOL, LABEL = '.agent/_jp_pool.json', 'JP'
    elif a.isdigit():
        K = int(a)

rows = json.load(io.open(POOL, encoding='utf-8'))

# 채널별 중앙값으로 정규화 — 채널 크기 교란을 막는 유일한 방법
by_ch = collections.defaultdict(list)
for v in rows:
    by_ch[v['ch']].append(v)

items = []
for ch, vs in by_ch.items():
    if len(vs) < 10:
        continue
    med = statistics.median([x['v'] for x in vs]) or 1
    for x in vs:
        if 4 <= x['sec'] <= 95 and len(x['t'].strip()) >= 6:
            items.append({'t': x['t'], 'ch': ch, 'rel': x['v'] / med, 'v': x['v'], 'sec': x['sec'], 'id': x.get('id','')})

print('  %s 쇼츠 %d편 · 채널 %d곳' % (LABEL, len(items), len(set(i['ch'] for i in items))))

from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
import numpy as np

# 다국어 모델 — 영어·일본어를 같은 공간에 놓아야 나중에 교차 비교가 된다
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
print('  임베딩 중...')
emb = model.encode([i['t'] for i in items], batch_size=128, show_progress_bar=False,
                   normalize_embeddings=True)

km = KMeans(n_clusters=K, n_init=8, random_state=0).fit(emb)
for i, lab in zip(items, km.labels_):
    i['k'] = int(lab)

overall_hit = sum(1 for i in items if i['rel'] >= 15) / len(items) * 100

out = []
for k in range(K):
    g = [i for i in items if i['k'] == k]
    if len(g) < 25:
        continue
    chs = collections.Counter(i['ch'] for i in g)
    top_ch, top_n = chs.most_common(1)[0]
    out.append({
        'k': k, 'n': len(g),
        'med': statistics.median([i['rel'] for i in g]),
        'hit': sum(1 for i in g if i['rel'] >= 15) / len(g) * 100,
        'chans': len(chs),
        'conc': top_n / len(g) * 100,          # 1위 채널 집중도 — 과반이면 신호 아님
        'ex': [i['t'] for i in sorted(g, key=lambda x: -x['rel'])[:3]],
        'top': sorted(g, key=lambda x: -x['v'])[:12],
    })

out.sort(key=lambda o: -o['hit'])
print('\n  ══ 군집별 성과 (전체 폭발률 %.1f%%) ══' % overall_hit)
print('   폭발률  배수중앙   편수  채널수  1위채널비중')
for o in out:
    flag = '  <= 한 채널 편중' if o['conc'] >= 50 else ''
    print('   %5.1f%%  %7.2f  %5d  %5d  %8.0f%%%s'
          % (o['hit'], o['med'], o['n'], o['chans'], o['conc'], flag))

print('\n  ══ 상위 군집의 실제 제목 (편중 50%% 미만만) ══')
for o in [x for x in out if x['conc'] < 50][:6]:
    print('\n   ── 폭발률 %.1f%% · %d편 · %d채널 ──' % (o['hit'], o['n'], o['chans']))
    for t in o['ex']:
        print('      ' + t[:66])

print('\n  ══ 하위 군집 (피해야 할 것) ══')
for o in [x for x in out if x['conc'] < 50][-3:]:
    print('\n   ── 폭발률 %.1f%% · %d편 · %d채널 ──' % (o['hit'], o['n'], o['chans']))
    for t in o['ex']:
        print('      ' + t[:66])

# ── 특정 군집의 «내려받을 목록» 을 뽑는다 ────────────────────────────────────
#   python scripts/_title-cluster.py 24 --dump=7.1   → 폭발률 7.1% 군집의 상위 영상
dump = next((a.split('=')[1] for a in sys.argv[1:] if a.startswith('--dump=')), None)
if dump:
    target = min(out, key=lambda o: abs(o['hit'] - float(dump)))
    print('\n  ══ 폭발률 %.1f%% 군집 · 내려받을 목록 ══' % target['hit'])
    print('   (편수 %d · 채널 %d · 1위채널비중 %.0f%%)' % (target['n'], target['chans'], target['conc']))
    seen = set()
    for i in target['top']:
        if i['ch'] in seen:      # 채널당 1편 — 한 채널 특성이 아니라 «유형» 을 보려면
            continue
        seen.add(i['ch'])
        print('   %s  %8s회  %2d초  %-16s %s'
              % (i['id'], format(i['v'], ','), i['sec'], i['ch'][:16], i['t'][:44]))
