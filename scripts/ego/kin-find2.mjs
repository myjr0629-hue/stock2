/* 미국주식 질문 중 «내가 아직 안 답한» 최신 질문을 찾는다 */
const fs = await import('node:fs');
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const done = new Set((fs.readFileSync('/tmp/kin-done.txt','utf8').match(/\d{9,}/g) || []));
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /kin\.naver\.com/);
const seen = new Set(); const cands = [];
for (const q of ['미국주식 초보', '미국주식 실적', '미국주식 프리마켓', '나스닥 지수']) {
  await page.goto('https://kin.naver.com/search/list.naver?query=' + encodeURIComponent(q) + '&sort=date'); await L.wait(4500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('a[href*="detail.naver"]')].map(a => ({ t: (a.innerText||'').replace(/\s+/g,' ').trim().slice(0,70), href: a.href })).filter(x => x.t).slice(0, 14));
  for (const r of rows) { const id = (r.href.match(/docId=(\d+)/) || [])[1]; if (!id || done.has(id) || seen.has(id)) continue; seen.add(id); cands.push({ q, id, t: r.t, href: r.href.split('&qb=')[0] }); }
}
console.log('신규 후보 ' + cands.length + '건');
for (const c of cands.slice(0, 8)) {
  await page.goto(c.href); await L.wait(3800);
  const d = await page.evaluate(() => {
    const body = (document.querySelector('.c-heading__content, .questionDetail') || {}).innerText || '';
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return { body: body.replace(/\s+/g,' ').slice(0, 180), answers: (t.match(/답변\s*(\d+)/) || [])[1] || '?', write: !!document.querySelector('button._answerWriteButton'), us: /미국|나스닥|S&P|테슬라|엔비디아|애플|미장|서학/.test(body) };
  });
  if (d.write && d.us) console.log(`✔ ${c.id} | 답변 ${d.answers} | ${d.body.slice(0,110)}`);
}
