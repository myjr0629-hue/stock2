/**
 * 마감 후(FINRA 장외) 랭킹의 «세션 시계» 시험 — src/lib/rankings/engine.ts afterCloseState · sessionPhase
 *                                              src/lib/marketCalendar.ts prevTradingDate
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/afterCloseSession.test.ts
 *
 * 2026-09-28 대표 보고: 앱 랭킹 «장 마감 후» 3종이 «아직 안 들어옴 — 보유분 2026-09-25, 옵션은 2026-09-28 세션»
 * 에서 채워지는 걸 본 적이 없다. 옛 게이트는 다크풀 날짜를 «옵션 스냅샷의 최신 달력 날짜»와 견줬다.
 */
import assert from 'node:assert/strict';
import { afterCloseState, sessionPhase } from '../src/lib/rankings/engine';
import { prevTradingDate } from '../src/lib/marketCalendar';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
// ET 벽시계 → epoch ms. 9월은 EDT(UTC-4), 12월은 EST(UTC-5).
const EDT = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 4, mi);
const EST = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h + 5, mi);

console.log('━━━ 1. 직전 거래일 ━━━');
t('월 9/28 → 금 9/25', () => assert.equal(prevTradingDate('2026-09-28'), '2026-09-25'));
t('토 9/26 → 금 9/25', () => assert.equal(prevTradingDate('2026-09-26'), '2026-09-25'));
t('화 9/8 → 금 9/4 (월 노동절)', () => assert.equal(prevTradingDate('2026-09-08'), '2026-09-04'));
t('금 11/27 → 수 11/25 (목 추수감사절)', () => assert.equal(prevTradingDate('2026-11-27'), '2026-11-25'));
t('월 2027-01-04 → 목 2026-12-31 (금 신정)', () => assert.equal(prevTradingDate('2027-01-04'), '2026-12-31'));

console.log('━━━ 2. 보고된 순간과 주말 ━━━');
const st = (d: string | null, ms: number) => afterCloseState(d, ms);
t('월 9/28 10:55 (보고 시각) · 다크풀 9/25 → fresh(마지막 마감 = 금 9/25)', () =>
    assert.deepEqual(st('2026-09-25', EDT(2026, 9, 28, 10, 55)), { state: 'fresh', lastClosed: '2026-09-25' }));
t('월 9/28 04:03 (옵션 수집이 새 날짜를 여는 순간) · 9/25 → fresh', () =>
    assert.equal(st('2026-09-25', EDT(2026, 9, 28, 4, 3)).state, 'fresh'));
t('토 9/26 12:00 · 9/25 → fresh', () => assert.deepEqual(st('2026-09-25', EDT(2026, 9, 26, 12)), { state: 'fresh', lastClosed: '2026-09-25' }));
t('일 9/27 20:00 · 9/25 → fresh', () => assert.equal(st('2026-09-25', EDT(2026, 9, 27, 20)).state, 'fresh'));
t('토 9/26 12:00 · 9/24 (금요일 적재 실패) → late', () => assert.equal(st('2026-09-24', EDT(2026, 9, 26, 12)).state, 'late'));

console.log('━━━ 3. 마감 → 적재 경계 (EDT) ━━━');
t('월 9/28 15:59 · 9/25 → fresh (아직 마감 전)', () => assert.deepEqual(st('2026-09-25', EDT(2026, 9, 28, 15, 59)), { state: 'fresh', lastClosed: '2026-09-25' }));
t('월 9/28 16:00 · 9/25 → pending (마지막 마감 = 9/28)', () => assert.deepEqual(st('2026-09-25', EDT(2026, 9, 28, 16)), { state: 'pending', lastClosed: '2026-09-28' }));
t('월 9/28 17:44 · 9/25 → pending', () => assert.equal(st('2026-09-25', EDT(2026, 9, 28, 17, 44)).state, 'pending'));
t('월 9/28 17:46 · 9/28 (17:45 적재) → fresh', () => assert.equal(st('2026-09-28', EDT(2026, 9, 28, 17, 46)).state, 'fresh'));
t('월 9/28 18:00 · 9/25 → late (적재 예정 지남)', () => assert.equal(st('2026-09-25', EDT(2026, 9, 28, 18)).state, 'late'));
t('화 9/29 00:30 (자정 함정) · 9/28 → fresh', () => assert.deepEqual(st('2026-09-28', EDT(2026, 9, 29, 0, 30)), { state: 'fresh', lastClosed: '2026-09-28' }));
t('화 9/29 10:00 · 9/28 → fresh', () => assert.equal(st('2026-09-28', EDT(2026, 9, 29, 10)).state, 'fresh'));
t('화 9/29 10:00 · 9/25 → late (한 세션 뒤)', () => assert.equal(st('2026-09-25', EDT(2026, 9, 29, 10)).state, 'late'));
t('화 9/29 16:30 · 9/25 → stale (두 세션 뒤)', () => assert.deepEqual(st('2026-09-25', EDT(2026, 9, 29, 16, 30)), { state: 'stale', lastClosed: '2026-09-29' }));
t('자료 없음(null) → stale', () => assert.equal(st(null, EDT(2026, 9, 28, 12)).state, 'stale'));

