/* ============================================================================
 * findupapp-probe — FindUpApp(findupapp.com · 무료·로그인 불필요·심사 없음 앱 발견 사이트)의 등록 화면을 «읽기만» 한다.
 *   쓰기 동작 없음(입력·제출·체크 안 함). 등록 버튼을 눌러 «열리는 화면»만 보고, 입력칸·체크박스(약관 동의 여부)·버튼·«로그인» 문구를 표로 찍는다.
 * 실행: bash scripts/ego-run.sh scripts/ego/findupapp-probe.mjs 120
 * 만든 이유(2026-10-05 03시 회차): 확장 레인 «신규 표면 발굴» — 무계정 앱 발견 사이트라 홍보 사이클이 직접 열 수 있는지(약관 체크·이메일 칸이 있으면 티켓)를 화면으로 가른다.
 * ========================================================================== */
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const task = await L.space(); if (!task) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await task.newPage(); // 이 스크립트 전용 탭 — 끝에서 닫는다
const snap = () => page.evaluate(() => {
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const pick = (sel) => [...document.querySelectorAll(sel)].filter(vis);
  return {
    url: location.href, title: document.title,
    text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1400),
    inputs: pick('input,textarea,select').map((e) => ({ tag: e.tagName, type: e.type || '', name: e.name || '', ph: (e.placeholder || '').slice(0, 60), req: !!e.required, aria: (e.getAttribute('aria-label') || '').slice(0, 40) })).slice(0, 25),
    checks: pick('input[type=checkbox],input[type=radio],[role=checkbox]').map((e) => ({ type: e.type || e.getAttribute('role'), label: ((e.closest('label') || e.parentElement || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 120) })).slice(0, 10),
    buttons: pick('button,[role=button],input[type=submit]').map((e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 25),
    links: pick('a[href]').map((e) => ({ t: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40), h: e.getAttribute('href') })).filter((z) => /登録|掲載|追加|投稿|submit|register|add|post|無料/i.test(z.t + ' ' + z.h)).slice(0, 15),
  };
});
const out = { at: new Date().toISOString() };
try {
  await page.goto('https://findupapp.com/ja'); await wait(7000);
  out.home = await snap();
  // 등록 진입 = 머리글 «アプリを登録» 버튼(링크가 아니라 버튼 — 10/5 03:09 실측). 눌러서 «열리는 창/화면»만 읽는다(입력·제출 없음).
  const hit = await L.clickText(page, /^アプリを登録$/, { tags: 'button,a,[role=button]', after: 3500 });
  out.entryClick = hit;
  out.entry = await snap();
} catch (e) { out.error = String(e && e.message || e).slice(0, 200); }
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true });
fs.writeFileSync('/tmp/ego/findupapp-probe.json', JSON.stringify(out, null, 1));
const brief = (o) => !o ? '(없음)' : JSON.stringify({ url: o.url, title: o.title, inputs: o.inputs, checks: o.checks, buttons: o.buttons, links: o.links, text: o.text.slice(0, 500).replace(/\n/g, ' | ') });
console.log('HOME:', brief(out.home)); console.log('ENTRY_CLICK:', JSON.stringify(out.entryClick)); console.log('ENTRY:', brief(out.entry)); if (out.error) console.log('오류:', out.error);
