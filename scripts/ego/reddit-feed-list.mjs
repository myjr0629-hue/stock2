#!/usr/bin/env node
/* ============================================================================
 * reddit-feed-list — 레딧 «새 글» 에서 댓글 후보를 «읽기만» 한다 (2026-10-04 14시 회차 신설 · 클릭·쓰기·투표 없음)
 *
 * 왜: 레딧 댓글 레인(reddit)은 발행기(reddit-comment.mjs)·규칙 조회기(reddit-rules.mjs)는 있는데 «어느 스레드에 달까»를 찾는 도구가 없어
 *     매번 즉석 스크립트로 찾았다(§39 «갱신/발굴 도구 없음» 과 같은 종류). 9/24 실측: 늦은 최상위 댓글(댓글 50개 이상·게시 4~8시간 뒤)은 점수 1 로 안 읽힌다
 *     → «게시 2시간 안·댓글 50개 미만» 으로 거른다. 같은 스레드 중복 금지(발행기가 거부)도 미리 표시한다.
 * 쓰는 것: 로그인된 페이지 안에서 /r/<sub>/new.json·/about/rules.json 을 읽는다(쿠키를 꺼내지 않는다 — reddit-rules.mjs 와 같은 방식).
 *   AI 작성 금지 서브는 발행기 BANNED 목록을 «발행기 소스에서 그대로 읽어»(drift 방지) 후보에서 뺀다 + 규칙 원문의 AI·봇 키워드가 걸리면 «AI?» 로 표시한다.
 *
 * 사용: ~/signum-ego-io/<KST 날짜>/reddit-feed-task.json = {"subs":["stocks","wallstreetbets"],"maxAgeMin":180,"maxComments":60,"rules":true}
 *       (subs 를 생략하면 기본 후보 목록) · bash scripts/ego-run.sh scripts/ego/reddit-feed-list.mjs 150
 *       «질문형 스레드 찾기»: "queries":["max pain","gamma flip"] 를 더하면 사이트 전체 검색(/search.json?sort=new&t=week)도 읽는다
 *       (나이 상한은 "queryMaxAgeMin", 기본 4320분=3일 — 새 글 피드가 비는 미국 밤·주말에 «개념 질문»에 답할 자리를 찾는다) · subs 를 []로 두면 검색만
 * 출력: 표 «서브 | t3_id | 나이(분) | 댓글 | 점수 | 제목 | 표시» + 결과 JSON ~/signum-ego-io/<KST 날짜>/reddit-feed-result.json
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let T = {};
try { T = JSON.parse(fs.readFileSync(await L.taskPath('reddit-feed-task.json'), 'utf8')); } catch { /* 없으면 기본값 */ }
const SUBS = (Array.isArray(T.subs) ? T.subs : ['stocks', 'wallstreetbets', 'Trading', 'thetagang', 'algotrading', 'SecurityAnalysis', 'dividends', 'pennystocks', 'swingtrading', 'Economics', 'finance']);
const MAX_AGE = Number(T.maxAgeMin) > 0 ? Number(T.maxAgeMin) : 180;
const MAX_COM = Number(T.maxComments) > 0 ? Number(T.maxComments) : 60;
const ROOT = '/Users/eunhoon/.gemini/antigravity/scratch/stock2';
// 발행기 BANNED 목록을 소스에서 읽는다(복사본을 두면 규칙이 늘 때 어긋난다).
let BANNED = [];
try { const m = fs.readFileSync(ROOT + '/scripts/reddit-comment.mjs', 'utf8').match(/const BANNED = \[([\s\S]*?)\];/); BANNED = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase()) : []; } catch { /* 아래에서 0개면 경고 */ }
if (!BANNED.length) { console.log('⛔ 발행기 BANNED 목록을 못 읽었다 — 후보를 믿을 수 없다'); process.exit(1); }
// 원장에 이미 우리 댓글이 있는 스레드(같은 스레드 중복 금지)
let done = new Set();
try { for (const e of JSON.parse(fs.readFileSync(ROOT + '/.agent/marketing/PUBLISH-LEDGER.json', 'utf8')).entries || []) { const m = String(e.url || '').match(/\/comments\/([a-z0-9]+)/i); if (m) done.add(m[1].toLowerCase()); } } catch { /* 없으면 표시 생략 */ }

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('작업공간을 못 잡았다 — 대표가 쓰는 중일 수 있다'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /reddit/, null);
try { await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' }); } catch { /* 느려도 그려진다 */ }
await L.wait(6000);
// ★page.evaluate 는 15초 상한이라 서브 하나씩 부른다(첫 시험: 11개 서브를 한 번에 돌려 PageEvaluationTimeoutError).
const readSub = (s, rules) => page.evaluate(async (cfg) => {
  const get = async (u) => { try { const r = await fetch(u, { credentials: 'include' }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch { return { s: r.status, j: null }; } } catch (e) { return { s: 0, err: String(e.message).slice(0, 80) }; } };
  const a = await get('https://www.reddit.com/r/' + cfg.s + '/new.json?limit=30&raw_json=1');
  const posts = ((a.j && a.j.data && a.j.data.children) || []).map((x) => x.data).map((d) => ({ id: d.id, name: d.name, title: d.title, created: d.created_utc, comments: d.num_comments, score: d.score, locked: d.locked, archived: d.archived, stickied: d.stickied, over18: d.over_18, author: d.author, flair: d.link_flair_text || '', text: String(d.selftext || '').replace(/\s+/g, ' ').slice(0, 400) }));
  let rules = null;
  if (cfg.rules) {
    const b = await get('https://www.reddit.com/r/' + cfg.s + '/about/rules.json');
    rules = ((b.j && b.j.rules) || []).map((r) => (r.short_name || '') + ' :: ' + String(r.description || '').replace(/\s+/g, ' ').slice(0, 220));
  }
  return { status: a.s, err: a.err || null, posts, rules };
}, { s, rules });
const out = { subs: {} };
for (const s of SUBS) {
  try { out.subs[s] = await readSub(s, T.rules !== false); } catch (e) { out.subs[s] = { status: 0, err: String(e.message).slice(0, 80), posts: [], rules: null }; }
  await L.wait(900);   // 연속 요청 뒤 JSON 이 끊긴 일(9/30)이 있어 간격을 둔다
}

const QUERIES = Array.isArray(T.queries) ? T.queries : [];
const Q_AGE = Number(T.queryMaxAgeMin) > 0 ? Number(T.queryMaxAgeMin) : 4320;
const readSearch = (q) => page.evaluate(async (cfg) => {
  try {
    const r = await fetch('https://www.reddit.com/search.json?q=' + encodeURIComponent(cfg.q) + '&sort=new&t=week&limit=25&raw_json=1', { credentials: 'include' });
    const j = await r.json();
    return { status: r.status, posts: ((j && j.data && j.data.children) || []).map((x) => x.data).map((d) => ({ id: d.id, name: d.name, sub: d.subreddit, title: d.title, created: d.created_utc, comments: d.num_comments, score: d.score, locked: d.locked, archived: d.archived, stickied: d.stickied, over18: d.over_18, flair: d.link_flair_text || '', text: String(d.selftext || '').replace(/\s+/g, ' ').slice(0, 400) })) };
  } catch (e) { return { status: 0, err: String(e.message).slice(0, 80), posts: [] }; }
}, { q });
const searchRows = [];
for (const q of QUERIES) {
  const r = await readSearch(q);
  console.log(`검색 «${q}»: HTTP ${r.status}${r.err ? ' ' + r.err : ''} · ${r.posts.length}건`);
  for (const p of r.posts) searchRows.push({ ...p, q });
  await L.wait(1200);
}
const now = Date.now() / 1000;
const AI_RE = /\b(AI|A\.I\.|LLM|ChatGPT|GPT|generated|machine[- ]written|bots?)\b/i;
// ★2026-10-04 22시 개선: 검색(queries) 결과는 «dark pool»·«implied move»·«short volume» 같은 말이 게임·육아·미용·뷰티 글에도 걸려 185건 중 금융은 21건뿐이었다(실측) —
//   서브 이름(금융 낱말·게임거래/프로필 서브 제외) 또는 제목+본문에 금융 낱말이 «서로 다른 2개 이상»이면 남긴다. 새 글 피드(subs)는 이미 금융 서브만 읽으므로 거르지 않는다.
//   task.finOnly=false 로 끈다. 걸러 낸 수는 출력에 적는다(검사기가 «없다»를 말할 땐 검사기부터 의심 — MISTAKES #45).
const FIN_ONLY = T.finOnly !== false;
const FIN_SUB_RE = /(stock|invest|trading|option|financ|econom|etf|dividend|bond|wallstreet|quant|commodit|futures|thetagang|bogle|portfolio|equit|ipo|earnings|macro|fintech|forex|breakout)/i;
const FIN_SUB_NO = /^u_|csgo|offensive|game|skin/i;
const FIN_RE = new RegExp('\\b(' + ['stock','stocks','option','options','spread','spreads','etf','etfs','invest','investing','investor','investors','portfolio','dividend','dividends','earnings','trading','trader','futures','bond','bonds','yield','treasury','gamma','theta','vix','nasdaq','volatility','strike','expiry','expiration','equity','equities','ticker','hedge','selloff'].join('|') + ')\\b', 'gi');
const isFin = (p) => { const sn = String(p.sub || ''); if (FIN_SUB_NO.test(sn)) return false; return FIN_SUB_RE.test(sn) || new Set((((p.title || '') + ' ' + (p.text || '')).match(FIN_RE) || []).map((w) => w.toLowerCase())).size >= 2; };
let finDropped = 0;
const rows = []; const summary = [];
for (const s of SUBS) {
  const r = out.subs[s] || {};
  const banned = BANNED.includes(s.toLowerCase());
  const aiRules = (r.rules || []).filter((x) => AI_RE.test(x));
  summary.push(`${s}: HTTP ${r.status}${r.err ? ' ' + r.err : ''} · 새 글 ${(r.posts || []).length}${banned ? ' · ⛔BANNED(발행기 제외 서브)' : ''}${aiRules.length ? ' · AI?규칙 ' + aiRules.length + '건: ' + aiRules[0].slice(0, 120) : ''}${(r.rules || []).length ? ' · 규칙: ' + r.rules.map((x) => x.split(' :: ')[0]).slice(0, 8).join(' / ') : ''}`);
  if (banned) continue;
  for (const p of r.posts || []) {
    const age = Math.round((now - p.created) / 60);
    if (p.locked || p.archived || p.over18 || p.stickied) continue;
    if (age > MAX_AGE || p.comments > MAX_COM) continue;
    const marks = []; if (done.has(String(p.id).toLowerCase())) marks.push('원장에 이미 있음'); if (aiRules.length) marks.push('AI?규칙(원문 확인)');
    rows.push({ sub: s, name: p.name, age, comments: p.comments, score: p.score, title: p.title, flair: p.flair, text: p.text, marks });
  }
}
for (const p of searchRows) {   // 검색 결과 — 서브별 규칙은 따로 읽지 않으므로 «AI 규칙 원문 확인»을 표시한다
  const age = Math.round((now - p.created) / 60);
  if (BANNED.includes(String(p.sub).toLowerCase())) continue;
  if (p.locked || p.archived || p.over18 || p.stickied || age > Q_AGE || p.comments > MAX_COM) continue;
  if (FIN_ONLY && !isFin(p)) { finDropped++; continue; }
  const marks = ['q:' + p.q, '규칙 미조회(올리기 전 reddit-rules.mjs)']; if (done.has(String(p.id).toLowerCase())) marks.push('원장에 이미 있음');
  rows.push({ sub: p.sub, name: p.name, age, comments: p.comments, score: p.score, title: p.title, flair: p.flair, text: p.text, marks });
}
rows.sort((a, b) => a.age - b.age);
console.log('── 서브별 ──'); for (const x of summary) console.log('  ' + x);
console.log(`── 후보 ${rows.length}건 (나이 ≤ ${MAX_AGE}분 · 댓글 ≤ ${MAX_COM} · 잠김·고정·성인 제외) ──`);
if (FIN_ONLY) console.log(`  (검색 결과 중 금융과 무관해 걸러 낸 것 ${finDropped}건 — 이 필터를 끄려면 작업 파일에 "finOnly": false)`);
for (const x of rows) console.log(`${x.sub.padEnd(16)} ${x.name.padEnd(11)} ${String(x.age).padStart(4)}분 댓${String(x.comments).padStart(3)} 점${String(x.score).padStart(3)} ${x.title.slice(0, 90)}${x.marks.length ? '  [' + x.marks.join('·') + ']' : ''}`);
try { fs.writeFileSync(await L.taskPath('reddit-feed-result.json'), JSON.stringify({ at: new Date().toISOString(), subs: SUBS, banned: BANNED, rows }, null, 1)); } catch { /* 결과 파일은 보조 */ }
console.log('FEED_DONE');
