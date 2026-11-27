/**
 * 조기 폐장(13:00 ET) 세션 판정 시험 — 2026-11-28 수리.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/earlyCloseSession1128.test.ts
 *
 * 사건: 2026-11-27(블랙프라이데이, NYSE 13:00 ET 조기 폐장) 13:14 ET 에 /api/market/status 가
 *   {"market":"open","session":"regular"} — 정규장 끝을 16:00(960)으로 박아 둔 탓.
 *   무버도 16:00 까지 «장중»으로 봐 EOD 종가 보정을 건너뛰고 시간외 체결을 하루 등락으로 보였다.
 * 고정: 정규장 끝 = sessionCloseMinutes(ET 날짜) — 평소 16:00 · 조기 폐장일 13:00. 프리·애프터 경계(04:00·20:00)는 그대로.
 */
import assert from 'node:assert/strict';
import { resolveLiveSession, calculateFallbackStatus } from '@/services/marketStatusProvider';
import { getMarketStatusIntrinio } from '@/services/intrinioClient';
import { isRegularSessionOpen, lastCompletedSessionDateET } from '@/services/moverSession';
import { determineSessionInfo } from '@/services/marketDaySSOT';
import { cashPhase, etClock } from '@/lib/marketSession';
import { afterCloseState } from '@/lib/rankings/engine';
import { isRegularHoursET } from '@/lib/earnings/earningsImplied';
import { isRegularSessionNow } from '@/services/breaking/detectMove';
import { etDateOf, etMinutesOf, sessionCloseMinutes } from '@/lib/marketCalendar';

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
    try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e: any) { fail++; console.log(`  ✗ ${name}\n      ${e?.message || e}`); }
}
const U = (iso: string) => Date.parse(iso);

// 11월 말·12월은 EST(UTC−5)
const BF_1314 = U('2026-11-27T18:14:00Z');   // 블프 13:14 ET — 조기 폐장 14분 뒤 (사건 시각)
const BF_1259 = U('2026-11-27T17:59:00Z');   // 블프 12:59 ET — 정규장 마지막 분
const BF_1300 = U('2026-11-27T18:00:00Z');   // 블프 13:00 ET — 마감 정각
const XE_1330 = U('2026-12-24T18:30:00Z');   // 성탄 전날 13:30 ET — 다음 조기 폐장
const NORM_1500 = U('2026-12-01T20:00:00Z'); // 평일(화) 15:00 ET
const NORM_1600 = U('2026-12-01T21:00:00Z'); // 평일(화) 16:00 ET
const NORM_1930 = U('2026-12-02T00:30:00Z'); // 평일(화) 19:30 ET
const BF_2030 = U('2026-11-28T01:30:00Z');   // 블프 20:30 ET — 애프터 끝 뒤

/** 운영 경로 그대로: 원천 어댑터(getMarketStatusIntrinio) → 공급자(resolveLiveSession) */
const live = (ms: number) => {
    const raw = getMarketStatusIntrinio(ms);
    return resolveLiveSession(raw.exchanges?.nasdaq || raw.market, ms);
};

console.log('▶ 시각 확인');
t('시험 시각이 의도한 ET 벽시계다', () => {
    assert.equal(etDateOf(BF_1314), '2026-11-27'); assert.equal(etMinutesOf(BF_1314), 13 * 60 + 14);
    assert.equal(etMinutesOf(BF_1259), 12 * 60 + 59);
    assert.equal(etDateOf(XE_1330), '2026-12-24'); assert.equal(etMinutesOf(XE_1330), 13 * 60 + 30);
    assert.equal(etMinutesOf(NORM_1500), 15 * 60);
    assert.equal(sessionCloseMinutes('2026-11-27'), 780);
    assert.equal(sessionCloseMinutes('2026-12-01'), 960);
});

