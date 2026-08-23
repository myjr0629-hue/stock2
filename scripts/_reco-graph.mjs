#!/usr/bin/env node
// ============================================================================
// _reco-graph — 「우리 영상을 본 사람에게 유튜브가 다음에 무엇을 띄우는가」
// ----------------------------------------------------------------------------
// ⛔ 왜 필요한가 (2026-08-23)
//   공식 Data/Analytics API 는 «우리 채널 데이터» 만 준다. 남의 눈에 우리가 어떻게
//   보이는지는 못 본다. 그래서 「알고리즘이 우리를 어느 시청자 풀에 묶었는가」를
//   지금까지 한 번도 확인하지 못했다.
//
//   InnerTube (youtubei.js) 는 실제 앱이 받는 응답을 그대로 준다.
//   그 안의 watch_next_feed 가 곧 «이 영상 다음에 띄우는 것» 이다.
//
// ⛔ 한계를 먼저 적는다 — 이걸로 답이 다 나오지 않는다
//   쇼츠는 «연관영상 클릭» 이 아니라 알고리즘이 강제로 띄우는 피드 스트림이다.
//   그래서 watch_next_feed 는 «롱폼식 연관» 에 가깝고, 쇼츠 피드 배포와 같지 않다.
//   ⇒ 이 도구가 답하는 것은 «분류(어느 무리에 묶였나)» 이지 «배포량» 이 아니다.
//     배포량이 0 인 문제(우리 일본 채널)는 이걸로 못 고친다.
//
// 사용:
//   node scripts/_reco-graph.mjs <videoId> [<videoId>...]
//   node scripts/_reco-graph.mjs <videoId> --lang=ja --loc=JP
//   node scripts/_reco-graph.mjs <videoId> --depth=2      2차 추천까지 (느리다)
// ============================================================================
import { Innertube } from 'youtubei.js';

const args = process.argv.slice(2);
const IDS = args.filter((a) => !a.startsWith('--'));
const arg = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const LANG = arg('lang', 'en');
const LOC = arg('loc', 'US');
const DEPTH = +arg('depth', 1);

if (!IDS.length) {
  console.error('사용: node scripts/_reco-graph.mjs <videoId> [--lang=ja] [--loc=JP] [--depth=2]');
  process.exit(1);
}

const yt = await Innertube.create({ lang: LANG, location: LOC, retrieve_player: false });

/** LockupView 에서 «쓸 수 있는 것» 만 꺼낸다 — 구조가 자주 바뀌므로 방어적으로 판다 */
function pull(node) {
  const id = node?.content_id ?? null;
  // metadata 안의 텍스트를 통째로 훑어 제목·채널을 찾는다 (경로가 버전마다 다르다)
  const texts = [];
  const walk = (o, d = 0) => {
    if (!o || d > 6) return;
    if (typeof o === 'string') { if (o.length > 1) texts.push(o); return; }
    if (Array.isArray(o)) return o.forEach((x) => walk(x, d + 1));
    if (typeof o === 'object') {
      if (typeof o.content === 'string') texts.push(o.content);
      if (typeof o.text === 'string') texts.push(o.text);
      for (const k of Object.keys(o)) {
        if (k === 'image' || k === 'renderer_context' || k === 'thumbnail') continue;
        walk(o[k], d + 1);
      }
    }
  };
  walk(node?.metadata);
  const uniq = [...new Set(texts)].filter((t) => !/^(再生リスト|Playlist|LIVE|ライブ)$/i.test(t));
  return {
    id,
    title: uniq[0] || '',
    channel: uniq.find((t, i) => i > 0 && !/回視聴|views|前|ago|万|K$|M$/.test(t)) || '',
    raw: uniq.slice(0, 4),
  };
}

/** 이 영상이 «어떤 무리» 에 묶였는지 한 줄로 판정한다 */
const FIN = /(株|投資|NISA|資産|配当|円安|日経|米国株|ドル|金利|決算|銘柄|証券|お金|年収|税|経済|市場|stock|invest|market|money|finance|trading|etf|crypto|bitcoin|earnings|fed|nasdaq|dividend)/i;

async function probe(id, label) {
  let info;
  try { info = await yt.getInfo(id); }
  catch (e) { console.log(`  ${label} ✗ ${String(e.message).slice(0, 60)}`); return null; }
  const b = info.basic_info;
  const feed = (info.watch_next_feed || []).map(pull).filter((x) => x.id);
  const fin = feed.filter((x) => FIN.test(x.title + ' ' + x.channel));

  console.log(`\n  ══ ${label} ══`);
  console.log(`   ${(b.title || '').slice(0, 50)}`);
  console.log(`   조회 ${b.view_count} · 길이 ${b.duration}초 · ${b.channel?.name || ''}`);
  console.log(`   추천 ${feed.length}개 중 «금융 관련» ${fin.length}개  (${feed.length ? (fin.length / feed.length * 100).toFixed(0) : 0}%)`);
  if (feed.length) {
    console.log('   ── 다음에 띄우는 것 (상위 8) ──');
    feed.slice(0, 8).forEach((x, i) => {
      const mark = FIN.test(x.title + ' ' + x.channel) ? '금융' : '  · ';
      console.log(`     ${String(i + 1).padStart(2)}. ${mark} ${String(x.channel).slice(0, 16).padEnd(18)}${String(x.title).slice(0, 40)}`);
    });
  }
  return { id, feed, fin: fin.length, total: feed.length };
}

const roots = [];
for (const id of IDS) roots.push(await probe(id, id));

// ── 2차 추천 — 「우리 시청자가 두 단계 뒤에 어디로 흘러가는가」 ──────────────
if (DEPTH >= 2) {
  for (const r of roots.filter(Boolean)) {
    console.log(`\n  ══ ${r.id} 의 2차 추천 (상위 3개 노드) ══`);
    let t = 0, f = 0;
    for (const child of r.feed.slice(0, 3)) {
      const c = await probe(child.id, `  └ ${String(child.title).slice(0, 30)}`);
      if (c) { t += c.total; f += c.fin; }
    }
    console.log(`\n   2차 합계: ${t}개 중 금융 ${f}개 (${t ? (f / t * 100).toFixed(0) : 0}%)`);
  }
}

console.log('\n  ⛔ 이 수치는 «분류» 를 말하지 «배포량» 을 말하지 않는다.');
console.log('     쇼츠는 연관영상 클릭이 아니라 피드 스트림이라, 여기서 금융 100% 여도');
console.log('     씨앗 노출이 0 이면 조회는 0 이다. 두 문제는 별개다.');
