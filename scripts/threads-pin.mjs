/* ==========================================================================
 * threads-pin — Threads(@signumhq_official) 내 글 하나를 프로필 «고정»으로 바꾼다. (2026-10-05 신설 — 리딤 «방식 B 확대»)
 * 사용: echo '{"post":"https://www.threads.com/@signumhq_official/post/<ID>","unpin":"<기존 고정 글 주소(선택)>","dry":false}' > ~/signum-ego-io/<KST>/threads-pin.json
 *       bash scripts/ego-run.sh scripts/threads-pin.mjs 200
 * 흐름: 글 주소 열기 → «그 글 컨테이너 안»의 «더 보기»(…) → 메뉴 항목 «프로필에 고정»/«Pin to profile» «만» 누른다(정확 일치 — 삭제·수정·보관 항목은 절대 안 누른다)
 *       → 확인 창이 있으면 «고정»/«Pin» → 프로필 첫 글이 그 글이고 «고정됨/Pinned» 표식이 있는지 확인.
 * dry:true 면 프로필 현황·후보 단추·메뉴 항목 «전부»를 출력하고(캡처 threads-pin-dry-menu.png) 아무것도 누르지 않는다(메뉴는 Escape 로 닫는다).
 * 이미 고정돼 있으면(메뉴에 «고정 해제/Unpin») 그대로 끝낸다.
 *
 * ★10/6 수리(11:5x 실패 «메뉴 후보: [사이드바 글자만] ⛔ 항목 없음»): 단추를 «시각 링크와 같은 줄·오른쪽»이라는 좌표 조건으로만 골라
 *   왼쪽 전역 «더 보기»/머리띠 «…» 를 눌러 글 메뉴가 열리지 않았다. 이제는 ① 글의 시각 링크에서 조상을 타고 올라가 «다른 글 링크를 품지 않는
 *   가장 큰 상자»를 글 컨테이너로 잡고 ② 그 안의 더 보기 단추(aria-label/svg title «더 보기»·«More», 크기 0 아님, 화면 안)만 후보로 둔다.
 *   메뉴 항목도 «단추 둘레(왼쪽 아래 440×620px) 안»의 글자만 읽어 사이드바 글자가 섞이지 않는다.
 * ★10/6 12:00 실측: 메뉴 «항목»은 실제 마우스 클릭이 반영되지 않는다(10/5·10/6 11:57 모두 메뉴만 닫히고 프로필 무변화) → JS 포인터 연쇄가 기본(js:false 로만 끈다).
 *   고정 글이 이미 있으면 unpin 으로 먼저 «고정 취소» → 새 글 «프로필에 고정» → 토스트 «상단에 고정됨» → 프로필 첫 글·«고정됨» 확인(성공 경로).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T = JSON.parse(fs.readFileSync(await L.taskPath('threads-pin.json'), 'utf8'));
const id = (String(T.post || '').match(/\/post\/([A-Za-z0-9_-]+)/) || [])[1];
if (!id) { console.log('⛔ Threads 글 주소가 아니다'); process.exit(1); }
const PIN_RE = /^(프로필에 고정|프로필에 고정하기|Pin to profile)$/;
const UNPIN_RE = /^(고정 취소|프로필에서 고정 해제|고정 해제|Unpin from profile|Unpin)$/;
const CONF_RE = /^(고정|고정하기|바꾸기|교체|교체하기|변경|확인|Pin|Replace|Change)$/;
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
await L.trapDialogs(page);

/** 프로필 첫 화면 — 첫 글 4개 주소와 «고정됨» 표식(읽기만). */
async function readProfile() {
  try { await page.goto('https://www.threads.com/@signumhq_official', { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(9000);
  return page.evaluate(() => {
    const t = (document.body.innerText || '');
    const links = [...document.querySelectorAll('a[href*="/post/"]')].map((a) => (a.getAttribute('href') || '').split('?')[0])
      .filter((h) => /\/@signumhq_official\/post\//.test(h)).filter((h, k, arr) => arr.indexOf(h) === k).slice(0, 4);
    const i = t.search(/고정됨|Pinned/);
    return { links, pinnedMark: i > -1 && i < 4000, around: i > -1 ? t.slice(Math.max(0, i - 30), i + 90).replace(/\s+/g, ' ').replace(/[A-Z0-9]{8,}/g, '[번호 가림]') : '' };
  });
}

/** 글 컨테이너 안의 «더 보기» 단추를 고른다(좌표 조건이 아니라 DOM 소속으로). */
function findMore(pid) {
  return page.evaluate((id) => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const inView = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const links = [...document.querySelectorAll('a[href*="/post/"]')].filter((a) => (a.getAttribute('href') || '').includes(id));
    const tl = links.find((a) => a.querySelector('time')) || links[0];
    if (!tl) return { err: 'no-link', links: links.length };
    const lr = tl.getBoundingClientRect();
    let box = tl;
    for (let a = tl.parentElement; a && a !== document.body; a = a.parentElement) {
      if (a.tagName === 'MAIN' || a.getAttribute('role') === 'main') break;
      const hrefs = [...a.querySelectorAll('a[href*="/post/"]')].map((x) => x.getAttribute('href') || '');
      if (hrefs.some((h) => !h.includes(id))) break;            // 답글·다른 글까지 품는 조상은 글 컨테이너가 아니다
      if (a.querySelector('nav,header,[role=navigation],[role=banner]') || a.getBoundingClientRect().width > innerWidth * 0.8) break;   // ★10/6 실측: 답글 없는 글은 화면 전체까지 올라갔다(전역 ☰·머리띠 … 포함) → 사이드바·머리띠를 품기 전에 멈춘다
      box = a;
    }
    const br = box.getBoundingClientRect();
    const seen = new Set(); const cands = [];
    const svgLabel = (s) => n(s.getAttribute('aria-label') || s.getAttribute('title') || (s.querySelector('title') || {}).textContent || '');
    const push = (el, how) => {
      const b = el.closest('[role=button]') || el;
      if (seen.has(b)) return; seen.add(b);
      const r = b.getBoundingClientRect();
      const label = n(b.getAttribute('aria-label') || '') || [...b.querySelectorAll('svg')].map(svgLabel).find(Boolean) || n(b.innerText || '');
      cands.push({ how, label: label.slice(0, 30), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height),
        inView: inView(r), haspopup: b.getAttribute('aria-haspopup') || '', dy: Math.round(Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2))), right: r.left >= lr.right - 2 });
    };
    for (const s of box.querySelectorAll('svg')) if (/^(더 보기|More|その他|更多)$/i.test(svgLabel(s))) push(s, 'svg');
    for (const e of box.querySelectorAll('[aria-label]')) if (/^(더 보기|More|その他|更多)$/i.test(n(e.getAttribute('aria-label')))) push(e, 'aria');
    for (const e of box.querySelectorAll('[role=button][aria-haspopup=menu],[role=button][aria-haspopup=true]')) push(e, 'haspopup');
    const good = cands.filter((c) => c.inView && c.w > 0 && c.h > 0 && c.w < 120 && c.h < 120);
    const score = (c) => (/^(더 보기|More|その他|更多)$/i.test(c.label) ? 0 : 20) + (c.right ? 0 : 5) + Math.min(c.dy, 800) / 100;
    good.sort((a, b) => score(a) - score(b));
    const chosen = good[0] || null;
    return { chosen, cands, box: { tag: box.tagName, w: Math.round(br.width), h: Math.round(br.height), top: Math.round(br.top) }, time: { x: Math.round(lr.left), y: Math.round(lr.top + lr.height / 2) }, vw: innerWidth, vh: innerHeight };
  }, pid);
}

