/** 공유 검증기 계약: 합성 응답만 사용하며 본문 지연·보존 상한을 확인한다. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRevenueCatVerifier } from '../src/lib/alerts/revenuecat';

const subscriber = (until: string | null = null) => ({ subscriber: { entitlements: {
    pro: { expires_date: until, purchase_date: '2026-10-20' },
} } });
async function main() {
    let reads = 0, aborts = 0;
    const verifier = createRevenueCatVerifier({ apiKey: 'fixture', timeoutMs: 20,
        fetchImpl: async (_url, init) => {
            reads++;
            if (reads > 4) return Response.json(subscriber());
            const signal = init!.signal!;
            // 헤더는 즉시 도착하고 본문만 멈춘다. AbortController가 본문까지 살아 있어야 한다.
            return { status: 200, ok: true, json: () => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => { aborts++; reject(new Error('본문 취소')); }, { once: true });
            }) } as Response;
        } });
    const started = performance.now();
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => verifier(`deadline-${i}`)));
    const elapsed = performance.now() - started;
    assert.equal(aborts, 4, '헤더 수신 후 본문 대기 4건 모두 취소');
    assert.equal(reads, 5, '시간 제한 뒤 동시 호출 슬롯을 반환해 다섯 번째 조회 시작');
    assert.ok(results.slice(0, 4).every(r => r.status === 'rejected' && r.reason.code === 'unavailable'));
    assert.equal(results[4].status, 'fulfilled');
    assert.ok(elapsed < 500, '20ms 제한 모형이 500ms 이내에 전부 종료');

    // 신호를 무시하는 합성 본문도 상한을 넘겨 검증 Promise를 붙잡지 못한다.
    const ignoresAbort = createRevenueCatVerifier({ apiKey: 'fixture', timeoutMs: 20,
        fetchImpl: async () => ({ status: 200, ok: true, json: () => new Promise(() => {}) }) as Response });
    await assert.rejects(ignoresAbort('ignores-abort'), { code: 'unavailable' });

    let now = 1_000_000, allowed = true, active = true, providerReads = 0;
    const classes: boolean[] = [];
    const bounded = createRevenueCatVerifier({ apiKey: 'fixture', now: () => now,
        positiveTtlMs: 600_000, positiveMaxAgeMs: 1_200_000,
        beforeFetch: async (_id, known) => { classes.push(known); return allowed; },
        fetchImpl: async () => { providerReads++; return Response.json(active ? subscriber() : { subscriber: {} }); } });
    assert.ok((await bounded('confirmed')).active);
    now += 600_001; allowed = false;
    assert.ok((await bounded('confirmed')).active, 'PRO 전용 예산 소진 시 마지막 양성 유지');
    now += 30_001;
    assert.ok((await bounded('confirmed')).active);
    assert.deepEqual(classes, [false, true, true], '음성·최초 예산과 다른 PRO 재검증 분류');
    assert.equal(providerReads, 1);
    now = 2_200_000;
    await assert.rejects(bounded('confirmed'), { code: 'unavailable' });
    assert.equal(classes.at(-1), false, '20분 상한 뒤에는 이전 PRO를 신뢰하지 않는다');

    let expires = now + 610_000;
    allowed = true;
    const expiring = createRevenueCatVerifier({ apiKey: 'fixture', now: () => now,
        positiveTtlMs: 600_000, positiveMaxAgeMs: 1_200_000,
        beforeFetch: async () => allowed,
        fetchImpl: async () => Response.json(subscriber(new Date(expires).toISOString())) });
    assert.ok((await expiring('expiring')).active);
    now += 600_001; allowed = false;
    assert.ok((await expiring('expiring')).active);
    now = expires;
    await assert.rejects(expiring('expiring'), { code: 'unavailable' });

    allowed = true;
    assert.ok((await bounded('revoked')).active);
    now += 600_001; active = false;
    assert.equal((await bounded('revoked')).active, false, '명시적 비활성 응답은 양성 보존을 즉시 끝낸다');
    assert.equal((await bounded('revoked')).active, false);

    // 알림 등 단일 인수 호출 계약: 기본 양성 5분·음성 30초·오류 형식을 보존한다.
    let defaultReads = 0;
    const defaults = createRevenueCatVerifier({ apiKey: 'fixture', now: () => now,
        fetchImpl: async () => { defaultReads++; return Response.json(subscriber()); } });
    await defaults('default'); now += 299_999; await defaults('default');
    assert.equal(defaultReads, 1);
    now++; await defaults('default'); assert.equal(defaultReads, 2);
    const notFound = createRevenueCatVerifier({ apiKey: 'fixture', now: () => now,
        fetchImpl: async () => new Response(null, { status: 404 }) });
    assert.equal((await notFound('missing')).active, false);
    const invalid = createRevenueCatVerifier({ apiKey: 'fixture', fetchImpl: async () => new Response('{') });
    await assert.rejects(invalid('invalid'), { code: 'unavailable' });
    console.log(`공유 검증기 통과: 본문 지연 4건 취소·5번째 조회 완료(${Math.round(elapsed)}ms), 보존 상한·권한 만료·철회·기본 TTL, 운영 쓰기 0`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
