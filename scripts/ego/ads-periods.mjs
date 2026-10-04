/* 애플 광고 «기간별» 판독 — 어제·최근 7일 등 (2026-10-03 만듦: ads-today.mjs 의 기간 선택 절차를 기간 목록으로 일반화)
 * 왜: ads-period.mjs 는 기간 후보만 찍는 탐침이라 «어제»·«이번 주» 지출·설치·CPA 를 못 읽었다(10/3 보고 요구).
 * 실행: ~/signum-ego-io/<KST 날짜>/ads-periods-task.json = {"periods":["어제","최근 7일"]}
 *       ★기간 항목명(10/4 21시 실측 — 선택기를 열어 읽음): 오늘·어제·최근 7일·지난주·최근 30일·최근 4주·최근 12주·당월·전월·최근 3개월 (옛 이름 «지난 7일» 은 없다 → 10/4 21:21 «기간 항목을 못 찾았다»로 실패. 아래 ALIAS 로 옛 이름도 받는다)
 *       bash scripts/ego-run.sh scripts/ego/ads-periods.mjs 300      → 결과 ads-periods-result.json
 * 읽기 전용 — 예산·입찰·키워드는 절대 만지지 않는다. 판독 실패는 «판독 실패»로 찍는다(0 으로 적지 않는다, MISTAKES #18). */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let P = ['어제', '최근 7일'];
const ALIAS = { '지난 7일': '최근 7일', '지난 30일': '최근 30일', '이번 달': '당월', '지난달': '전월' };   // 옛 이름 → 실제 항목명
try { P = JSON.parse(fs.readFileSync(await L.taskPath('ads-periods-task.json'), 'utf8')).periods || P; } catch { /* 기본값 */ }
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const REPORT = 'https://app-ads.apple.com/cm/app/23872040/report';
const page = await L.findPage(ts, /app-ads\.apple\.com/, REPORT);
const out = [];
for (const LABEL of P) {
  try { await page.goto(REPORT, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* 느려도 그려진다 */ }
  await L.wait(10000);
  if (/idmsa\.apple\.com|signin/.test(await page.url())) { console.log('SESSION_EXPIRED — 대표 로그인 필요. 판독 실패'); out.push({ period: LABEL, fail: 'session' }); break; }
  await page.mouse.click(977, 224); await L.wait(3000);   // ① 우상단 기간 선택기를 «연다»(ads-today 실측 위치)
  const WANT = ALIAS[LABEL] || LABEL;
  const pk = await page.evaluate((lab) => {
    const o = [...document.querySelectorAll('button,li,a,div,span')].filter((e) => e.offsetParent)
      .map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || '').replace(/\s+/g, ' ').trim(), x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), h: Math.round(b.height) }; })
      .filter((z) => z.h > 0 && z.h < 50 && z.t === lab);
    return o[0] || null;
  }, WANT);
  if (!pk) { console.log(`[${LABEL}] ⚠ 기간 항목을 못 찾았다 — 판독 실패`); out.push({ period: LABEL, fail: 'picker' }); continue; }
  await page.mouse.click(pk.x, pk.y); await L.wait(9000);  // ② 드롭다운의 그 기간을 누른다
  const rows = await page.evaluate(() => {
    const t = (document.body.innerText || '');
    const i = Math.max(0, t.indexOf('캠페인 관리'));
    const seg = t.slice(i, i + 3000).replace(/\n+/g, ' | ');
    const total = (seg.match(/합계 \|[^\n]{0,220}/) || [])[0] || null;
    const per = [...seg.matchAll(/(SIGNUM [A-Z]{2} - [^|]{1,40}?) \| (실행 중|일시 정지됨) \|(?:[^|]*\|){2,6}? ?\$([\d.,]+) \| \$([\d.,]+) \| \$([\d.,]+) \| \$([\d.,]+) \| ([\d,]+) \| (\d+) \| (\d+)/g)]
      .map((m) => ({ c: m[1].trim(), st: m[2], spend: m[3], cpa: m[4], cpt: m[5], cpm: m[6], impr: m[7], taps: m[8], inst: m[9] }));
    const range = [...document.querySelectorAll('button,div,span')].filter((e) => e.offsetParent && e.children.length === 0)
      .map((e) => { const b = e.getBoundingClientRect(); return { t: (e.innerText || '').replace(/\s+/g, ' ').trim(), y: Math.round(b.y) }; })
      .filter((z) => z.y > 150 && z.y < 280 && /\d{4}|오늘|어제|지난|최근|~|–|-\s*\d/.test(z.t) && z.t.length < 60).map((z) => z.t);
    return { total, per, range: [...new Set(range)].slice(0, 6), raw: seg.slice(0, 600) };
  });
  console.log(`\n[${LABEL}] 기간 표시=${JSON.stringify(rows.range)}`);
  for (const r of rows.per) console.log(`  ${r.c.padEnd(32)} ${r.st.padEnd(7)} 지출 $${r.spend.padEnd(7)} 노출 ${r.impr.padEnd(7)} 탭 ${r.taps.padEnd(3)} 설치 ${r.inst}  CPA $${r.cpa} · CPT $${r.cpt}`);
  console.log('  합계=' + (rows.total || '(미파싱 — 판독 실패)'));
  if (!rows.total) console.log('  원문 앞부분: ' + rows.raw.slice(0, 300));
  out.push({ period: LABEL, ...rows });
}
fs.writeFileSync(L.ioDir() + '/ads-periods-result.json', JSON.stringify(out, null, 1));
console.log('\n저장:', L.ioDir() + '/ads-periods-result.json');
