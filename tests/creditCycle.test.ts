/**
 * 실제 크레딧 주기·기준점·등급별 정지선 (src/lib/ai/creditCycle.ts) — 2026-11-06 «크레딧이 해결됐는데 끊기면 안 된다».
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/creditCycle.test.ts
 */
import assert from 'node:assert/strict';
import {
    cycleAt, parseCheckpoint, tierStopUsd, pacingTargetUsd, spendTier, addMonthsUTC, currentCycle, describeCycle,
    CODE_CHECKPOINT, CREDIT_CHECKPOINT_KEY, TIER_HEADROOM_USD, _resetCreditCycleForTest,
} from '@/lib/ai/creditCycle';
import { memoryStore } from '@/lib/ai/llmStore';

let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
    try { await fn(); pass++; console.log(`  ok  ${name}`); } catch (e: any) { fail++; console.log(`  FAIL ${name}\n       ${e?.message || e}`); }
}
const U = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);

(async () => {
    await t('코드 기본 기준점 = 대표 11/5 13:18Z $205.83 · 다음 갱신 12/5 00:00Z', () => {
        assert.equal(CODE_CHECKPOINT.at, '2026-11-05T13:18:00.000Z');
        assert.equal(CODE_CHECKPOINT.balanceUsd, 205.83);
        const c = cycleAt(U(2026, 11, 6, 1));
        assert.equal(c.id, 'c20261105T1318'); assert.equal(c.source, 'checkpoint'); assert.equal(c.amountUsd, 205.83);
        assert.equal(new Date(c.endsMs).toISOString(), '2026-12-05T00:00:00.000Z');
    });
    await t('기준점 이전은 예전 달력 주기(id YYYY-MM · $200) — 끝은 기준점 시각', () => {
        const c = cycleAt(U(2026, 11, 5, 13, 17));
        assert.equal(c.id, '2026-10'); assert.equal(c.source, 'legacy'); assert.equal(c.amountUsd, 200);
        assert.equal(c.endsMs, Date.parse(CODE_CHECKPOINT.at));
        assert.equal(cycleAt(U(2026, 10, 10)).id, '2026-10');
        assert.equal(cycleAt(U(2026, 10, 10), null).endsMs, U(2026, 11, 6));
    });
    await t('다음 갱신 뒤에는 매월 같은 시각 · monthlyUsd(기본 $200)', () => {
        const c = cycleAt(U(2026, 12, 5, 0, 0));
        assert.equal(c.id, 'c20261205T0000'); assert.equal(c.source, 'monthly'); assert.equal(c.amountUsd, 200);
        assert.equal(new Date(c.endsMs).toISOString(), '2027-01-05T00:00:00.000Z');
        assert.equal(cycleAt(U(2027, 2, 10)).id, 'c20270205T0000');
        assert.equal(cycleAt(U(2026, 12, 4, 23, 59)).id, 'c20261105T1318');
    });
    await t('nextResetAt 이 없으면 at + 1개월 · 31일은 그달 마지막 날', () => {
        const cp = { at: '2027-01-31T10:00:00Z', balanceUsd: 50 };
        assert.equal(new Date(cycleAt(U(2027, 2, 1), cp).endsMs).toISOString(), '2027-02-28T10:00:00.000Z');
        assert.equal(new Date(addMonthsUTC(U(2027, 3, 31), 1)).toISOString(), '2027-04-30T00:00:00.000Z');
    });
    await t('기준점 검사 — 깨진 값은 null(코드 기본값으로)', () => {
        assert.equal(parseCheckpoint('nope'), null);
        assert.equal(parseCheckpoint({ at: 'x', balanceUsd: 10 }), null);
        assert.equal(parseCheckpoint({ at: '2026-11-05T00:00:00Z', balanceUsd: 0 }), null);
        assert.equal(parseCheckpoint({ at: '2026-11-05T00:00:00Z', balanceUsd: 10, nextResetAt: '2026-11-04T00:00:00Z' }), null);
        assert.equal(parseCheckpoint({ at: '2026-11-05T00:00:00Z', balanceUsd: 10, monthlyUsd: -1 }), null);
        assert.deepEqual(parseCheckpoint(JSON.stringify({ at: '2026-11-05T00:00:00Z', balanceUsd: 10 })), { at: '2026-11-05T00:00:00.000Z', balanceUsd: 10 });
    });
    await t('정지선: 필수 잔액−0.2 > 일반 −1.0 > 증가분 −1.5 > 페이싱 목표 −2.0 ($200 이면 199.8/199/198.5/198)', () => {
        assert.equal(tierStopUsd('essential', 200), 199.8); assert.equal(tierStopUsd('standard', 200), 199);
        assert.equal(tierStopUsd('extra', 200), 198.5); assert.equal(pacingTargetUsd(200), 198);
        assert.equal(tierStopUsd('essential', 205.83), 205.63);
        assert.ok(TIER_HEADROOM_USD.essential < TIER_HEADROOM_USD.standard && TIER_HEADROOM_USD.standard < TIER_HEADROOM_USD.extra);
        assert.ok(tierStopUsd('essential', 205.83) < 205.83, '필수도 실제 잔액은 넘지 않는다');
        const d = describeCycle(cycleAt(U(2026, 11, 6, 1)));
        assert.deepEqual(d.alertsAtUsd, [164.66, 195.54]);
    });
    await t('등급: 증가분 문맥은 extra(크레딧 전용 필수 제외) · 필수 · 일반', () => {
        assert.equal(spendTier('CrossSector', false), 'essential');
        assert.equal(spendTier('CrossSector', true), 'extra');
        assert.equal(spendTier('WatchlistLine', true), 'essential');
        assert.equal(spendTier('UC', false), 'standard');
        assert.equal(spendTier('UC', true), 'extra');
    });
    await t('저장소 기준점이 있으면 그것 · 깨졌거나 저장소가 죽으면 코드 기본값 · 30초 캐시', async () => {
        _resetCreditCycleForTest();
        const s = memoryStore();
        s.data.set(CREDIT_CHECKPOINT_KEY, JSON.stringify({ at: '2026-11-10T00:00:00Z', balanceUsd: 120 }));
        const now = U(2026, 11, 11);
        assert.equal((await currentCycle(s, now)).id, 'c20261110T0000');
        s.data.set(CREDIT_CHECKPOINT_KEY, 'broken');
        assert.equal((await currentCycle(s, now + 1000)).id, 'c20261110T0000', '30초 캐시');
        _resetCreditCycleForTest();
        assert.equal((await currentCycle(s, now)).id, 'c20261105T1318');
        _resetCreditCycleForTest();
        const dead: any = { ...memoryStore(), get: () => Promise.reject(new Error('down')) };
        assert.equal((await currentCycle(dead, now)).id, 'c20261105T1318');
        _resetCreditCycleForTest();
    });

    console.log(`\ncreditCycle: ${pass} passed, ${fail} failed`);
    if (fail) process.exit(1);
})();