/** 단추 둘레(팝업 메뉴 자리)의 짧은 잎 글자만 읽는다 — role=menuitem 이 있으면 그것을 우선. */
function readMenu(btn) {
  return page.evaluate((b) => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    const near = (r) => r.right > b.x - 460 && r.left < b.x + 80 && r.bottom > b.y - 60 && r.top < b.y + 640;
    const items = [...document.querySelectorAll('[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]')];
    const pool = items.length ? items : [...document.querySelectorAll('div,span,a,[role=button]')];
    for (const e of pool) {
      const t = n(e.innerText); if (!t || t.length > 24) continue;
      if (!items.length && [...e.children].some((c) => n(c.innerText) === t)) continue;
      const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0 || !near(r)) continue;
      out.push({ t, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    return { viaRole: !!items.length, items: out.filter((o, k, arr) => arr.findIndex((p) => p.t === o.t && Math.abs(p.y - o.y) < 6) === k) };
  }, btn);
}

async function openMenu(url, tag) {
  const pid = (String(url).match(/\/post\/([A-Za-z0-9_-]+)/) || [])[1];
  try { await page.goto(url, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(9000);
  const f = await findMore(pid);
  if (T.dry || !f.chosen) console.log(`[${tag}] 단추 탐색:`, JSON.stringify({ err: f.err, box: f.box, time: f.time, vw: f.vw, vh: f.vh, chosen: f.chosen, cands: (f.cands || []).map((c) => `${c.how}:${c.label}@${c.x},${c.y} ${c.w}x${c.h}${c.inView ? '' : ' 화면밖'}${c.haspopup ? ' popup=' + c.haspopup : ''} dy=${c.dy}`) }));
  if (!f.chosen) return null;
  await page.mouse.move(f.chosen.x, f.chosen.y); await L.wait(300);
  await page.mouse.click(f.chosen.x, f.chosen.y, { label: '글 더 보기' }); await L.wait(2200);
  const m = await readMenu(f.chosen);
  console.log(`[${tag}] 메뉴 항목(${m.viaRole ? 'role' : '둘레'}):`, JSON.stringify(m.items.map((i) => i.t)));
  if (T.dry) await page.screenshot({ path: L.ioDir() + `/threads-pin-dry-${tag}.png` }).catch(() => {});
  return m.items;
}
/** 메뉴 항목 누르기. ★10/5·10/6 실측: 항목 가운데를 «실제 마우스»로 눌러도 메뉴만 닫히고 반영되지 않는다(두 번 다 프로필 무변화).
 *  js:true 면 role=menuitem 요소(정확 일치) «안쪽 글자 요소»에 pointerdown→mousedown→pointerup→mouseup→click 을 차례로 보낸다 —
 *  lib.jsClick 은 문서 순서 첫 일치(바깥 포장 div)에 click() 만 보내 안쪽 메뉴 항목의 처리기가 안 받을 수 있다. */
async function pressItem(it, label) {
  if (T.js !== false) {
    const r = await page.evaluate(({ text }) => {
      const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const item = [...document.querySelectorAll('[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]')].find((e) => n(e.innerText) === text);
      if (!item) return null;
      let el = item; for (;;) { const c = [...el.children].find((k) => n(k.innerText) === text); if (!c) break; el = c; }
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2), button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window };
      for (const [type, Ev, extra] of [['pointerdown', PointerEvent, { buttons: 1 }], ['mousedown', MouseEvent, { buttons: 1 }], ['pointerup', PointerEvent, {}], ['mouseup', MouseEvent, {}], ['click', MouseEvent, {}]]) el.dispatchEvent(new Ev(type, { ...o, ...extra }));
      return { role: item.getAttribute('role'), tag: el.tagName, text: n(item.innerText).slice(0, 30) };
    }, { text: it.t });
    console.log('JS 클릭(' + label + '):', JSON.stringify(r));
  } else { await page.mouse.move(it.x, it.y); await L.wait(400); await page.mouse.click(it.x, it.y, { label }); }
}
/** 클릭 뒤 확인 창(있을 때만) — role=dialog 가 아닐 수 있어 «보이는 짧은 잎 글자» 중 확인 문구를 찾는다(정확 일치만, 취소·삭제는 안 누름) */
async function confirmIfAny() {
  const dlg = await page.evaluate(() => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const e of document.querySelectorAll('div,span,button,[role=button]')) {
      const t = n(e.innerText); if (!t || t.length > 40) continue;
      if ([...e.children].some((c) => n(c.innerText) === t)) continue;
      const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0 || r.left < 260) continue;   // 왼쪽 사이드바 제외
      out.push({ t, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
    return out;
  });
  console.log('클릭 뒤 확인 후보:', JSON.stringify(dlg.filter((o) => CONF_RE.test(o.t) || /고정|Pin/.test(o.t)).map((o) => o.t).slice(0, 12)));
  const conf = dlg.filter((o) => CONF_RE.test(o.t)).pop();
  if (conf) { await page.mouse.click(conf.x, conf.y, { label: '고정 확인: ' + conf.t }); await L.wait(3000); return conf.t; }
  return null;
}

if (T.dry) { const before = await readProfile(); console.log('프로필 현황(전):', JSON.stringify(before)); }

// (선택) 기존 고정 글을 먼저 해제 — ★10/5 실측: 고정 글이 이미 있으면 «프로필에 고정»을 눌러도 바뀌지 않았다(조용히 무시)
if (T.unpin) {
  let ui = null;
  for (let k = 0; k < 2 && !(ui && ui.length); k++) ui = await openMenu(T.unpin, 'unpin');
  const un = (ui || []).find((i) => UNPIN_RE.test(i.t));
  if (T.dry) { console.log('DRY — 해제 항목:', un ? un.t : '(없음)'); try { await page.keyboard.press('Escape'); } catch {} }
  else if (un) { await pressItem(un, '기존 고정 해제'); await L.wait(3000); console.log('기존 고정 해제 누름:', un.t); }
  else console.log('⚠ 해제 항목 없음 — 기존 고정이 이미 풀렸거나 메뉴가 안 열렸다');
}
let items = null;
for (let k = 0; k < 2 && !(items && items.length); k++) items = await openMenu(T.post, 'pin');   // 메뉴가 가끔 안 열린다(10/5 실측) — 한 번 더
items = items || [];
if (items.some((i) => UNPIN_RE.test(i.t))) { console.log('이미 고정돼 있다'); try { await page.keyboard.press('Escape'); } catch {} process.exit(0); }
const pin = items.find((i) => PIN_RE.test(i.t));
if (T.dry) { console.log('DRY — 누르지 않음. 고정 항목:', pin ? pin.t : '(없음)'); try { await page.keyboard.press('Escape'); } catch {} process.exit(0); }
if (!pin) { console.log('⛔ «프로필에 고정» 항목 없음 — 누르지 않는다'); try { await page.keyboard.press('Escape'); } catch {} process.exit(1); }
await page.screenshot({ path: L.ioDir() + '/threads-pin-menu.png' }).catch(() => {});
await pressItem(pin, '프로필에 고정');
await L.wait(2500);
await page.screenshot({ path: L.ioDir() + '/threads-pin-after.png' }).catch(() => {});
await confirmIfAny();
// 검증 — 프로필 첫 글
const v = await readProfile();
console.log('검증:', JSON.stringify({ first: v.links[0] || '', same: (v.links[0] || '').includes(id), pinnedMark: v.pinnedMark, links: v.links, around: v.around }));
if ((v.links[0] || '').includes(id) && v.pinnedMark) console.log('✅ 고정 완료:', T.post); else { console.log('⚠ 프로필 첫 글·고정 표식 확인 실패 — «고정했다»고 적지 않는다'); process.exit(1); }
