/** 뉴스 지수 검사의 실제 반환 경로 — 네트워크·Redis·AI는 메모리 대역만 사용한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildIndexFacts, indexSourceNums } from '@/lib/ai/indexFacts';

const NOW = Date.parse('2026-10-18T00:00:00Z');
Date.now = () => NOW;
process.env.FMP_API_KEY = '';
const store = new Map<string, any>();
const writes: string[] = [];
const SKIP = new Error('local fresh-tier skip');
let skip = false;
let calls = 0;
const facts = buildIndexFacts({ spx: { price: 7659.44, changePct: -1.09 } }, null);
const fields = { summaryKR: '시장 소식이다.', summaryJP: '市場のニュースです。', analysisKR: '시장 흐름을 살핀다.', analysisEN: 'Watch market positioning.', analysisJP: '市場を確認します。' };
const good = { ...fields, id: 'good', headline: 'Valid mixed market report', summaryEN: 'S&P 500 fell 1.09%; VIX rose 5.00%.', publishedAt: new Date(NOW - 60000).toISOString(), _idx: facts, _srcIdxNums: [] };
const bad = { ...fields, id: 'bad', headline: 'Legacy incorrect level', summaryEN: 'S&P 500은 7704 부근으로 하락했다.', publishedAt: good.publishedAt };
const sourceText = 'The S&P 500 fell to 7,600.25 at midday.';
const sourced = { ...good, id: 'sourced', headline: 'Source intraday level', summaryEN: sourceText, _srcIdxNums: indexSourceNums(sourceText) };

const mocks: Record<string, any> = {
    '@/services/redisClient': {
        getFromCache: async (key: string) => store.get(key) ?? null,
        setInCache: async (key: string, value: unknown) => { writes.push(key); store.set(key, value); return true; },
    },
    '@/lib/news/rss': { fetchRssPool: async () => [] },
    '@/services/massiveClient': {
        CACHE_POLICY: { DISPLAY_NEWS: {} },
        fetchMassive: async () => ({ results: [{ id: 'fresh', title: 'Fresh headline', description: 'Market news', published_utc: good.publishedAt }] }),
    },
    '@/services/bedrockClient': {
        MODELS: { HAIKU_35: 'local-test' },
        callBedrock: async () => { calls++; return { text: JSON.stringify([{ ...good, id: 'fresh', headline: 'Fresh valid summary' }]), model: 'local-test' }; },
    },
    '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: { IDX_SPX: 'test:spx', IDX_NASDAQ: 'test:nasdaq' } },
    '@/lib/ai/creditPacing': { pacingKnobs: async () => ({}), effectiveDigestIntervalMin: () => 15 },
    '@/lib/ai/freshTier': { withFreshTier: async (fn: () => unknown) => { if (skip) throw SKIP; return fn(); }, isFreshTierSkipped: (e: unknown) => e === SKIP },
    '@/lib/ai/ladderGates': { newsDigestGate: () => true },
};
const load = (Module as any)._load;
(Module as any)._load = function (name: string, ...rest: unknown[]) {
    return name in mocks ? mocks[name] : load.call(this, name, ...rest);
};
global.fetch = async () => { throw new Error('Network disabled in newsIndexExit test'); };
const digest = require('@/app/api/guardian/news-digest/route');
const archive = require('@/app/api/guardian/news-archive/route');
const { buildWhyContext } = require('@/services/breaking/whyBuilder');
const { toArchiveItem, etDay, ARCHIVE_KEY_PREFIX, DIGEST_REDIS_KEY } = require('@/lib/news/pulseArchive');
(Module as any)._load = load;

function reset() {
    store.clear(); writes.length = 0; calls = 0; skip = false;
    store.set(DIGEST_REDIS_KEY, { items: [bad, good, sourced], generatedAt: new Date(NOW).toISOString() });
    store.set('test:spx', { price: 7659.44, changePct: -1.09, source: 'TEST' });
}
async function callDigest(query: string) {
    return (await digest.GET({ url: `https://example.test/api/guardian/news-digest?${query}` })).json();
}
const tests: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => tests.push([name, fn]);

t('캐시 응답 — 옛 수준 오류만 제외, 정상 혼합 지표·원문 소수점은 유지', async () => {
    reset();
    const body = await callDigest('locale=en');
    assert.deepEqual(body.items.map((it: any) => it.id), ['good', 'sourced']);
    assert.equal(calls, 0); assert.deepEqual(writes, []);
});
t('pace no-new-article 조기 반환도 검증된 항목만 반환', async () => {
    reset(); store.set('guardian:news:digest:sig:v1', { keys: ['freshheadline'] });
    const body = await callDigest('refresh=1&pace=1&locale=en');
    assert.equal(body._pace, 'no-new-article');
    assert.deepEqual(body.items.map((it: any) => it.id), ['good', 'sourced']);
    assert.equal(calls, 0); assert.deepEqual(writes, []);
});
t('pace skipped 조기 반환도 검증된 항목만 반환', async () => {
    reset(); skip = true;
    const body = await callDigest('refresh=1&pace=1&locale=en');
    assert.equal(body._pace, 'skipped');
    assert.deepEqual(body.items.map((it: any) => it.id), ['good', 'sourced']);
    assert.equal(calls, 0); assert.deepEqual(writes, []);
});
t('새 생성·누적 — 정상 새 항목과 원문 수치를 유지, 잘못된 옛 캐시를 재저장하지 않는다', async () => {
    reset();
    const body = await callDigest('refresh=1&locale=en');
    assert.equal(calls, 1);
    assert.deepEqual(new Set(body.items.map((it: any) => it.id)), new Set(['fresh', 'good', 'sourced']));
    assert.ok(!store.get(DIGEST_REDIS_KEY).items.some((it: any) => it.id === 'bad'));
});
t('보관 변환 — 현물·원문 근거를 보존하고 옛 수준 오류는 제외', () => {
    const row = toArchiveItem(sourced);
    assert.deepEqual(row?._idx, facts);
    assert.deepEqual(row?._srcIdxNums, sourced._srcIdxNums);
    assert.equal(toArchiveItem(bad), null);
});
t('보관본 직접 읽기 — 옛 수준 오류 제외·정상 혼합 지표와 소수점 보존·개수 일치', async () => {
    reset();
    const legacy = { ...toArchiveItem(good), id: 'legacy', k: 'legacy', summaryEN: bad.summaryEN, _idx: undefined, _srcIdxNums: undefined };
    store.set(`${ARCHIVE_KEY_PREFIX}${etDay(good.publishedAt)}`, { items: [legacy, toArchiveItem(good), toArchiveItem(sourced)] });
    const body = await (await archive.GET({ url: 'https://example.test/api/guardian/news-archive?locale=en' })).json();
    assert.deepEqual(new Set(body.items.map((it: any) => it.id)), new Set(['good', 'sourced']));
    assert.equal(body.count, 2); assert.deepEqual(writes, []);
});
t('보관본 digest 대체 — 원문 소수점 보존·잘못된 옛 수준은 제외', async () => {
    reset();
    const body = await (await archive.GET({ url: 'https://example.test/api/guardian/news-archive?locale=en' })).json();
    assert.equal(body.source, 'digest');
    assert.deepEqual(new Set(body.items.map((it: any) => it.id)), new Set(['good', 'sourced']));
    assert.equal(body.count, 2); assert.deepEqual(writes, []);
});
t('급변동 해설의 직접 캐시 소비도 정상 문장·원문 소수점을 유지하고 옛 수준 오류는 제외', async () => {
    reset();
    const ctx = await buildWhyContext({ atISO: new Date(NOW).toISOString(), changePct: -1 }, 'en');
    assert.deepEqual(new Set(ctx.news.map((it: any) => it.summary)), new Set([good.summaryEN, sourced.summaryEN]));
    assert.deepEqual(writes, []); assert.equal(calls, 0);
});

(async () => {
    let passed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log('ok -', name); }
        catch (e) { process.exitCode = 1; console.error('FAIL -', name, e); }
    }
    console.log(`${passed} passed, ${tests.length - passed} failed`);
})();
