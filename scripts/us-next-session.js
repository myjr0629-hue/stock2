#!/usr/bin/env node
/* ============================================================================
 * us-next-session — «다음 미국 세션» 소재 한 장: 경제 일정·주요 실적·금리/지수 시세 (브라우저 없음)
 *
 * 왜 (2026-09-30 04시 사이클): WSB «moves» 댓글·x_jp 아침 글·스레드 글이 매번 같은 세 가지를 손으로 모았다.
 *   그러다 두 번 헛디뎠다 — ①야후 차트 API 가 429(Too Many Requests)로 막혔고 ②나스닥 경제 일정 API 의
 *   date 는 «하루 앞»을 받아야 그날 일정이 나온다(실측: date=09-30 → 화 9/29 콘퍼런스보드·JOLTS,
 *   date=10-01 → 수 9/30 ADP·PCE·시카고 PMI — BEA 공식 일정 «Sep 30 8:30 Personal Income and Outlays» 로 대조,
 *   date=09-29 → 월 9/28 댈러스 연준 제조업·3개월물 입찰). 실적 일정 API(calendar/earnings)는 date 그대로다.
 *   → 이 둘을 한 곳에 고정하고, 시세는 CNBC 공개 시세(무인증)로 받는다.
 *
 * 사용: node scripts/us-next-session.js [YYYY-MM-DD(ET 세션일)] [추가티커...]
 *   날짜를 안 주면: ET 16:00 전이면 오늘, 뒤면 다음 평일.
 * 출력: 콘솔 + /tmp/ego/next-session-<날짜>.json
 * 규칙: 옵션 수치는 여기서 내지 않는다(나스닥 전체 체인 대조 ✓ 종목만 — audit-structure-vs-nasdaq.js).
 * ========================================================================== */
const fs = require('fs');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const NQ = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const get = async (u, h) => { const r = await fetch(u, { headers: h || { 'User-Agent': UA } }); const t = await r.text(); try { return JSON.parse(t); } catch { return { __raw: r.status + ' ' + t.slice(0, 80) }; } };
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

function defaultSession() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  let s = ymd(new Date(Date.UTC(et.getFullYear(), et.getMonth(), et.getDate())));
  if (et.getHours() >= 16) s = addDays(s, 1);
  while ([0, 6].includes(new Date(s + 'T12:00:00Z').getUTCDay())) s = addDays(s, 1);
  return s;
}

