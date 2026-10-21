/** 관문 재현: 메모리 원자 카운터·합성 공급사·발행본만 사용한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { NextRequest } from 'next/server';
import { createRevenueCatVerifier } from '../src/lib/alerts/revenuecat';
import { makeSnapshot, HEAD_KEY, metaKey, lensKey } from '../src/lib/guruLens/pipeline';
import { LENS_IDS } from '../src/lib/guruLens/types';
import { GURU_UNIVERSE } from '../src/lib/guruLens/sources';
import { guruCompany } from './helpers/guruCompany';

const originalNow = Date.now;
let now = Date.parse('2026-10-21T01:00:00Z');
Date.now = () => now;
globalThis.fetch = async () => { throw new Error('실제 네트워크 금지'); };
const snapshot = makeSnapshot(GURU_UNIVERSE.slice(0, 10).map(({ t }) => ({ ...guruCompany(), ticker: t })),
    { sec: 0, prices: 0, paid: 0 }, new Date(now));
for (const id of LENS_IDS) {
    snapshot.lenses[id].passCount = 10;
    snapshot.lenses[id].rows.forEach(r => { r.passed = true; r.inputsComplete = true; });
}
const { lenses: _, ...meta } = snapshot;
const store = new Map<string, unknown>([[HEAD_KEY, { current: snapshot.date, previous: null }], [metaKey(snapshot.date), meta]]);
LENS_IDS.forEach(id => store.set(lensKey(id, snapshot.date), { date: snapshot.date, result: snapshot.lenses[id] }));
const counters = new Map<string, number>();
let reads = 0, active = 0, peak = 0, failure = false, storeFailure = false, configured = true;
const load = (Module as any)._load;
(Module as any)._load = function(name: string, parent: any, main: any) {
    if (name === '@/lib/aws/dynamoClient') return { getDynamoClient: () => configured ? { send: async (cmd: any) => {
        if (storeFailure) throw new Error('합성 저장소 장애');
        const p = cmd.input, key = p.Key.pk;
        assert.match(key, /^R#guru:(ip|id|provider)[:#]/);
        assert.equal(p.ConditionExpression, 'attribute_not_exists(n) OR n < :limit');
        assert.equal(p.ExpressionAttributeValues[':ttl'], Math.floor(now / 1000) + 1200);
        const n = counters.get(key) ?? 0;
        if (n >= p.ExpressionAttributeValues[':limit']) throw new Error('제한 도달');
        counters.set(key, n + 1);
        return {};
    } } : null };
    if (name === '@/lib/guruLens/service') return {
        readonlyCache: { read: async (key: string) => store.get(key) ?? null }, currentBadges: async () => ({}),
    };
    if (name === '@/lib/alerts/revenuecat') return { createRevenueCatVerifier: (options: any) => createRevenueCatVerifier({
        ...options, apiKey: 'fixture', now: () => now, fetchImpl: async () => {
            reads++; active++; peak = Math.max(peak, active);
            await new Promise(resolve => setImmediate(resolve));
            active--;
            return failure ? new Response(null, { status: 503 })
                : Response.json({ subscriber: { entitlements: { pro: { expires_date: '2026-10-22' } } } });
        },
    }) };
    return load.call(this, name, parent, main);
};
let route: any;
function reset() {
    counters.clear(); reads = 0; peak = 0; failure = false; storeFailure = false; configured = true;
    delete require.cache[require.resolve('../src/app/api/guru-lens/route')];
    route = require('../src/app/api/guru-lens/route');
}
async function get(id = 'fixture-user', ip = '192.0.2.1') {
    const res = await route.GET(new NextRequest('http://localhost/api/guru-lens?access=pro&badges=0', {
        headers: { 'x-rc-app-user-id': id, 'x-forwarded-for': ip },
    }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    return (await res.json()).lenses[0].rows[3];
}
async function main() {
    reset();
    const same = await Promise.all(Array.from({ length: 24 }, () => get()));
    assert.equal(reads, 1, '동일 ID 동시 24건 → 공급사 1회');
    assert.equal(same.filter(r => r.locked).length, 12, 'ID 10분 12회 제한');
    assert.equal(same.filter(r => r.ticker).length, 12);

    reset();
    await get(); await get();
    assert.equal(reads, 1, 'ID 캐시 적중은 공급사 예산을 쓰지 않는다');
    now += 30_001;
    await get();
    assert.equal(reads, 2, '30초 캐시 만료 뒤 재검증');

    reset();
    // 기존 IP 제한은 30회이므로 앞선 12회 뒤 다른 ID 동시 24건으로 경계를 검증한다.
    for (let i = 0; i < 12; i++) await get(`warm-user-${i}`);
    const before = reads;
    const different = await Promise.all(Array.from({ length: 24 }, (_, i) => get(`different-user-${i}`)));
    assert.equal(reads - before, 18, '다른 ID 동시 24건 중 IP 잔여 18건만 공급사 조회');
    assert.equal(different.filter(r => r.locked).length, 6);
    assert.ok(peak <= 4, '기존 로더의 동시 공급사 호출 상한 4');

    reset();
    const all = await Promise.all(Array.from({ length: 48 }, (_, i) => get(`global-user-${i}`, `192.0.2.${i + 1}`)));
    assert.equal(reads, 30, '서로 다른 IP/ID에도 공급사 전체 10분 30회 상한');
    assert.equal(all.filter(r => r.locked).length, 18);

    reset(); failure = true;
    const errors = await Promise.all(Array.from({ length: 24 }, () => get()));
    assert.equal(reads, 1, '공급사 실패도 동시 24건을 1회로 병합');
    assert.ok(errors.every(r => r.locked), '검증 실패는 무료 응답');
    reset(); failure = true;
    await get();
    failure = false;
    assert.ok((await get()).ticker, '실패 판정을 캐시하지 않아 다음 요청에 복구');
    assert.equal(reads, 2);

    for (const missing of [false, true]) {
        reset(); storeFailure = !missing; configured = !missing;
        assert.ok((await get()).locked);
        assert.equal(reads, 0, '제한 저장소 장애·설정 없음은 공급사 호출 0');
    }
    reset();
    await get('bad/id');
    assert.equal(counters.size, 0); assert.equal(reads, 0);
    (Module as any)._load = load;
    Date.now = originalNow;
    console.log('관문 재현 통과: 동일 ID 24건→1회, 다른 ID 24건 제한, 전체 상한·실패·30초 캐시·복구, 운영 쓰기 0');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
