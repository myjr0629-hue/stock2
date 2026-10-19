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
t('시각 순서가 확인되고 서버와 0.25% 안이면 허브 값', () => {
    const r = pickExtPrice(338.4, 338.18, { serverTime: 1000, wsTimeMs: 2000 });   // 0.065%
    assert.equal(r.price, 338.4); assert.equal(r.fromWs, true);
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

console.log('━━━ 2. 목록 행(wsTickUsable · liveDisplay) ━━━');
const rest = (over: any = {}) => ({ price: 334.3, previousClose: 332.99, changePercent: 0.39, extendedPrice: 338.18, extendedChangePercent: 1.16, extendedLabel: 'PRE', session: 'pre', ...over });
t('프리: 어제 값을 든 허브 틱(334.81)은 쓰지 않는다 → 시세의 시간외 값 338.18 이 한 숫자', () => {
    const tick = { price: 334.81, changePct: 0.5, ts: 1 };
    assert.equal(wsTickUsable(rest(), tick, 'pre'), false);
    const d = liveDisplay(rest(), tick, { wsConnected: true });
    assert.equal(d!.price, 338.18); assert.equal(d!.live, false); assert.equal(d!.ext, true);
});
t('프리: 허브가 서버와 일치하면(338.3) 허브 틱을 쓴다', () => {
    const tick = { price: 338.3, changePct: 1.2, ts: 1 };
    assert.equal(wsTickUsable(rest(), tick, 'pre'), true);
    assert.equal(liveDisplay(rest(), tick, { wsConnected: true })!.live, true);
});
t('정규장은 그대로 — 2% 가드(시세 기준 1% 어긋난 허브 틱은 쓴다)', () => {
    const r = rest({ session: 'regular', extendedPrice: 0 });
    assert.equal(wsTickUsable(r, { price: 337.6, changePct: 0, ts: 1 }, 'reg'), true);     // 0.98% — 실시간
    assert.equal(wsTickUsable(r, { price: 345, changePct: 0, ts: 1 }, 'reg'), false);      // 3%
});
t('시간외 체결 확인 전(서버 extendedPrice 0)에는 허브 틱을 쓰지 않는다(기존 규칙 유지)', () => {
    assert.equal(wsTickUsable(rest({ extendedPrice: 0 }), { price: 334.81, changePct: 0, ts: 1 }, 'pre'), false);
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
t('REG: 허브가 지금가(변경 없음)', () => {
    const r = computeOnePipe({ session: 'REG', pollPrice: 100, pollPrevClose: 99, pollExtPrice: 0, pollExtLabel: '', pollChangePct: 1, wsPrice: 100.4, regularCloseToday: null });
    assert.equal(r.price, 100.4); assert.equal(r.source, 'WS');
});
console.log(`\n✅ ${n}개 통과`);
