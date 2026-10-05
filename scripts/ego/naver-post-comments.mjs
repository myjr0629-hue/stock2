/* 네이버 블로그 글 «댓글 읽기» — 읽기 전용 (2026-10-05 11시 회차 신설)
 * 왜: 리딤 B 글(네이버)은 b-posts-check.py 가 «이 도구가 모르는 주소 형식 — 직접 확인»으로 건너뛴다(10/5 08·09·10·11시 회차 연속 «읽는 도구 없음»).
 *     남이 «사용했어요 ①» 댓글을 달아도 갱신 답글(사용됨·남은 번호)이 영영 못 나간다. 공개 댓글 API(apis.naver.com/commentBox/cbox/…)는 서버 호출에
 *     «3300 서비스 정책에 의해 사용이 제한되었습니다»(10/5 11시 curl 실측) — 우회하지 않고, 사람이 보는 길(글 페이지의 댓글 영역)을 브라우저로 «읽는다».
 * 실행: bash scripts/ego-run.sh scripts/ego/naver-post-comments.mjs 120
 *       작업 파일 ~/signum-ego-io/<KST>/naver-comments-task.json = {"urls":["https://blog.naver.com/<블로그ID>/<글번호>", …최대 4]}
 *       결과 ~/signum-ego-io/<KST>/naver-comments-result.json · 마지막 줄 RESULT {json}
 * 검증(10/5 11시): 양성 대조군 = 댓글 1개인 남의 공개 글(댓글 버튼 «댓글 1 새 댓글» → .u_cbox_comment 1개 판독) · 우리 B 글(댓글 0) = 위젯 확인 + 댓글 버튼 없음.
 *       PC «글 본문 단독 화면»(PostView.naver)을 쓴다 — 모바일(m.blog.naver.com)에는 댓글 위젯이 안 그려졌다(2회 실측).
 * 읽기 전용 — 입력·제출·공감·이웃추가 없음. 댓글 영역을 «열기» 위한 댓글 버튼 1번 클릭만 한다(스마트링크·외부 링크는 누르지 않는다).
 * 일회용 번호 모양(영숫자 8자 이상)은 «[번호 가림]» 으로 가린다(공개 저장소·로그에 번호를 남기지 않는다).
 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T0 = Date.now(); const el = () => Math.round((Date.now() - T0) / 1000) + 's';
let task = { urls: [] };
try { task = JSON.parse(fs.readFileSync(await L.taskPath('naver-comments-task.json'), 'utf8')); } catch { /* 없으면 빈 목록 */ }
const urls = (task.urls || []).slice(0, 4);
if (!urls.length) { console.log('작업 파일에 urls 가 없다(naver-comments-task.json)'); process.exit(0); }
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await L.findPage(ts, /blog\.naver\.com/, null);
await page.evaluate(() => { window.onbeforeunload = null; }).catch(() => {});
const MASK = (s) => String(s || '').replace(/[A-Za-z0-9]{8,}/g, '[번호 가림]');
const USED = /(사용|썼|써봤|입력했|등록했|적용|redeem|used)/i;
const out = [];
for (const raw of urls) {
  const m = String(raw).match(/blog\.naver\.com\/([A-Za-z0-9_\-]+)\/(\d{6,})/);
  if (!m) { out.push({ url: raw, fail: '주소 형식(blog.naver.com/<ID>/<글번호>) 아님' }); continue; }
  const mobile = `https://blog.naver.com/PostView.naver?blogId=${m[1]}&logNo=${m[2]}&redirect=Dlog&widgetTypeCall=true&directAccess=false`;
  try { await page.goto(mobile, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch { /* 느려도 그려진다 */ }
  await L.wait(7000);
  // 댓글 영역은 글 아래쪽에서 늦게 그려진다 — 아래로 내려 «불러오게» 한다(스크롤은 읽기)
  for (let k = 0; k < 4; k++) { await page.evaluate(() => window.scrollBy(0, 1800)); await L.wait(1200); }
  if (task.debug) {
    const dbg = await page.evaluate(() => {
      const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const cls = new Set(); for (const e of document.querySelectorAll('[class]')) { const c = String(e.className); if (/comment|cbox|reply|Comment/.test(c)) cls.add(e.tagName.toLowerCase() + '.' + c.slice(0, 50)); }
      const ifr = [...document.querySelectorAll('iframe')].map((f) => (f.src || '').slice(0, 100));
      const sp = [...document.querySelectorAll('[class*="comments"],[class*="Comment"],[class*="comment"]')].slice(0, 3).map((e) => ({ tag: e.tagName.toLowerCase(), c: String(e.className).slice(0, 40), t: n(e.innerText).slice(0, 30), up: (e.closest('a,button') ? e.closest('a,button').tagName + ':' + (e.closest('a,button').getAttribute('href') || '').slice(0, 90) : '-') }));
      const ah = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /omment|Reply|reply/.test(h)).slice(0, 6);
      const i = n(document.body.innerText).indexOf('공감');
      const wp = document.querySelector('.wrap_postcomment');
      const box = document.querySelector('[class*="commentbox"], #naverComment, ._naverCommentList, .u_cbox');
      return { boxHtml: (box ? box.outerHTML : (wp ? wp.outerHTML : '')).replace(/\s+/g, ' ').slice(0, 2200), sp, ah, near: n(document.body.innerText).slice(Math.max(0, i - 120), i + 160), cls: [...cls].slice(0, 18), ifr };
    });
    console.log('DEBUG ' + JSON.stringify(dbg));
  }
  const diag = await page.evaluate(() => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const txt = n(document.body.innerText || '');
    const cm = txt.match(/댓글\s*(\d+)/);
    const btns = [...document.querySelectorAll('a,button')].filter((e) => e.offsetParent && (/comment/i.test(String(e.className)) || /^댓글/.test(n(e.innerText))))
      .map((e) => ({ t: n(e.innerText).slice(0, 24), c: String(e.className).slice(0, 50) })).slice(0, 6);
    return { url: location.href.slice(0, 110), countFromText: cm ? Number(cm[1]) : null, btns, cboxItems: document.querySelectorAll('.u_cbox_comment').length };
  });
  console.log(`[${el()}]`, JSON.stringify(diag));
  // 댓글 영역 열기 — 댓글 버튼 1번(읽기). 이미 열려 있으면 건너뛴다
  let opened = diag.cboxItems > 0;
  if (!opened) {
    const clicked = await page.evaluate(() => {
      const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const cand = [...document.querySelectorAll('a,button,span,em')].filter((x) => x.offsetParent && (/^댓글\s*\d*$/.test(n(x.innerText)) || /btn_comment|_commentBtn|comment_btn|btn_cmt/i.test(String(x.className))));
      const e = cand.find((x) => x.closest('a,button,[role=button]')) || cand[0];
      if (!e) return null;
      const t = e.closest('a,button,[role=button]') || e; t.scrollIntoView({ block: 'center' }); t.click();
      return n(e.innerText).slice(0, 24) + '|' + String(t.className).slice(0, 40);
    });
    console.log(`[${el()}] 댓글 버튼`, clicked || '못 찾음');
    await L.wait(4500);
  }
  const rows = await page.evaluate(() => {
    const n = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.u_cbox_comment')].map((c) => ({
      nick: n((c.querySelector('.u_cbox_nick') || {}).innerText || ''),
      text: n((c.querySelector('.u_cbox_contents') || {}).innerText || '').slice(0, 160),
      date: n((c.querySelector('.u_cbox_date') || {}).innerText || ''),
    }));
  });
  const empty = await page.evaluate(() => /등록된 댓글이 없|첫 댓글을 남겨|댓글이 없습니다/.test(document.body.innerText || ''));
  const widget = await page.evaluate(() => !!document.querySelector('._naverCommentHeader, .wrap_postcomment, .u_cbox'));
  if (!widget) { out.push({ url: raw, fail: '판독 실패 — 댓글 위젯이 없는 화면(주소·로딩 확인)' }); console.log(`[${el()}] 판독 실패 — 댓글 위젯 없음`); continue; }
  const OURS = /(돈음|donneum|signum|시그넘)/i;
  const others = rows.filter((r) => !OURS.test(r.nick));
  out.push({ url: raw, countFromText: diag.countFromText, widget, total: rows.length, others: others.map((r) => ({ nick: r.nick, text: MASK(r.text), date: r.date, used: USED.test(r.text) })) });
  console.log(`[${el()}] 댓글 ${rows.length}개 · 남이 쓴 것 ${others.length}개${rows.length === 0 ? ' · 댓글 위젯 확인(버튼 없음 = 0개)' : ''}`);
  for (const r of rows) console.log(`   ${OURS.test(r.nick) ? '[내 계정?]' : '[남]'} @${r.nick} | ${MASK(r.text).slice(0, 110)} | ${r.date}${USED.test(r.text) ? ' | 사용 표현 ✓' : ''}`);
}
fs.writeFileSync(L.ioDir() + '/naver-comments-result.json', JSON.stringify({ at: new Date().toISOString(), out }, null, 1));
console.log('RESULT ' + JSON.stringify(out.map((o) => ({ url: o.url, total: o.total, others: (o.others || []).length, used: (o.others || []).filter((x) => x.used).length, fail: o.fail }))));
