/* 광고그룹 키워드 성과 판독(읽기 전용) — 지출은 있는데 설치 0 인 «진 키워드»를 찾는다.
 * 기간은 화면에서 «지난 7일»로 고정한다(표본이 하루는 너무 얇다). 입찰·예산은 만지지 않는다. */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
const CP = process.env.CP || '2144649814', AG = process.env.AG || '';
await page.goto(`https://app-ads.apple.com/cm/app/23872040/report/campaign/${CP}${AG ? '/adgroup/' + AG : ''}`); await L.wait(13000);
if (/idmsa|signin/.test(await page.url())) { console.log('SESSION_EXPIRED'); process.exit(0); }
console.log('기간=' + JSON.stringify(await L.clickText(page, /^지난 7일$/, { deep: true, after: 11000 })));
await L.clickText(page, /^(모든 키워드|키워드)$/, { deep: true, after: 9000 });
const rows = await page.evaluate(() => {
  const t = (document.body.innerText || '');
  const i = Math.max(0, t.indexOf('키워드'));
  const seg = t.slice(i, i + 6000).replace(/\n+/g, ' | ');
  // 키워드 | 상태 | 입찰 | ... | 지출 | ... | 노출 | 탭 | 설치
  const rx = /\| ([^|]{2,28}) \| (실행 중|일시 정지됨) \|[^|]*\| \$([\d.,]+) \|[^|]*\| \$([\d.,]+) \| \$([\d.,]+) \| \$([\d.,]+) \| ([\d,]+) \| (\d+) \| (\d+) \|/g;
  return [...seg.matchAll(rx)].map((m) => ({ kw: m[1].trim(), st: m[2], bid: m[3], spend: Number(m[4].replace(/,/g, '')), impr: m[7], taps: Number(m[8]), inst: Number(m[9]) }));
});
console.log('키워드 ' + rows.length + '행');
const losers = rows.filter((r) => r.st === '실행 중' && r.spend >= 3 && r.inst === 0).sort((a, b) => b.spend - a.spend);
for (const r of rows.filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 12))
  console.log(`  ${r.kw.padEnd(22)} ${r.st.padEnd(8)} 입찰 $${r.bid.padEnd(6)} 지출 $${String(r.spend).padEnd(7)} 노출 ${String(r.impr).padEnd(6)} 탭 ${String(r.taps).padEnd(3)} 설치 ${r.inst}`);
console.log('\n진 키워드 후보(실행 중·지출 $3+·설치 0): ' + (losers.map((r) => `${r.kw}($${r.spend})`).join(' · ') || '없음'));
