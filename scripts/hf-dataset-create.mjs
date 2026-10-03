/* ============================================================================
 * hf-dataset-create — Hugging Face «새 데이터셋 저장소»를 만든다(ego 판, 10/4 신설). 파일 올리기는 hf-datasets-upload.mjs.
 *
 * 왜: hf_datasets 확장 티켓(eunhoon/us-finra-short-volume — HF 검색 «short volume» 은 주간 데이터셋 2개(좋아요 0)뿐인 얇은 문)을
 *   실행할 도구가 없었다. 9/23 에 의회 데이터셋을 만든 절차(/new-dataset → 이름칸 비우고 입력 → Create Dataset)를 도구화했다.
 *
 * 사용(ego 런타임은 argv·환경변수를 못 받는다 → 작업 파일 ~/signum-ego-io/<KST 날짜>/hf-create-task.json):
 *   python3 -c "import json;json.dump({'name':'us-finra-short-volume','go':False},open('<위 경로>','w'))"
 *   bash scripts/ego-run.sh scripts/hf-dataset-create.mjs 180
 *   · go 가 true 가 «아니면» 드라이런 — 양식 칸 목록·스크린샷만 남기고 아무것도 만들지 않는다(되돌릴 수 없는 동작은 기본 드라이런).
 *   · 이미 있는 저장소면 만들지 않고 «ALREADY_EXISTS» 로 끝낸다(공개 API 200).
 * 계정 정보는 입력하지 않는다 — 로그인이 안 돼 있으면 LOGIN_REQUIRED 로 끝낸다.
 * 함정(9/23 실측): 이름칸에 두 번 치면 이어 붙는다 → 칸을 «비우고(전체선택+지우기) 값 확인 후» 한 번만 친다. 버튼은 role=button «Create Dataset».
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const task = JSON.parse(fs.readFileSync(await L.taskPath('hf-create-task.json'), 'utf8'));
const NAME = String(task.name || ''); const GO = task.go === true;
if (!/^[\w.-]{3,60}$/.test(NAME)) { console.log('⛔ task.name 은 데이터셋 이름(영숫자·-_.)이어야 한다'); process.exit(1); }
const OWNER = String(task.owner || 'eunhoon');
const have = await fetch(`https://huggingface.co/api/datasets/${OWNER}/${NAME}`, { headers: { 'user-agent': 'signum-create-check' } });
if (have.status === 200) { console.log(`ALREADY_EXISTS — https://huggingface.co/datasets/${OWNER}/${NAME} (만들지 않는다)`); process.exit(0); }
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /huggingface\.co/, null);
try { await page.goto('https://huggingface.co/new-dataset', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
const inv = () => page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return {
    url: location.href,
    inputs: [...document.querySelectorAll('input,textarea')].filter(vis).map((e) => ({ type: e.type, name: e.name, ph: e.placeholder, val: (e.value || '').slice(0, 60), checked: e.checked, id: e.id, y: Math.round(e.getBoundingClientRect().y) })),
    selects: [...document.querySelectorAll('select')].filter(vis).map((e) => ({ name: e.name, val: e.value, opts: [...e.options].slice(0, 6).map((o) => o.value) })),
    buttons: [...document.querySelectorAll('button,[role=button]')].filter(vis).map((e) => ({ t: n(e.innerText).slice(0, 40), dis: !!e.disabled })).filter((b) => b.t).slice(0, 14),
    text: n(document.body.innerText).slice(0, 500),
  };
});
const st = await inv();
console.log('양식 목록:', JSON.stringify(st));
try { await page.screenshot({ path: `${L.ioDir()}/hf-new-dataset.png` }); } catch {}
if (/\/login|\/join/.test(st.url)) { console.log('LOGIN_REQUIRED — 로그인은 대표 몫(계정 정보 입력 금지)'); process.exit(0); }
if (!GO) { console.log('DRY — 아무것도 만들지 않았다(task.go=true 일 때만 만든다)'); process.exit(0); }
// 이름칸: name="name" 우선, 없으면 placeholder/라벨에 name 이 들어간 텍스트 칸
const pos = await page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const c = [...document.querySelectorAll('input')].filter((e) => vis(e) && (e.type === 'text' || !e.type));
  // 10/4 드라이런 실측: 이름칸 = input#repo-name(placeholder «New Dataset name», name 속성 없음) · 첫 text 칸은 상단 검색창 — 순서로 고르지 않는다
  const e = document.querySelector('#repo-name') || c.find((x) => /new dataset name/i.test(x.placeholder || ''));
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), name: e.name };
});
if (!pos) { console.log('⛔ 이름 입력칸을 못 찾았다'); process.exit(1); }
await page.mouse.click(pos.x, pos.y); await L.wait(400);
await page.keyboard.press('Meta+A'); await L.wait(150); await page.keyboard.press('Backspace'); await L.wait(300);
const cleared = await page.evaluate(() => { const e = document.querySelector('#repo-name'); return e ? e.value : '?'; });
if (cleared !== '') { console.log('⛔ 이름칸이 안 비워졌다: ' + JSON.stringify(cleared)); process.exit(1); }
await page.keyboard.type(NAME, { delay: 25 }); await L.wait(900);
const typed = await page.evaluate(() => { const e = document.querySelector('#repo-name'); return e ? e.value : '?'; });
console.log('입력값:', JSON.stringify(typed));
if (typed !== NAME) { console.log('⛔ 입력값이 이름과 다르다 — 만들지 않는다'); process.exit(1); }
const radio = await page.evaluate(() => { const r = [...document.querySelectorAll('input[type=radio]')].map((e) => ({ v: e.value, c: e.checked })); return r; });
console.log('공개 범위 라디오:', JSON.stringify(radio));
await L.wait(1200);
const btn = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('button,[role=button],input[type=submit]')].filter((e) => /^Create Dataset$/i.test(n(e.innerText || e.value)) && e.getBoundingClientRect().width > 30 && !e.disabled);
  if (!c.length) return null; c[0].scrollIntoView({ block: 'center' });
  return true;
});
if (!btn) { console.log('⛔ Create Dataset 버튼이 없거나 비활성 — 이름이 쓸 수 없는 값일 수 있다'); process.exit(1); }
await L.wait(1500); // scrollIntoView 직후 좌표는 믿지 않는다 — 재측정(RUNBOOK §4-4)
const b2 = await page.evaluate(() => {
  const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const c = [...document.querySelectorAll('button,[role=button],input[type=submit]')].filter((e) => /^Create Dataset$/i.test(n(e.innerText || e.value)) && e.getBoundingClientRect().width > 30 && !e.disabled);
  if (!c.length) return null; const r = c[0].getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
});
if (!b2) { console.log('⛔ 버튼 좌표 재측정 실패'); process.exit(1); }
await page.mouse.click(b2.x, b2.y);
await L.wait(10000);
const r = await fetch(`https://huggingface.co/api/datasets/${OWNER}/${NAME}`, { headers: { 'user-agent': 'signum-create-check' } });
const j = r.status === 200 ? await r.json() : null;
console.log('생성 확인:', r.status, j ? `private=${j.private} · id=${j.id}` : '(없음)', '· 현재 주소:', await page.url());