// ═══ 주간 모드 — `node scripts/us-next-session.js --week [YYYY-MM-DD] [--all] [--json]` · 시험 — `--selftest` (★2026-10-05 19시 회차 신설) ═══
// 왜: «이번 주 일정» 글(Threads·X·note·블루스카이)을 쓸 때마다 세션일을 4~5번 따로 돌리고 ET→한국시간을 손으로 바꿨다(오늘 밤 23:00 = 월 ET 10:00 ·
//   FOMC 의사록 = 수 ET 14:00 → «목» 새벽 03:00 — 요일이 밀린다 · 서머타임 EDT +13h / EST +14h). 한 번에 월~금 주요 지표를 «한국 요일·시각»으로 찍는다.
// 날짜 오프셋(나스닥 date 는 하루 앞인데 조회 시각에 따라 어긋난 적이 있다 — MISTAKES #74)은 날짜 하나씩 믿지 않고
//   «화요일 앵커(Redbook·API)가 든 목록이 어느 date 인가»로 주 전체 오프셋을 정하고, 수·목 앵커로 교차 확인한다(어긋나면 ⚠).
// 예상치는 나스닥(Zacks) 컨센서스다 — 출처마다 다르다(10/5 ISM 서비스업: 55.0·55.1·55.7 로 갈렸다). 글에는 «안팎»이나 출처 표기로 쓴다.
const WK = '일월화수목금토';
const NYF = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const nyWallAsUtc = (ms) => { const p = {}; for (const x of NYF.formatToParts(new Date(ms))) p[x.type] = x.value; return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); };
// ET 벽시계(날짜·HH:MM) → 한국시간. 서머타임(EDT −4 / EST −5)은 Intl 로 그 «순간»의 오프셋을 읽는다(두 번 보정 — 전환일 경계).
function etToKst(ymdStr, hm) {
  const [h, m] = hm.split(':').map(Number);
  const wall = Date.UTC(+ymdStr.slice(0, 4), +ymdStr.slice(5, 7) - 1, +ymdStr.slice(8, 10), h, m);
  let utc = wall + 4 * 3600e3;
  for (let i = 0; i < 2; i++) utc = wall - (nyWallAsUtc(utc) - utc);
  const k = new Date(utc + 9 * 3600e3);
  return { kDate: ymd(k), kHm: k.toISOString().slice(11, 16), kDow: WK[k.getUTCDay()] };
}
const MAJOR = new RegExp([
  'ISM (Non-)?Manufacturing PMI', 'S&P Global (Composite|Services|Manufacturing) PMI', 'FOMC Meeting Minutes', 'FOMC (Rate|Interest|Press|Statement)', 'Fed Chair',
  'Nonfarm Payrolls?', 'Unemployment Rate', 'Initial Jobless Claims', '\\bCPI\\b', '\\bPPI\\b', 'PCE Price', 'Core PCE', '\\bGDP(?!Now)', 'Retail Sales',
  'Michigan Consumer Sentiment', 'Consumer Confidence', 'JOLTS', 'Trade Balance', 'Durable Goods Orders', 'Housing Starts', 'Building Permits',
  'Existing Home Sales', 'New Home Sales', 'Industrial Production', 'Beige Book', 'Empire State', 'Philadelphia Fed (Manufacturing|Index)', 'Average Hourly Earnings',
  'ADP Employment Change(?! Weekly)', '(3|10|30)-Year (Note|Bond) Auction',
].join('|'), 'i');
const SPEAK = /(Fed|FOMC)[^|]*Speaks/i;
function selfTest() {
  // [ET 날짜, ET 시각, 기대 한국 날짜, 기대 한국 시각, 기대 요일] — 양성 대조군(MISTAKES #75·#79): 하나라도 어긋나면 종료 1
  const cases = [
    ['2026-10-05', '10:00', '2026-10-05', '23:00', '월'], // EDT: ISM 서비스업 — 오늘 밤
    ['2026-10-07', '14:00', '2026-10-08', '03:00', '목'], // FOMC 의사록: 수 오후 → 목 새벽
    ['2026-10-08', '08:30', '2026-10-08', '21:30', '목'], // 신규 실업수당
    ['2026-11-02', '10:00', '2026-11-03', '00:00', '화'], // EST(서머타임 끝난 뒤 +14h) — 자정 넘김
    ['2026-11-01', '08:30', '2026-11-01', '22:30', '일'], // 서머타임 끝나는 날(11/1) 아침 — 이미 EST
    ['2026-03-09', '08:30', '2026-03-09', '21:30', '월'], // 서머타임 시작 다음 날(3/8 시작) — +13h
  ];
  let bad = 0;
  for (const [d, t, ed, et2, ew] of cases) {
    const r = etToKst(d, t); const ok = r.kDate === ed && r.kHm === et2 && r.kDow === ew;
    if (!ok) bad++;
    console.log((ok ? '✓' : '✗') + ` ET ${d} ${t} → 한국 ${r.kDate} ${r.kDow} ${r.kHm}` + (ok ? '' : `  (기대 ${ed} ${ew} ${et2})`));
  }
  const names = ['ISM Non-Manufacturing PMI', 'S&P Global Services PMI', 'FOMC Meeting Minutes', 'Initial Jobless Claims', 'Michigan Consumer Sentiment', 'Trade Balance'];
  const noise = ['ISM Non-Manufacturing Prices', 'Continuing Jobless Claims', 'Jobless Claims 4-Week Avg.', 'Atlanta Fed GDPNow', 'ADP Employment Change Weekly', 'Crude Oil Inventories']; // 모두 나스닥 API 의 실제 이름
  for (const n of names) if (!MAJOR.test(n)) { bad++; console.log('✗ 주요 지표인데 걸러짐: ' + n); }
  for (const n of noise) if (MAJOR.test(n)) { bad++; console.log('✗ 잡음인데 통과: ' + n); }
  console.log(bad ? `⛔ 시험 실패 ${bad}건` : `✅ 시험 통과 — 시각 ${cases.length}건 · 주요 지표 ${names.length}건 통과 · 잡음 ${noise.length}건 차단`);
  process.exit(bad ? 1 : 0);
}
async function weekMode(args) {
  const all = args.includes('--all'), asJson = args.includes('--json');
  const given = args.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const base = given || ymd(new Date(Date.UTC(etNow.getFullYear(), etNow.getMonth(), etNow.getDate())));
  const dow = new Date(base + 'T12:00:00Z').getUTCDay();
  const mon = dow === 0 ? addDays(base, 1) : dow === 6 ? addDays(base, 2) : addDays(base, 1 - dow); // 주말이면 다음 주 월요일
  const log = (...a) => { if (!asJson) console.log(...a); };
  // 1) date=월~일 7개 목록 → 요일 앵커로 «어느 date 가 어느 세션일인가»(오프셋 o: 세션 j 번째 = 목록 j+o)를 정한다
  const lists = [];
  for (let i = 0; i < 7; i++) {
    const dt = addDays(mon, i); let e = {};
    try { e = await get('https://api.nasdaq.com/api/calendar/economicevents?date=' + dt, NQ); } catch {}
    lists.push({ dt, rows: ((e.data && e.data.rows) || []).filter((r) => /United States/i.test(r.country || '')) });
  }
  const ANCH = [[2, /Redbook|API Weekly Crude/i], [3, /MBA Mortgage|Crude Oil Inventories/i], [4, /Initial Jobless Claims/i]];
  const guess = (rs) => { for (const [d, re] of ANCH) if (rs.some((r) => re.test(r.eventName || ''))) return d; return null; };
  const g = lists.map((l) => guess(l.rows));
  let o = null, how = '';
  for (const [wd, label] of [[2, '화'], [3, '수'], [4, '목']]) { const i = g.indexOf(wd); if (i >= 0) { o = i - (wd - 1); how = `${label}요일 앵커 목록 = date=${lists[i].dt}`; break; } }
  const warn = [];
  if (o === null) { o = 1; warn.push('요일 앵커(화 Redbook·API / 수 MBA·EIA / 목 신규 실업수당)를 한 곳도 못 찾았다 — 하루 앞(+1) 규칙으로 가정했다. 월·금 항목은 규칙 일정으로 대조하라'); how = '앵커 없음 → +1 가정'; }
  for (const [j, wd] of [[1, 2], [2, 3], [3, 4]]) { const gi = g[j + o]; if (gi != null && gi !== wd) warn.push(`${WK[wd]}요일 자리의 목록이 ${WK[gi]}요일 앵커를 가졌다 — 오프셋 ${o} 가 틀렸을 수 있다`); }
  if (lists.every((l) => !l.rows.length)) warn.push('나스닥 캘린더에서 일정을 한 건도 못 받았다(차단·장애?) — 이 출력을 글에 쓰지 말 것');
  // 2) 세션일마다 주요 지표(ET→한국시간) + 시총 상위 실적
  const days = [];
  for (let j = 0; j < 5; j++) {
    const S = addDays(mon, j), rows = (lists[j + o] || { rows: [] }).rows, seen = new Set(), ev = [];
    for (const r of rows) {
      const k = [r.gmt, r.eventName, r.consensus, r.previous].join('|'); if (seen.has(k)) continue; seen.add(k);
      const name = (r.eventName || '').trim();
      if (!all && !(MAJOR.test(name) || SPEAK.test(name))) continue;
      const t = (r.gmt || '').trim();
      ev.push({ et: t, kst: /^\d{1,2}:\d{2}$/.test(t) ? etToKst(S, t) : null, event: name, cons: (r.consensus || '').trim(), prev: (r.previous || '').replace(/&nbsp;/g, '').trim() });
    }
    ev.sort((a, b) => ((a.kst ? a.kst.kDate + a.kst.kHm : '9') < (b.kst ? b.kst.kDate + b.kst.kHm : '9') ? -1 : 1));
    let earn = [];
    try {
      const er = await get('https://api.nasdaq.com/api/calendar/earnings?date=' + S, NQ); const cap = (s) => Number(String(s || '').replace(/[$,]/g, '')) || 0;
      earn = ((er.data && er.data.rows) || []).sort((a, b) => cap(b.marketCap) - cap(a.marketCap)).slice(0, 4)
        .map((r) => ({ symbol: r.symbol, when: /pre/.test(r.time || '') ? '장전' : /after/.test(r.time || '') ? '장후' : '시각 미정', eps: r.epsForecast || '-' }));
    } catch {}
    days.push({ session: S, dow: WK[new Date(S + 'T12:00:00Z').getUTCDay()], ev, earn });
  }
  const out = { week: mon, offset: o, offsetBasis: how, warn, days, at: new Date().toISOString() };
  try { fs.mkdirSync('/tmp/ego', { recursive: true }); fs.writeFileSync('/tmp/ego/week-schedule-' + mon + '.json', JSON.stringify(out, null, 1)); } catch {}
  if (asJson) { console.log(JSON.stringify(out, null, 1)); return; }
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  log(`── 주간 일정 · 미국 세션 월 ${md(mon)} ~ 금 ${md(addDays(mon, 4))} · ET→한국시간(서머타임 자동) · 나스닥 캘린더 · ${all ? '전체' : '주요 지표만(--all 로 전부)'} ──`);
  log(`   날짜 정렬: ${how} → 세션일 = date+${o}${warn.length ? '' : ' ✓ (수·목 앵커 교차 확인)'}`);
  for (const w of warn) log('   ⚠ ' + w);
  for (const d of days) {
    log(`\n[${d.dow} ${md(d.session)} 미국 세션]`);
    if (!d.ev.length) log('   (주요 지표 없음)');
    for (const e of d.ev) log(`   ${e.kst ? `한국 ${e.kst.kDow} ${e.kst.kHm}` : '시각 미정    '} (ET ${e.et || '-'})  ${e.event}${e.cons ? ' · 예상 ' + e.cons : ''}${e.prev ? ' · 직전 ' + e.prev : ''}`);
    if (d.earn.length) log(`   실적(시총 상위): ` + d.earn.map((x) => `${x.symbol}(${x.when}·EPS 예상 ${x.eps})`).join(' · ') + '  — 장전=한국 같은 날 저녁, 장후=한국 다음 날 새벽');
  }
  log('\n· 예상치는 나스닥(Zacks) 컨센서스다 — 출처마다 다르다(10/5 ISM 서비스업: 55.0·55.1·55.7 로 갈렸다). 글에는 «안팎»이나 출처 표기로 쓴다. 옵션 수치는 여기서 내지 않는다.');
  log('저장: /tmp/ego/week-schedule-' + mon + '.json');
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selfTest();
  if (args.includes('--week')) return weekMode(args);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(args[0] || '') ? args.shift() : defaultSession();
  const extra = args.map((x) => x.toUpperCase());
  const out = { session: day, at: new Date().toISOString() };

  // 1) 경제 일정 — date 는 «하루 앞»(위 주석의 실측)
  const ev = await get('https://api.nasdaq.com/api/calendar/economicevents?date=' + addDays(day, 1), NQ);
  const rows = ((ev.data && ev.data.rows) || []).filter((r) => /United States/i.test(r.country || ''));
  out.econ = rows.map((r) => ({ time: r.gmt, event: r.eventName, cons: (r.consensus || '').trim(), prev: (r.previous || '').replace(/&nbsp;/g, '').trim(), actual: (r.actual || '').replace(/&nbsp;/g, '').trim() }));
  console.log(`── 경제 일정 (ET, ${day}) · 나스닥 캘린더 date=${addDays(day, 1)} ──`);
  const seen = new Set();
  // 같은 이름이 m/m·y/y 두 줄로 온다(Core PCE Price Index 0.3%/3.4%) — 이름만으로 지우면 y/y 가 사라진다
  for (const e of out.econ) { const k = [e.time, e.event, e.cons, e.prev].join('|'); if (seen.has(k)) continue; seen.add(k); console.log(`${e.time}  ${e.event}${e.cons ? ' · 예상 ' + e.cons : ''}${e.prev ? ' · 직전 ' + e.prev : ''}${e.actual ? ' · 실제 ' + e.actual : ''}`); }

  // ★2026-10-05 날짜 점검(MISTAKES #74): 위 «하루 앞» 규칙이 조회 시각에 따라 어긋난 적이 있다(10/5 00시대: date=10-06 → 화요일 항목, 월요일 ISM 없음).
  //   응답 행에는 날짜 필드가 없다(키: actual·consensus·country·description·eventName·gmt·previous) → date·D+1·D+2 세 목록의 «요일 앵커»(화 Redbook·API / 수 MBA·EIA / 목 신규 실업수당)를 읽어 알려 준다.
  {
    const ANCH = [[2, /Redbook|API Weekly Crude/i], [3, /MBA Mortgage|Crude Oil Inventories/i], [4, /Initial Jobless Claims/i]];
    const guess = (rs) => { for (const [d, re] of ANCH) if (rs.some((r) => re.test(r.eventName || ''))) return d; return null; };
    const NAME = ['일', '월', '화', '수', '목', '금', '토'];
    const want = new Date(day + 'T12:00:00Z').getUTCDay();
    const lines = [];
    for (const k of [0, 1, 2]) {
      const dt = addDays(day, k);
      let e2 = ev; if (k !== 1) { try { e2 = await get('https://api.nasdaq.com/api/calendar/economicevents?date=' + dt, NQ); } catch { e2 = {}; } }
      const rs = ((e2.data && e2.data.rows) || []).filter((r) => /United States/i.test(r.country || ''));
      lines.push({ k, dt, n: rs.length, g: guess(rs), sample: rs.slice(0, 3).map((r) => r.gmt + ' ' + r.eventName).join(' / ') });
    }
    console.log(`\n── 날짜 점검(요일 앵커: 화 Redbook·API / 수 MBA·EIA / 목 신규 실업수당) · 세션일 요일 ${NAME[want]} ──`);
    for (const l of lines) console.log(`date=${l.dt}${l.k === 1 ? ' (위 목록)' : ''} · 미국 ${l.n}건 · 앵커 요일 ${l.g == null ? '-' : NAME[l.g]} · ${l.sample}`);
    const used = lines[1];
    if (used.g != null && used.g !== want) console.log(`⚠⚠ 위 일정은 ${NAME[used.g]}요일 목록이다(세션일은 ${NAME[want]}요일) — 일정 글을 쓰지 말고 다른 date 목록·규칙 일정으로 확인하라(MISTAKES #74)`);
    else if (used.g == null && (want === 1 || want === 5)) console.log('· 월·금은 앵커가 없다 — 화요일 앵커가 있는 목록 바로 앞이 월요일이다. 규칙 일정(ISM·PMI)으로 대조하라');
    out.dateCheck = lines;
  }

  // 2) 실적 — date 그대로 · 시총 상위
  const er = await get('https://api.nasdaq.com/api/calendar/earnings?date=' + day, NQ);
  const cap = (s) => Number(String(s || '').replace(/[$,]/g, '')) || 0;
  out.earnings = ((er.data && er.data.rows) || []).sort((a, b) => cap(b.marketCap) - cap(a.marketCap)).slice(0, 8)
    .map((r) => ({ symbol: r.symbol, time: r.time, eps: r.epsForecast, ests: r.noOfEsts, lastYearEPS: r.lastYearEPS, cap: r.marketCap }));
  console.log(`\n── 실적 (${day}, 시총 상위 8) ──`);
  for (const r of out.earnings) console.log(`${r.symbol.padEnd(6)} ${String(r.time).replace('time-', '').padEnd(14)} EPS 예상 ${r.eps || '-'} (${r.ests}명) · 작년 ${r.lastYearEPS}`);

  // 3) 시세 — CNBC 공개 시세(야후 차트 API 는 429 로 막힐 때가 있다)
  const syms = ['US2Y', 'US10Y', 'US30Y', '.SPX', '.IXIC', '.VIX', ...extra];
  const q = await get('https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=' + encodeURIComponent(syms.join('|')) + '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json');
  const fq = (q.FormattedQuoteResult && q.FormattedQuoteResult.FormattedQuote) || [];
  out.quotes = fq.map((x) => ({ symbol: x.symbol, last: x.last, change: x.change, pct: x.change_pct, time: x.last_time, prevClose: x.previous_day_closing, status: x.curmktstatus }));
  console.log('\n── 시세 (CNBC) ──');
  for (const x of out.quotes) console.log(`${x.symbol.padEnd(6)} ${x.last}  ${x.change} (${x.pct})  전일 ${x.prevClose}  · ${x.time} ${x.status}`);

  const f = '/tmp/ego/next-session-' + day + '.json';
  try { fs.mkdirSync('/tmp/ego', { recursive: true }); fs.writeFileSync(f, JSON.stringify(out, null, 1)); console.log('\n저장: ' + f); } catch {}
})();
