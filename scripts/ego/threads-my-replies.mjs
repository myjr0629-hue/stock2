/* ============================================================================
 * threads-my-replies — «내 Threads 답글 탭»의 최근 답글 목록을 읽기만 한다(클릭·입력·게시 없음). 2026-10-05 07시 회차 신설.
 * 왜: threads-reply.mjs 가 ego-run 240초 상한에 걸려 «강제 종료(-9)» 됐을 때(10/5 07:12 MSFT 답글) 출력이 파이프에 갇혀 «어디까지 했는지·글이 올라갔는지»를
 *   알 수 없었다. ego 안의 스크립트는 클라이언트를 죽여도 계속 돌 수 있어(MISTAKES #52·#83) «같은 발행기를 바로 다시 돌리면» 같은 답글이 두 번 나간다.
 *   재시도 전에 «글이 생겼는지»를 공개 시야가 아니라도 «로그인 시야의 답글 탭»으로 먼저 본다(MISTAKES #73).
 * 사용: bash scripts/ego-run.sh scripts/ego/threads-my-replies.mjs 90
 *   선택 작업 파일 ~/signum-ego-io/<KST>/threads-my-replies-task.json = {"mark":"본문에 있는 고유 문구"} (30분 안 것만) → 있으면 MARK_FOUND <주소> / MARK_NOT_FOUND 를 찍는다.
 * 출력: «주소 | 본문 앞 80자 | mark 포함» 최근 12개. 읽기 전용 — 앱 링크가 없는 페이지라 클릭 카운터에 영향 없음.
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let MARK = '';
try {
  const tp = L.ioDir() + '/threads-my-replies-task.json';
  if (fs.existsSync(tp) && Date.now() - fs.statSync(tp).mtimeMs < 30 * 60e3) MARK = String(JSON.parse(fs.readFileSync(tp, 'utf8')).mark || '');
} catch {}
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
await L.trapDialogs(page);
try { await page.goto('https://www.threads.com/@signumhq_official/replies', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(9000);
const rows = await page.evaluate(function (M) {
  const seen = new Set(); const out = [];
  for (const a of document.querySelectorAll('a[href^="/@signumhq_official/post/"]')) {
    const h = a.getAttribute('href').split('?')[0].replace(/\/media$/, '');
    if (seen.has(h)) continue; seen.add(h);
    let b = a; for (let i = 0; i < 8 && b.parentElement; i++) b = b.parentElement;
    const t = (b.innerText || '').replace(/\s+/g, ' ').trim();
    out.push({ h: h, t: t.slice(0, 80), has: M ? t.includes(M) : false });
    if (out.length >= 12) break;
  }
  return out;
}, MARK);
for (const r of rows) console.log(`https://www.threads.com${r.h} | ${r.t} | ${r.has ? 'mark✓' : ''}`);
if (!rows.length) console.log('(답글 0개 읽음 — 페이지가 안 떴거나 로그인 끊김)');
if (MARK) {
  const hit = rows.find((r) => r.has);
  console.log(hit ? `MARK_FOUND https://www.threads.com${hit.h}` : 'MARK_NOT_FOUND');
}
