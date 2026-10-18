/** 뉴스 지수 검사의 실제 반환 경로 — 네트워크·Redis·AI는 메모리 대역만 사용한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildIndexFacts, indexSourceNums } from '@/lib/ai/indexFacts';

let NOW = Date.parse('2026-10-18T00:00:00Z');
Date.now = () => NOW;
process.env.FMP_API_KEY = '';
const store = new Map<string, any>();
const writes: string[] = [];
const afterTasks: Array<() => unknown> = [];
const SKIP = new Error('local fresh-tier skip');
let skip = false;
let calls = 0;
let aiFail = false;
let freshDescription = 'Market news';
let freshSummary = 'S&P 500 fell 1.09%; VIX rose 5.00%.';
const facts = buildIndexFacts({ spx: { price: 7659.44, changePct: -1.09 } }, null);
const fields = { summaryKR: '시장 소식이다.', summaryJP: '市場のニュースです。', analysisKR: '시장 흐름을 살핀다.', analysisEN: 'Watch market positioning.', analysisJP: '市場を確認します。' };
const good = { ...fields, id: 'good', headline: 'Valid mixed market report', summaryEN: 'S&P 500 fell 1.09%; VIX rose 5.00%.', publishedAt: new Date(NOW - 60000).toISOString(), _idx: facts, _srcIdxNums: [] };
const bad = { ...fields, id: 'bad', headline: 'Legacy incorrect level', summaryEN: 'S&P 500은 7704 부근으로 하락했다.', publishedAt: good.publishedAt };
const sourceText = 'The S&P 500 fell to 7,600.25 at midday.';
const sourced = { ...good, id: 'sourced', headline: 'Source intraday level', summaryEN: sourceText, _srcIdxNums: indexSourceNums(sourceText) };

const mocks: Record<string, any> = {
    'next/server': { ...require('next/server'), after: (fn: () => unknown) => { afterTasks.push(fn); } },
    '@/services/redisClient': {
        getFromCache: async (key: string) => store.get(key) ?? null,
        setInCache: async (key: string, value: unknown) => { writes.push(key); store.set(key, value); return true; },
    },
    '@/lib/news/rss': { fetchRssPool: async () => [] },
    '@/services/massiveClient': {
        CACHE_POLICY: { DISPLAY_NEWS: {} },
        fetchMassive: async () => ({ results: [{ id: 'fresh', title: 'Fresh headline', description: freshDescription, published_utc: good.publishedAt }] }),
    },
    '@/services/bedrockClient': {
        MODELS: { HAIKU_35: 'local-test' },
        callBedrock: async () => { calls++; if (aiFail) throw new Error('local AI failure'); return { text: JSON.stringify([{ ...good, id: 'fresh', headline: 'Fresh valid summary', summaryEN: freshSummary }]), model: 'local-test' }; },
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
    store.clear(); writes.length = 0; afterTasks.length = 0; calls = 0; skip = false; aiFail = false;
    freshDescription = 'Market news'; freshSummary = good.summaryEN;
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

t('3차 관문 — 캐시·보관본·급변동 해설에서 한·일 혼합 지표 보존, 원문 오기·쉼표 오류 제외', async () => {
    reset();
    const source = indexSourceNums('S&P 500 futures fell 1.11% to 7,704.25.');
    const valid = [
        { ...good, id: 'mixed-ko', summaryKR: 'S&P 500은 1.09% 하락했고 VIX는 5.00% 상승했다.' },
        { ...good, id: 'mixed-ja', summaryJP: 'S&P 500は1.09%下落し、VIXは5.00%上昇した。' },
    ];
    const invalid = [
        { ...good, id: 'wrong-kind', summaryEN: 'S&P 500 fell 1.11% to 7,704.25.', _srcIdxNums: source },
        { ...good, id: 'wrong-direction', summaryEN: 'S&P 500 rose 1.09%.', _srcIdxNums: indexSourceNums('S&P 500 fell 1.09%.') },
        { ...good, id: 'wrong-comma', summaryEN: 'S&P 500 fell to 7,659.44, down 1.11%.' },
        { ...good, id: 'legacy-bare', summaryEN: 'S&P 500 fell 1.11%.', _srcIdxNums: ['1.11%'] },
    ];
    store.set(DIGEST_REDIS_KEY, { items: [...valid, ...invalid], generatedAt: new Date(NOW).toISOString() });
    const body = await callDigest('locale=en');
    assert.deepEqual(body.items.map((it: any) => it.id), valid.map(it => it.id));
    const ctx = await buildWhyContext({ atISO: new Date(NOW).toISOString(), changePct: -1 }, 'ko');
    assert.deepEqual(new Set(ctx.news.map((it: any) => it.summary)), new Set(valid.map(it => it.summaryKR)));
    for (const row of valid) assert.ok(toArchiveItem(row));
    for (const row of invalid) assert.equal(toArchiveItem(row), null, row.id);
    // 과거 저장 문서는 변환을 거치지 않았을 수 있으므로 직접 읽기도 검증한다.
    store.set(`${ARCHIVE_KEY_PREFIX}${etDay(good.publishedAt)}`, { items: [...valid, ...invalid].map(it => ({ ...it, k: it.id })) });
    const archived = await (await archive.GET({ url: 'https://example.test/api/guardian/news-archive?locale=en' })).json();
    assert.deepEqual(new Set(archived.items.map((it: any) => it.id)), new Set(valid.map(it => it.id)));
    assert.deepEqual(writes, []); assert.equal(calls, 0);
});

t('3차 관문 — 새 생성의 원문 근거도 지수 종류·방향을 지키고 장중 수치는 보존한다', async () => {
    for (const [description, summary, keep] of [
        ['S&P 500 futures fell 1.11% to 7,704.25.', 'S&P 500 fell 1.11% to 7,704.25.', false],
        ['S&P 500 fell 1.09%.', 'S&P 500 rose 1.09%.', false],
        ['Market news', 'S&P 500 fell to 7,659.44, down 1.11%.', false],
        ['S&P 500 fell 1.25% to 7,600.25 at midday.', 'S&P 500 fell 1.25% to 7,600.25 at midday.', true],
        ['Market news', 'S&P 500は1.09%下落し、VIXは5.00%上昇した。', true],
    ] as const) {
        reset(); freshDescription = description; freshSummary = summary;
        const body = await callDigest('refresh=1&locale=en');
        assert.equal(calls, 1);
        assert.equal(body.items.some((it: any) => it.id === 'fresh'), keep, summary);
        assert.equal(store.get(DIGEST_REDIS_KEY).items.some((it: any) => it.id === 'fresh'), keep, summary);
    }
});

t('4차 관문 1 — 필터로 빈 결과가 되어도 연속 일반 GET은 AI를 재호출하지 않고 3분 후 재시도', async () => {
    reset(); store.set(DIGEST_REDIS_KEY, { items: [bad], generatedAt: new Date(NOW).toISOString() });
    freshSummary = 'S&P 500 fell 1.11%.';
    const first = await callDigest('locale=en');
    const second = await callDigest('locale=en');
    assert.equal(first.items.length, 0); assert.equal(second.items.length, 0);
    assert.equal(calls, 1);
    NOW += 181000;
    try { await callDigest('locale=en'); assert.equal(calls, 2); }
    finally { NOW -= 181000; }
});
t('오래된 캐시 — 전부 거절되면 즉시 생성만 실행, 정상 캐시는 응답 후 갱신만 예약', async () => {
    reset();
    const generatedAt = new Date(NOW - 21 * 60000).toISOString();
    store.set(DIGEST_REDIS_KEY, { items: [bad], generatedAt });
    freshSummary = 'S&P 500 fell 1.11%.';
    await callDigest('locale=en');
    assert.equal(calls, 1); assert.equal(afterTasks.length, 0);
    reset(); store.set(DIGEST_REDIS_KEY, { items: [good], generatedAt });
    const body = await callDigest('locale=en');
    assert.equal(body.items.length, 1);
    assert.equal(calls, 0); assert.equal(afterTasks.length, 1);
});
t('4차 관문 1 — 빈 결과 대기 중에도 명시적 refresh·urgent 요청은 실행', async () => {
    reset(); store.delete(DIGEST_REDIS_KEY); freshSummary = 'S&P 500 fell 1.11%.';
    await callDigest('locale=en');
    await callDigest('refresh=1&locale=en');
    await callDigest('urgent=1&locale=en');
    assert.equal(calls, 3);
});
t('4차 관문 2·3 — 생성·캐시·보관 변환·보관 읽기·급변동 해설에서 별칭 보존과 보충 오류 거절', async () => {
    for (const [description, summary, keep] of [
        ['Nasdaq Composite fell 1.25% at midday.', 'Nasdaq fell 1.25% at midday.', true],
        ['Nasdaq Composite fell 1.25% at midday.', '나스닥은 장중 1.25% 하락했다.', true],
        ['Market news', 'S&P 500 fell to 7,659.44, a decline of 1.11%.', false],
        ['Market news', 'S&P 500 fell to 7,659.44 and was down 1.11%.', false],
    ] as const) {
        reset(); store.set('test:nasdaq', { price: 28420.12, changePct: -2.31, source: 'TEST' });
        freshDescription = description; freshSummary = summary;
        const generated = await callDigest('refresh=1&locale=en');
        assert.equal(generated.items.some((it: any) => it.id === 'fresh'), keep, summary);
        const row = { ...good, id: 'gate4', summaryEN: summary, _srcIdxNums: indexSourceNums(description) };
        store.set(DIGEST_REDIS_KEY, { items: [good, row], generatedAt: new Date(NOW).toISOString() });
        const cached = await callDigest('locale=en');
        assert.equal(cached.items.some((it: any) => it.id === 'gate4'), keep, summary);
        assert.equal(toArchiveItem(row) !== null, keep, summary);
        store.set(`${ARCHIVE_KEY_PREFIX}${etDay(good.publishedAt)}`, { items: [{ ...good, k: good.id }, { ...row, k: row.id }] });
        const archived = await (await archive.GET({ url: 'https://example.test/api/guardian/news-archive?locale=en' })).json();
        assert.equal(archived.items.some((it: any) => it.id === 'gate4'), keep, summary);
        const ctx = await buildWhyContext({ atISO: new Date(NOW).toISOString(), changePct: -1 }, 'en');
        assert.equal(ctx.news.some((it: any) => it.summary === summary), keep, summary);
    }
});

t('5차 관문 1·3 — 생성·캐시·보관 변환·보관 읽기·급변동 해설: 분사 등락률 오류 거절, Nasdaq 선물 별칭 보존', async () => {
    const fullFacts = buildIndexFacts({ spx: { price: 7659.44, changePct: -1.09 }, nasdaq: { price: 28420.12, changePct: -2.31 } }, { nasdaq100: { level: 29392, chgPct: -2.5, symbolUsed: 'NQ=F' } });
    for (const [description, summary, keep, gen] of [
        ['Market news', 'S&P 500 closed at 7,659.44, losing 1.11%.', false, true],
        ['Market news', 'S&P 500 closed at 7,659.44, losing 1.09%.', true, true],
        ['Market news', 'S&P 500은 7,659.44에 마감, 1.11% 하락했다.', false, true],
        ['Market news', 'S&P 500 fell 1.09%, led by Tesla, which dropped 3.00%.', true, true],
        ['S&P 500 fell 1.09%; VIX rose 5.00%.', 'S&P 500은 1.09% 내렸고 VIX는 5.00% 올랐다.', true, true],
        ['Market news', 'S&P 500은 1.11% 내렸고 VIX는 5.00% 올랐다.', false, true],
        ['Market news', 'S&P 500은 최고 수준인 7,704.25에 마감했다.', false, true],
        ['Market news', 'S&P 500은 1.09% 하락했고 10년물 국채금리는 4.00%로 올랐다.', true, true],
        ['Market news', 'S&P 500은 1.11% 내려앉았고 VIX는 5.00% 올랐다.', false, true],
        ['Nasdaq-100 futures fell 1.25% at midday.', 'Nasdaq futures fell 1.25% at midday.', true, false],
        ['Nasdaq-100 futures fell 1.25% at midday.', 'Nasdaq futures fell 1.35% at midday.', false, false],
    ] as const) {
        reset(); store.set('test:nasdaq', { price: 28420.12, changePct: -2.31, source: 'TEST' });
        freshDescription = description; freshSummary = summary;
        if (gen) {                                   // 생성 경로는 선물 사실(macro fetch)이 없어 현물 문장만
            const generated = await callDigest('refresh=1&locale=en');
            assert.equal(generated.items.some((it: any) => it.id === 'fresh'), keep, summary);
        }
        const row = { ...good, id: 'gate5', summaryEN: summary, _idx: fullFacts, _srcIdxNums: indexSourceNums(description) };
        store.set(DIGEST_REDIS_KEY, { items: [good, row], generatedAt: new Date(NOW).toISOString() });
        const cached = await callDigest('locale=en');
        assert.equal(cached.items.some((it: any) => it.id === 'gate5'), keep, summary);
        assert.equal(toArchiveItem(row) !== null, keep, summary);
        store.set(`${ARCHIVE_KEY_PREFIX}${etDay(good.publishedAt)}`, { items: [{ ...good, k: good.id }, { ...row, k: row.id }] });
        const archived = await (await archive.GET({ url: 'https://example.test/api/guardian/news-archive?locale=en' })).json();
        assert.equal(archived.items.some((it: any) => it.id === 'gate5'), keep, summary);
        const ctx = await buildWhyContext({ atISO: new Date(NOW).toISOString(), changePct: -1 }, 'en');
        assert.equal(ctx.news.some((it: any) => it.summary === summary), keep, summary);
    }
});

t('6차 관문 1 — AI 실패 대체 항목(원문 지수 문장)은 캐시 출구를 통과하고, 일반 GET 3회에 AI는 1회만', async () => {
    for (const description of ['S&P 500 fell 1.09%.', 'S&P 500 fell 1.25% to 7,600.25 at midday.']) {
        reset(); store.delete(DIGEST_REDIS_KEY);
        aiFail = true; freshDescription = description;
        const r1 = await callDigest('locale=en');
        assert.ok(r1.items.some((it: any) => it.id === 'fresh' && it.summaryEN === description), description);
        const r2 = await callDigest('locale=en');
        const r3 = await callDigest('locale=en');
        assert.equal(calls, 1, description);
        for (const r of [r2, r3]) assert.ok(r.items.some((it: any) => it.id === 'fresh'), description);
    }
});
t('6차 관문 2 — «posting a 1.09% loss»(실제 +1.09%)는 생성·캐시·보관·급변동 해설에서 제외', async () => {
    const up = buildIndexFacts({ spx: { price: 7659.44, changePct: 1.09 } }, null);
    for (const [summary, keep] of [['S&P 500 closed at 7,659.44, posting a 1.09% loss.', false], ['S&P 500 posted a 1.09% decrease.', false], ['S&P 500 closed at 7,659.44, posting a 1.09% gain.', true], ['S&P 500 posted a 1.09% increase.', true]] as const) {
        reset(); store.set('test:spx', { price: 7659.44, changePct: 1.09, source: 'TEST' });
        freshSummary = summary;
        const generated = await callDigest('refresh=1&locale=en');
        assert.equal(generated.items.some((it: any) => it.id === 'fresh'), keep, summary);
        const row = { ...good, id: 'gate6', summaryEN: summary, _idx: up, _srcIdxNums: [] };
        const okRow = { ...good, _idx: up, summaryEN: 'S&P 500 rose 1.09%.' };
        store.set(DIGEST_REDIS_KEY, { items: [okRow, row], generatedAt: new Date(NOW).toISOString() });
        const cached = await callDigest('locale=en');
        assert.equal(cached.items.some((it: any) => it.id === 'gate6'), keep, summary);
        assert.equal(toArchiveItem(row) !== null, keep, summary);
        store.set(`${ARCHIVE_KEY_PREFIX}${etDay(good.publishedAt)}`, { items: [{ ...okRow, k: okRow.id }, { ...row, k: row.id }] });
        const archived = await (await archive.GET({ url: 'https://example.test/api/guardian/news-archive?locale=en' })).json();
        assert.equal(archived.items.some((it: any) => it.id === 'gate6'), keep, summary);
        const ctx = await buildWhyContext({ atISO: new Date(NOW).toISOString(), changePct: 1 }, 'en');
        assert.equal(ctx.news.some((it: any) => it.summary === summary), keep, summary);
    }
});

(async () => {
    let passed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); passed++; console.log('ok -', name); }
        catch (e) { process.exitCode = 1; console.error('FAIL -', name, e); }
    }
    console.log(`${passed} passed, ${tests.length - passed} failed`);
})();
