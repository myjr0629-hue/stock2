#!/usr/bin/env node
/* ============================================================================
 * tistory-edit-paragraph — 이미 올린 티스토리(smartbox) 글의 «한 문단의 끝 문장»을 고쳐 다시 발행한다. (2026-10-04 신설)
 *
 * 왜: MISTAKES #62 — 앱 «TOTAL PREMIUM» 칸(값은 콜−풋 순 프리미엄)을 «거래 금액의 합계»로 설명한 문장이 네이버 META·GOOGL 말고
 *   티스토리 COST 글(13:15 발행·292번)에도 있었다(17시 grep 으로 발견). naver-blog-edit-paragraph.mjs 와 같은 방식 —
 *   글 편집기(TinyMCE iframe #editor-tistory_ifr)에서 «문단 끝 실제 클릭 → 옛 문장 글자 수만큼 Backspace → 새 문장 입력» → 완료 → 공개 발행.
 *
 * 안전 장치(하나라도 어긋나면 «발행하지 않고» 종료): ① 제목칸 값이 task.title 앞 14자와 같아야 한다 ② 로드 중 확인창이 뜨면 멈춘다
 *   ③ startsWith 로 찾은 문단이 «정확히 1개»·그 문단이 oldTail 로 끝나야 한다 ④ 지운 뒤 문단 = 앞부분만 남고 ⑤ 입력 뒤 문단 = 앞부분 + newTail ·
 *   다른 문단 텍스트·이미지 수 불변 ⑥ 발행 레이어의 최종 버튼 글자가 «공개 발행/발행/수정» 하나로 특정될 때만 클릭.
 * 작업 파일: ~/signum-ego-io/<KST 날짜>/tistory-edit-task.json = {"dry":false,"postId":"292","title":"…","startsWith":"문단 첫 글자들","oldTail":"…","newTail":"…"}
 * 결과: 같은 폴더 tistory-edit-results.jsonl · bash scripts/ego-run.sh scripts/tistory-edit-paragraph.mjs 300 · 공개 확인은 호출자가 curl 로(비로그인)
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 120)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const DIR = L.ioDir();
const TASK = await L.taskPath('tistory-edit-task.json'); L.assertFreshTask(TASK, 25);
const T = JSON.parse(fs.readFileSync(TASK, 'utf8'));
const norm = (s) => String(s || '').replace(/[​‌‍﻿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const out = (o) => { const line = JSON.stringify({ at: new Date().toISOString(), postId: T.postId, ...o }); console.log(line.slice(0, 800)); fs.appendFileSync(DIR + '/tistory-edit-results.jsonl', line + '\n'); };
const shot = async (page, name) => { try { const s = await page.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${DIR}/${name}.png`, Buffer.from(s.data, 'base64')); } catch {} };
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await L.takeSpaceOrExit(sp.id);
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /tistory/, null);
const r = {};
try {
  try { await page.goto(`https://smartbox.tistory.com/manage/newpost/${T.postId}?type=post`, { waitUntil: 'domcontentloaded' }); } catch {}
  // 로드 중 확인창(예: «작성 중인 글이 있습니다»)은 원문을 남기고 «멈춘다»(tistory-post.mjs 와 같은 규칙)
  { const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      let inf = null; try { inf = await page.info(); } catch {}
      const d = inf && inf.dialog;
      if (d) { r.dialog = String(d.message || '').slice(0, 120) + '|' + (d.type || '?');
        if (d.type === 'alert') { await page.acceptDialog(); } else { out({ ...r, ok: false, step: 'confirm-dialog' }); process.exit(3); } }
      await L.wait(700); } }
  await L.trapDialogs(page);
  const head = await page.evaluate(() => ({ url: location.href.slice(0, 90), title: (document.querySelector('#post-title-inp') || {}).value || '', ifr: !!document.querySelector('#editor-tistory_ifr') }));
  r.url = head.url; r.title = head.title.slice(0, 40);
  if (!head.ifr || norm(head.title).slice(0, 14) !== norm(T.title).slice(0, 14)) { out({ ...r, ok: false, step: 'title-or-editor-mismatch', want: norm(T.title).slice(0, 20) }); process.exit(1); }
  await L.wait(2500);
  const paras = () => page.evaluate(() => { const d = document.querySelector('#editor-tistory_ifr').contentDocument; return { ps: [...d.querySelectorAll('p')].map((p) => (p.innerText || '').replace(/[​‌‍﻿ ]/g, ' ').replace(/\s+/g, ' ').trim()), imgs: d.querySelectorAll('img').length }; });
  const before = await paras();
  const idxs = before.ps.map((t, i) => (t.startsWith(norm(T.startsWith)) ? i : -1)).filter((i) => i >= 0);
  r.paras = before.ps.length; r.hits = idxs.length; r.imgs = before.imgs;
  if (idxs.length !== 1) { out({ ...r, ok: false, step: 'para-not-unique' }); process.exit(1); }
  const idx = idxs[0]; const oldFull = before.ps[idx];
  if (!oldFull.endsWith(norm(T.oldTail))) { r.tailNow = oldFull.slice(-60); out({ ...r, ok: false, step: 'old-tail-mismatch' }); process.exit(1); }
  const headPart = oldFull.slice(0, oldFull.length - norm(T.oldTail).length).trimEnd();
  // 문단 끝 클릭 위치(iframe 안 좌표 + iframe 위치) — 스크롤 → 대기 → 다시 측정(RUNBOOK §4-4)
  const scrollTo = () => page.evaluate((i) => { const f = document.querySelector('#editor-tistory_ifr'); const d = f.contentDocument; const p = [...d.querySelectorAll('p')][i]; p.scrollIntoView({ block: 'center' }); return true; }, idx);
  await scrollTo(); await L.wait(900);
  const endPos = await page.evaluate((i) => {
    const f = document.querySelector('#editor-tistory_ifr'); const fr = f.getBoundingClientRect(); const d = f.contentDocument;
    const p = [...d.querySelectorAll('p')][i]; const pr = p.getBoundingClientRect(); const rg = d.createRange(); rg.selectNodeContents(p);
    const rs = [...rg.getClientRects()].filter((q) => q.width > 0 && q.height > 0); const last = rs[rs.length - 1]; if (!last) return null;
    return { x: Math.round(fr.left + Math.min(last.right + 30, pr.right - 6)), y: Math.round(fr.top + last.top + last.height / 2) };
  }, idx);
  if (!endPos) { out({ ...r, ok: false, step: 'no-end-pos' }); process.exit(1); }
  await page.mouse.click(endPos.x, endPos.y, {}); await L.wait(500);
  await page.keyboard.press('End'); await L.wait(200);
  const nChars = [...norm(T.oldTail)].length; r.nChars = nChars;
  for (let k = 0; k < nChars; k++) await page.keyboard.press('Backspace');
  await L.wait(500);
  let mid = await paras(); r.extra = 0;
  // 앞부분만 남았는지(남은 글자가 있으면 한 글자씩 더, 최대 +4) — 앞 문단과 합쳐지면(문단 수 감소) 즉시 중단
  while (mid.ps.length === before.ps.length && mid.ps[idx] !== headPart && mid.ps[idx].length > headPart.length && r.extra < 4) { await page.keyboard.press('Backspace'); r.extra++; await L.wait(150); mid = await paras(); }
  r.midTail = (mid.ps[idx] || '').slice(-30);
  const neighborsSame = mid.ps.length === before.ps.length && mid.ps.every((t, i) => i === idx || t === before.ps[i]);
  if (!neighborsSame || mid.ps[idx] !== headPart) { out({ ...r, ok: false, step: 'delete-mismatch' }); await shot(page, `tistory-edit-${T.postId}-delete`); process.exit(1); }
  // 옛 문장 «앞의 공백»은 지우지 않았다(글자 수 = oldTail 만) — 공백을 또 넣으면 이중 공백(&nbsp;)이 된다
  await page.keyboard.type(norm(T.newTail), { delay: 6 }); await L.wait(900);
  const after = await paras();
  const want = headPart + ' ' + norm(T.newTail);
  const diff = after.ps.map((t, i) => (before.ps[i] === t ? -1 : i)).filter((i) => i >= 0);
  r.afterParas = after.ps.length; r.diff = diff.join(','); r.afterImgs = after.imgs;
  if (after.ps.length !== before.ps.length || diff.length !== 1 || diff[0] !== idx || norm(after.ps[idx]) !== norm(want) || after.imgs !== before.imgs) {
    r.afterTail = (after.ps[idx] || '').slice(-80); out({ ...r, ok: false, step: 'edit-mismatch' }); await shot(page, `tistory-edit-${T.postId}-mismatch`); process.exit(1);
  }
  await shot(page, `tistory-edit-${T.postId}-edited`);
  if (T.dry) { out({ ...r, ok: true, step: 'dry-edited-not-published' }); process.exit(0); }
  // 완료 → 레이어 → 최종 버튼(글자로 특정) — 눌러서 이동한다
  const btnAt = (re) => page.evaluate((src) => { const rx = new RegExp(src); const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const hits = [...document.querySelectorAll('button,a')].filter((b) => rx.test(n(b.innerText)) && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height > 0);
    return hits.map((b) => { const q = b.getBoundingClientRect(); return { t: n(b.innerText), x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; }); }, re);
  const done = await btnAt('^완료$');
  if (done.length !== 1) { r.done = done.length; out({ ...r, ok: false, step: 'done-button-count' }); process.exit(1); }
  await page.mouse.click(done[0].x, done[0].y, {}); await L.wait(2500);
  const layer = await page.evaluate(() => { const n = (s) => (s || '').replace(/\s+/g, ' ').trim(); return { radios: [...document.querySelectorAll('input[type=radio]')].map((q) => { const l = q.closest('label') || document.querySelector(`label[for="${q.id}"]`); return (q.checked ? '●' : '○') + n(l && l.innerText); }).slice(0, 8), btns: [...document.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => n(b.innerText)).filter((x) => /발행|수정|저장|취소|완료/.test(x)).slice(0, 10) }; });
  r.layer = JSON.stringify(layer).slice(0, 300);
  const pubs = await btnAt('^(공개 발행|발행|공개 수정|수정 완료|수정)$');
  const pub = pubs.filter((b) => b.y > 100);
  if (pub.length !== 1) { r.pubTexts = pubs.map((b) => b.t).join('|'); out({ ...r, ok: false, step: 'publish-button-ambiguous' }); await shot(page, `tistory-edit-${T.postId}-layer`); process.exit(1); }
  if (!/●\s*공개/.test(layer.radios.join('|'))) { out({ ...r, ok: false, step: 'not-public-radio' }); await shot(page, `tistory-edit-${T.postId}-radio`); process.exit(1); }
  await page.mouse.click(pub[0].x, pub[0].y, {});
  let end = '';
  for (let i = 0; i < 20; i++) { await L.wait(1000); try { end = await page.evaluate(() => location.href); } catch { end = '(navigating)'; } if (!/newpost/.test(end)) break; }
  r.afterUrl = end.slice(0, 100); r.dialogs = await L.dialogs(page).catch(() => []);
  out({ ...r, ok: !/newpost/.test(end), step: 'published' });
} catch (e) { out({ ...r, ok: false, step: 'exception', err: String((e && e.message) || e).slice(0, 160) }); }
console.log('DONE');