console.log('▶ /api/market/status 경로 (원천 어댑터 → 공급자)');
t('11/27 13:14 ET → post (regular 아님) · market extended-hours', () => {
    assert.equal(getMarketStatusIntrinio(BF_1314).market, 'extended-hours');
    assert.equal(getMarketStatusIntrinio(BF_1314).earlyAdjournment, true);
    assert.deepEqual(live(BF_1314), { session: 'post', market: 'extended-hours' });
});
t('11/27 12:59 ET → regular · market open', () => {
    assert.deepEqual(live(BF_1259), { session: 'regular', market: 'open' });
});
t('11/27 13:00 ET 정각 → post', () => {
    assert.equal(live(BF_1300).session, 'post');
});
t('12/24 13:30 ET → post', () => {
    assert.deepEqual(live(XE_1330), { session: 'post', market: 'extended-hours' });
});
t('평일 15:00 ET → regular (평소 동작 그대로)', () => {
    assert.deepEqual(live(NORM_1500), { session: 'regular', market: 'open' });
    assert.equal(getMarketStatusIntrinio(NORM_1500).earlyAdjournment, false);
});
t('평일 16:00 ET → post · 19:30 → post (애프터 끝 20:00 그대로)', () => {
    assert.equal(live(NORM_1600).session, 'post');
    assert.equal(live(NORM_1930).session, 'post');
});
t('조기 폐장일 20:30 ET → closed (애프터 끝 20:00 그대로)', () => {
    assert.equal(live(BF_2030).session, 'closed');
});
t('원천이 늦게까지 «open» 이라 해도 조기 폐장 뒤엔 post (방어)', () => {
    assert.deepEqual(resolveLiveSession('open', BF_1314), { session: 'post', market: 'extended-hours' });
    assert.deepEqual(resolveLiveSession('open', BF_1259), { session: 'regular', market: 'open' });
    assert.deepEqual(resolveLiveSession('open', NORM_1500), { session: 'regular', market: 'open' });
});

console.log('▶ 원천 실패 폴백 (calculateFallbackStatus)');
t('11/27 13:14 → post · 12:59 → regular · 12/24 13:30 → post · 평일 15:00 → regular', () => {
    assert.equal(calculateFallbackStatus(BF_1314).session, 'post');
    assert.equal(calculateFallbackStatus(BF_1314).market, 'extended-hours');
    assert.equal(calculateFallbackStatus(BF_1259).session, 'regular');
    assert.equal(calculateFallbackStatus(XE_1330).session, 'post');
    assert.equal(calculateFallbackStatus(NORM_1500).session, 'regular');
    assert.equal(calculateFallbackStatus(NORM_1600).session, 'post');
    assert.equal(calculateFallbackStatus(BF_2030).session, 'closed');
});

console.log('▶ 무버 세션 (moverSession)');
t('isRegularSessionOpen: 13:14 false · 12:59 true · 12/24 13:30 false · 평일 15:00 true', () => {
    assert.equal(isRegularSessionOpen(BF_1314), false);
    assert.equal(isRegularSessionOpen(BF_1259), true);
    assert.equal(isRegularSessionOpen(XE_1330), false);
    assert.equal(isRegularSessionOpen(NORM_1500), true);
    assert.equal(isRegularSessionOpen(NORM_1600), false);
});
t('lastCompletedSessionDateET: 11/27 13:14 → 11/27 (EOD 보정 기준일) · 평일 15:00 → 전날', () => {
    assert.equal(lastCompletedSessionDateET(BF_1314), '2026-11-27');
    assert.equal(lastCompletedSessionDateET(XE_1330), '2026-12-24');
    assert.equal(lastCompletedSessionDateET(NORM_1500), '2026-11-30');
    assert.equal(lastCompletedSessionDateET(NORM_1600), '2026-12-01');
});

console.log('▶ 기타 세션 판정');
t('marketDaySSOT.determineSessionInfo: 13:14 POST · 12:59 REG · 평일 15:00 REG', () => {
    assert.equal(determineSessionInfo(new Date(BF_1314)).badge, 'POST');
    assert.equal(determineSessionInfo(new Date(BF_1259)).badge, 'REG');
    assert.equal(determineSessionInfo(new Date(XE_1330)).badge, 'POST');
    assert.equal(determineSessionInfo(new Date(NORM_1500)).badge, 'REG');
});
t('marketSession.cashPhase: 13:14 after-close · 12:59 regular · 평일 15:00 regular', () => {
    assert.equal(cashPhase(etClock(BF_1314)), 'after-close');
    assert.equal(cashPhase(etClock(BF_1259)), 'regular');
    assert.equal(cashPhase(etClock(NORM_1500)), 'regular');
});
t('rankings.afterCloseState: 조기 폐장 뒤 lastClosed = 그날', () => {
    assert.equal(afterCloseState('2026-11-26', BF_1314).lastClosed, '2026-11-27');
    assert.equal(afterCloseState('2026-11-26', BF_1259).lastClosed, '2026-11-25');
    assert.equal(afterCloseState('2026-11-30', NORM_1500).lastClosed, '2026-11-30');
});
t('earningsImplied.isRegularHoursET · breaking.isRegularSessionNow', () => {
    assert.equal(isRegularHoursET(BF_1314), false);
    assert.equal(isRegularHoursET(BF_1259), true);
    assert.equal(isRegularHoursET(NORM_1500), true);
    assert.equal(isRegularSessionNow(new Date(BF_1314)), false);
    assert.equal(isRegularSessionNow(new Date(BF_1259)), true);
    assert.equal(isRegularSessionNow(new Date(NORM_1500)), true);
});

console.log(`\n${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
