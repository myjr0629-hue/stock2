#!/usr/bin/env node
/* ============================================================================
 * naver-blog-edit-paragraph — 이미 올린 네이버 블로그 글의 «한 문단»을 고쳐 다시 발행한다(수정 발행). (2026-10-04 신설)
 *
 * 왜: MISTAKES #62 — META·GOOGL 글이 앱 «TOTAL PREMIUM» 칸(값은 콜−풋 «순» 프리미엄)을 «거래 금액의 합계»로 설명했다.
 *   정정 방법은 정정 댓글뿐이었고, 본문 수정 도구가 없었다. naver-blog-recategorize.mjs(9/30)의 «수정 → 편집기 → 발행» 경로를 그대로 쓰되
 *   본문의 «딱 한 문단»만 바꾼다. 나머지(제목·이미지·링크 카드·카테고리·주제·등록일)는 건드리지 않는다.
 *
 * 안전 장치(하나라도 어긋나면 «발행하지 않고» 종료):
 *   ① 편집기 제목이 작업 파일 title 앞 14자와 같아야 한다 ② «작성 중인 글/수정 중인 글» 팝업이 있으면 멈춘다
 *   ③ startsWith 로 찾은 문단이 «정확히 1개» ④ 편집 뒤 문단 수 불변·바뀐 문단은 그 1개뿐·글자 모양(span 클래스) 불변
 *   ⑤ 발행 레이어의 카테고리 «투자»·주제 «비즈니스·경제» 확인 후에만 확정 «발행»
 *
 * 작업 파일(ego 는 env·argv 를 못 받는다): ~/signum-ego-io/<KST 날짜>/naver-edit-task.json =
 *   {"dry":false,"posts":[{"logNo":"…","title":"(공개 제목)","startsWith":"고칠 문단의 첫 글자들","newText":"새 문단 전체"}]}
 *   (dry:true 면 편집·검증까지만 하고 발행 없이 편집기를 닫는다 — 닫을 때 «저장 안 함»)
 * 결과: 같은 폴더 naver-edit-results.jsonl 에 글마다 한 줄 · bash scripts/ego-run.sh scripts/naver-blog-edit-paragraph.mjs 300
 * 공개 확인(비로그인)은 호출자가 PostView 를 curl 로 따로 한다(scripts/naver-public-para.py).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 120)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const DIR = L.ioDir();
const TASK = await L.taskPath('naver-edit-task.json'); L.assertFreshTask(TASK, 25);
const T = JSON.parse(fs.readFileSync(TASK, 'utf8'));
const norm = (s) => String(s || '').replace(/[​‌‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const out = (o) => { const line = JSON.stringify({ at: new Date().toISOString(), ...o }); console.log(line.slice(0, 700)); fs.appendFileSync(DIR + '/naver-edit-results.jsonl', line + '\n'); };
const shot = async (page, name) => { try { const s = await page.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${DIR}/${name}.png`, Buffer.from(s.data, 'base64')); } catch {} };
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await L.takeSpaceOrExit(sp.id);
const closeEditors = async () => { try { for (const pg of await ts.pages()) { try { if (/postupdate\?logNo=/.test(await pg.url())) await pg.close(); } catch {} } } catch {} };
await closeEditors();
await L.wait(800);

const paras = (ed) => ed.evaluate(() => [...document.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle')).map((p) => ({
  t: (p.innerText || '').replace(/[​‌‍﻿]/g, '').replace(/\s+/g, ' ').trim(),
  c: [...p.querySelectorAll('span')].map((s) => (s.className || '').toString().replace(/\s+/g, ' ').trim()).filter(Boolean).join('|'),
})));
const center = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; }, sel);
const catText = (ed) => ed.evaluate(() => (document.querySelector('[aria-label="카테고리 목록 버튼"]')?.innerText || '').replace(/\s+/g, ' ').trim());
const topicText = (ed) => ed.evaluate(() => (document.querySelector('[aria-label="주제 목록 버튼"]')?.innerText || '').replace(/\s+/g, ' ').trim());

for (const P of T.posts) {
  const N = String(P.logNo); const r = { logNo: N };
  try {
    // ① 글 보기 → «수정» (recategorize 와 같은 경로)
    const pv = await L.findPage(ts, /blog\.naver\.com\/PostView/, null);
    try { await pv.goto(`https://blog.naver.com/PostView.naver?blogId=donneum&logNo=${N}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
    await L.wait(5000);
    const has = await pv.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => (x.innerText || '').trim() === '수정' && /suggestConvert/.test(x.getAttribute('href') || '')); if (!a) return false; a.scrollIntoView({ block: 'center' }); return true; });
    if (!has) { out({ ...r, ok: false, step: 'no-edit-link' }); continue; }
    await L.wait(700);
    const e1 = await pv.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => (x.innerText || '').trim() === '수정' && /suggestConvert/.test(x.getAttribute('href') || '')); const q = a.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; });
    await pv.mouse.click(e1.x, e1.y, {});
    let ed = null;
    for (let i = 0; i < 20 && !ed; i++) { await L.wait(1000); try { for (const pg of await ts.pages()) { try { if (new RegExp(`postupdate\\?logNo=${N}`).test(await pg.url())) ed = pg; } catch {} } } catch {} }
    if (!ed) { out({ ...r, ok: false, step: 'no-editor-tab' }); continue; }
    let title = '';
    for (let i = 0; i < 20 && !title; i++) { await L.wait(1000); title = await ed.evaluate(() => (document.querySelector('.se-title-text')?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => ''); }
    r.title = title.slice(0, 40);
    if (!title || norm(title).slice(0, 14) !== norm(P.title).slice(0, 14)) { out({ ...r, ok: false, step: 'title-mismatch', want: norm(P.title).slice(0, 20) }); await closeEditors(); continue; }
    if (await ed.evaluate(() => /작성 중인 글|이어서 작성|수정 중인 글/.test(document.body.innerText))) { out({ ...r, ok: false, step: 'draft-popup' }); await shot(ed, `edit-${N}-popup`); continue; }
    await L.wait(2500);
    await L.trapDialogs(ed);

    // ② 고칠 문단 찾기 — 정확히 1개
    const before = await paras(ed);
    const idxs = before.map((p, i) => (p.t.startsWith(norm(P.startsWith)) ? i : -1)).filter((i) => i >= 0);
    r.paras = before.length; r.hits = idxs.length;
    if (idxs.length !== 1) { out({ ...r, ok: false, step: 'para-not-unique' }); await closeEditors(); continue; }
    const idx = idxs[0]; r.idx = idx; r.beforeText = before[idx].t.slice(0, 80);
    // ③ 문단 끝을 «실제 마우스로 클릭» → «실제 키보드(Shift+←)»로 글자 수만큼 거꾸로 선택 → 입력
    //   (10/4 17시 첫 시도: DOM Selection API 로 선택하면 편집기가 자기 선택을 되살려 «클릭 자리(총 프|리미엄)»에 끼워 넣었다 —
    //    edit-mismatch 게이트가 발행 전에 막았다. 선택도 «실제 키»로 한다. 줄바꿈 수에 기대지 않게 글자 수로 센다.)
    const where = await ed.evaluate((i) => {
      const ps = [...document.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle')); const p = ps[i];
      p.scrollIntoView({ block: 'center' }); return true;
    }, idx);
    await L.wait(900);
    const endPos = await ed.evaluate((i) => {
      const ps = [...document.querySelectorAll('.se-text-paragraph')].filter((p) => !p.closest('.se-documentTitle')); const p = ps[i];
      const pr = p.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(p);
      const rs = [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0); const last = rs[rs.length - 1];
      if (!last) return null; return { x: Math.round(Math.min(last.right + 40, pr.right - 8)), y: Math.round(last.top + last.height / 2) };
    }, idx);
    if (!endPos) { out({ ...r, ok: false, step: 'no-end-pos' }); await closeEditors(); continue; }
    // 지우기: 문단 끝을 클릭하고 «글자 수만큼 Backspace». (10/4 17시 실측 — ego 키보드는 Shift+←·삼중 클릭·Alt/Meta+Shift+↑ 로는 선택이 안 만들어졌다(전부 0자)
    //   · DOM Selection 으로 만든 선택은 편집기가 되살려 끼워 넣기가 됐다. Backspace 는 편집기가 자기 키 처리로 받는다.)
    //   글자 수가 정확하지 않으면 «한 글자 더 지워 앞 문단과 합쳐지는» 사고가 나므로 다 지운 직후 «문단 수 불변·그 문단이 빔·이웃 문단 불변»을 확인하고,
    //   남았으면 한 글자씩 더 지운다(최대 +6) · 합쳐졌으면(문단 수 감소) 발행 없이 종료.
    await ed.mouse.click(endPos.x, endPos.y, {}); await L.wait(400);
    await ed.keyboard.press('End'); await L.wait(200);
    const nChars = [...before[idx].t].length; r.nChars = nChars;
    for (let k = 0; k < nChars; k++) await ed.keyboard.press('Backspace');
    await L.wait(500);
    let mid = await paras(ed); r.extra = 0;
    while (mid.length === before.length && mid[idx] && mid[idx].t !== '' && r.extra < 6) { await ed.keyboard.press('Backspace'); r.extra++; await L.wait(150); mid = await paras(ed); }
    const neighborsSame = mid.length === before.length && mid.every((p, i) => i === idx || p.t === before[i].t);
    r.midText = ((mid[idx] || {}).t || '').slice(0, 40); r.midParas = mid.length;
    if (!neighborsSame || (mid[idx] && mid[idx].t !== '')) { out({ ...r, ok: false, step: 'delete-incomplete' }); await shot(ed, `edit-${N}-delete`); await closeEditors(); continue; }
    await ed.keyboard.type(P.newText, { delay: 6 }); await L.wait(900);
    const after = await paras(ed);
    const diff = after.map((p, i) => (before[i] && p.t === before[i].t ? -1 : i)).filter((i) => i >= 0);
    r.afterParas = after.length; r.diff = diff.join(',');
    if (after.length !== before.length || diff.length !== 1 || diff[0] !== idx || after[idx].t !== norm(P.newText)) {
      r.afterText = (after[idx] || {}).t; out({ ...r, ok: false, step: 'edit-mismatch' }); await shot(ed, `edit-${N}-mismatch`); await closeEditors(); continue;
    }
    // 글자 모양(span 클래스 묶음)이 같은 문단들과 같은지 — 크기·색이 달라지면 글이 어색해진다
    const sameStyle = after[idx].c === before[idx].c;
    r.styleSame = sameStyle; if (!sameStyle) { r.cBefore = before[idx].c.slice(0, 100); r.cAfter = after[idx].c.slice(0, 100); }
    await shot(ed, `edit-${N}-edited`);
    if (!sameStyle) { out({ ...r, ok: false, step: 'style-changed' }); await closeEditors(); continue; }
    if (T.dry) { out({ ...r, ok: true, step: 'dry-edited-not-published' }); await closeEditors(); continue; }

    // ④ 발행 레이어 — 카테고리·주제가 그대로인지 확인한 뒤에만 «수정 발행»
    await ed.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === '발행' && x.getBoundingClientRect().y < 80); if (b) b.click(); });
    await L.wait(3000);
    r.cat = await catText(ed); r.topic = await topicText(ed);
    if (r.cat !== '투자' || !/비즈니스·경제/.test(r.topic)) { out({ ...r, ok: false, step: 'layer-category-changed' }); await shot(ed, `edit-${N}-layer`); await ed.keyboard.press('Escape'); continue; }
    const pb = await center(ed, '[data-testid="seOnePublishBtn"]');
    if (!pb) { out({ ...r, ok: false, step: 'no-publish-btn' }); await shot(ed, `edit-${N}-nobtn`); continue; }
    await ed.mouse.click(pb.x, pb.y, {});
    let end = '';
    for (let i = 0; i < 20; i++) { await L.wait(1000); try { end = await ed.url(); } catch { end = '(tab closed)'; } if (!/postupdate/.test(end)) break; }
    r.afterUrl = end.slice(0, 100); r.dialogs = await L.dialogs(ed).catch(() => []);
    out({ ...r, ok: !/postupdate/.test(end), step: 'published' });
  } catch (e) { out({ ...r, ok: false, step: 'exception', err: String((e && e.message) || e).slice(0, 160) }); }
}
console.log('DONE');
