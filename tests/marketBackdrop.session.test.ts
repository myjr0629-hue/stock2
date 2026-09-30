// «지금 시장» 배경 — 세션 꼬리표·모드·결정적 문장·시간 검사 경계 테스트
// 실행: npx ts-node -P tsconfig.tsnode.json tests/marketBackdrop.session.test.ts
//
// 2026-09-28(월) 08:56 ET UC «THE MARKET NOW»가 금요일 등락(+0.48%·+0.93%)을 «today»로,
// FRED 전일 10년물 5.17%를 지금 값으로 썼다. 입력값은 그 시각 야후 실제 값(1분봉·일봉)으로 재구성했다.
import { buildBackdrop, backdropText, timeLabelViolation, factsBlock, calendarKey, type BackdropInputs } from '../src/lib/marketBackdrop';
import { lastClosedSessionDate, isEquityFuturesOpen, closeLabel, etClock, etWallTimeToMs } from '../src/lib/marketSession';

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
    total++;
    if (cond) pass++;
    else { failures.push(`${name}: ${detail}`); console.log(`  ❌ ${name}: ${detail}`); }
}
const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const EST = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 5, mi);
const iso = (ms: number) => new Date(ms).toISOString();

// ── 9/28(월) 08:56 ET 재구성 (야후 1분봉·일봉) ──────────────────────────────
const FRI_CLOSE = '2026-09-25T21:16:00.000Z';
const monPre = (now: number): BackdropInputs => ({
    nowMs: now,
    nasdaq: { price: 27068.717, changePct: 0.4801, marketTime: FRI_CLOSE, lastChangeAt: FRI_CLOSE },
    dow: { price: 51828.62, changePct: 0.9321, marketTime: '2026-09-25T21:05:00.000Z', lastChangeAt: FRI_CLOSE },
    spx: { price: 7743.41, changePct: 0.5099, marketTime: '2026-09-25T20:39:00.000Z' },
    nq: { price: 30748.75, changePct: -0.4548, marketTime: iso(now - 60_000), lastChangeAt: iso(now - 30_000) },
    es: { price: 7781, changePct: -0.2915, marketTime: iso(now - 60_000), lastChangeAt: iso(now - 30_000) },
    us10y: { level: 5.209, chgAbs: 0.025, symbolUsed: '^TNX', marketTime: iso(now - 120_000), curveDate: '2026-09-25', source: 'YAHOO' },
});

