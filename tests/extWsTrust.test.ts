/**
 * 프리·애프터 시간외 칸에 가격 허브 틱을 쓰는 기준 — src/utils/extWsTrust.ts · liveQuote.wsTickUsable · useOnePipe.computeOnePipe
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extWsTrust.test.ts
 *
 * 사고(10/13 04:32 ET JPM·실적일): 화면 PRE $334.81(어젯밤 애프터 마지막 체결, 허브가 틱을 못 받아 들고 있던 값) · 서버 시세 PRE 338.18 · 통합 테이프 337~338.
 */
import assert from 'node:assert/strict';
import { pickExtPrice, extWsTrusted, EXT_WS_MAX_DEVIATION } from '../src/utils/extWsTrust';
import { wsTickUsable, liveDisplay } from '../src/utils/liveQuote';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };

console.log('━━━ 1. 순수 함수 ━━━');
t('★ JPM: 허브 334.81(어제 값) vs 서버 338.18 → 서버 값(예전: 2% 가드를 통과해 허브 값이 칸에 앉았다)', () => {
    const r = pickExtPrice(334.81, 338.18);
    assert.equal(r.price, 338.18); assert.equal(r.fromWs, false);
    assert.equal(extWsTrusted(334.81, 338.18), false);
});
t('서버 체결 시각보다 새 허브 체결이면 허브 값 — 가격 차이와 무관(0.065% · 1%)', () => {
    const r = pickExtPrice(338.4, 338.18, { serverTime: 1000, wsTimeMs: 2000 });   // 0.065%
    assert.equal(r.price, 338.4); assert.equal(r.fromWs, true);
    assert.deepEqual(pickExtPrice(341.6, 338.18, { serverTime: 1000, wsTimeMs: 2000 }), { price: 341.6, fromWs: true });
    // 같은 시각이면 서버(같은 체결 시각의 서로 다른 값 — 서버 우선)
    assert.deepEqual(pickExtPrice(338.4, 338.18, { serverTime: 2000, wsTimeMs: 2000 }), { price: 338.18, fromWs: false });
});
t('서버 시각 없음·무효: 다른 소켓 가격은 시각·가격 근접도와 무관하게 서버 값 유지', () => {
    for (const serverTime of [undefined, null, '', 'invalid', 0]) {
        for (const wsTimeMs of [undefined, 1000, Date.parse('2026-10-19T12:00:30Z')]) {
            assert.deepEqual(pickExtPrice(99.8, 100, { serverTime, wsTimeMs }), { price: 100, fromWs: false });
        }
    }
    assert.deepEqual(pickExtPrice(99.8, 100), { price: 100, fromWs: false });
    assert.deepEqual(pickExtPrice(100, 100), { price: 100, fromWs: true });
});
t('경계: 정확히 0.25% 는 통과, 그보다 크면 서버 값', () => {
    assert.equal(extWsTrusted(100.25, 100), true); assert.equal(extWsTrusted(100.26, 100), false);
    assert.equal(EXT_WS_MAX_DEVIATION, 0.0025);
});
t('서버가 시간외 체결을 확인하지 않았으면(0·null) 허브 값도 쓰지 않는다(04:00 직후 어제 애프터 함정)', () => {
    assert.deepEqual(pickExtPrice(334.81, 0), { price: 0, fromWs: false });
    assert.deepEqual(pickExtPrice(334.81, null), { price: 0, fromWs: false });
    assert.deepEqual(pickExtPrice(null, 338.18), { price: 338.18, fromWs: false });
});

