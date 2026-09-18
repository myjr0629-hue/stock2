/* 애플 광고 «오늘» 판독 — 매 사이클 고정 작업.
 * 실행: ego-browser nodejs < scripts/ego/ads-today.mjs
 * 출력: 캠페인별 지출·노출·탭·설치 + 한도 초과 경고. 예산·입찰은 절대 만지지 않는다(읽기 전용). */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const REPORT = 'https://app-ads.apple.com/cm/app/23872040/report';
const page = await L.findPage(ts, /app-ads\.apple\.com/, REPORT);
await L.wait(4000);
// ★ 2026-09-18: 이전 사이클이 «키워드 관리» 화면에 탭을 두고 끝나면 findPage 가 그 탭을
//   그대로 재사용해 합계를 못 읽었다(「지출 파싱 실패」). 캠페인 목록이 아니면 강제로 돌아간다.
if (!/\/report(\?|$)/.test(await page.url())) {
    await page.goto(REPORT, { waitUntil: 'domcontentloaded', timeout: 60000 });
}
await L.wait(9000);
if (/idmsa\.apple\.com|signin/.test(await page.url())) { console.log('SESSION_EXPIRED — 대표 로그인 필요(t176). 오늘 수치 판독 불가.'); process.exit(0); }
// 기간을 «오늘»로 고정한다(30일치와 섞어 읽던 사고 방지)
// ★ 2026-09-19 수리. 예전엔 clickText(/^오늘$/) 하나였는데 «선택기를 열지 않은 채» 눌러서
//   적용이 안 됐다. 화면은 계속 「최근 7일」이었고, 그 7일 합계($284.62)를 하루 한도($25)와
//   비교해 ⛔ 거짓 경보를 냈다(캠페인을 정지할 뻔했다). 절차는 두 단계다:
//   ① 우상단 기간 선택기를 «열고»(실측 위치 977,224) ② 드롭다운의 「오늘」을 누른다.
await page.mouse.click(977, 224);
await L.wait(3000);
const picker = await page.evaluate(() => {
    const o = [...document.querySelectorAll('button,li,a,div,span')].filter((e) => e.offsetParent)
        .map((e) => { const b = e.getBoundingClientRect();
            return { t: (e.innerText || '').replace(/\s+/g, ' ').trim(), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), h: Math.round(b.height) }; })
        .filter((z) => z.h > 0 && z.h < 50 && z.t === '오늘');
    return o[0] || null;
});
console.log('기간 선택=' + JSON.stringify(picker));
if (picker) { await page.mouse.click(picker.x, picker.y); await L.wait(9000); }
else { console.log('⚠ 기간 선택기를 못 열었다 — 아래 수치는 «오늘»이 아닐 수 있다. 화면을 볼 것.'); }
const rows = await page.evaluate(() => {
    const t = (document.body.innerText || '');
    const i = Math.max(0, t.indexOf('캠페인 관리'));
    const seg = t.slice(i, i + 3000).replace(/\n+/g, ' | ');
    const total = (seg.match(/합계 \|[^\n]{0,160}/) || [])[0] || null;
    // 캠페인 행: 이름 … $지출 $설치비용 $CPT $CPA 노출 탭 설치
    const per = [...seg.matchAll(/(SIGNUM [A-Z]{2} - [^|]{1,40}?) \| (실행 중|일시 정지됨) \|(?:[^|]*\|){2,6}? ?\$([\d.,]+) \| \$([\d.,]+) \| \$([\d.,]+) \| \$([\d.,]+) \| ([\d,]+) \| (\d+) \| (\d+)/g)]
        .map((m) => ({ c: m[1].trim(), st: m[2], spend: m[3], cpt: m[5], cpa: m[6], impr: m[7], taps: m[8], inst: m[9] }));
    return { total, per, raw: seg.slice(0, 900) };
});
for (const r of rows.per) console.log(`  ${r.c.padEnd(32)} ${r.st.padEnd(7)} 지출 $${r.spend.padEnd(7)} 노출 ${r.impr.padEnd(7)} 탭 ${r.taps.padEnd(3)} 설치 ${r.inst}  CPA $${r.cpa}`);
console.log('합계=' + (rows.total || '(미파싱)'));
// ★ 한도 검사는 «합계 지출»로 한다 — 캠페인 파싱이 실패해도 거짓 «정상» 을 내지 않는다(2026-09-18 실측 결함)
const totalSpend = rows.total ? Number((rows.total.match(/\$([\d.,]+)/) || [])[1]?.replace(/,/g, '')) : NaN;
const LIMIT = 25; // JP $5 + KR $10 + US $10
if (!Number.isFinite(totalSpend)) console.log('\n⚠ 지출 파싱 실패 — 한도 검사를 못 했다. 화면을 직접 볼 것.\n' + rows.raw.slice(0, 400));
else console.log(`\n지출 합계 $${totalSpend.toFixed(2)} / 한도 $${LIMIT} · ` + (totalSpend > LIMIT * 1.5 ? '⛔ 1.5배 초과 — 즉시 정지·기록' : '정상 범위') + (rows.per.length ? '' : ' (캠페인별 파싱 실패 — 합계로만 판정)'));
