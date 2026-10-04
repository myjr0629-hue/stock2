#!/usr/bin/env node
/* ============================================================================
 * reddit-rules — 서브 규칙 원문을 «올리기 직전에» 로그인 세션으로 읽는다 (2026-10-03 만듦)
 *
 * 왜: 10/3 레딧 댓글 전에 규칙을 읽으려 curl 을 썼더니 403(레딧이 비브라우저 요청을 막는다).
 *     발행기(reddit-comment.mjs)의 BANNED 목록은 9/30 에 저장한 규칙이다 — 3일 뒤 규칙이 바뀌었는지는 «지금» 읽어야 안다.
 *     (MISTAKES-LOG #16: 새 서브·바뀐 서브는 rules.json AI 규칙부터)
 *
 * 사용: ~/signum-ego-io/<KST 날짜>/reddit-rules-task.json = {"subs":["IndiaInvestments"],"threads":["t3_1wn6wgp"],"find":"Show II"}
 *       bash scripts/ego-run.sh scripts/ego/reddit-rules.mjs 150
 * 출력: 규칙 전문 + AI·봇·링크·홍보 키워드 표시 + 스레드 제목·댓글 수·잠김 + 스레드 본문.
 *       결과 JSON = ~/signum-ego-io/<KST 날짜>/reddit-rules-live.json   (읽기 전용 — 쓰는 것 없음)
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const TASK = await L.taskPath('reddit-rules-task.json');
const T = JSON.parse(fs.readFileSync(TASK, 'utf8'));
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('작업공간을 못 잡았다 — 대표가 쓰는 중일 수 있다'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /reddit/, null);
try { await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' }); } catch { /* 느려도 그려진다 */ }
await L.wait(6000);
const out = await page.evaluate(async (cfg) => {
  const res = { subs: {}, threads: {}, found: [] };
  const get = async (u) => { try { const r = await fetch(u, { credentials: 'include' }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, j: null }; } } catch (e) { return { s: 0, err: String(e.message).slice(0, 80) }; } };
  for (const s of cfg.subs || []) {
    const a = await get('https://www.reddit.com/r/' + s + '/about/rules.json');
    res.subs[s] = { status: a.s, rules: ((a.j && a.j.rules) || []).map((r) => ({ n: r.short_name, d: (r.description || '').replace(/\s+/g, ' ') })) };
    const b = await get('https://www.reddit.com/r/' + s + '/about.json');
    res.subs[s].about = b.j && b.j.data ? { subscribers: b.j.data.subscribers, type: b.j.data.subreddit_type, desc: (b.j.data.public_description || '').slice(0, 300) } : null;
    if (cfg.find) {
      const c = await get('https://www.reddit.com/r/' + s + '/search.json?q=' + encodeURIComponent(cfg.find) + '&restrict_sr=1&sort=new&limit=5');
      res.found = ((c.j && c.j.data && c.j.data.children) || []).map((x) => ({ id: x.data.name, title: x.data.title, author: x.data.author, created: new Date(x.data.created_utc * 1000).toISOString(), stickied: x.data.stickied, comments: x.data.num_comments, locked: x.data.locked }));
    }
  }
  for (const t of cfg.threads || []) {
    const c = await get('https://www.reddit.com/api/info.json?id=' + t);
    const d = c.j && c.j.data && c.j.data.children && c.j.data.children[0] && c.j.data.children[0].data;
    res.threads[t] = d ? { sub: d.subreddit, title: d.title, author: d.author, created: new Date(d.created_utc * 1000).toISOString(), comments: d.num_comments, locked: d.locked, archived: d.archived, stickied: d.stickied, text: (d.selftext || '').slice(0, 3500) } : { status: c.s };
  }
  return res;
}, T);
const FLAG = { AI: /\b(AI|A\.I\.|LLM|ChatGPT|GPT|generated|machine[- ]written|bots?)\b/i, 링크: /\b(links?|urls?|http|referral|affiliate)\b/i, 홍보: /promot|advertis|self[- ]?promo|spam/i };
for (const [s, v] of Object.entries(out.subs)) {
  console.log('\n══ r/' + s + ' · 규칙 ' + v.rules.length + '개 · http ' + v.status + ' · 구독자 ' + (v.about ? v.about.subscribers : '?'));
  let aiHit = 0;
  for (const r of v.rules) {
    const f = Object.entries(FLAG).filter(([, re]) => re.test(r.n + ' ' + r.d)).map(([k]) => k);
    if (f.includes('AI')) aiHit++;
    console.log(' - [' + f.join('·') + '] ' + r.n + ' :: ' + r.d.slice(0, 420));
  }
  console.log(' ▶ AI·봇 키워드가 걸린 규칙: ' + aiHit + '개 (0 이어도 «작성 금지»가 없다는 뜻은 아니다 — 위 원문을 읽고 판단)');
}
if (out.found.length) { console.log('\n── 검색 «' + T.find + '» 최신 ──'); for (const f of out.found) console.log(' ', JSON.stringify(f)); }
for (const [t, v] of Object.entries(out.threads)) console.log('\n── 스레드 ' + t + ' ──\n' + JSON.stringify({ ...v, text: undefined }) + '\n' + (v.text || ''));
fs.writeFileSync(L.ioDir() + '/reddit-rules-live.json', JSON.stringify(out, null, 1));
console.log('\n저장:', L.ioDir() + '/reddit-rules-live.json');
