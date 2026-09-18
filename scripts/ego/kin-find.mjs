/* 지식iN — 답변 0건 질문을 찾는다(선점 = 영구 1등). 읽기 전용. */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /kin\.naver\.com/);
const queries = (process.env.Q || '미국주식 앱,프리마켓,미국주식 실적발표,나스닥 지수 보는법').split(',');
const out = [];
for (const q of queries) {
  await page.goto('https://kin.naver.com/search/list.naver?query=' + encodeURIComponent(q) + '&sort=date'); await L.wait(5000);
  const rows = await page.evaluate(() => [...document.querySelectorAll('li')].map(li => {
    const a = li.querySelector('a[href*="detail.naver"]'); if (!a) return null;
    const t = (li.innerText || '').replace(/\s+/g, ' ').trim();
    const ans = (t.match(/답변\s*(\d+)/) || [])[1];
    return { t: t.slice(0, 70), href: a.getAttribute('href'), ans: ans == null ? null : Number(ans) };
  }).filter(Boolean).slice(0, 12));
  const zero = rows.filter(r => r.ans === 0);
  console.log(`[${q}] 결과 ${rows.length} · 답변0 ${zero.length}`);
  for (const r of zero.slice(0, 3)) { console.log('   0답변: ' + r.t + ' | ' + (r.href || '').slice(0, 80)); out.push({ q, ...r }); }
  if (!zero.length && rows.length) console.log('   (최신 3건) ' + rows.slice(0, 3).map(r => `${r.ans}답변 ${r.t.slice(0, 34)}`).join(' / '));
}
console.log('후보=' + out.length);
