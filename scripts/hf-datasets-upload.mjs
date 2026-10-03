/* ============================================================================
 * hf-datasets-upload — Hugging Face «데이터셋» 저장소에 파일을 웹 업로드한다(ego 판). 주의: scripts/hf-sync.mjs 의 «HF» 는
 *   Higgsfield(영상 클립)이지 Hugging Face 가 아니다 — 이름이 겹쳐 둘을 헷갈리지 않게 파일명을 풀어 썼다.
 *
 * 왜 (2026-10-04): hf_datasets 가 10일째 «뚫기» 배정인데 갱신 도구가 없어 매번 미뤄졌다(9/23 이후 미러가 낡은 채 방치).
 *   github-upload.mjs 와 같은 절차를 HF 업로드 페이지에 맞췄다. 계정 정보는 입력하지 않는다 — 로그인이 안 돼 있으면 LOGIN_REQUIRED 로 끝낸다.
 *
 * 사용(ego 런타임은 argv 를 못 받는다 → 작업 파일 ~/signum-ego-io/<KST 날짜>/hf-task.json):
 *   python3 -c "import json;json.dump({'repo':'eunhoon/us-congress-stock-trades','files':['/abs/README.md','/abs/x.csv']},open('<위 경로>','w'))"
 *   bash scripts/ego-run.sh scripts/hf-datasets-upload.mjs 240
 * 실측 함정: 업로드 페이지에 input[type=file] 이 «2개»(파일·폴더)라 setInputFiles('input[type=file]') 는 모호성 오류로 죽는다 → `>> nth=0`.
 *   커밋 버튼 글자는 «Commit changes to\nmain» — 공백 정규화 뒤 정확히 맞춘다. 반영 확인은 공개 API(lastModified)와 raw 파일로.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const task = JSON.parse(fs.readFileSync(await L.taskPath('hf-task.json'), 'utf8'));
const REPO = String(task.repo || '');
if (!/^[\w.-]+\/[\w.-]+$/.test(REPO)) { console.log('⛔ task.repo 는 <계정>/<데이터셋> 이어야 한다'); process.exit(1); }
const files = (task.files || []).filter((f) => fs.existsSync(f));
if (!files.length) { console.log('⛔ 올릴 파일이 없다'); process.exit(1); }
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /huggingface\.co/, null);
try { await page.goto(`https://huggingface.co/datasets/${REPO}/upload/main`, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const st = await page.evaluate(() => ({ url: location.href, text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300), fileInputs: document.querySelectorAll('input[type=file]').length }));
console.log('상태:', JSON.stringify({ url: st.url, fileInputs: st.fileInputs }));
if (/\/login|\/join/.test(st.url) || !st.fileInputs) { console.log('LOGIN_REQUIRED 또는 업로드 칸 없음 — 로그인은 대표 몫(계정 정보 입력 금지)'); process.exit(0); }
await page.setInputFiles('input[type=file] >> nth=0', files);
const names = files.map((f) => f.split('/').pop());
const check = () => page.evaluate((ns) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const t = norm(document.body.innerText);
  const missing = ns.filter((n) => !t.includes(n));
  const c = [...document.querySelectorAll('button')].map((e) => ({ e, t: norm(e.innerText), r: e.getBoundingClientRect() }))
    .filter((o) => o.r.width > 30 && /^Commit changes to main$/.test(o.t) && !o.e.disabled);
  if (!c.length) return { seen: !missing.length, missing, btn: null };
  c[0].e.scrollIntoView({ block: 'center' });
  const r = c[0].e.getBoundingClientRect();
  return { seen: !missing.length, missing, btn: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } };
}, names);
let b = { seen: false, btn: null };
for (let i = 0; i < 14; i++) { await L.wait(4000); b = await check(); if (b.seen && b.btn) break; }
console.log('업로드 목록 확인:', JSON.stringify(b));
if (!b.btn || !b.seen) { console.log('⛔ 파일이 목록에 안 보이거나 커밋 버튼이 없다'); process.exit(1); }
await L.wait(1500); // scrollIntoView 직후 좌표는 믿지 않는다 — 재측정(RUNBOOK §4-4)
const b2 = await check();
await page.mouse.click(b2.btn.x, b2.btn.y);
await L.wait(14000);
const j = await (await fetch(`https://huggingface.co/api/datasets/${REPO}`, { headers: { 'user-agent': 'signum-upload-check' } })).json();
console.log('HF lastModified:', j.lastModified, '· 파일:', (j.siblings || []).map((s) => s.rfilename).join(','));
