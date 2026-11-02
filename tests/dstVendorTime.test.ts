// 서머타임 경계·벤더 시각 복구 테스트 (2026-11-02 PRE 칸 결측 회귀)
// 실행: node_modules/.bin/esbuild tests/dstVendorTime.test.ts --bundle --platform=node --packages=external --outfile=.tmp-test/dst.cjs && node .tmp-test/dst.cjs
//
// 11/2(월) 05:15 ET — 서머타임 종료 다음 거래일 프리마켓. Intrinio realtime 이 마지막 체결 시각을
// «2083-09-02T14:05:08.905Z»로 줘서 프리마켓 체결이 아니라고 판정됐다(PRE 가격 null → 화면 «POST (CLOSED)»).
import assert from 'node:assert/strict';
import { repairVendorEpochMs, repairIntrinioRealtimeTimes, etWallToMs, usDstTransitionDates } from '../src/lib/vendorTime';
import { cashSessionPhaseAt, etDateOf, etMinutesOf } from '../src/lib/marketCalendar';
import { isTradeInExtSession } from '../src/services/extendedSessionClose';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sessionAt } = require('../scripts/integrity/clock');

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
    total++;
    if (cond) pass++;
    else { failures.push(`${name}: ${detail}`); console.log(`  ❌ ${name}: ${detail}`); }
}

// ET 벽시계 → epoch. 테스트의 정답은 «고정 오프셋을 날짜별로 손으로 고른 값»이다(코드의 Intl 계산과 독립).
const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const EST = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 5, mi);

console.log('━━━ 1. 서머타임 전환일 계산 ━━━');
{
    const a = usDstTransitionDates(2026), b = usDstTransitionDates(2027);
    check('2026 시작 3/8', a.start.join('-') === '2026-3-8', a.start.join('-'));
    check('2026 종료 11/1', a.end.join('-') === '2026-11-1', a.end.join('-'));
    check('2027 시작 3/14', b.start.join('-') === '2027-3-14', b.start.join('-'));
    check('2027 종료 11/7', b.end.join('-') === '2027-11-7', b.end.join('-'));
    check('etWallToMs 2026-11-01 00:00 = EDT 자정', etWallToMs(2026, 11, 1) === Date.parse('2026-11-01T04:00:00Z'), String(etWallToMs(2026, 11, 1)));
    check('etWallToMs 2026-11-02 04:00 = EST', etWallToMs(2026, 11, 2, 4) === EST(2026, 11, 2, 4), String(etWallToMs(2026, 11, 2, 4)));
    check('etWallToMs 2026-03-09 09:30 = EDT', etWallToMs(2026, 3, 9, 9, 30) === EDT(2026, 3, 9, 9, 30), String(etWallToMs(2026, 3, 9, 9, 30)));
}

console.log('━━━ 2. 벤더 시각 복구 (11/2 실측값) ━━━');
{
    const now = Date.parse('2026-11-02T10:21:01.001Z');
    const obs: Array<[string, string, string]> = [
        ['NVDA', '2083-09-02T14:05:08.905Z', '2026-11-02T10:05:08.905Z'],
        ['PLTR', '2083-09-02T14:06:00.394Z', '2026-11-02T10:06:00.394Z'],   // 테이프 10:06:00.393
        ['PGR', '2083-09-02T13:00:01.263Z', '2026-11-02T09:00:01.263Z'],
        ['edge', '2083-09-02T13:29:35.739Z', '2026-11-02T09:29:35.739Z'],
    ];
    for (const [t, bad, good] of obs) {
        const r = repairVendorEpochMs(Date.parse(bad), now);
        check(`${t} 복구`, r === Date.parse(good), new Date(r).toISOString());
    }
    const fri = Date.parse('2026-10-30T19:59:59.903Z');
    check('정상 과거 시각 그대로', repairVendorEpochMs(fri, now) === fri);
    check('0 → 0', repairVendorEpochMs(0, now) === 0);
    check('NaN → 0', repairVendorEpochMs(NaN, now) === 0);
    check('5분 미래(시계 차) 그대로', repairVendorEpochMs(now + 5 * 60_000, now) === now + 5 * 60_000);
    check('복구 불가 미래 → 0', repairVendorEpochMs(Date.parse('2090-01-01T00:00:00Z'), now) === 0);
    check('하루 미래(왜곡 아님) → 0', repairVendorEpochMs(now + 86_400_000, now) === 0);

    const raw = {
        last_price: 207.61, last_time: '2083-09-02T14:04:20.125Z', bid_time: '2083-09-02T14:04:22.123Z',
        ask_time: '2083-09-02T14:04:22.123Z', updated_on: '2083-09-02T14:04:22.123Z',
        normal_market_hours_last_time: '2026-10-30T19:59:59.903Z', eod_close_date: '2026-10-30', source: 'cboe_one_delayed',
    };
    const fixed: any = repairIntrinioRealtimeTimes(raw, now);
    check('last_time 복구', fixed.last_time === '2026-11-02T10:04:20.125Z', fixed.last_time);
    check('bid_time 복구', fixed.bid_time === '2026-11-02T10:04:22.123Z', fixed.bid_time);
    check('updated_on 복구', fixed.updated_on === '2026-11-02T10:04:22.123Z', fixed.updated_on);
    check('정규장 시각 그대로', fixed.normal_market_hours_last_time === raw.normal_market_hours_last_time);
    check('날짜 필드 그대로', fixed.eod_close_date === '2026-10-30');
    check('원본 불변', raw.last_time === '2083-09-02T14:04:20.125Z');
    check('진단 표식', fixed._timeRepair?.repaired === 4, JSON.stringify(fixed._timeRepair));
    const clean = { last_time: '2026-11-02T10:04:20.125Z' };
    check('고칠 것 없으면 같은 객체', repairIntrinioRealtimeTimes(clean, now) === clean);
    check('null 그대로', repairIntrinioRealtimeTimes(null, now) === null);

    // 실제 증상: 복구 전엔 «오늘 프리 체결»이 아니라고 판정 → PRE 가격 null
    check('복구 전 판정 = 프리 아님(버그 재현)', !isTradeInExtSession(Date.parse(raw.last_time), '2026-11-02', 'pre'));
    check('복구 후 판정 = 오늘 프리 체결', isTradeInExtSession(Date.parse(fixed.last_time), '2026-11-02', 'pre'));
}

