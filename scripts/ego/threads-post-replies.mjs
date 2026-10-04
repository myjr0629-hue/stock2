/* ============================================================================
 * threads-post-replies — Threads 글 한 편 아래 «답글 목록»을 읽기만 한다(클릭·입력·게시 없음). 2026-10-05 08시 회차 신설.
 * 왜: 리딤 B 글(첫 답글에 일회용 번호를 단 글)은 «회차마다 답글을 읽어 실제 사용 보고가 있으면 갱신 답글 1개»를 쓰는 규칙인데(리딤 정본 §6-5),
 *   답글을 읽는 도구가 없어 회차가 즉석 스크립트를 짜거나 건너뛸 수 있었다(MISTAKES #49 «로그에만 있는 요령은 첫 반복에 도구로»).
 * 사용: 작업 파일 ~/signum-ego-io/<KST>/threads-post-replies-task.json = {"url":"https://www.threads.com/@signumhq_official/post/<코드>"} (30분 안 것만)
 *       bash scripts/ego-run.sh scripts/ego/threads-post-replies.mjs 90
 * 출력: «@작성자 | 본문 앞 110자 | 사용 보고로 보이는 표현 ✓» 을 위에서부터 최대 30개 + 끝에 «남이 쓴 답글 N개 · 사용 표현 M개».
 *   읽기 전용 — 글 속 스마트링크를 누르지 않는다(클릭 카운터 오염 방지 — MISTAKES #51). 번호는 출력하지 않는다(본문 속 번호 줄은 가린다).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let URL_ = '';
try {
  const tp = L.ioDir() + '/threads-post-replies-task.json';
  if (fs.existsSync(tp) && Date.now() - fs.statSync(tp).mtimeMs < 30 * 60e3) URL_ = String(JSON.parse(fs.readFileSync(tp, 'utf8')).url || '');
} catch {}
if (!/^https:\/\/www\.threads\.(com|net)\/@[\w.]+\/post\/[\w-]+$/.test(URL_)) { console.log('작업 파일 없음·낡음·주소 형식 불일치 — threads-post-replies-task.json {"url":"https://www.threads.com/@…/post/…"} 를 방금 쓸 것'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /threads\.(net|com)/, null);
await L.trapDialogs(page);
try { await page.goto(URL_, { waitUntil: 'domcontentloaded' }); } catch {}
await L.wait(8000);
for (let i = 0; i < 3; i++) { try { await page.mouse.wheel(0, 900); } catch {} await L.wait(1500); }
const me = (URL_.match(/@([\w.]+)\//) || [])[1];
const rows = await page.evaluate(function (ME) {
  const USED = /(使い|使え|使用|使った|入力しました|適用|used|redeem|applied|worked|감사|사용|썼|적용|ありがとう|ゲット)/i;
  const seen = new Set(); const out = [];
  for (const a of document.querySelectorAll('a[href*="/post/"]')) {
    const h = (a.getAttribute('href') || '').split('?')[0].replace(/\/media$/, '');
    const m = h.match(/^\/@([\w.]+)\/post\//);
    if (!m || seen.has(h)) continue; seen.add(h);
    let b = a; for (let i = 0; i < 8 && b.parentElement; i++) b = b.parentElement;
    let t = (b.innerText || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/[A-Z0-9]{8,}/g, '[번호 가림]');   // 일회용 번호·코드 모양(영숫자 8자 이상)은 출력에서 가린다
    out.push({ who: m[1], h: h, t: t.slice(0, 110), used: USED.test(t) && m[1] !== ME });
    if (out.length >= 30) break;
  }
  return out;
}, me);
for (const r of rows) console.log(`@${r.who} | ${r.t} | ${r.used ? '사용 표현 ✓' : ''}`);
const others = rows.filter((r) => r.who !== me);
console.log(`남이 쓴 답글 ${others.length}개 · 사용 표현 ${others.filter((r) => r.used).length}개 (읽기 전용 — 클릭·입력 없음)`);
if (!rows.length) console.log('(0개 읽음 — 페이지가 안 떴거나 로그인 끊김)');
