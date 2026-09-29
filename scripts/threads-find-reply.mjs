/* ============================================================================
 * threads-find-reply — threads_reply 대상 찾기(큰 금융 계정의 최근 글). 2026-09-30 정본화(매 회차 임시 스크립트를 새로 쓰던 것).
 * 사용: bash scripts/ego-run.sh scripts/threads-find-reply.mjs 200   → /tmp/ego/threads-find-reply.json
 * ⚠ 스크립트 안에 마감(기본 120초)을 둔다: ego-run 제한에 걸려 -9 로 죽으면 잠금을 240초 더 쥔다(9/30 03:3x 실측 — 9계정×16초 > 150초).
 * 제외: @yahoofinance(답글이 비로그인에 invalid_post — 9/25·9/30 2/2). 결과는 계정마다 파일에 쓴다(중간에 죽어도 남는다).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fsx = (await import('node:fs')).default;
const OUT = '/tmp/ego/threads-find-reply.json';
const T0 = Date.now(); const BUDGET = 120e3; const MAX_AGE_H = 2.5;
const HANDLES = ['cnbc', 'bloombergbusiness', 'wsj', 'marketwatch', 'reuters', 'barronsonline', 'financialtimes', 'businessinsider'];
const out = [];
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts = null; try { ts = await takeOverTaskSpace(sp.id); } catch { console.log('USER_CONTROL'); }
if (ts) {
  await L.cleanupPages(ts, 2);
  const page = await L.findPage(ts, /threads\.(net|com)/, null);
  await L.trapDialogs(page);
  for (const h of HANDLES) {
    if (Date.now() - T0 > BUDGET) { console.log('마감 — 남은 계정 건너뜀'); break; }
    try {
      try { await page.goto('https://www.threads.com/@' + h, { waitUntil: 'domcontentloaded' }); } catch {}
      await L.wait(4500);
      const rows = await page.evaluate(() => {
        const seen = new Set(); const res = [];
        for (const a of document.querySelectorAll('a[href*="/post/"]')) {
          const t = a.querySelector('time'); if (!t) continue; const href = a.getAttribute('href'); if (seen.has(href)) continue; seen.add(href);
          let el = a; for (let i = 0; i < 8 && el; i++) el = el.parentElement;
          res.push({ href, at: t.getAttribute('datetime'), txt: el ? el.innerText.replace(/\s+/g, ' ').slice(0, 300) : '' });
        }
        return res.slice(0, 8);
      });
      for (const r of rows) { const age = (Date.now() - Date.parse(r.at)) / 36e5; if (age < MAX_AGE_H) out.push({ h, age: +age.toFixed(2), url: 'https://www.threads.com' + r.href, txt: r.txt }); }
      fsx.writeFileSync(OUT, JSON.stringify(out, null, 1));
      console.log(h, '글', rows.length);
    } catch (e) { console.log(h, '오류', String(e && e.message).slice(0, 80)); }
  }
}
fsx.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const o of out) console.log(o.h, o.age + 'h', o.url, '|', o.txt.slice(0, 160));
console.log('DONE', out.length, Math.round((Date.now() - T0) / 1000) + '초');