console.log('━━━ 1. 월 08:56 ET 개장 전 — 선물이 앞, 지수는 «금요일», 10년물은 살아 있는 값 ━━━');
{
    const b = buildBackdrop(monPre(EDT(2026, 9, 28, 8, 56)));
    check('mode=futures', b.mode === 'futures', b.mode);
    check('cash.sessionDate=Fri', b.cash.sessionDate === '2026-09-25', b.cash.sessionDate);
    check('cash not live', b.cash.live === false);
    check('futures live', b.futures.live && !!b.futures.es && !!b.futures.nq);
    check('10Y live 5.209', !!b.us10y && b.us10y.live && b.us10y.level === 5.209, JSON.stringify(b.us10y));
    check('10Y +2.5bp', b.us10y?.changeBp === 2.5, String(b.us10y?.changeBp));
    const en = backdropText(b, 'en')!;
    console.log('   en:', en);
    check('en text: futures first', en.startsWith('Before the open, S&P 500 futures are down 0.29%'), en);
    check('en text: Friday named', /On Friday, the Nasdaq closed up 0.48% and the Dow up 0.93%/.test(en), en);
    check('en text: no "today"', !/today/i.test(en), en);
    check('en text: 10Y 5.21 +2.5bp from Friday', /5\.21%, up 2\.5bp from Friday's close/.test(en), en);
    const ko = backdropText(b, 'ko')!; console.log('   ko:', ko);
    check('ko text', ko.includes('금요일 종가 기준 나스닥 0.48% 상승') && ko.includes('개장 전 선물') && !ko.includes('오늘'), ko);
    const ja = backdropText(b, 'ja')!; console.log('   ja:', ja);
    check('ja text', ja.includes('金曜日の終値') && ja.includes('寄り付き前の先物') && !ja.includes('今日'), ja);
    // 실제로 나간 문장은 위반이어야 한다
    const bad = 'Stocks are modestly higher today—NASDAQ +0.48%, Dow +0.93%—as investors weigh the macro backdrop. The 10Y yield sits at 5.17% (down 1bp).';
    check('guard catches the 9/28 sentence', timeLabelViolation(bad, b, 'en') !== null);
    check('guard passes deterministic en', timeLabelViolation(en, b, 'en') === null, String(timeLabelViolation(en, b, 'en')));
    check('guard passes deterministic ko', timeLabelViolation(ko, b, 'ko') === null, String(timeLabelViolation(ko, b, 'ko')));
    check('guard passes deterministic ja', timeLabelViolation(ja, b, 'ja') === null, String(timeLabelViolation(ja, b, 'ja')));
    check('guard: futures "this morning" ok', timeLabelViolation('Stock futures are lower this morning, after the Nasdaq rose 0.48% on Friday.', b, 'en') === null);
    check('guard ko 오늘 나스닥 → 위반', timeLabelViolation('오늘 나스닥은 0.48% 올랐습니다.', b, 'ko') !== null);
    check('guard ko 금요일 나스닥 → 통과', timeLabelViolation('지난 금요일 나스닥은 0.48% 올랐고, 지금 선물은 약세입니다.', b, 'ko') === null);
    check('guard ja 今日のナスダック → 違反', timeLabelViolation('今日のナスダックは0.48%上昇しています。', b, 'ja') !== null);
    check('guard ja 金曜 → 通過', timeLabelViolation('金曜のナスダックは0.48%上昇し、現在の先物は軟調です。', b, 'ja') === null);
    const facts = factsBlock(b, { fed: { noChange: 35.8, hike: 64.2, ease: 0, daysUntilFomc: 32, asOf: '2026-09-25T22:08:35.545Z' } });
    check('facts: NOT OPEN YET', facts.includes('NOT OPEN YET'), facts);
    check('facts: Friday close NOT today', facts.includes("[Friday's close, 2026-09-25 — NOT today] NASDAQ Composite"), facts);
    check('facts: futures LIVE', facts.includes('[LIVE 08:56 ET] S&P 500 futures -0.29%'), facts);
    check('facts: fed as-of', facts.includes('as of 2026-09-25 22:08 UTC'), facts);
    console.log(facts.split('\n').map((l) => '   ' + l).join('\n'));
}

console.log('━━━ 2. 토 12:00 ET — 선물도 닫힘, 전부 «금요일 마감» ━━━');
{
    const now = EDT(2026, 9, 26, 12);
    const inp = monPre(now);
    inp.nq = { price: 30889.25, changePct: 0.4, marketTime: '2026-09-25T20:59:00.000Z', lastChangeAt: '2026-09-25T20:59:30.000Z' };
    inp.es = { price: 7803.75, changePct: 0.47, marketTime: '2026-09-25T20:59:00.000Z', lastChangeAt: '2026-09-25T20:59:30.000Z' };
    // 토요일: TNX 날짜(금) = 곡선 날짜(금) → 통일본은 곡선 값(5.17), 변화량은 같은 세션이라 유효
    inp.us10y = { level: 5.17, chgAbs: 0.022, symbolUsed: 'UST:10Y', marketTime: '2026-09-25T19:00:00.000Z', curveDate: '2026-09-25', source: 'US_TREASURY' };
    const b = buildBackdrop(inp);
    check('mode=cash-closed', b.mode === 'cash-closed', b.mode);
    check('futures not live', !b.futures.live);
    check('10Y not live, Fri', !!b.us10y && !b.us10y.live && b.us10y.sessionDate === '2026-09-25', JSON.stringify(b.us10y));
    const en = backdropText(b, 'en')!; console.log('   en:', en);
    check('en closed text', en.startsWith('U.S. markets are closed. On Friday, the Nasdaq closed up 0.48%'), en);
    check('en 10Y closed Friday', en.includes('The 10-year Treasury yield closed Friday at 5.17%.'), en);
    console.log('   ko:', backdropText(b, 'ko'));
    console.log('   ja:', backdropText(b, 'ja'));
    check('guard: «yields sit at 5.17% today» 위반', timeLabelViolation('The 10-year yield is at 5.17% today.', b, 'en') !== null);
    check('closeLabel en', closeLabel(b.cash.sessionDate, 'en') === 'Fri 9/25 close');
    check('closeLabel ko', closeLabel(b.cash.sessionDate, 'ko') === '9/25(금) 마감 기준');
    check('closeLabel ja', closeLabel(b.cash.sessionDate, 'ja') === '9/25(金) 終値');
}

console.log('━━━ 3. 월 11:00 ET 정규장 — 오늘 값, «today» 허용 ━━━');
{
    const now = EDT(2026, 9, 28, 11);
    const inp = monPre(now);
    inp.nasdaq = { price: 26740.04, changePct: -1.2142, marketTime: iso(now - 60_000), lastChangeAt: iso(now - 30_000) };
    inp.dow = { price: 51471.46, changePct: -0.6891, marketTime: iso(now - 60_000), lastChangeAt: iso(now - 30_000) };
    inp.us10y = { level: 5.242, chgAbs: 0.058, symbolUsed: '^TNX', marketTime: iso(now - 900_000), curveDate: '2026-09-25' };
    const b = buildBackdrop(inp);
    check('mode=cash-live', b.mode === 'cash-live', b.mode);
    check('cash live today', b.cash.live && b.cash.sessionDate === '2026-09-28');
    const en = backdropText(b, 'en')!; console.log('   en:', en);
    check('en live text', en.startsWith('Stocks are lower today: the Nasdaq is down 1.21% and the Dow down 0.69%.'), en);
    check('guard off in live session', timeLabelViolation('Stocks are lower today.', b, 'en') === null);
}

console.log('━━━ 4. 월 18:30 ET 마감 뒤 — 오늘 종가(요일로), 선물은 다음 세션 ━━━');
{
    const now = EDT(2026, 9, 28, 18, 30);
    const inp = monPre(now);
    inp.nasdaq = { price: 26700, changePct: -1.36, marketTime: '2026-09-28T20:16:00.000Z' };
    inp.dow = { price: 51400, changePct: -0.83, marketTime: '2026-09-28T20:05:00.000Z' };
    inp.us10y = { level: 5.25, chgAbs: 0.067, symbolUsed: '^TNX', marketTime: '2026-09-28T19:00:00.000Z', curveDate: '2026-09-25' };
    const b = buildBackdrop(inp);
    check('mode=cash-closed (same day)', b.mode === 'cash-closed' && b.cash.sessionDate === '2026-09-28', `${b.mode} ${b.cash.sessionDate}`);
    const en = backdropText(b, 'en')!; console.log('   en:', en);
    check('en same-day close uses weekday', en.startsWith('Stocks ended Monday lower'), en);
    console.log('   ko:', backdropText(b, 'ko'));
    console.log('   ja:', backdropText(b, 'ja'));
}

console.log('━━━ 5. 화 03:00 ET — 선물 거래 중, TNX 아직 전(곡선 값·어제 날짜) ━━━');
{
    const now = EDT(2026, 9, 29, 3);
    const inp = monPre(now);
    inp.nasdaq = { price: 26700, changePct: -1.36, marketTime: '2026-09-28T20:16:00.000Z' };
    inp.dow = { price: 51400, changePct: -0.83, marketTime: '2026-09-28T20:05:00.000Z' };
    // 월요일 곡선이 게시된 뒤: TNX(월) = 곡선(월) → 곡선 값
    inp.us10y = { level: 5.24, chgAbs: 0.066, symbolUsed: 'UST:10Y', marketTime: '2026-09-28T19:00:00.000Z', curveDate: '2026-09-28' };
    const b = buildBackdrop(inp);
    check('mode=futures', b.mode === 'futures', b.mode);
    check('cash = Mon', b.cash.sessionDate === '2026-09-28');
    check('10Y = Mon close, not live', !!b.us10y && !b.us10y.live && b.us10y.sessionDate === '2026-09-28' && b.us10y.changeBp === 6.6, JSON.stringify(b.us10y));
    const en = backdropText(b, 'en')!; console.log('   en:', en);
    check('en: On Monday + 10Y closed Monday', en.includes('On Monday, the Nasdaq closed down 1.36%') && en.includes('closed Monday at 5.24%'), en);
}

console.log('━━━ 6. 선물 값이 멈춰 있으면(피드 정지) 선물로 시작하지 않는다 ━━━');
{
    const now = EDT(2026, 9, 28, 8, 56);
    const inp = monPre(now);
    inp.nq!.lastChangeAt = iso(now - 45 * 60_000);
    inp.es!.lastChangeAt = iso(now - 45 * 60_000);
    const b = buildBackdrop(inp);
    check('frozen futures → cash-closed', b.mode === 'cash-closed' && !b.futures.live, b.mode);
    check('still names Friday', /On Friday/.test(backdropText(b, 'en')!), backdropText(b, 'en')!);
}

console.log('━━━ 7. 벤더가 개장 전에 시각만 «오늘»로 밀어도 달력이 이긴다 ━━━');
{
    const now = EDT(2026, 9, 28, 8, 56);
    const inp = monPre(now);
    inp.nasdaq!.marketTime = iso(now - 60_000);
    inp.dow!.marketTime = iso(now - 60_000);
    const b = buildBackdrop(inp);
    check('sessionDate stays Fri', b.cash.sessionDate === '2026-09-25', b.cash.sessionDate);
}

console.log('━━━ 8. 장중인데 지수 피드가 금요일에 멈춰 있으면 live 아님 ━━━');
{
    const now = EDT(2026, 9, 28, 11);
    const b = buildBackdrop(monPre(now)); // 지수 marketTime = 금요일
    check('stale cash feed → not live, Fri', !b.cash.live && b.cash.sessionDate === '2026-09-25' && b.mode !== 'cash-live', `${b.mode} ${b.cash.sessionDate}`);
}

console.log('━━━ 9. 달력 경계 ━━━');
const lc: Array<[string, number, string]> = [
    ['토 9/26 12:00', EDT(2026, 9, 26, 12), '2026-09-25'],
    ['월 9/28 08:56', EDT(2026, 9, 28, 8, 56), '2026-09-25'],
    ['월 9/28 15:59', EDT(2026, 9, 28, 15, 59), '2026-09-25'],
    ['월 9/28 16:00', EDT(2026, 9, 28, 16), '2026-09-28'],
    ['화 9/29 00:30', EDT(2026, 9, 29, 0, 30), '2026-09-28'],
    ['월 9/7 12:00 노동절', EDT(2026, 9, 7, 12), '2026-09-04'],
    ['화 9/8 03:00', EDT(2026, 9, 8, 3), '2026-09-04'],
    ['화 12/29 16:30 EST', EST(2026, 12, 29, 16, 30), '2026-12-29'],
];
for (const [name, ms, want] of lc) check(`lastClosed ${name}`, lastClosedSessionDate(ms) === want, lastClosedSessionDate(ms));
const fut: Array<[string, number, boolean]> = [
    ['토 12:00', EDT(2026, 9, 26, 12), false],
    ['토 00:30 (자정 함정)', EDT(2026, 9, 26, 0, 30), false],
    ['일 17:59', EDT(2026, 9, 27, 17, 59), false],
    ['일 18:00', EDT(2026, 9, 27, 18), true],
    ['월 08:56', EDT(2026, 9, 28, 8, 56), true],
    ['화 17:30 휴식', EDT(2026, 9, 29, 17, 30), false],
    ['금 17:00 마감', EDT(2026, 9, 25, 17), false],
    ['노동절 12:59', EDT(2026, 9, 7, 12, 59), true],
    ['노동절 13:00', EDT(2026, 9, 7, 13), false],
    ['노동절 18:00', EDT(2026, 9, 7, 18), true],
];
for (const [name, ms, want] of fut) check(`futures ${name}`, isEquityFuturesOpen(ms) === want, String(isEquityFuturesOpen(ms)));
check('etWallTimeToMs EDT 9/25 20:00', etWallTimeToMs('2026-09-25', 20 * 60) === Date.parse('2026-09-26T00:00:00Z'), new Date(etWallTimeToMs('2026-09-25', 1200)).toISOString());
check('etWallTimeToMs EST 12/29 20:00', etWallTimeToMs('2026-12-29', 20 * 60) === Date.parse('2026-12-30T01:00:00Z'), new Date(etWallTimeToMs('2026-12-29', 1200)).toISOString());
check('etClock midnight = 0', etClock(EDT(2026, 9, 29, 0, 5)).minutes === 5, String(etClock(EDT(2026, 9, 29, 0, 5)).minutes));
check('calKey changes at open', calendarKey(EDT(2026, 9, 28, 9, 29)) !== calendarKey(EDT(2026, 9, 28, 9, 30)));
check('calKey changes at ET midnight', calendarKey(EDT(2026, 9, 28, 23, 59)) !== calendarKey(EDT(2026, 9, 29, 0, 1)));

console.log('═══════════════════════════════════════════════════════════');
console.log(`  marketBackdrop: ${pass}/${total} ${pass === total ? '✅ ALL PASS' : '❌ FAILURES'}`);
if (failures.length) failures.forEach((f) => console.log('  • ' + f));
console.log('═══════════════════════════════════════════════════════════');
if (failures.length) process.exit(1);
