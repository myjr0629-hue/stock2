/* ============================================================================
 * ih-feed-list — IndieHackers 홈 피드의 «댓글 달 만한 글» 목록을 읽는다(읽기 전용 — 클릭 없음, 이동·DOM 읽기만).
 * ★2026-10-04 09시 도구화(그 전엔 /tmp 조각 ih-list.mjs). indiehackers_comment 레인의 «발굴» 단계다.
 * 사용: bash scripts/ego-run.sh scripts/ih-feed-list.mjs 150   → «번호. 제목 | 주소 | 맥락(작성자·댓글 수·시각)» 최대 60줄
 * 실측: 홈(/)은 항목 41개 · /tag/marketing·/tag/mobile-apps 는 0개(주소가 틀렸거나 비어 있음 — 쓰지 않는다).
 *       IH 는 curl·Node fetch 가 403(Cloudflare) — 로그인된 ego 로만 읽힌다.
 * 고르는 기준: 우리 실측으로 «가치 있는 답»을 줄 수 있는 글(앱 설치 경로·스토어 검색·클릭 집계·AI 출력 검증·분포 질문) · 이미 우리가
 *   댓글을 단 글은 제외(원장 indiehackers_comment) · 자기 제품 홍보 글에 링크로 답하지 않는다(댓글에 링크 0).
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /indiehackers/, null);
const seen = new Map();
try { await page.goto('https://www.indiehackers.com/', { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(6000);
for (let i = 0; i < 3; i++) { try { await page.evaluate(() => window.scrollBy(0, 1800)); } catch {} await L.wait(1500); }
const items = await page.evaluate(() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href*="/post/"]')) {
    const t = (a.innerText || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length < 12) continue;
    const box = a.closest('article, li, [class*="feed-item"], [class*="post"]') || a.parentElement;
    const ctx = (box && box.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    out.push({ href: a.href, t: t.slice(0, 140), ctx });
  }
  return out;
});
for (const it of items) if (!seen.has(it.href)) seen.set(it.href, it);
let n = 0;
for (const [h, it] of seen) { n++; console.log(n + '. ' + it.t + ' | ' + h + ' | ' + it.ctx.slice(0, 160)); if (n >= 60) break; }
console.log('항목', seen.size);
