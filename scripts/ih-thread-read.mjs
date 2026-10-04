/* ============================================================================
 * ih-thread-read — IndieHackers 스레드 본문과 «앞선 댓글들»을 읽는다(읽기 전용 — 클릭 없음).
 * ★2026-10-04 09시 도구화(그 전엔 /tmp 조각 ih-read.mjs). indiehackers_comment 레인의 «읽기» 단계: 댓글을 쓰기 전에
 *   글이 정확히 무엇을 묻는지·앞사람이 이미 한 말(중복 방지)·작성칸이 1개인지를 본다.
 * 사용: 작업 파일 ~/signum-ego-io/<KST 날짜>/ih-read-task.json = {"urls":["<스레드 주소>", …], "max":3000}  (python json.dump)
 *       bash scripts/ego-run.sh scripts/ih-thread-read.mjs 150
 * 출력: 스레드마다 «주소 | 작성칸 수 | 길이» + 앞 max 자(기본 3000). 작성칸이 1이 아니면 댓글 도구(ih-comment.mjs)가 중단한다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const { readFileSync } = await import('node:fs');
const TASK = JSON.parse(readFileSync(await L.taskPath('ih-read-task.json'), 'utf8'));
const MAX = Number(TASK.max) > 0 ? Number(TASK.max) : 3000;
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /indiehackers/, null);
for (const u of TASK.urls) {
  try { await page.goto(u, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(6500);
  const r = await page.evaluate((max) => {
    const t = (document.body.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    return { len: t.length, nbox: document.querySelectorAll('textarea.comment-box__textarea').length, text: t.slice(0, max) };
  }, MAX);
  console.log('########', u, '| 작성칸', r.nbox, '| 길이', r.len);
  console.log(r.text);
}
