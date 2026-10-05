/* 광고그룹 키워드 성과 판독(읽기 전용) — 지출은 있는데 설치 0 인 «진 키워드»를 찾는다.
 * 기간은 화면에서 «최근 7일»로 고정한다(표본이 하루는 너무 얇다 — 옛 이름 «지난 7일» 은 없어졌다, 10/5 수리). 입찰·예산은 만지지 않는다. */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
// ★10/4: ego 스크립트에는 셸 환경변수가 안 간다(메모리 ego-scripts-ignore-shell-env) → 예전 기본값(2144649814 = 미국 Exact, 일시 정지)만 읽고 있었다.
//   기본을 실행 중인 일본 캠페인(2144644299)으로 바꾸고, 다른 캠페인은 작업 파일 ads-keywords-task.json {"cp":"…","ag":"…"} 으로 고른다.
let T = {}; try { T = JSON.parse((await import('node:fs')).readFileSync(await L.taskPath('ads-keywords-task.json'), 'utf8')); } catch {}
const CP = T.cp || process.env.CP || '2144644299', AG = T.ag || process.env.AG || '';
console.log(`캠페인 ${CP}${CP === '2144644299' ? '(일본)' : ''}${AG ? ' · 광고그룹 ' + AG : ''}`);
await page.goto(`https://app-ads.apple.com/cm/app/23872040/report/campaign/${CP}${AG ? '/adgroup/' + AG : ''}`); await L.wait(13000);
if (/idmsa|signin/.test(await page.url())) { console.log('SESSION_EXPIRED'); process.exit(0); }
// ★2026-10-05 12시: 옛 이름 «지난 7일» 은 없다(실제 항목명 «최근 7일» — ads-periods.mjs 와 같은 10/4 실측). 이 줄이 null 을 돌려줘도 아래가 «화면 기본 기간» 숫자로 계속 읽혀 11시 회차 판독의 기간이 불명이었다(MISTAKES #55 — 같은 일을 하는 스크립트 전수 확인: «지난 7일» 은 이 파일뿐).
//   항목은 우상단 선택기를 «열어야» 보인다 → ①글자가 이미 보이면 누르고 ②아니면 선택기를 열고(ads-periods 와 같은 위치) 항목을 찾아 누른다. 둘 다 실패하면 «기간 불명»을 크게 찍는다 — 그 숫자로 진 키워드를 판정하지 않는다.
let period = await L.clickText(page, /^최근 7일$/, { deep: true, after: 11000 });
if (!period) {
  await page.mouse.click(977, 224); await L.wait(3000);
  const pk = await page.evaluate(() => {
    const o = [...document.querySelectorAll('button,li,a,div,span')].filter((e) => e.offsetParent)
      .map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || '').replace(/\s+/g, ' ').trim(), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), h: Math.round(b.height) }; })
      .filter((z) => z.h > 0 && z.h < 50 && z.t === '최근 7일');
    return o[0] || null;
  });
  if (pk) { await page.mouse.click(pk.x, pk.y); await L.wait(11000); period = '최근 7일(선택기)'; }
}
console.log('기간=' + JSON.stringify(period) + (period ? '' : '  ⚠ 캠페인 화면에서는 기간 선택기를 못 찾았다(우상단 칸이 캠페인 요약 패널 — 10/5 12시 탐침 2회) — 아래 숫자는 «화면에 남아 있는 기간»(보통 직전 ads-periods 실행의 마지막 기간)의 것이다. '
  + '기간을 정하려면 먼저 `ads-periods.mjs` 로 그 기간을 고른 뒤 이 도구를 돌리고, 아래 «행 지출 합»이 ads-periods 의 그 기간 캠페인 지출과 같은지 확인한다(10/5 12시 실측: 최근 7일 $34.17 = 키워드 행 합 $34.17). ★«최근 7일» 은 «오늘»을 뺀 7일이다.'));
await L.clickText(page, /^(모든 키워드|키워드)$/, { deep: true, after: 9000 });
const rows = await page.evaluate(() => {
  const t = (document.body.innerText || '');
  const i = Math.max(0, t.indexOf('키워드'));
  const seg = t.slice(i, i + 6000).replace(/\n+/g, ' | ');
  // 키워드 | 상태 | 입찰 | ... | 지출 | ... | 노출 | 탭 | 설치
  const rx = /\| ([^|]{2,28}) \| (실행 중|일시 정지됨) \|[^|]*\| \$([\d.,]+) \|[^|]*\| \$([\d.,]+) \| \$([\d.,]+) \| \$([\d.,]+) \| ([\d,]+) \| (\d+) \| (\d+) \|/g;
  return [...seg.matchAll(rx)].map((m) => ({ kw: m[1].trim(), st: m[2], bid: m[3], spend: Number(m[4].replace(/,/g, '')), impr: m[7], taps: Number(m[8]), inst: Number(m[9]) }));
});
console.log('키워드 ' + rows.length + '행 · 행 지출 합 $' + rows.reduce((t, r) => t + r.spend, 0).toFixed(2) + ' · 설치 합 ' + rows.reduce((t, r) => t + r.inst, 0) + ' (기간 확인용 — 위 안내)');
const losers = rows.filter((r) => r.st === '실행 중' && r.spend >= 3 && r.inst === 0).sort((a, b) => b.spend - a.spend);
for (const r of rows.filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 12))
  console.log(`  ${r.kw.padEnd(22)} ${r.st.padEnd(8)} 입찰 $${r.bid.padEnd(6)} 지출 $${String(r.spend).padEnd(7)} 노출 ${String(r.impr).padEnd(6)} 탭 ${String(r.taps).padEnd(3)} 설치 ${r.inst}`);
console.log('\n진 키워드 후보(실행 중·지출 $3+·설치 0): ' + (!period ? '판정 안 함 — 기간을 도구가 못 골랐다(위 ⚠ — ads-periods 로 기간을 먼저 맞추고 행 지출 합으로 확인)' : (losers.map((r) => `${r.kw}($${r.spend})`).join(' · ') || '없음')));