console.log('━━━ 4. 휴장 ━━━');
t('월 9/7 노동절 12:00 · 9/4 → fresh (마지막 마감 = 금 9/4)', () => assert.deepEqual(st('2026-09-04', EDT(2026, 9, 7, 12)), { state: 'fresh', lastClosed: '2026-09-04' }));
t('월 9/7 노동절 18:30 · 9/4 → fresh (휴장일 저녁은 새 마감이 없다)', () => assert.equal(st('2026-09-04', EDT(2026, 9, 7, 18, 30)).state, 'fresh'));
t('화 9/8 16:30 · 9/4 → pending (직전 거래일이 9/4)', () => assert.equal(st('2026-09-04', EDT(2026, 9, 8, 16, 30)).state, 'pending'));
t('달력보다 앞선 날짜(목록 오류) → fresh', () => assert.equal(st('2026-09-07', EDT(2026, 9, 7, 12)).state, 'fresh'));

console.log('━━━ 5. 겨울(EST) — 적재는 22:45 UTC = 17:45 EST ━━━');
t('화 12/1 17:30 EST · 11/30 → pending', () => assert.equal(st('2026-11-30', EST(2026, 12, 1, 17, 30)).state, 'pending'));
t('화 12/1 17:50 EST · 12/1 → fresh', () => assert.equal(st('2026-12-01', EST(2026, 12, 1, 17, 50)).state, 'fresh'));
t('화 12/1 18:05 EST · 11/30 → late', () => assert.equal(st('2026-11-30', EST(2026, 12, 1, 18, 5)).state, 'late'));

console.log('━━━ 6. sessionPhase — 달력·서머타임 ━━━');
t('월 9/28 10:55 EDT → intraday 10:55', () => assert.deepEqual(sessionPhase(EDT(2026, 9, 28, 10, 55)), { phase: 'intraday', etTime: '10:55', regularOpen: true }));
t('월 9/7 노동절 11:00 → postclose(휴장)', () => assert.equal(sessionPhase(EDT(2026, 9, 7, 11)).regularOpen, false));
t('토 9/26 11:00 → postclose', () => assert.equal(sessionPhase(EDT(2026, 9, 26, 11)).regularOpen, false));
t('화 12/1 09:00 EST → 장 전 (고정 −4h 는 10:00 으로 읽어 «장중»이었다)', () => assert.deepEqual(sessionPhase(EST(2026, 12, 1, 9)), { phase: 'postclose', etTime: '09:00', regularOpen: false }));
t('화 12/1 15:45 EST → intraday (고정 −4h 는 16:45 로 읽어 «마감»이었다)', () => assert.equal(sessionPhase(EST(2026, 12, 1, 15, 45)).regularOpen, true));
t('화 9/29 00:30 EDT → etTime 00:30 (자정이 «24»로 안 나온다)', () => assert.equal(sessionPhase(EDT(2026, 9, 29, 0, 30)).etTime, '00:30'));

console.log('━━━ 7. 옛 게이트 vs 새 게이트 — 9/25(금)~9/29(화) 15분 간격 재현 ━━━');
// 실측 시간표(9/21~9/28): 옵션 수집은 매일(주말 포함) 04:03 ET 에 그 달력 날짜의 첫 행을 쓴다.
// 다크풀은 거래일 17:45 ET 적재(EC2 21:45 UTC) — 첫 계산이 17:46 에 끝난다고 둔다.
{
    const etDate = (ms: number) => new Date(ms - 4 * 3600e3).toISOString().slice(0, 10);   // 9월 = EDT
    const etMin = (ms: number) => { const d = new Date(ms - 4 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
    const optionSession = (ms: number) => (etMin(ms) >= 4 * 60 + 3 ? etDate(ms) : etDate(ms - 86400e3));
    const landed: Array<[number, string]> = [
        [EDT(2026, 9, 24, 17, 46), '2026-09-24'], [EDT(2026, 9, 25, 17, 46), '2026-09-25'],
        [EDT(2026, 9, 28, 17, 46), '2026-09-28'], [EDT(2026, 9, 29, 17, 46), '2026-09-29'],
    ];
    const dpAt = (ms: number) => landed.filter(([at]) => at <= ms).pop()![1];
    let ticks = 0, oldShown = 0, newShown = 0;
    for (let ms = EDT(2026, 9, 25, 0); ms < EDT(2026, 9, 30, 0); ms += 15 * 60e3) {
        ticks++;
        const dp = dpAt(ms);
        if (dp === optionSession(ms)) oldShown++;
        const s2 = afterCloseState(dp, ms).state;
        if (s2 !== 'stale') newShown++;
        assert.notEqual(s2, 'late', `정상 적재인데 late: ${new Date(ms).toISOString()}`);
    }
    console.log(`  옛 게이트: ${oldShown}/${ticks} (${Math.round(oldShown / ticks * 100)}%) · 새 게이트: ${newShown}/${ticks}`);
    t('정상 적재 주간에 새 게이트는 한 번도 비지 않는다', () => assert.equal(newShown, ticks));
    t('옛 게이트는 절반 넘게 비어 있었다', () => assert.ok(oldShown / ticks < 0.5));
}

console.log(`\n${n}건 통과`);
