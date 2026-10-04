// gn-scan — GeekNews(news.hada.io) 홈 + /new 1~N쪽에서 «금융·투자·시장» 관련 글을 찾는다(geeknews_comment 레인의 후보 발굴 · 브라우저 없음 · 읽기 전용).
// 사용: node scripts/gn-scan.mjs [쪽수=3]
// 왜(2026-10-04 18시): geeknews_comment 레인이 4일째 «실행»에 재배정됐는데 스캔 방법이 로그(«브라우저로 /new 1~3쪽»)에만 있었다 → curl 한 번으로 되는 것을 확인(HTML 의 topic_row·topic-title-heading·data-topic-comment-count)해 도구로 옮겼다.
// 규칙: 관련 글이 0 이면 «억지 댓글 금지»(레인 규칙) — 댓글은 무링크·앱명 없이 실측 데이터만, 발행기는 scripts/geeknews-comment.mjs.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const N = Math.max(1, Number(process.argv[2]) || 3);
const pages = ['https://news.hada.io/'];
for (let i = 1; i <= N; i++) pages.push(i === 1 ? 'https://news.hada.io/new' : `https://news.hada.io/new?page=${i}`);
const KW = /주식|투자|금융|증시|옵션|나스닥|엔비디아|NVIDIA|Nvidia|반도체|마이크론|Micron|테슬라|ETF|펀드|금리|연준|Fed|인플레|트레이딩|거래|시장|버블|데이터센터|매출|실적|환율|달러|비트코인|암호|핀테크|증권|공매도|S&P|채권|트레이더|월가|경제/i;
const dec = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const seen = new Map();
for (const url of pages) {
  let t;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ko' } });
    if (!r.ok) { console.log('X', url, r.status); continue; }
    t = await r.text();
  } catch (e) { console.log('X', url, String(e.message).slice(0, 60)); continue; }
  for (const blk of t.split("<div class='topic_row'").slice(1)) {
    const id = (blk.match(/data-topic-state-id='(\d+)'/) || [])[1];
    const title = (blk.match(/topic-title-heading'>([\s\S]*?)<\/h2>/) || [])[1];
    if (!id || !title || seen.has(id)) continue;
    const cm = (blk.match(/data-topic-comment-count='(\d+)'/) || [])[1] ?? '?';
    const age = ((blk.match(/<time[^>]*>([\s\S]*?)<\/time>/) || [])[1] || '?').trim();
    const pts = (blk.match(/<span id='tp\d+'>(\d+)<\/span> point/) || [])[1] ?? '?';
    seen.set(id, { id, title: dec(title).trim(), cm, age, pts });
  }
}
let hit = 0;
for (const o of seen.values()) {
  if (KW.test(o.title)) { hit++; console.log(`★ ${o.id} | ${o.title.slice(0, 90)} | 점수 ${o.pts} | 댓글 ${o.cm} | ${o.age} | https://news.hada.io/topic?id=${o.id}`); }
}
console.log(`총 ${seen.size}개 글 확인 · 금융 키워드 글 ${hit}개${hit ? ' — 읽어 보고 «우리 실측 데이터가 직접 답이 되는 글»만 댓글(무링크·앱명 0)' : ' — 억지 댓글 금지(레인 규칙)'}`);
if (!seen.size) { console.log('⚠ 글을 하나도 못 읽었다 — HTML 구조가 바뀌었는지(topic_row · topic-title-heading) 확인'); process.exit(1); }
