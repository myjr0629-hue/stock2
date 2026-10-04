/* ============================================================================
 * x-profile-top — X 프로필의 «맨 위 글 N개»를 읽기만 한다(클릭·입력·게시 없음). (2026-10-05 05시 회차 신설)
 *
 * 왜: x-post.mjs 가 «⛔ 본문이 든 새 글을 못 찾았다»로 끝나면(10/5 05:01 X 일본어 QQQ — 프로필 3번 읽어도 새 글 없음)
 *     «글이 안 올라갔나, 목록이 늦나»를 가를 도구가 없어 재시도가 «이중 게시» 위험이었다(MISTAKES #73 — 실패 뒤엔 재시도 전에
 *     글이 생겼는지부터). 발행기를 다시 돌리지 않고, 같은 읽기 코드만 따로 돌려 본다.
 *
 * 실행: bash scripts/ego-run.sh scripts/ego/x-profile-top.mjs 90
 *   작업 파일 ~/signum-ego-io/<KST>/x-profile-top-task.json {"handle":"/signumhq_jp","n":6,"mark":"찾을 본문 앞부분(선택)"} · 25분 안
 * 출력: 글마다 «고정 여부 · 상태 주소 · 사진 수 · 본문 앞 60자 · 시각(time 태그)». mark 가 있으면 «MARK_FOUND <주소>» 또는 «MARK_NOT_FOUND».
 *   (공백 제거 후 비교 — X 가 캐시태그 앞뒤에 공백을 넣어 그린다) · 새로고침 3번(6·11·16초 대기) · 로그인 시야라 «공개 증거»는 아니다 —
 *   찾으면 node scripts/x-public-check.mjs <주소> 로 비로그인 확인을 이어 한다.
 * ========================================================================== */
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const TP = await L.taskPath('x-profile-top-task.json'); L.assertFreshTask(TP);
let task = {}; try { task = JSON.parse(fs.readFileSync(TP, 'utf8')); } catch (e) { console.log('작업 파일 읽기 실패:', String(e.message).slice(0, 80)); process.exit(1); }
const handle = String(task.handle || '').trim(); const n = Math.max(1, Math.min(10, Number(task.n) || 6));
if (!/^\/[A-Za-z0-9_]{1,15}$/.test(handle)) { console.log('handle 은 "/signumhq_jp" 꼴이어야 한다:', handle); process.exit(1); }
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await ts.newPage();
const sq = (x) => (x || '').replace(/\s+/g, '');
let top = [], hit = null;
for (let i = 0; i < 3; i++) {
  try { await page.goto('https://x.com' + handle + '?v=' + Date.now(), { waitUntil: 'domcontentloaded' }); } catch {}
  await wait(6000 + i * 5000);
  top = await page.evaluate((h, n) => {
    const hl = h.replace('/', '').toLowerCase();
    return [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0, n).map((a) => {
      const own = [...a.querySelectorAll('a[href*="/status/"]')].map((x) => x.getAttribute('href'))
        .find((x) => x.toLowerCase().startsWith('/' + hl + '/status/') && /\/status\/\d+$/.test(x)) || null;
      const tm = a.querySelector('time');
      return { pinned: /Pinned|고정/.test(a.innerText), status: own, img: a.querySelectorAll('[data-testid="tweetPhoto"] img').length,
        time: tm ? tm.getAttribute('datetime') : null, text: (a.innerText || '').replace(/\s+/g, ' ') };
    });
  }, handle, n);
  if (task.mark) { hit = top.find((t) => !t.pinned && t.status && sq(t.text).includes(sq(task.mark))) || null; if (hit) break; }
  else break;
}
try { await page.close(); } catch {}
for (const t of top) console.log('TOP:', JSON.stringify({ ...t, text: t.text.slice(0, 60) }));
if (task.mark) console.log(hit ? 'MARK_FOUND https://x.com' + hit.status + ' · ' + hit.time : 'MARK_NOT_FOUND «' + task.mark + '» (상위 ' + top.length + '개 — 새로고침 3번)');
