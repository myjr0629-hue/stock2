#!/usr/bin/env node
/* ============================================================================
 * reddit-comment — 레딧에 «클릭 없이» 댓글을 단다. 그리고 게시 여부를 스스로 검증한다.
 *
 * ★2026-09-22 만든 이유 (대표 지시: 「브라우저 없는 경로 하나 더 뚫어」):
 *   발행 속도가 채널마다 10배씩 차이 난다 —
 *     · 블루스카이 CLI: **건당 30초**(브라우저 없음)
 *     · 브라우저로 UI 를 모는 채널: **건당 5~10분**(작성칸 찾기·좌표·버튼 재측정…)
 *   완전히 브라우저가 없는 공개 API 는 Mastodon·dev.to 뿐인데 둘 다 «가입»이 필요하다(내 안전선).
 *   그래서 차선을 뚫었다: **로그인된 페이지 «안에서» 그 사이트의 API 를 직접 부른다.**
 *   쿠키를 꺼내지 않는다(그건 세션 탈취다). 브라우저는 쓰되 «클릭을 안 한다».
 *   실측: 댓글 하나가 수 초. UI 조작 대비 20배 이상 빠르다.
 *
 * 왜 레딧인가: 팔로워가 0이어도 도달하는 몇 안 되는 채널이고(§reddit-is-the-one-channel-that-works),
 *   «글»은 전부 스팸필터에 죽지만 «댓글»은 산다(§reddit-posts-are-all-spam-filtered).
 *
 * 안전선(스크립트가 강제한다):
 *   · 본문 링크 금지 — 레딧에서 링크는 삭제 사유다. http(s) 가 있으면 거부한다.
 *   · AI 작성 금지 서브 제외: r/options · r/StockMarket · r/investing · r/iosapps · r/Daytrading
 *     (+9/25 규칙 실측: r/ValueInvesting · r/Bogleheads · r/economy · r/personalfinance · r/quant · r/CanadianInvestor · r/fatFIRE · r/JapanFinance)
 *   · 하루 3건(UTC일)·8분 간격은 «사이클 규칙»이다. 이 스크립트는 한 번에 하나만 올린다.
 *
 * 사용:
 *   ego-browser nodejs < scripts/reddit-comment.mjs            상태만 확인(누가 로그인됐나)
 *   작업 파일을 먼저 쓰고 같은 명령을 돌린다:
 *     echo '{"parent":"t3_xxxx","file":"/tmp/ego/c.txt"}' > /tmp/ego/reddit-task.json
 *   ⚠ 환경변수·argv 는 쓸 수 없다 — ego-browser 는 스크립트를 stdin 으로 받는 별도 런타임이라
 *     셸의 env 가 전달되지 않는다(2026-09-22 실측: REDDIT_PARENT 가 undefined 였다). 그래서 «파일»로 넘긴다.
 *
 * 게시 «했다»고 적기 전에 이 스크립트가 직접 확인한다: 스레드 JSON 을 다시 읽어
 * 내 댓글이 실제로 보이고 removed 가 아닌지 본다. 200 응답만으로는 «게시됨»이 아니다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { readFileSync } = await import('node:fs');

// ★2026-09-25 규칙 전수 실측(/r/<sub>/about/rules.json, 48개 서브에서 AI·LLM·ChatGPT·generated 검색)으로 확장:
//   valueinvesting(«AI-generated content» 삭제 사유) · bogleheads(«AI-generated responses» 금지) · economy(«ChatGPT-generated articles» 금지)
//   personalfinance(«AI-generated content») · quant(«No AI Content») · canadianinvestor(«No AI») · fatfire(«No … AI posts») · japanfinance(«LLM-generated content»)
const BANNED = ['options', 'stockmarket', 'investing', 'iosapps', 'daytrading', 'valueinvesting', 'bogleheads', 'economy', 'personalfinance', 'quant', 'canadianinvestor', 'fatfire', 'japanfinance'];
const TASK = '/tmp/ego/reddit-task.json';
let task = {};
try { task = JSON.parse(readFileSync(TASK, 'utf8')); } catch { /* 없으면 상태 확인만 한다 */ }
const parent = String(task.parent || '').trim();   // t3_xxxx(글) 또는 t1_xxxx(댓글)
const text = task.file ? readFileSync(task.file, 'utf8').trim() : String(task.text || '').trim();

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts;
try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('작업공간을 못 잡았다 — 대표가 쓰는 중일 수 있다'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /reddit/, null);
try { await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded' }); } catch { /* 느려도 그려진다 */ }
await L.wait(6000);

const me = await page.evaluate(async () => {
    try {
        const r = await fetch('https://www.reddit.com/api/me.json', { credentials: 'include' });
        const j = await r.json();
        return { name: j?.data?.name || null, uh: !!j?.data?.modhash, karma: j?.data?.total_karma ?? null };
    } catch (e) { return { err: String(e.message).slice(0, 80) }; }
});
console.log('로그인:', me.name || '(없음)', '· modhash', me.uh ? 'O' : 'X', '· 카르마', me.karma);
if (!me.name || !me.uh) { console.log('로그인되어 있지 않다 — 대표 로그인 1회 필요'); process.exit(1); }
if (!parent || !text) { console.log('\n상태 확인만 했다. 올리려면 ' + TASK + ' 에 {parent,file} 을 써 둔다.'); process.exit(0); }

// ── 안전선 ────────────────────────────────────────────────────────────────
if (/https?:\/\//i.test(text)) { console.log('⛔ 본문에 링크가 있다 — 레딧에서는 삭제 사유다. 거부한다.'); process.exit(1); }
if (!/^t[13]_[a-z0-9]+$/i.test(parent)) { console.log('⛔ REDDIT_PARENT 형식이 아니다(t3_xxxx 또는 t1_xxxx)'); process.exit(1); }

// 어느 서브인지 확인해 금지 서브를 막는다
const sub = await page.evaluate(async (id) => {
    try {
        const r = await fetch(`https://www.reddit.com/api/info.json?id=${id}`, { credentials: 'include' });
        const j = await r.json();
        return j?.data?.children?.[0]?.data?.subreddit || null;
    } catch { return null; }
}, parent);
console.log('대상 서브:', sub || '(확인 실패)');
if (sub && BANNED.includes(String(sub).toLowerCase())) {
    console.log(`⛔ r/${sub} 는 AI 작성 금지 또는 제외 서브다. 거부한다.`); process.exit(1);
}

// ── 게시 ─────────────────────────────────────────────────────────────────
const res = await page.evaluate(async (cfg) => {
    const me2 = await (await fetch('https://www.reddit.com/api/me.json', { credentials: 'include' })).json();
    const uh = me2?.data?.modhash;
    const body = new URLSearchParams({ api_type: 'json', thing_id: cfg.parent, text: cfg.text, uh });
    const r = await fetch('https://www.reddit.com/api/comment', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Modhash': uh },
        body: body.toString(),
    });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* HTML 이 오면 아래에서 raw 로 본다 */ }
    const things = j?.json?.data?.things || [];
    return { status: r.status, errors: j?.json?.errors || null, id: things[0]?.data?.id || null,
             link: things[0]?.data?.link_id || null, raw: j ? null : t.slice(0, 200) };
}, { parent, text });
console.log('응답:', JSON.stringify(res));
if (res.status !== 200 || (res.errors && res.errors.length) || !res.id) {
    console.log('⛔ 게시 실패 — «올렸다»고 적지 않는다.'); process.exit(1);
}

