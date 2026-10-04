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

(async () => {
  const args = process.argv.slice(2);
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
