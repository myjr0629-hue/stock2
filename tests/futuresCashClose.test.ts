/** 마감 기준 관측 → 캐시 → 공통 지수 → Tactical POST. 모든 I/O는 메모리 모의다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { buildIndexFacts } from '@/lib/ai/tacticalIndexFacts';
import { buildTacticalPrompt, tacticalIndexReasons } from '@/lib/ai/tacticalPrompt';
import { futuresCashCloseCandidate, futuresCashCloseKey, closerCashCloseReference, isCashCloseReferenceAt,
    type FuturesCashCloseReference } from '@/lib/futuresCashClose';
import { etWallTimeToMs } from '@/lib/marketSession';
import { sessionCloseMinutes } from '@/lib/marketCalendar';

const iso = (at: number) => new Date(at).toISOString();
const quote = (symbol: string, at: number, price = 20000, changePct = -0.6) => ({ symbol, price, changePct,
    marketTime: iso(at), lastChangeAt: iso(at), updatedAt: iso(at), source: 'YAHOO', prevClose: price * 0.99, change: 0, isStale: false });
const reference = (symbol: 'NQ=F' | 'ES=F', date: string, at: number, price = 20000): FuturesCashCloseReference =>
    ({ symbol, sessionDate: date, asOf: iso(at), price });
const store = new Map<string, unknown>();
const writes: { key: string; value: unknown; ttl: number }[] = [];
const reads: string[] = [];
let failRead = '', failWrite = '';
let beforeWrite = async (_key: string, _value: unknown) => {};
const upstashStore = new Map<string, unknown>();
const redis = {
    getFromCache: async (key: string) => { reads.push(key); if (key === failRead) throw new Error('mock read failure'); return store.get(key) ?? null; },
    // store = EC2 우선 읽기 경로, upstashStore = Upstash 직접 읽기. 어느 쪽 사본이 나은지는 호출자가 고른다.
    mgetBothStores: async (keys: string[]) => {
        keys.forEach(k => reads.push(k));
        if (keys.includes(failRead)) throw new Error('mock read failure');
        return { primary: keys.map(k => store.get(k) ?? null), upstash: keys.map(k => upstashStore.get(k) ?? null) };
    },
    setInCache: async (key: string, value: unknown, ttl: number) => {
        if (key === failWrite) return false;
        writes.push({ key, value, ttl }); store.set(key, value); return true;
    },
    setFuturesCashCloseIfCloser: async (key: string, value: FuturesCashCloseReference, _closeAt: string, ttl: number) => {
        await beforeWrite(key, value);
        if (key === failWrite) return false;
        const previous = store.get(key) as FuturesCashCloseReference | null ?? null;
        const selected = closerCashCloseReference(previous, value);
        if (selected !== previous) { writes.push({ key, value: selected, ttl }); store.set(key, selected); }
        return true;
    },
};
const originalLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
    return id === './redisClient' || id === '@/services/redisClient' ? redis : originalLoad.call(this, id, ...args);
};
const { captureFuturesCashClose, _resetSettledCashCloseRefsForTest } = require('../src/services/futuresCashClose');
const { loadMarketIndexBasis } = require('../src/services/marketIndexBasis');
const { runMarketFeed } = require('../src/services/jobs/marketFeedJob');

async function main() {
    // 정상·조기 폐장 및 DST 시작/종료 직전/직후 거래일의 실제 UTC 마감.
    for (const [date, closeISO] of [
        ['2026-10-22', '2026-10-22T20:00:00.000Z'],
        ['2026-11-27', '2026-11-27T18:00:00.000Z'],
        ['2026-03-06', '2026-03-06T21:00:00.000Z'],
        ['2026-03-09', '2026-03-09T20:00:00.000Z'],
        ['2026-10-30', '2026-10-30T20:00:00.000Z'],
        ['2026-11-02', '2026-11-02T21:00:00.000Z'],
    ]) {
        store.clear(); upstashStore.clear(); _resetSettledCashCloseRefsForTest(); writes.length = 0;
        const close = etWallTimeToMs(date, sessionCloseMinutes(date));
        assert.equal(iso(close), closeISO, date);
        for (const symbol of ['NQ=F', 'ES=F'] as const) {
            const key = futuresCashCloseKey(symbol, date);
            // 정각 관측이 없어도 앞뒤 관측에서 초 단위로 가장 가까운 값을 고른다.
            for (const delta of [-60_000, -15_000, 20_000, 65_000]) {
                assert.equal(await captureFuturesCashClose(quote(symbol, close + delta), close + Math.max(0, delta)), true);
            }
            assert.equal((store.get(key) as FuturesCashCloseReference).asOf, iso(close - 15_000));
            assert.equal(writes.filter(w => w.key === key).length, 2, '더 멀어진 관측은 재저장하지 않음');
            // 늦게 도착한 정각 관측은 한 번 개선하고 이후 고정한다.
            await captureFuturesCashClose(quote(symbol, close), close + 70_000);
            await captureFuturesCashClose(quote(symbol, close, 21000), close + 80_000);
            await captureFuturesCashClose(quote(symbol, close + 2 * 60_000), close + 2 * 60_000);
            assert.equal((store.get(key) as FuturesCashCloseReference).price, 20000);
            assert.ok(writes.filter(w => w.key === key).every(w => w.ttl === 86400));
        }
        const at = close + 15 * 60_000;
        store.set('yahoo:idx:nasdaq', quote('^IXIC', close - 60_000, 20000, -1.2));
        store.set('yahoo:idx:spx', quote('^GSPC', close - 60_000, 5000, -0.6));
        store.set('yahoo:nq', quote('NQ=F', at - 60_000, 20060));
        store.set('yahoo:spx', quote('ES=F', at - 60_000, 19960, 1.1));
        const before = writes.length;
        const basis = await loadMarketIndexBasis(at);
        assert.equal(writes.length, before, 'load는 캐시 읽기만');
        assert.ok(Math.abs(basis.futures.nq.sinceCashClosePct - 0.3) < 1e-10);
        assert.ok(Math.abs(basis.futures.es.sinceCashClosePct + 0.2) < 1e-10);
        assert.equal(basis.futures.nq.changePct, -0.6, '정산 대비 수치는 그대로');
        assert.equal(basis.futures.nq.cashCloseReferenceAt, closeISO);
        assert.deepEqual(buildIndexFacts(basis, 'POST', at).map(f => f.id), ['nasdaq', 'spx', 'nq', 'es']);
        if (date === '2026-10-22') {
            for (const [locale, sentence] of [
                ['ko', '10/22 정규장에서 나스닥 종합은 1.2%, S&P500은 0.6% 내렸고, 지금 장후 나스닥100 선물은 종가 시점 대비 0.3% 상승, S&P500 선물은 0.2% 하락 중입니다.'],
                ['en', 'In the 10/22 cash session Nasdaq Composite fell 1.2% and S&P 500 fell 0.6%, while now after-hours Nasdaq 100 futures are up 0.3% and S&P 500 futures are down 0.2% since that cash close.'],
                ['ja', '10/22の通常取引でナスダック総合は1.2%、S&P500は0.6%下落し、現在の時間外ナスダック100先物は取引終了時点比0.3%上昇、S&P500先物は0.2%下落中です。'],
            ] as const) {
                const prompt = buildTacticalPrompt({ indexBasis: basis, asOf: iso(at), rlsiScore: 31, nasdaqChange: -1.2, vix: 19 }, locale);
                assert.deepEqual(tacticalIndexReasons(sentence, prompt), [], locale);
            }
        }
    }

    const date = '2026-10-22', close = Date.parse('2026-10-22T20:00:00Z'), at = close + 15 * 60_000;
    // 관문 재현: 오래된 관측의 쓰기를 멈춘 사이 정각 기준이 먼저 저장된다.
    store.clear(); upstashStore.clear(); _resetSettledCashCloseRefsForTest();
    let arrived!: () => void, release!: () => void;
    const waiting = new Promise<void>(resolve => { arrived = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    beforeWrite = async (_key, value) => {
        if ((value as FuturesCashCloseReference).asOf === iso(close - 30_000)) { arrived(); await resume; }
    };
    const slow = captureFuturesCashClose(quote('NQ=F', close - 30_000, 20000), close);
    await waiting;
    assert.equal(await captureFuturesCashClose(quote('NQ=F', close, 20020), close), true);
    release();
    assert.equal(await slow, true);
    beforeWrite = async () => {};
    // 현재값은 정각 기준과 같으므로 실제 POST 변화는 0%다.
    store.set('yahoo:nq', quote('NQ=F', at, 20020));
    const racedBasis = await loadMarketIndexBasis(at);
    assert.equal(racedBasis.futures.nq.sinceCashClosePct, 0, '먼 관측이 정각 기준을 덮어쓰면 +0.1% 오표시');
    // 검증 조회 전에 다른 수집자가 개선한 기준도 성공으로 인정한다.
    assert.equal(await captureFuturesCashClose(quote('NQ=F', close - 30_000), close,
        async () => ({ ok: true, value: reference('NQ=F', date, close, 20020) })), true);
    assert.equal(await captureFuturesCashClose(quote('NQ=F', close), close,
        async () => ({ ok: true, value: reference('NQ=F', date, close - 30_000) })), false);
    assert.equal(await captureFuturesCashClose(quote('NQ=F', close), close,
        async () => ({ ok: true, value: reference('ES=F', date, close) })), false);
    store.clear(); upstashStore.clear(); _resetSettledCashCloseRefsForTest();

    // 관문 10240752 재현: 15:59:30 20,000 을 양쪽에 저장 → EC2 장애 중 16:00 20,020 은 Upstash 에만 → EC2 복구.
    // EC2 값이 있어도 Upstash 의 더 가까운 기준을 써야 실제 0% 가 된다(예전 +0.1% 오표시).
    store.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close - 30_000, 20000));
    upstashStore.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close, 20020));
    store.set('yahoo:nq', quote('NQ=F', at, 20020));
    const recovered = await loadMarketIndexBasis(at);
    assert.equal(recovered.futures.nq.sinceCashClosePct, 0, 'EC2 복구 뒤에도 마감에 더 가까운 Upstash 기준');
    assert.equal(recovered.futures.nq.cashCloseReferenceAt, iso(close));
    // 반대(Upstash 가 덜 정확)도 가까운 쪽. 한쪽이 깨진 값이면 다른 쪽.
    _resetSettledCashCloseRefsForTest();
    store.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close, 20020));
    upstashStore.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close - 30_000, 20000));
    assert.equal((await loadMarketIndexBasis(at)).futures.nq.sinceCashClosePct, 0, 'EC2 가 더 가까우면 EC2');
    _resetSettledCashCloseRefsForTest();
    store.set(futuresCashCloseKey('NQ=F', date), { ...reference('NQ=F', date, close, 20020), asOf: 'bad' });
    upstashStore.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close - 30_000, 20000));
    assert.ok(Math.abs((await loadMarketIndexBasis(at)).futures.nq.sinceCashClosePct - 0.1) < 1e-10, '깨진 사본은 버리고 유효한 쪽');
    // 관문 10241622 재현: 한쪽(Upstash) 읽기 실패·불일치 때 고른 기준은 고정하지 않는다 → 복구 뒤 더 가까운 기준으로 바뀐다.
    _resetSettledCashCloseRefsForTest();
    store.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close - 30_000, 20000));
    upstashStore.delete(futuresCashCloseKey('NQ=F', date));   // Upstash 읽기 실패(=null) 모사
    store.set('yahoo:nq', quote('NQ=F', at, 20020));
    assert.ok(Math.abs((await loadMarketIndexBasis(at)).futures.nq.sinceCashClosePct - 0.1) < 1e-10, '한쪽만 있으면 그 값(임시)');
    upstashStore.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close, 20020));
    assert.equal((await loadMarketIndexBasis(at)).futures.nq.sinceCashClosePct, 0, 'Upstash 복구 뒤 더 가까운 기준으로 교정(고정 안 됨)');
    // 두 저장소가 같은 기준이면 마감 10분 뒤 고정 — 다음 조회는 저장소를 다시 읽지 않는다.
    store.set(futuresCashCloseKey('NQ=F', date), reference('NQ=F', date, close, 20020));
    await loadMarketIndexBasis(at);
    reads.length = 0;
    await loadMarketIndexBasis(at);
    assert.ok(!reads.some(k => k.startsWith('yahoo:cash-close:nq:')), '두 저장소가 일치한 확정 기준은 다시 읽지 않음');
    // 마감 10분 전에는 일치해도 고정하지 않는다.
    _resetSettledCashCloseRefsForTest();
    await loadMarketIndexBasis(close + 5 * 60_000);
    reads.length = 0;
    await loadMarketIndexBasis(close + 6 * 60_000);
    assert.ok(reads.some(k => k.startsWith('yahoo:cash-close:nq:')), '마감 10분 전에는 매번 읽음');
    // 정규장·장전(PRE)·주말에는 기준을 읽지 않는다(읽기 비용 증가 0).
    reads.length = 0;
    await loadMarketIndexBasis(close - 60 * 60_000);
    await loadMarketIndexBasis(Date.parse('2026-10-22T12:00:00Z'));
    await loadMarketIndexBasis(Date.parse('2026-10-24T18:00:00Z'));
    assert.ok(!reads.some(k => k.startsWith('yahoo:cash-close:')), 'REG·PRE·주말에는 기준 읽기 0');
    store.clear(); upstashStore.clear(); _resetSettledCashCloseRefsForTest();

    const raw = quote('NQ=F', at - 60_000, 20060);
    for (const ref of [null, reference('NQ=F', date, close - 180_001), reference('NQ=F', date, close + 180_001),
        reference('ES=F', date, close), reference('NQ=F', '2026-10-21', close), reference('NQ=F', date, close, 0),
        reference('NQ=F', date, close, NaN), { ...reference('NQ=F', date, close), asOf: 'bad' }]) {
        const basis = buildMarketIndexBasis({ nq: raw }, at, { nq: ref });
        assert.equal(basis.futures.nq.sinceCashClosePct, null);
        assert.equal(basis.futures.nq.cashCloseReferenceAt, null);
        assert.deepEqual(buildIndexFacts(basis, 'POST', at), []);
        assert.match(buildTacticalPrompt({ indexBasis: basis, asOf: iso(at), rlsiScore: 31, nasdaqChange: null, vix: 19 }, 'ko'), /AFTER_CLOSE_FUTURES: "종가 이후 선물 변화 미확인"/);
    }
    for (const delta of [-180_000, -60_000, 60_000, 180_000]) {
        const basis = buildMarketIndexBasis({ nq: raw }, at, { nq: reference('NQ=F', date, close + delta) });
        assert.equal(basis.futures.nq.cashCloseReferenceAt, iso(close + delta), '3분 이내의 실제 시각을 보존');
        assert.equal(buildIndexFacts(basis, 'POST', at)[0].id, 'nq');
        basis.futures.nq.cashCloseReferenceAt = iso(close + 180_001);
        assert.deepEqual(buildIndexFacts(basis, 'POST', at), [], '직접 전달된 basis도 3분 경계 재검사');
    }
    assert.equal(buildMarketIndexBasis({ nq: quote('NQ=F', close) }, at,
        { nq: reference('NQ=F', date, close + 60_000) }).futures.nq.sinceCashClosePct, null, '현재 시세보다 미래 기준 거절');
    const stale = buildMarketIndexBasis({ nq: { ...raw, lastChangeAt: iso(close - 60 * 60_000) } }, at,
        { nq: reference('NQ=F', date, close) });
    assert.deepEqual(buildIndexFacts(stale, 'POST', at), [], '기준이 있어도 정체된 현재 피드는 제외');
    for (const q of [quote('NQ=F', close - 60_001), quote('NQ=F', close + 120_000),
        quote('^IXIC', close), { ...quote('NQ=F', close), price: 0 }, { ...quote('NQ=F', close), source: 'DEFAULT' },
        { ...quote('NQ=F', close), marketTime: 'bad' }, { ...quote('NQ=F', close), lastChangeAt: iso(close - 21 * 60_000) }]) {
        assert.equal(futuresCashCloseCandidate(q, close + 120_000), null);
    }
    assert.equal(futuresCashCloseCandidate(quote('NQ=F', close), close + 180_001), null, '수집 시점도 3분 이상 지연되면 거절');
    assert.equal(futuresCashCloseCandidate(quote('NQ=F', close + 1), close), null);
    assert.equal(futuresCashCloseCandidate(quote('NQ=F', Date.parse('2026-10-24T20:00:00Z')), Date.parse('2026-10-24T20:00:00Z')), null);
    assert.equal(isCashCloseReferenceAt('2026-11-27T21:00:00Z', '2026-11-27'), false, '조기 폐장일 16시 기준 금지');
    const earlier = reference('NQ=F', date, close - 30_000);
    assert.equal(closerCashCloseReference(earlier, reference('NQ=F', date, close + 30_000)), earlier, '동률은 이른 관측');

    store.clear(); upstashStore.clear(); _resetSettledCashCloseRefsForTest(); writes.length = 0; reads.length = 0;
    failRead = futuresCashCloseKey('NQ=F', date);
    const missing = await loadMarketIndexBasis(at);
    assert.equal(missing.futures.nq.sinceCashClosePct, null, 'Redis 읽기 실패는 결측');
    failRead = '';
    assert.equal(writes.length, 0);
    await captureFuturesCashClose(quote('NQ=F', close), close);
    assert.equal(await captureFuturesCashClose(quote('NQ=F', close), close, async () => ({ ok: false, value: null })), false,
        '이미 저장된 기준도 EC2 성공 표식에는 주 저장소 확인 필요');
    assert.equal(await captureFuturesCashClose(quote('NQ=F', close), close,
        async key => ({ ok: true, value: store.get(key) })), true);
    store.clear(); upstashStore.clear(); _resetSettledCashCloseRefsForTest();

    // 실제 market-feed 배선: NQ/ES당 기존 chart 요청 1회만, 기준 저장 실패는 재시도 표식.
    const savedFetch = global.fetch, savedNow = Date.now;
    let providerCalls = 0;
    Date.now = () => close;
    global.fetch = (async (url: string) => {
        providerCalls++;
        const symbol = decodeURIComponent(url.match(/chart\/([^?]+)/)![1]);
        const price = symbol === 'NQ=F' ? 20000 : 5000;
        return { ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: price,
            previousClose: price * 0.99, regularMarketTime: close / 1000 } }] } }) };
    }) as any;
    try {
        store.set('yahoo:nq', quote('NQ=F', close));
        store.set('yahoo:spx', quote('ES=F', close, 5000));
        let result = await runMarketFeed({ only: ['NQ=F', 'ES=F'], fearGreed: false, vixCheck: false, newsBaseUrl: 'http://localhost',
            verifyRead: async (key: string) => ({ ok: true, value: store.get(key) }) });
        assert.equal(providerCalls, 2, '공급사 추가 호출 0');
        assert.equal(result.ok, 2);
        assert.equal(result.fail, 0);
        assert.equal((store.get(futuresCashCloseKey('ES=F', date)) as FuturesCashCloseReference).price, 5000);
        store.delete(futuresCashCloseKey('NQ=F', date));
        failWrite = futuresCashCloseKey('NQ=F', date);
        result = await runMarketFeed({ only: ['NQ=F'], fearGreed: false, vixCheck: false, newsBaseUrl: 'http://localhost' });
        assert.deepEqual(result.failed, ['NQ=F']);
        assert.equal(result.fail, 1);
        assert.ok(result.results.includes('NQ=F=CASH_CLOSE_WRITE_FAIL'));
    } finally { global.fetch = savedFetch; Date.now = savedNow; failWrite = ''; }
    console.log('통과 마감 기준 저장·정상/조기폐장·DST 양 경계·결측/3분·실제 수집 호출 수·3언어 POST 계약');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { (Module as any)._load = originalLoad; });