console.log('━━━ 3. 세션 경계 표 — 서머타임 시작·종료 주 ━━━');
{
    // [이름, epoch, clock.sessionAt 기대, cashSessionPhaseAt 기대, 프리체결?, 애프터체결?]
    type Row = [string, number, string, string, boolean, boolean];
    const weeks: Array<[string, number, number, number, typeof EDT]> = [
        ['2026-03-06(금, EST)', 2026, 3, 6, EST],
        ['2026-03-09(월, EDT 첫날)', 2026, 3, 9, EDT],
        ['2026-10-30(금, EDT)', 2026, 10, 30, EDT],
        ['2026-11-02(월, EST 첫날)', 2026, 11, 2, EST],
        ['2027-03-15(월, EDT 첫날)', 2027, 3, 15, EDT],
        ['2027-11-08(월, EST 첫날)', 2027, 11, 8, EST],
    ];
    for (const [label, y, mo, d, Z] of weeks) {
        const date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const rows: Row[] = [
            ['03:59', Z(y, mo, d, 3, 59), 'closed', 'pre-open', false, false],
            ['04:00', Z(y, mo, d, 4, 0), 'pre', 'pre-open', true, false],
            ['09:29', Z(y, mo, d, 9, 29), 'pre', 'pre-open', true, false],
            ['09:30', Z(y, mo, d, 9, 30), 'regular', 'regular', false, false],
            ['15:59', Z(y, mo, d, 15, 59), 'regular', 'regular', false, false],
            ['16:00:01', Z(y, mo, d, 16, 0) + 1000, 'post', 'after-close', false, true],
            ['19:59', Z(y, mo, d, 19, 59), 'post', 'after-close', false, true],
            ['20:00', Z(y, mo, d, 20, 0), 'closed', 'after-close', false, false],
        ];
        for (const [hm, ms, sess, phase, pre, post] of rows) {
            const s = sessionAt(ms);
            check(`${label} ${hm} 날짜`, etDateOf(ms) === date, etDateOf(ms));
            check(`${label} ${hm} 분`, etMinutesOf(ms) === Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)), String(etMinutesOf(ms)));
            check(`${label} ${hm} sessionAt`, s.session === sess, s.session);
            check(`${label} ${hm} cashPhase`, cashSessionPhaseAt(ms) === phase, cashSessionPhaseAt(ms));
            check(`${label} ${hm} 프리체결`, isTradeInExtSession(ms, date, 'pre') === pre, String(!pre));
            check(`${label} ${hm} 애프터체결`, isTradeInExtSession(ms, date, 'post') === post, String(!post));
        }
    }
    // 전환일 자체(일요일)는 휴장
    check('2026-11-01(일) 휴장', sessionAt(EST(2026, 11, 1, 10)).session === 'closed');
    check('2026-03-08(일) 휴장', sessionAt(EDT(2026, 3, 8, 10)).session === 'closed');
}

console.log(`\n${pass}/${total} 통과`);
assert.equal(failures.length, 0, failures.join('\n'));