console.log('━━━ 2. 목록 행(wsTickUsable · liveDisplay) — 2026-10-19 가격 채택 통합: 체결 시각으로만 판정 ━━━');
// 10/13(화) EDT. 지금 = PRE 04:40 ET · 서버가 확인한 시간외 체결 04:20(15분 지연) · 정규장 10:00
const ETs = (ymd: string, hh: number, mm = 0) => Date.parse(`${ymd}T${String(hh + 4).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
const NOW_PRE = ETs('2026-10-13', 4, 40);
const NOW_REG = ETs('2026-10-13', 10, 0);
const rest = (over: any = {}) => ({ price: 334.3, previousClose: 332.99, changePercent: 0.39, extendedPrice: 338.18, extendedChangePercent: 1.16, extendedLabel: 'PRE', session: 'pre',
    extendedTime: new Date(ETs('2026-10-13', 4, 20)).toISOString(), extendedDate: '2026-10-13', extendedKind: 'live', ...over });
t('프리: 어제 애프터 체결을 든 허브 틱(334.81 · 10/12 19:59)은 쓰지 않는다 → 시세의 시간외 값 338.18 이 한 숫자', () => {
    const tick = { price: 334.81, changePct: 0.5, ts: NOW_PRE - 1000, priceTime: ETs('2026-10-12', 19, 59) };
    assert.equal(wsTickUsable(rest(), tick, 'pre', NOW_PRE), false);
    const d = liveDisplay(rest(), tick, { wsConnected: true, nowMs: NOW_PRE });
    assert.equal(d!.price, 338.18); assert.equal(d!.live, false); assert.equal(d!.ext, true);
});
t('프리: 서버 체결(04:20)보다 새 허브 체결(04:25)이면 가격 차이와 무관하게 허브 틱', () => {
    for (const price of [338.3, 341]) {   // 0.04% · 0.8% — 근접성은 최신의 증거도 거부 사유도 아니다
        const tick = { price, changePct: 1.2, ts: NOW_PRE - 1000, priceTime: ETs('2026-10-13', 4, 25) };
        assert.equal(wsTickUsable(rest(), tick, 'pre', NOW_PRE), true);
        assert.equal(liveDisplay(rest(), tick, { wsConnected: true, nowMs: NOW_PRE })!.live, true);
    }
});
t('프리: 체결 시각 없는 허브 틱은 서버 값을 대신하지 않는다(값이 같아도 · 0.25% 안이어도)', () => {
    for (const price of [338.18, 338.3]) assert.equal(wsTickUsable(rest(), { price, changePct: 0, ts: NOW_PRE - 1000 }, 'pre', NOW_PRE), false);
});
t('정규장: 오늘 정규장 체결이면 쓴다(3% 급등도) · 체결 시각 없는 틱은 쓰지 않는다', () => {
    const r = rest({ session: 'regular', extendedPrice: 0, price: 334.3, sourceSessionDate: '2026-10-13', observedAt: NOW_REG - 60_000, basis: 'live' });
    assert.equal(wsTickUsable(r, { price: 337.6, changePct: 0, ts: NOW_REG, priceTime: NOW_REG - 2000 }, 'reg', NOW_REG), true);
    assert.equal(wsTickUsable(r, { price: 345, changePct: 0, ts: NOW_REG, priceTime: NOW_REG - 2000 }, 'reg', NOW_REG), true);
    assert.equal(wsTickUsable(r, { price: 337.6, changePct: 0, ts: NOW_REG }, 'reg', NOW_REG), false);
    // 서버가 이미 본 체결보다 옛 틱은 쓰지 않는다
    assert.equal(wsTickUsable(r, { price: 337.6, changePct: 0, ts: NOW_REG, priceTime: NOW_REG - 120_000 }, 'reg', NOW_REG), false);
});
t('시간외 체결 확인 전(서버 extendedPrice 0): 어제 체결 틱은 쓰지 않고, 오늘 프리 체결(시각 확인)은 쓸 수 있다(설계서 ③-8)', () => {
    assert.equal(wsTickUsable(rest({ extendedPrice: 0 }), { price: 334.81, changePct: 0, ts: NOW_PRE, priceTime: ETs('2026-10-12', 19, 59) }, 'pre', NOW_PRE), false);
    assert.equal(wsTickUsable(rest({ extendedPrice: 0 }), { price: 336.2, changePct: 0, ts: NOW_PRE, priceTime: ETs('2026-10-13', 4, 10) }, 'pre', NOW_PRE), true);
});

console.log('━━━ 3. computeOnePipe(목록·포트폴리오·인텔이 쓰는 순수 함수) ━━━');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeOnePipe } = require('../src/hooks/useOnePipe');
t('PRE: 허브 334.81 은 버리고 서버 338.18 · 등락은 마지막 정규장 종가 대비', () => {
    const r = computeOnePipe({ session: 'PRE', pollPrice: 334.3, pollPrevClose: 332.99, pollExtPrice: 338.18, pollExtLabel: 'PRE', pollChangePct: 0.39, wsPrice: 334.81, regularCloseToday: null });
    assert.equal(r.extPrice, 338.18); assert.equal(r.extLabel, 'PRE'); assert.equal(r.source, 'POLL');
    assert.ok(Math.abs((r.extChangePct as number) - 1.16) < 0.01, String(r.extChangePct));
});
t('PRE: 새 체결이고 서버와 근접하면 허브(source WS)', () => {
    const r = computeOnePipe({ session: 'PRE', pollPrice: 334.3, pollPrevClose: 332.99, pollExtPrice: 338.18, pollExtLabel: 'PRE', pollChangePct: 0.39, wsPrice: 338.3, regularCloseToday: null, pollExtTime: 1000, wsTimeMs: 2000 });
    assert.equal(r.extPrice, 338.3); assert.equal(r.source, 'WS');
});
t('PRE·POST: 서버 시각이 없으면 0.25% 안의 옛 소켓도 실제 0%를 덮지 못한다', () => {
    for (const session of ['PRE', 'POST'] as const) {
        const r = computeOnePipe({ session, pollPrice: 100, pollPrevClose: 98, pollExtPrice: 100,
            pollExtLabel: session, pollChangePct: 200 / 98, wsPrice: 99.8, regularCloseToday: null,
            wsTimeMs: Date.parse('2026-10-16T23:59:00Z') });
        assert.equal(r.extPrice, 100); assert.equal(r.extChangePct, 0); assert.equal(r.source, 'POLL');
    }
});
t('POST: 같은 규칙 — 어긋난 허브는 서버 애프터 값', () => {
    const r = computeOnePipe({ session: 'POST', pollPrice: 152.68, pollPrevClose: 154.34, pollExtPrice: 150.3, pollExtLabel: 'POST', pollChangePct: -1.08, wsPrice: 153.61, regularCloseToday: 152.68 });
    assert.equal(r.extPrice, 150.3); assert.equal(r.extLabel, 'POST'); assert.equal(r.source, 'POLL');
});
t('REG: 허브가 지금가(시각을 넘기지 않는 옛 호출자 — 변경 없음)', () => {
    const r = computeOnePipe({ session: 'REG', pollPrice: 100, pollPrevClose: 99, pollExtPrice: 0, pollExtLabel: '', pollChangePct: 1, wsPrice: 100.4, regularCloseToday: null });
    assert.equal(r.price, 100.4); assert.equal(r.source, 'WS');
});
t('REG: 시각을 넘기면 공용 규칙 — 오늘 정규장 체결만(어제 체결·시각 없음·서버보다 옛 틱은 서버 값)', () => {
    const base = { session: 'REG', pollPrice: 100, pollPrevClose: 99, pollExtPrice: 0, pollExtLabel: '', pollChangePct: 1, wsPrice: 104, regularCloseToday: null, nowMs: NOW_REG };
    assert.equal(computeOnePipe({ ...base, wsTimeMs: NOW_REG - 1000 }).price, 104);            // 4% 급등도 실제 체결이면
    assert.equal(computeOnePipe({ ...base, wsTimeMs: ETs('2026-10-12', 15, 59) }).price, 100); // 어제 체결
    assert.equal(computeOnePipe({ ...base, wsTimeMs: null }).price, 100);                       // 시각 없음
    assert.equal(computeOnePipe({ ...base, wsTimeMs: NOW_REG - 60_000, pollPriceTime: NOW_REG - 1000 }).price, 100); // 서버가 더 새 체결
});
console.log(`\n✅ ${n}개 통과`);
