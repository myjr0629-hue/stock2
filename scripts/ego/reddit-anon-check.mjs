#!/usr/bin/env node
/* ============================================================================
 * reddit-anon-check — 내 레딧 댓글이 «로그인 없는 독자»에게 보이는지 본다 (2026-10-03 만듦)
 *
 * 왜: 발행기의 검증은 로그인 세션으로 스레드를 다시 읽는다. 레딧 스팸필터가 지운 댓글도 «작성자에게는» 그대로 보인다
 *     (memory reddit-is-the-one-channel-that-works) → 로그인 기준 «보인다»는 독자가 본다는 증거가 아니다(visible-where-matters).
 *     같은 브라우저에서 쿠키를 «보내지 않고»(credentials:'omit') 스레드 JSON 을 읽어 내 댓글 본문이 있는지 본다.
 *     (curl 은 레딧이 403 으로 막는다 — 브라우저 안의 쿠키 없는 요청이 가장 가까운 비로그인 시험)
 *
 * ★10/3 실측: 쿠키 없는 조회는 레딧이 «403»(차단 페이지)으로 막는다 → 익명 판정은 불가능하다. 403 을 «내 댓글이 숨겨졌다»로 읽지 않는다(검사기부터 의심).
 *   대체: 로그인한 «내 댓글 목록»(/user/<나>/comments.json) — 스팸필터가 지운 댓글은 여기서 «[ Removed by Reddit ]» 로 보인다(9/16 실측). 이 둘을 같이 판정한다.
 *
 * 사용: ~/signum-ego-io/<KST 날짜>/reddit-anon-task.json = {"thread":"1wn6wgp","id":"pdjcmju","must":["SIGNUM HQ","signumhq.com/app?from=reddit_in"]}
 *       bash scripts/ego-run.sh scripts/ego/reddit-anon-check.mjs 120     → 마지막 줄 ANON_PASS / ANON_FAIL
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync(await L.taskPath('reddit-anon-task.json'), 'utf8'));
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('작업공간을 못 잡았다'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /reddit/, null);
try { await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' }); } catch { /* 느려도 그려진다 */ }
await L.wait(5000);
const out = await page.evaluate(async (cfg) => {
  const res = { status: 0, comments: [], mine: null };
  try {
    const r = await fetch('https://www.reddit.com/comments/' + cfg.thread + '/.json?limit=300&raw_json=1', { credentials: 'omit' });
    res.status = r.status;
    const a = await r.json();
    const walk = (n, depth) => { if (!n) return; if (Array.isArray(n)) { n.forEach((x) => walk(x, depth)); return; }
      if (n.kind === 't1' && n.data) { const d = n.data; res.comments.push({ id: d.id, author: d.author, score: d.score, depth, body: String(d.body || '').replace(/\s+/g, ' '), removed: d.removed_by_category || null });
        if (d.replies) walk(d.replies, depth + 1); }
      else if (n.data && n.data.children) walk(n.data.children, depth); };
    walk(a, 0);
    const mine = res.comments.find((c) => c.id === cfg.id);
    res.mine = mine || null;
  } catch (e) { res.err = String(e.message).slice(0, 100); }
  try {
    const me = await (await fetch('https://www.reddit.com/api/me.json', { credentials: 'include' })).json();
    const r2 = await fetch('https://www.reddit.com/user/' + me.data.name + '/comments.json?limit=10&raw_json=1', { credentials: 'include' });
    const j2 = await r2.json();
    const row = ((j2.data && j2.data.children) || []).map((x) => x.data).find((d) => d.id === cfg.id);
    res.own = row ? { body: String(row.body || '').replace(/\s+/g, ' '), score: row.score, removed: row.removed_by_category || null } : null;
  } catch (e) { res.ownErr = String(e.message).slice(0, 100); }
  return res;
}, T);
console.log('익명(쿠키 없음) 조회 http', out.status, '· 보이는 댓글', out.comments.length, out.err ? '· 오류 ' + out.err : '');
for (const c of out.comments) console.log(' -', c.id, 'u/' + c.author, '점수', c.score, 'depth', c.depth, c.removed ? '[removed:' + c.removed + ']' : '', '|', c.body.slice(0, 90));
let pass = false;
const blocked = out.status === 403;
if (out.mine) {
  const miss = (T.must || []).filter((m) => !out.mine.body.includes(m));
  pass = !out.mine.removed && !/^\[(removed|deleted)\]$/.test(out.mine.body) && miss.length === 0;
  console.log('내 댓글(익명 시야):', JSON.stringify({ score: out.mine.score, removed: out.mine.removed, 길이: out.mine.body.length, 빠진문구: miss }));
} else if (blocked && out.own) {
  const bad = /removed by reddit|^\[(removed|deleted)\]$/i.test(out.own.body.trim()) || !!out.own.removed;
  const miss = (T.must || []).filter((m) => !out.own.body.includes(m));
  pass = !bad && miss.length === 0;
  console.log('익명 조회는 403 으로 막혀 판정 불가 → 내 댓글 목록으로 대체:', JSON.stringify({ 점수: out.own.score, 삭제표시: bad, 길이: out.own.body.length, 앞부분: out.own.body.slice(0, 60), 빠진문구: miss }));
  console.log('※ 한계: 독자 시야(익명)는 확인하지 못했다 — «공개 확인»이 아니라 «작성자 목록 정상 + 삭제 표시 없음»으로 적는다');
} else console.log('내 댓글이 익명 시야에도 내 목록에도 없다 — 숨겨졌거나 삭제됐을 수 있다', out.ownErr || '');
console.log(pass ? 'ANON_PASS' : 'ANON_FAIL');
