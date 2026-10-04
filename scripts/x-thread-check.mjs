/* ============================================================================
 * x-thread-check — 내 X 답글이 «루트 글 스레드 안»에 보이는지 확인한다(읽기 전용·DOM 만 — 입력·게시·좋아요 없음). 2026-10-04 21시 회차 신설.
 * 왜: x-reply.mjs 의 «공개 확인»은 내 답글 탭(with_replies)과 비로그인 syndication 까지다. 9/18 에는 링크+이미지 답글이 «게시는 됐는데 스레드·프로필 어디에도
 *   안 보인» 사례가 있었고(스팸 분류기), 스레드 안은 «스팸 가능성 답글 보기» 접힘 뒤에 숨을 수 있다. 답글의 목적은 «남의 청중에게 보이는 것»이라 스레드 안 노출을 따로 잰다.
 * 방법: 루트 글 주소를 열고 몇 번 스크롤하며 article 에서 mark 문구를 찾는다 → ① 처음부터 보이면 «본문 노출» ② 안 보이면 «추가 답글 보기/스팸 가능성» 접힘 버튼을
 *   (펼치기만 — 데이터 변경 없는 화면 토글) 눌러 다시 찾아 «접힘 안에 숨음» ③ 그래도 없으면 «안 보임». 로그인 시야라 «비로그인 증거»는 아니다(X 는 비로그인 스레드가 로그인 벽).
 * 사용: ~/signum-ego-io/<KST>/x-thread-check-task.json = {"items":[{"status":"/business/status/2106708425321087369","mark":"Long end led"}]}
 *       bash scripts/ego-run.sh scripts/x-thread-check.mjs 120
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fsx = (await import('node:fs')).default;
let T = { items: [] };
try { T = JSON.parse(fsx.readFileSync(await L.taskPath('x-thread-check-task.json'), 'utf8')); } catch { console.log('⛔ 작업 파일 x-thread-check-task.json 이 없다'); process.exit(1); }
const items = (T.items || []).slice(0, 6);
if (!items.length) { console.log('⛔ items 가 비었다'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts = null; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); }
const out = [];
if (ts) {
  await L.cleanupPages(ts, 2);
  const page = await L.findPage(ts, /x\.com/, null);
  await L.trapDialogs(page);
  const has = (mark) => page.evaluate((m) => [...document.querySelectorAll('article')].some((a) => (a.innerText || '').includes(m)), mark);
  for (const it of items) {
    let verdict = '✗ 안 보임'; let scrolled = 0;
    try {
      try { await page.goto('https://x.com' + it.status, { waitUntil: 'domcontentloaded' }); } catch {}
      await L.wait(6500);
      let seen = await has(it.mark);
      for (; !seen && scrolled < 6; scrolled++) { await page.evaluate(() => window.scrollBy(0, 1300)); await L.wait(1400); seen = await has(it.mark); }
      if (seen) verdict = '✅ 스레드 본문에 노출';
      else {
        // 접힘 버튼(«Show additional replies…» / «Show probable spam»)을 «펼치기만» 한다
        const clicked = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button,[role=button],span')].filter((e) => e.offsetParent && /show (additional|more) replies|probable spam|show hidden replies/i.test((e.innerText || '').replace(/\s+/g, ' ')) && (e.innerText || '').length < 160);
          if (!b.length) return false; b[0].click(); return true;
        });
        if (clicked) { await L.wait(3500); for (let i = 0; i < 4 && !seen; i++) { seen = await has(it.mark); if (!seen) { await page.evaluate(() => window.scrollBy(0, 1300)); await L.wait(1200); } } }
        verdict = seen ? '⚠ 접힘(스팸 가능성 등) 안에 숨음' : (clicked ? '✗ 접힘을 펼쳐도 안 보임' : '✗ 안 보임(접힘 버튼도 없음 — 답글 제한·삭제·지연 가능)');
      }
    } catch (e) { verdict = '오류 ' + String(e && e.message).slice(0, 80); }
    out.push({ status: it.status, mark: it.mark, verdict });
    console.log(`${verdict} | ${it.status} | «${it.mark}»`);
  }
}
fsx.writeFileSync(L.ioDir() + '/x-thread-check-result.json', JSON.stringify({ at: new Date().toISOString(), out }, null, 1));
