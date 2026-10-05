/* ============================================================================
 * threads-views — 우리 Threads 글 여러 편의 «스레드 조회 N회»(작성자에게만 보이는 조회 수)를 읽기만 한다. 2026-10-06 03시 운영 세션 신설.
 * 왜: 10/5 쿠폰 글이 조회 20회·1회였다(threads-post-replies 출력) — 병목이 «쿠폰 매력»이 아니라 «도달»인지 글마다 숫자로 본다.
 * 사용: 작업 파일 ~/signum-ego-io/<KST>/threads-views-task.json = {"urls":["https://www.threads.com/@signumhq_official/post/<코드>", …]} (30분 안 것만)
 *       bash scripts/ego-run.sh scripts/ego/threads-views.mjs 240
 * 출력: «글 코드 | 조회 N | 글 앞 60자» 한 줄씩. 읽기 전용 — 클릭·입력 없음, 글 속 링크를 누르지 않는다(MISTAKES #51).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let URLS = [];
try {
  const tp = L.ioDir() + '/threads-views-task.json';
  if (fs.existsSync(tp) && Date.now() - fs.statSync(tp).mtimeMs < 30 * 60e3) URLS = (JSON.parse(fs.readFileSync(tp, 'utf8')).urls || []).map(String);
} catch {}
URLS = URLS.filter((u) => /^https:\/\/www\.threads\.(com|net)\/@[\w.]+\/post\/[\w-]+$/.test(u)).slice(0, 20);
if (!URLS.length) { console.log('작업 파일 없음·낡음·주소 형식 불일치 — threads-views-task.json {"urls":[…]} 를 방금 쓸 것'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
await L.trapDialogs(page);
for (const u of URLS) {
  try { await page.goto(u, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(6500);
  const r = await page.evaluate(() => {
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    const m = t.match(/(?:스레드 조회|조회)\s*([\d,.]+\s*[천만]?)\s*회/) || t.match(/([\d,.]+[KkMm]?)\s*views?/);
    const code = location.pathname.split('/post/')[1] || '';
    const i = t.indexOf('signumhq_official');
    const main = document.querySelector('[data-pressable-container]') || document.body;
    const links = [...main.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /signumhq\.com|l\.threads\.(com|net)/.test(h)).length;
    const imgs = [...main.querySelectorAll('img')].filter((im) => im.naturalWidth > 300).length;
    const tags = (t.match(/#[^\s#]+/g) || []).slice(0, 3).join(' ');
    const codes = (t.slice(0, 1200).match(/\b[A-Z0-9]{12,}\b/g) || []).length;
    return { code, views: m ? m[1] : '?', links, imgs, tags, codes, len: (t.slice(i > -1 ? i : 0).split('번역하기')[0] || '').length, head: t.slice(i > -1 ? i : 0, (i > -1 ? i : 0) + 140).replace(/[A-Z0-9]{8,}/g, '[번호 가림]') };
  }).catch(() => ({ code: u.split('/post/')[1], views: '읽기 실패', head: '' }));
  console.log(`${r.code} | 조회 ${r.views} | 링크 ${r.links} · 큰 이미지 ${r.imgs} · 번호꼴 ${r.codes} · 태그 ${r.tags || '-'} | ${r.head.slice(0, 70)}`);
}
