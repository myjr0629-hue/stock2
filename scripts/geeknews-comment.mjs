// GeekNews 무링크 데이터 댓글 1건 — geeknews_comment 레인(주 1회·관련 글이 있을 때만). 2026-09-30 첫 실행(cid66633)
//   작업 파일: ~/signum-ego-io/<KST 날짜>/gn-task.json = {"topic":"34509","lines":[문단..],"dry":false}
//   사용: bash scripts/ego-run.sh scripts/geeknews-comment.mjs 180 → node scripts/mkt-plan.js pub geeknews_comment "https://news.hada.io/topic?id=<글>#cid<번호>"
//   거부: 링크·앱명(signum/시그넘) · 로그인 표시 없음 · 이미 우리 댓글이 있는 글 · 입력 길이 불일치
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 120)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const DIR = L.ioDir();
L.assertFreshTask(await L.taskPath('gn-task.json')); // ★2026-10-04 낡은 작업 파일 거부(MISTAKES #52)
const T = JSON.parse(fs.readFileSync(await L.taskPath('gn-task.json'), 'utf8'));
const log = (k, v) => { const line = k + ' ' + (typeof v === 'string' ? v : JSON.stringify(v)); console.log(line.slice(0, 800)); fs.appendFileSync(DIR + '/gn.log', line + '\n'); };
const shot = async (page, name) => { try { const s = await page.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${DIR}/${name}.png`, Buffer.from(s.data, 'base64')); } catch {} };
const body = T.lines.join('\n');
if (/https?:\/\/|signum|시그넘/i.test(body)) { log('STOP', '링크·앱명 금지 위반'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await L.takeSpaceOrExit(sp.id);
const page = await L.findPage(ts, /news\.hada\.io/, null);
try { await page.goto(`https://news.hada.io/topic?id=${T.topic}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
await L.wait(5000);
const st = await page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const tas = [...document.querySelectorAll('textarea')].filter(vis);
  const me = /signumhq/.test(document.querySelector('header, #header, .header, nav')?.innerText || document.body.innerText.slice(0, 600));
  const f = tas[0]?.closest('form');
  const btns = f ? [...f.querySelectorAll('button,input[type=submit]')].filter(vis).map((b) => (b.innerText || b.value || '').trim()) : [];
  return { n: tas.length, me, action: f?.getAttribute('action') || null, btns, already: /signumhq/.test([...document.querySelectorAll('.comment_row, .commentinfo')].map((e) => e.innerText).join(' ')) };
});
log('STATE', st);
await shot(page, 'gn-before');
if (!st.me) { log('STOP', '로그인 표시(signumhq) 없음'); process.exit(1); }
if (st.already) { log('STOP', '이 글에 우리 댓글이 이미 있다'); process.exit(1); }
if (st.n !== 1 || !st.btns.length) { log('STOP', '댓글 입력칸/버튼을 하나로 특정 못 함'); process.exit(1); }
const ta = await page.evaluate(() => { const t = [...document.querySelectorAll('textarea')].find((e) => e.getBoundingClientRect().width > 0); t.scrollIntoView({ block: 'center' }); const r = t.getBoundingClientRect(); return { x: Math.round(r.x + 30), y: Math.round(r.y + 20) }; });
await L.wait(600);
await L.typeInto(page, ta, T.lines, { chunk: 300, gap: 200 });
await L.wait(800);
const typed = await page.evaluate(() => ([...document.querySelectorAll('textarea')].find((e) => e.getBoundingClientRect().width > 0)?.value || ''));
log('TYPED_LEN', { len: typed.length, want: body.length, head: typed.slice(0, 40) });
if (Math.abs(typed.length - body.length) > 3) { log('STOP', '입력 길이 불일치 — 제출하지 않는다'); await shot(page, 'gn-typed'); process.exit(1); }
if (T.dry) { log('DRY', '제출 안 함'); process.exit(0); }
const btn = await page.evaluate(() => { const t = [...document.querySelectorAll('textarea')].find((e) => e.getBoundingClientRect().width > 0); const f = t.closest('form'); const b = [...f.querySelectorAll('button,input[type=submit]')].find((x) => x.getBoundingClientRect().width > 0); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: (b.innerText || b.value || '').trim() }; });
log('SUBMIT', btn);
await L.wait(500);
await page.mouse.click(btn.x, btn.y, {});
await L.wait(6000);
log('AFTER_URL', await page.url());
await shot(page, 'gn-after');
// 공개 확인(비로그인 fetch)
const cid = ((await page.url()).match(/#cid(\d+)/) || [])[1] || null;
// ★ 본문 앞머리 문자열 대조는 «» 같은 문자가 엔티티로 와서 실패했다(9/30 첫 실행) → 댓글 번호(cid)와 작성자로 확인한다
const pub = await page.evaluate(async ({ id, cid }) => { const r = await fetch(`https://news.hada.io/topic?id=${id}`, { credentials: 'omit', cache: 'no-store' }); const h = await r.text(); const i = cid ? h.indexOf(cid) : -1; return { status: r.status, found: i >= 0 && /signumhq/.test(h.slice(i, i + 1500)), cid }; }, { id: T.topic, cid });
log('PUBLIC', pub);
