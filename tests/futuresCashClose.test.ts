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
const redis = {
    getFromCache: async (key: string) => { reads.push(key); if (key === failRead) throw new Error('mock read failure'); return store.get(key) ?? null; },
    setInCache: async (key: string, value: unknown, ttl: number) => {
        if (key === failWrite) return false;
        writes.push({ key, value, ttl }); store.set(key, value); return true;
    },
};
const originalLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
    return id === './redisClient' || id === '@/services/redisClient' ? redis : originalLoad.call(this, id, ...args);
};
const { captureFuturesCashClose } = require('../src/services/futuresCashClose');
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
        store.clear(); writes.length = 0;
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

    store.clear(); writes.length = 0; reads.length = 0;
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
    store.clear();

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
