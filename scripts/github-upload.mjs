#!/usr/bin/env node
/* ============================================================================
 * github-upload — 데이터셋 저장소(options-market-structure-daily)에 파일을 «웹 업로드»로 올리고 검증한다.
 * (2026-09-23 /tmp/ego/gh5.mjs 를 저장소로 옮김 — 세션이 바뀌어도 «데이터셋 문»이 멈추지 않게)
 *
 * 왜 웹 업로드: 이 맥에는 저장소 쓰기 토큰이 없다(t165). 로그인된 브라우저 세션의 업로드 페이지를 쓴다.
 * 사용: echo '{"files":["/tmp/ego/gh/2026-09-22.json","/tmp/ego/gh/2026-09-22.md"]}' > /tmp/ego/gh-task.json
 *       ego-browser nodejs < scripts/github-upload.mjs
 * 순서(RUNBOOK «데이터셋 문»): ① 그날 json+md 업로드 → ② gh-dataset-index.js 로 index.html 재생성 → ③ index.html 업로드
 *   (①을 먼저 해야 index 의 JSON-LD 가 새 날짜를 포함한다 — 저장소에 «실제로 있는» 파일만 읽기 때문)
 * 버튼은 «공백 정규화» 후 정확일치(«Commit changes»). 반영 확인은 GitHub API 파일 목록으로 한다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const task = JSON.parse(fs.readFileSync('/tmp/ego/gh-task.json', 'utf8'));
const files = (task.files || []).filter((f) => fs.existsSync(f));
if (!files.length) { console.log('⛔ 올릴 파일이 없다'); process.exit(1); }
const REPO = 'myjr0629-hue/options-market-structure-daily';

const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await takeOverTaskSpace(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /github/, null);
try { await page.goto(`https://github.com/${REPO}/upload/main`, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(10000);
await page.setInputFiles('input[type=file]', files);
await L.wait(8000);
const b = await page.evaluate((names) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const t = norm(document.body.innerText);
  const c = [...document.querySelectorAll('button')].map((e) => ({ e, t: norm(e.innerText), r: e.getBoundingClientRect() }))
    .filter((o) => o.r.width > 30 && /^Commit changes$/.test(o.t) && !o.e.disabled);
  const seen = names.every((n) => t.includes(n));
  if (!c.length) return { seen, btn: null };
  c[0].e.scrollIntoView({ block: 'center' });
  const r = c[0].e.getBoundingClientRect();
  return { seen, btn: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } };
}, files.map((f) => f.split('/').pop()));
console.log('업로드 목록 확인:', JSON.stringify(b));
if (!b.btn || !b.seen) { console.log('⛔ 파일이 목록에 안 보이거나 커밋 버튼이 없다'); process.exit(1); }
await page.mouse.click(b.btn.x, b.btn.y);
await L.wait(13000);
const r = await fetch(`https://api.github.com/repos/${REPO}/contents/`, { headers: { 'user-agent': 'signum-upload-check' } });
const names = (await r.json()).map((x) => x.name);
const ok = files.map((f) => f.split('/').pop()).every((n) => names.includes(n));
console.log('저장소 반영:', ok ? '✅ 확인' : '⛔ 목록에 없다', '· 날짜 파일', names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().slice(-3).join(' '));
if (!ok) process.exit(1);
