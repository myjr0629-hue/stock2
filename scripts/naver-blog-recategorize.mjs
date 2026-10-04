#!/usr/bin/env node
/* ============================================================================
 * naver-blog-recategorize — 이미 올린 네이버 블로그 글의 «카테고리 → 투자 · 주제 → 비즈니스·경제»를 고친다.
 *   (2026-09-30 HANDOFF §4 0-za: 9/21~9/30 금융 글 23편이 첫 칸 «여행»·주제 없음으로 올라가 있었다 → 23/23 이동 +
 *    투자 칸 주제 없는 5편 지정, 비로그인 PostView 로 카테고리·주제·본문 해시·이미지·링크·등록일 전후 대조 = 변화 0)
 *   · 글 삭제 없음 · 본문 무변경 — 글 보기의 «수정» → 편집기(blog.naver.com/donneum/postupdate?logNo=…) → 헤더 «발행» →
 *     레이어의 «카테고리 목록 버튼»에서 투자(categoryItemText_7), 주제가 안 따라오면 «주제 목록 버튼» → 비즈니스·경제 → 확인 →
 *     레이어 확정 «발행»(data-testid=seOnePublishBtn). 등록일(addDate)은 바뀌지 않는다(실측).
 *   · 작업 파일: ~/signum-ego-io/<KST 날짜>/naver-recat-task.json = {"dry":false,"posts":[{"logNo":"…","title":"…(공개 og:title)"}]}
 *   · 결과: 같은 폴더 naver-recat-results.jsonl 에 글마다 한 줄(강제 종료돼도 남는다) · 한 번에 8편 이하·ego-run 420초
 *   · 전후 검증(비로그인): ~/Documents/signum-work/2026-09-30/cycle/nb_fingerprint.py 방식 — PostView 의 categoryNo·
 *     var postTopics.directory_name·본문 해시
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 120)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const DIR = L.ioDir();
const T = JSON.parse(fs.readFileSync(await L.taskPath('naver-recat-task.json'), 'utf8'));
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const out = (o) => { const line = JSON.stringify({ at: new Date().toISOString(), ...o }); console.log(line.slice(0, 600)); fs.appendFileSync(DIR + '/naver-recat-results.jsonl', line + '\n'); };
const shot = async (page, name) => { try { const s = await page.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${DIR}/${name}.png`, Buffer.from(s.data, 'base64')); } catch {} };
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
const ts = await L.takeSpaceOrExit(sp.id);
// 남아 있는 수정 편집기 탭은 닫는다(다른 글 편집기와 섞이지 않게)
try { for (const pg of await ts.pages()) { try { if (/postupdate\?logNo=/.test(await pg.url())) await pg.close(); } catch {} } } catch {}
await L.wait(1000);
const center = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: (e.innerText || '').replace(/\s+/g, ' ').trim() }; }, sel);
const catText = (ed) => ed.evaluate(() => (document.querySelector('[aria-label="카테고리 목록 버튼"]')?.innerText || '').replace(/\s+/g, ' ').trim());
const topicText = (ed) => ed.evaluate(() => (document.querySelector('[aria-label="주제 목록 버튼"]')?.innerText || '').replace(/\s+/g, ' ').trim());

for (const P of T.posts) {
  const N = String(P.logNo);
  const r = { logNo: N };
  try {
    const pv = await L.findPage(ts, /blog\.naver\.com\/PostView/, null);
    try { await pv.goto(`https://blog.naver.com/PostView.naver?blogId=donneum&logNo=${N}`, { waitUntil: 'domcontentloaded', timeout: 30000 }); } catch {}
    await L.wait(5000);
    const has = await pv.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => (x.innerText || '').trim() === '수정' && /suggestConvert/.test(x.getAttribute('href') || '')); if (!a) return false; a.scrollIntoView({ block: 'center' }); return true; });
    if (!has) { out({ ...r, ok: false, step: 'no-edit-link' }); continue; }
    await L.wait(700);
    const e1 = await pv.evaluate(() => { const a = [...document.querySelectorAll('a')].find((x) => (x.innerText || '').trim() === '수정' && /suggestConvert/.test(x.getAttribute('href') || '')); const q = a.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; });
    await pv.mouse.click(e1.x, e1.y, {});
    // 편집기 탭(같은 탭 이동 또는 새 탭)을 기다린다
    let ed = null;
    for (let i = 0; i < 20 && !ed; i++) { await L.wait(1000); try { for (const pg of await ts.pages()) { try { if (new RegExp(`postupdate\\?logNo=${N}`).test(await pg.url())) ed = pg; } catch {} } } catch {} }
    if (!ed) { out({ ...r, ok: false, step: 'no-editor-tab' }); continue; }
    let title = '';
    for (let i = 0; i < 20 && !title; i++) { await L.wait(1000); title = await ed.evaluate(() => (document.querySelector('.se-title-text')?.innerText || '').replace(/\s+/g, ' ').trim()).catch(() => ''); }
    r.title = title.slice(0, 40);
    if (!title || norm(title).slice(0, 14) !== norm(P.title).slice(0, 14)) { out({ ...r, ok: false, step: 'title-mismatch', want: norm(P.title).slice(0, 20) }); continue; }
    if (await ed.evaluate(() => /작성 중인 글|이어서 작성|수정 중인 글/.test(document.body.innerText))) { out({ ...r, ok: false, step: 'draft-popup' }); await shot(ed, `recat-${N}-popup`); continue; }
    await L.wait(2500);
    await L.trapDialogs(ed);
    await ed.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === '발행' && x.getBoundingClientRect().y < 80); if (b) b.click(); });
    await L.wait(3000);
    r.catBefore = await catText(ed); r.topicBefore = await topicText(ed);
    if (!r.catBefore) { out({ ...r, ok: false, step: 'no-publish-layer' }); await shot(ed, `recat-${N}-nolayer`); continue; }
    // ① 카테고리 → 투자
    if (r.catBefore !== '투자') {
      const cb = await center(ed, '[aria-label="카테고리 목록 버튼"]');
      await ed.mouse.click(cb.x, cb.y, {}); await L.wait(1500);
      const items = await ed.evaluate(() => [...document.querySelectorAll('[data-testid^="categoryItemText_"]')].map((e) => ({ id: e.getAttribute('data-testid'), t: (e.innerText || '').replace(/\s+/g, ' ').trim(), vis: e.getBoundingClientRect().width > 0 })));
      r.catItems = items.map((i) => i.id + '=' + i.t).join(',');
      const it = await ed.evaluate(() => { const e = [...document.querySelectorAll('[data-testid^="categoryItemText_"]')].find((x) => (x.innerText || '').replace(/\s+/g, ' ').trim() === '투자' && x.getBoundingClientRect().width > 0); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; });
      if (!it) { out({ ...r, ok: false, step: 'no-invest-item' }); await ed.keyboard.press('Escape'); continue; }
      await ed.mouse.click(it.x, it.y, {}); await L.wait(1500);
    }
    r.catAfter = await catText(ed);
    if (r.catAfter !== '투자') { out({ ...r, ok: false, step: 'cat-not-set' }); await shot(ed, `recat-${N}-cat`); await ed.keyboard.press('Escape'); continue; }
    // ② 주제 → 비즈니스·경제 (카테고리 주제분류가 자동으로 채우면 건너뛴다)
    r.topicMid = await topicText(ed);
    if (!/비즈니스·경제/.test(r.topicMid)) {
      const tb = await center(ed, '[aria-label="주제 목록 버튼"]');
      await ed.mouse.click(tb.x, tb.y, {}); await L.wait(1800);
      r.topicLayer = await ed.evaluate(() => { const hits = [...document.querySelectorAll('label,button,a,span,li')].filter((e) => (e.innerText || '').replace(/\s+/g, ' ').trim() === '비즈니스·경제' && e.getBoundingClientRect().width > 0); return hits.map((e) => e.tagName + '.' + (e.className || '').toString().slice(0, 30)).join('|'); });
      const tp = await ed.evaluate(() => { const hits = [...document.querySelectorAll('label,button,a,span,li')].filter((e) => (e.innerText || '').replace(/\s+/g, ' ').trim() === '비즈니스·경제' && e.getBoundingClientRect().width > 0); const e = hits.find((x) => x.tagName === 'LABEL') || hits[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) }; });
      if (!tp) { out({ ...r, ok: false, step: 'no-topic-item' }); await shot(ed, `recat-${N}-topic`); await ed.keyboard.press('Escape'); continue; }
      await ed.mouse.click(tp.x, tp.y, {}); await L.wait(1200);
      await shot(ed, `recat-${N}-topiclayer`);
      // 주제 레이어의 «확인»(있을 때만)
      const ok = await ed.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(확인|선택 완료|완료)$/.test((x.innerText || '').trim()) && x.getBoundingClientRect().width > 0); if (!b) return null; const q = b.getBoundingClientRect(); return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), t: (b.innerText || '').trim() }; });
      if (ok) { r.topicConfirm = ok.t; await ed.mouse.click(ok.x, ok.y, {}); await L.wait(1200); }
    }
    r.topicAfter = await topicText(ed);
    await shot(ed, `recat-${N}-layer`);
    if (!/비즈니스·경제/.test(r.topicAfter) || (await catText(ed)) !== '투자') { out({ ...r, ok: false, step: 'topic-not-set' }); await ed.keyboard.press('Escape'); continue; }
    if (T.dry) { out({ ...r, ok: true, step: 'dry-ready' }); await ed.keyboard.press('Escape'); continue; }
    // ③ 발행(수정 발행) — 레이어 안 확정 버튼
    const pb = await center(ed, '[data-testid="seOnePublishBtn"]');
    if (!pb) { out({ ...r, ok: false, step: 'no-publish-btn' }); continue; }
    await ed.mouse.click(pb.x, pb.y, {});
    let after = '';
    for (let i = 0; i < 20; i++) { await L.wait(1000); try { after = await ed.url(); } catch { after = '(tab closed)'; } if (!/postupdate/.test(after)) break; }
    r.afterUrl = after.slice(0, 100);
    r.dialogs = await L.dialogs(ed).catch(() => []);
    out({ ...r, ok: !/postupdate/.test(after), step: 'published' });
  } catch (e) { out({ ...r, ok: false, step: 'exception', err: String(e.message || e).slice(0, 160) }); }
}
console.log('DONE');
