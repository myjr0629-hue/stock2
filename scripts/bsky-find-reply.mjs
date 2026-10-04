// bsky-find-reply — bluesky_reply 대상 찾기(무로그인 공개 API). 큰 금융 계정의 최근 90분 글 중 시장 키워드 글을 팔로워 수와 함께 나열한다.
// (2026-09-30 01시 사이클 정본화 — 그전엔 매 사이클 임시 스크립트를 새로 썼다.) 사용: node scripts/bsky-find-reply.mjs
// 규칙(channels.json bluesky_reply): 게시 1시간 안 · 링크·예측 없음 · 같은 문장 재사용 금지 · 하루 2편. 발행: node scripts/bsky-publish.mjs --text-file <답.txt> --reply-to <at-uri>
// ★2026-10-04 18시: 목록의 8개 핸들이 getAuthorFeed 400(«Profile not found»)이라 후보 풀이 조용히 줄어 있었다 → ft.com→financialtimes.com · finance.yahoo.com→yahoofinance.com · business.financialpost.com→financialpost.com · paulkrugman→pkrugman 로 교체, 찾을 수 없는 4개(lisaabramowicz·jenniferschonberger·jonsindreu·matthewcklein) 제거, axios.com 중복 제거. 핸들이 바뀌면 아래 «X 핸들 무효» 줄이 나온다 — 그때 searchActors 로 새 핸들을 찾아 고친다.
const actors = ['sherwood.news', 'semafor.com', 'businessinsider.com', 'economist.com', 'axios.com', 'politico.com', 'thehill.com', 'cnn.com', 'washingtonpost.com', 'bloomberg.bsky.social', 'markets.bsky.social', 'neilirwin.bsky.social', 'jeannasmialek.bsky.social', 'nickbunker.bsky.social', 'guyberger.bsky.social', 'ernietedeschi.bsky.social', 'skanda.bsky.social', 'bencasselman.bsky.social', 'justinwolfers.bsky.social', 'dampedspring.bsky.social', 'carlquintanilla.bsky.social', 'cnbc.com', 'fortune.com', 'reuters.com', 'wsj.com', 'financialtimes.com', 'bloomberg.com', 'marketwatch.com', 'financialpost.com', 'apnews.com', 'nytimes.com', 'barrons.com', 'yahoofinance.com', 'morningbrew.bsky.social', 'josephpolitano.bsky.social', 'jasonfurman.bsky.social', 'pkrugman.bsky.social', 'nickwiggins.bsky.social', 'conorsen.bsky.social', 'michaelsantoli.bsky.social', 'zatapatique.bsky.social', 'employamerica.bsky.social', 'tbpn.bsky.social', 'ritholtz.bsky.social', 'thestalwart.bsky.social', 'dkthomp.bsky.social'];
const KW = /(yield|treasur|bond|stock|s&p|nasdaq|dow|fed\b|rate hike|hike|market|oil|consumer confidence|semiconductor|chip|nvidia|micron|earnings|30-year|10-year|shares)/i;
const now = Date.now();
const out = [];
let bad = 0;
for (const a of actors) {
  try {
    const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${a}&limit=15&filter=posts_no_replies`);
    if (!r.ok) { console.log('X', a, r.status, r.status === 400 ? '— 핸들 무효(Profile not found): 목록에서 고칠 것' : ''); bad++; continue; }
    const j = await r.json();
    for (const it of j.feed || []) {
      const p = it.post; if (it.reason) continue;
      const t = new Date(p.record.createdAt).getTime(); const ageMin = Math.round((now - t) / 60000);
      if (ageMin > 90) continue;
      const text = p.record.text || '';
      if (!KW.test(text)) continue;
      out.push({ a, ageMin, likes: p.likeCount, replies: p.replyCount, uri: p.uri, text: text.slice(0, 260).replace(/\n/g, ' ') });
    }
  } catch (e) { console.log('ERR', a, e.message); }
}
// followers
const handles = [...new Set(out.map(o => o.a))];
const fol = {};
for (let i = 0; i < handles.length; i += 25) {
  const q = handles.slice(i, i + 25).map(h => 'actors=' + h).join('&');
  const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles?${q}`); const j = await r.json();
  for (const p of j.profiles || []) fol[p.handle] = p.followersCount;
}
out.sort((x, y) => x.ageMin - y.ageMin);
for (const o of out) console.log(`${o.ageMin}m | ${o.a} (${fol[o.a]}) | ♥${o.likes} ↩${o.replies} | ${o.uri}\n    ${o.text}`);
console.log(bad ? `⚠ 무효 핸들 ${bad}개 — 위 «X» 줄을 searchActors 로 새 핸들을 찾아 고칠 것` : `✓ 핸들 ${actors.length}개 전부 유효`);
