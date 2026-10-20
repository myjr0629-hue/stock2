// 2026-10-19 대표 «연방기준금리 등 데이터가 안 나오고 있다 · REAL 도 데이터가 없다 · 데이터를 비게 하지 마라»
// 관문 10192347 재현: ① 부분 결측을 보관값으로 채움 ② 벤더 전부 실패해도 7행 유지(GDP 행 소실 금지)
import assert from 'node:assert/strict';
import { fillFromLastGood, hasValue, METRIC_ORDER } from '../src/lib/macroLastGood';

const m = (key: string, value: number | null, asOf: string | null = '2026-10-15') => {
    const s: any = METRIC_ORDER.find((x) => x.key === key);
    return { ...s, value, asOf, change: null, trend: 'FLAT', watch: null };
};
let passed = 0, failed = 0;
function test(name: string, fn: () => void) {
    try { fn(); passed++; console.log(`PASS ${name}`); } catch (e: any) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}

test('부분 결측은 지표별 마지막 정상값(값·asOf 그대로)으로 채운다', () => {
    const raw: any = { metrics: METRIC_ORDER.map((s) => m(s.key, s.key === 'cpiYoY' ? 3.7 : null, s.key === 'cpiYoY' ? '2026-09-01' : null)), attribution: 'x', newestAsOf: null, missing: 6 };
    const last: any = { fedFunds: m('fedFunds', 3.88, '2026-10-15'), unemployment: m('unemployment', 4.2, '2026-09-01') };
    const { data, filled, stillMissing } = fillFromLastGood(raw, last);
    assert.equal(filled, 2);
    assert.equal(stillMissing, 4);
    assert.equal(data.metrics.length, 7);
    assert.equal(data.metrics.find((x: any) => x.key === 'fedFunds')!.value, 3.88);
    assert.equal(data.metrics.find((x: any) => x.key === 'fedFunds')!.asOf, '2026-10-15');
    assert.equal(data.metrics.find((x: any) => x.key === 'cpiYoY')!.value, 3.7);
});

test('벤더 전부 실패(빈 목록)여도 7행을 같은 순서로 — 보관값 없는 GDP 는 행 유지·값 null', () => {
    const empty: any = { metrics: [], attribution: 'x', newestAsOf: null, missing: 7 };
    const last: any = {};
    for (const s of METRIC_ORDER) if (s.key !== 'gdpQoQ') last[s.key] = m(s.key, 1.5);
    const { data, stillMissing } = fillFromLastGood(empty, last);
    assert.deepEqual(data.metrics.map((x: any) => x.key), METRIC_ORDER.map((s) => s.key));
    assert.equal(stillMissing, 1);
    const gdp: any = data.metrics.find((x: any) => x.key === 'gdpQoQ');
    assert.equal(gdp.value, null);
    assert.equal(gdp.label.ko, 'GDP 전분기비');
});

test('측정된 0 은 결측이 아니다 — 보관값으로 덮지 않는다', () => {
    const raw: any = { metrics: METRIC_ORDER.map((s) => m(s.key, s.key === 'curve10y2y' ? 0 : 1)), attribution: 'x', newestAsOf: null, missing: 0 };
    const last: any = { curve10y2y: m('curve10y2y', 0.35, '2026-10-14') };
    const { data, filled } = fillFromLastGood(raw, last);
    assert.equal(filled, 0);
    assert.equal(data.metrics.find((x: any) => x.key === 'curve10y2y')!.value, 0);
});

test('값 없는 현재 행의 라벨은 보관값으로 채운 뒤에도 보존한다 — TS2339 재현 경로', () => {
    const cur = { ...m('fedFunds', null, null), label: { en: 'Current', ko: '현재 라벨', ja: '現在' } };
    assert.equal(hasValue(cur), false);
    const { data, filled } = fillFromLastGood({ metrics: [cur] } as any, { fedFunds: m('fedFunds', 3.88) } as any);
    assert.equal(filled, 1);
    const filledMetric = data.metrics.find((x) => x.key === 'fedFunds')!;
    assert.deepEqual(filledMetric.label, cur.label);
    assert.equal(filledMetric.value, 3.88);
    assert.equal(filledMetric.asOf, '2026-10-15');
    assert.equal(hasValue(m('fedFunds', 0)), true);
    assert.equal(hasValue(m('fedFunds', NaN)), false);
    assert.equal(hasValue(m('fedFunds', Infinity)), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
