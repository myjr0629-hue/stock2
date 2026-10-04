/* ============================================================================
 * threads-find-reply-kr — threads_reply_kr 대상 찾기(한국어 «미국주식» 개인 투자자의 최근 글). 2026-10-04 신설.
 * 왜: threads_reply_kr 이 «실행» 상단에 5일째 재배정됐다. 이유는 «후보를 찾는 도구가 없어서» — 영어용 threads-find-reply.mjs 는 대형 금융
 *   계정 프로필만 읽고, 9/30 한국어 탐색은 /tmp 임시 스크립트(재부팅 소실)에 있었다(«최근» 탭을 못 찾아 인기순 5~26일 전 글만 나왔다).
 *   MISTAKES #39(반복 배정은 도구가 없어서일 수 있다 — 첫 배정 때 도구화)·#49(브라우저를 여는 도구는 시간 상한을 스스로 갖는다).
 * 방법: 검색 주소에 «filter=recent»(최근 정렬)를 붙여 열고 DOM 만 읽는다(클릭 없음 — 계정·클릭 카운터에 영향 없음).
 *   결과 목록이 «최근»으로 정렬됐는지는 나이 분포(최신 글 몇 분 전 · 중앙값)로 판정해 출력한다 — 정렬이 안 먹으면 «WARN 최근 정렬 아님».
 * 사용: bash scripts/ego-run.sh scripts/threads-find-reply-kr.mjs 200   → ~/signum-ego-io/<KST 날짜>/threads-find-reply-kr.json
 *   (손에 검증된 종목 값이 있으면 위 task 파일로 그 종목 이름만 검색 — 10/4 16:2x 아마존·오라클 등)
 * 제외: 우리 계정 글 · 12시간보다 오래된 글. 매수·조언 요청 글은 «표시만»(신호 필드 ask) — 답글 대상으로 고르지 않는다(예측·권유 금지 원칙).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fsx = (await import('node:fs')).default;
const OUT = L.ioDir() + '/threads-find-reply-kr.json';
const T0 = Date.now(); const BUDGET = 130e3; const MAX_AGE_H = 12;
let QUERIES = ['미국주식', '나스닥', '엔비디아', '테슬라', '옵션 만기', '맥스페인', '서학개미', '미장'];
// 선택: 검색어를 바꾸려면 ~/signum-ego-io/<오늘>/threads-find-reply-kr-task.json = {"queries":["아마존","오라클"]} (30분 안 것만 — 낡은 작업 파일은 무시)
try { const tp = L.ioDir() + '/threads-find-reply-kr-task.json';
  if (fsx.existsSync(tp) && Date.now() - fsx.statSync(tp).mtimeMs < 30 * 60e3) { const q = JSON.parse(fsx.readFileSync(tp, 'utf8')).queries; if (Array.isArray(q) && q.length) QUERIES = q.slice(0, 10); } } catch {}
// ★2026-10-05 05시: 일본어 «조언·질문 요청» 단어를 추가했다 — 같은 날 threads_reply_jp 가 이 도구로 처음 일본어 검색어(米国株·ナスダック…)를 돌렸는데 ask 판정이 한국어 전용이라
//   일본어 조언 요청 글(예: «SOX7割MSTR3割か比率に悩む»)이 ask:false 로 나와 사람이 눈으로 걸러야 했다(예측·권유 금지 원칙 — 조언 요청 글은 답글 대상이 아니다).
const ASK = /(추천|사야|팔아야|살까|팔까|어떡|어떻게\s*생각|물렸|물려|손절|존버|매수\s*타이밍|조언|教えて|アドバイス|おすすめ|オススメ|どう思|どうすれば|買うべき|売るべき|買い時|売り時|損切|含み損|塩漬け|ナンピン|悩(む|み|ん)|初心者|質問)/;
const out = [];
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts = null; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); }
if (ts) {
  await L.cleanupPages(ts, 2);
  const page = await L.findPage(ts, /threads\.(net|com)/, null);
  await L.trapDialogs(page);
  for (const q of QUERIES) {
    if (Date.now() - T0 > BUDGET) { console.log('마감 — 남은 검색어 건너뜀:', q); break; }
    try {
      try { await page.goto('https://www.threads.com/search?q=' + encodeURIComponent(q) + '&serp_type=default&filter=recent', { waitUntil: 'domcontentloaded' }); } catch {}
      await L.wait(6500);
      const rows = await page.evaluate(() => {
        const seen = new Set(); const res = [];
        for (const a of document.querySelectorAll('a[href*="/post/"]')) {
          const t = a.querySelector('time'); if (!t) continue; const href = a.getAttribute('href'); if (seen.has(href)) continue; seen.add(href);
          let el = a; for (let i = 0; i < 8 && el; i++) el = el.parentElement;
          res.push({ href, at: t.getAttribute('datetime'), txt: el ? el.innerText.replace(/\s+/g, ' ').slice(0, 320) : '' });
        }
        return res.slice(0, 20);
      });
      const ages = rows.map((r) => (Date.now() - Date.parse(r.at)) / 36e5).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
      const med = ages.length ? ages[Math.floor(ages.length / 2)] : null;
      console.log(`«${q}» 글 ${rows.length} · 최신 ${ages.length ? ages[0].toFixed(1) : '-'}h · 중앙값 ${med == null ? '-' : med.toFixed(1)}h` + (med != null && med > 48 ? ' · WARN 최근 정렬 아님(중앙값 48h 초과)' : ''));
      for (const r of rows) {
        const age = (Date.now() - Date.parse(r.at)) / 36e5;
        if (!(age < MAX_AGE_H)) continue;
        if (/signumhq_official/.test(r.href) || /signumhq_official/.test(r.txt.slice(0, 60))) continue;
        if (out.some((o) => o.url.endsWith(r.href))) continue;
        out.push({ q, age: +age.toFixed(2), url: 'https://www.threads.com' + r.href, ask: ASK.test(r.txt), txt: r.txt });
      }
      fsx.writeFileSync(OUT, JSON.stringify(out, null, 1));
    } catch (e) { console.log(q, '오류', String(e && e.message).slice(0, 80)); }
  }
}
fsx.writeFileSync(OUT, JSON.stringify(out, null, 1));
out.sort((a, b) => a.age - b.age);
for (const o of out.slice(0, 25)) console.log(`${o.age}h${o.ask ? ' [질문·조언]' : ''} ${o.url} | ${o.txt.slice(0, 170)}`);
console.log('DONE', out.length, Math.round((Date.now() - T0) / 1000) + '초 →', OUT);
