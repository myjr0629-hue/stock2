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
        assert.equal(c.id, 'b20261105T131800'); assert.equal(c.source, 'checkpoint'); assert.equal(c.amountUsd, 205.83);
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
        assert.equal(c.id, 'm20261205T000000'); assert.equal(c.source, 'monthly'); assert.equal(c.amountUsd, 200);
        assert.equal(new Date(c.endsMs).toISOString(), '2027-01-05T00:00:00.000Z');
        assert.equal(cycleAt(U(2027, 2, 10)).id, 'm20270205T000000');
        assert.equal(cycleAt(U(2026, 12, 4, 23, 59)).id, 'b20261105T131800');
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
        assert.equal(parseCheckpoint({ at: '2026-11-05T00:00:00Z', balanceUsd: 10, nextResetAt: '2026-12-20T00:00:00Z' }), null, '주기 35일 넘으면 원장 보존(45일)을 넘길 수 있다');
        assert.deepEqual(parseCheckpoint(JSON.stringify({ at: '2026-11-05T00:00:00Z', balanceUsd: 10 })), { at: '2026-11-05T00:00:00.000Z', balanceUsd: 10 });
    });
    await t('원장 밖 지출: openingUsd·carry(키 값 − fromUsd)는 기준점 주기에만 · 잘못된 키·잔액 이상 opening 은 거부', async () => {
        const c = cycleAt(U(2026, 11, 6, 1));
        assert.equal(c.openingUsd, 4.27); assert.deepEqual(c.carry, [{ key: 'llm:cost:2026-11', fromUsd: 0 }]);
        const m = cycleAt(U(2026, 12, 6));
        assert.equal(m.openingUsd, 0); assert.deepEqual(m.carry, []);
        assert.equal(parseCheckpoint({ at: '2026-11-05T00:00:00Z', balanceUsd: 10, carry: [{ key: 'promo:x', fromUsd: 0 }] }), null);
        assert.equal(parseCheckpoint({ at: '2026-11-05T00:00:00Z', balanceUsd: 10, openingUsd: 11 }), null);
        const s = memoryStore();
        s.data.set('llm:cost:b20261105T131800', '1.5'); s.data.set('llm:cost:2026-11', '0.5');
        const { cycleSpentUsd } = await import('@/lib/ai/creditCycle');
        const v = await cycleSpentUsd(s, c);
        assert.ok(Math.abs(v.total - (1.5 + 0.5 + 4.27)) < 1e-9); assert.equal(v.ledger, 1.5);
        // 관리자 기준점 교체: 직전 주기 원장은 «그 순간 값부터»만 더한다 · 같은 id 라도 opening 을 고치면 서명이 바뀐다
        const cp2 = { at: '2026-11-20T00:00:00Z', balanceUsd: 100, carry: [{ key: 'llm:cost:b20261105T131800', fromUsd: 150 }] };
        const c2 = cycleAt(U(2026, 11, 20, 0, 1), cp2);
        s.data.set('llm:cost:b20261105T131800', '150.4'); s.data.set('llm:cost:b20261120T000000', '0.1');
        assert.ok(Math.abs((await cycleSpentUsd(s, c2)).total - 0.5) < 1e-9);
        assert.notEqual(c2.sig, cycleAt(U(2026, 11, 20, 0, 1), { ...cp2, openingUsd: 1 }).sig);
        assert.deepEqual(cycleAt(U(2026, 11, 20, 0, 1), { ...cp2, carry: [{ key: 'llm:cost:b20261120T000000', fromUsd: 0 }] }).carry, [], '자기 원장은 carry 에서 뺀다');
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
        assert.equal((await currentCycle(s, now)).id, 'b20261110T000000');
        s.data.set(CREDIT_CHECKPOINT_KEY, 'broken');
        assert.equal((await currentCycle(s, now + 1000)).id, 'b20261110T000000', '30초 캐시');
        _resetCreditCycleForTest();
        assert.equal((await currentCycle(s, now)).id, 'b20261105T131800');
        _resetCreditCycleForTest();
        const dead: any = { ...memoryStore(), get: () => Promise.reject(new Error('down')) };
        assert.equal((await currentCycle(dead, now)).id, 'b20261105T131800');
        _resetCreditCycleForTest();
    });

    await t('경보 alertOnce: 보낸 뒤에만 «보냄» 표시 · 5분 칸 원자 잠금으로 한 인스턴스만 · 실패하면 잠금 해제 · 죽은 잠금은 다음다음 칸에 풀림', async () => {
        const { alertOnce, _resetCreditAlertForTest } = await import('@/lib/ai/creditAlert');
        _resetCreditAlertForTest();
        const SLOT = 5 * 60_000, T = 3 * SLOT;                   // 칸 3 의 시작
        const s = memoryStore(); const key = 'llm:credit:alert:x:p80';
        s.data.set(`${key}:lock:3`, '1');                        // A 가 칸 3 잠금을 잡고 보내는 중
        const sent: string[] = []; const ok = async (sub: string) => { sent.push(sub); return true; };
        assert.equal(await alertOnce(s, key, ok, 'S', 'M', undefined, T), false, '동시에 둘이 보내지 않는다');
        s.data.delete(`${key}:lock:3`);                          // A 발송 실패 → 잠금 해제
        assert.equal(await alertOnce(s, key, ok, 'S', 'M', undefined, T + 60_000), false, '10분 전에는 다시 안 본다');
        assert.equal(await alertOnce(s, key, ok, 'S', 'M', undefined, T + 10 * 60_000 + 1), true);
        assert.ok(s.data.has(`${key}:sent`));
        assert.equal(await alertOnce(s, key, ok, 'S', 'M', undefined, T + 99 * 60_000), false, '보낸 뒤엔 다시 안 보낸다');
        _resetCreditAlertForTest();
        assert.equal(await alertOnce(s, key, ok, 'S', 'M', undefined, T + 100 * 60_000), false, '다른 인스턴스도 «보냄» 표시를 보고 안 보낸다');
        assert.equal(sent.length, 1);
        // A 가 잠금을 잡은 채 죽었다 — 바로 다음 칸은 기다리고, 그다음 칸에 다른 인스턴스가 보낸다
        _resetCreditAlertForTest();
        const s2 = memoryStore(); s2.data.set(`${key}:lock:3`, '1');
        assert.equal(await alertOnce(s2, key, ok, 'S', 'M', undefined, T + 6 * 60_000), false);
        assert.equal(await alertOnce(s2, key, ok, 'S', 'M', undefined, T + 16 * 60_000), true);
        // 둘이 같은 칸에서 경쟁 — 하나만
        _resetCreditAlertForTest();
        const s3 = memoryStore(); let n3 = 0; const c3 = async () => { n3++; return true; };
        const r = await Promise.all([alertOnce(s3, key, c3, 'S', 'M', undefined, T), (async () => { _resetCreditAlertForTest(); return alertOnce(s3, key, c3, 'S', 'M', undefined, T + 1); })()]);
        assert.equal(r.filter(Boolean).length, 1); assert.equal(n3, 1);
        // 칸 경계 경쟁 — 뒤 칸(B)이 잠근 뒤 앞 칸(A) 잠금이 보이면 B 는 물러난다
        _resetCreditAlertForTest();
        const s4 = memoryStore(); s4.data.set(`${key}:lock:3`, '1');   // A 가 칸 3 을 방금 잡음(B 의 앞 칸 확인 뒤라고 가정 → B 는 확인 뒤 다시 본다)
        const realGet = s4.get.bind(s4); let first = true;
        (s4 as any).get = async (k: string) => { if (k === `${key}:lock:3` && first) { first = false; return null; } return realGet(k); };
        assert.equal(await alertOnce(s4, key, ok, 'S', 'M', undefined, 4 * SLOT + 1), false);
        assert.equal(s4.data.has(`${key}:lock:4`), false, 'B 는 잠금을 풀고 물러난다');
        // 저장소 응답 없음 — 이 인스턴스에서 보낸다(누락보다 중복 한 통)
        _resetCreditAlertForTest();
        const dead: any = { get: async () => null, setEx: async () => undefined, del: async () => undefined, incrByFloat: async () => null };
        assert.equal(await alertOnce(dead, key, ok, 'S', 'M', undefined, T), true);
        _resetCreditAlertForTest();
    });
    await t('기준점 at 은 초 단위로 내린다(주기 id 와 같은 정밀도)', () => {
        assert.equal(parseCheckpoint({ at: '2026-11-05T13:18:00.999Z', balanceUsd: 10 })!.at, '2026-11-05T13:18:00.000Z');
    });
    await t('기준점 읽기 null(키 없음·시간 초과 구분 불가) — 마지막으로 읽은 저장 기준점을 5초만 쓰고 다시 읽는다 · 지운 표시는 코드 기본값', async () => {
        const { CHECKPOINT_CLEARED } = await import('@/lib/ai/creditCycle');
        _resetCreditCycleForTest();
        const s = memoryStore(); const now = U(2026, 11, 11);
        s.data.set(CREDIT_CHECKPOINT_KEY, JSON.stringify({ at: '2026-11-10T00:00:00Z', balanceUsd: 120 }));
        assert.equal((await currentCycle(s, now)).id, 'b20261110T000000');
        s.data.delete(CREDIT_CHECKPOINT_KEY);                    // 시간 초과처럼 null
        assert.equal((await currentCycle(s, now + 31_000)).id, 'b20261110T000000', '잠깐의 null 에 기본 주기로 넘어가지 않는다');
        s.data.set(CREDIT_CHECKPOINT_KEY, CHECKPOINT_CLEARED);
        assert.equal((await currentCycle(s, now + 33_000)).id, 'b20261110T000000', '5초 캐시');
        assert.equal((await currentCycle(s, now + 37_000)).id, 'b20261105T131800', '지운 표시 → 코드 기본값');
        _resetCreditCycleForTest();
    });
    console.log(`\ncreditCycle: ${pass} passed, ${fail} failed`);
    if (fail) process.exit(1);
})();