// ── ★검증: 200 은 «게시됨»이 아니다. 스레드를 다시 읽어 실제로 보이는지 본다 ──
await L.wait(4000);
const linkId = String(res.link || parent).replace(/^t3_/, '');
// ⚠ 응답의 id 는 «t1_ 접두사»가 붙어 오고(t1_pbcxrer), 스레드 JSON 의 id 는 «맨 id»다(pbcxrer).
//   2026-09-22 실측: 이 차이 때문에 검증이 항상 false 로 나와 «안 올라갔다»고 오판했다(실제로는 올라가 있었다).
//   검사기가 «없다»를 말할 때는 검사기부터 의심한다 — 여기서 접두사를 벗겨 맞춘다.
const bareId = String(res.id).replace(/^t1_/, '');
const check = await page.evaluate(async (cfg) => {
    try {
        const r = await fetch(`https://www.reddit.com/comments/${cfg.linkId}/.json?limit=300`, { credentials: 'include' });
        const a = await r.json();
        const out = []; const walk = (n) => { if (!n) return; if (Array.isArray(n)) { n.forEach(walk); return; }
            if (n.kind === 't1' && n.data) { out.push({ id: n.data.id, author: n.data.author, removed: !!n.data.removed_by_category, score: n.data.score }); walk(n.data.replies); }
            else if (n.data && n.data.children) walk(n.data.children); };
        walk(a);
        const mine = out.find((c) => c.id === cfg.id);
        return { total: out.length, found: !!mine, removed: mine ? mine.removed : null, score: mine ? mine.score : null };
    } catch (e) { return { err: String(e.message).slice(0, 80) }; }
}, { linkId, id: bareId });

const permalink = `https://www.reddit.com/comments/${linkId}/comment/${bareId}/`;
console.log('검증:', JSON.stringify(check));
if (!check.found || check.removed) {
    console.log('⛔ 응답은 200 인데 스레드에서 안 보인다(스팸필터 가능성). «올렸다»고 적지 않는다.');
    console.log('   permalink(참고):', permalink); process.exit(1);
}
console.log('\n✅ 게시·검증 완료:', permalink);
console.log('다음: node scripts/mkt-plan.js pub reddit "' + permalink + '"');
