/** H3/H4/M3: 감사 수치와 실제 GET 매핑을 재생. 외부 통신·운영 쓰기 없음. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildMarketIndexBasis, guardianCashChange, indexContext } from '@/lib/marketIndexBasis';
import { guardianNumsFromMarket } from '@/lib/ai/guardianNumbers';
import { deriveLocaleParts, withCashIndexBasis } from '@/services/guardian/guardianCore';

const now = Date.parse('2026-10-23T01:20:00Z');
const quote = (symbol: string, price: number, changePct: number | null, marketTime = '2026-10-22T20:00:00Z') =>
    ({ symbol, price, changePct, marketTime, source: 'YAHOO' });
const basis = buildMarketIndexBasis({
    nasdaq: quote('^IXIC', 26008.86, -2.60), spx: quote('^GSPC', 7663.43, -1.21),
    nq: quote('NQ=F', 29123.75, -0.06, '2026-10-23T01:19:00Z'),
    es: quote('ES=F', 7704, 0, '2026-10-23T01:18:00Z'),
}, now);
const macro: any = { indexBasis: basis, nqChangePercent: -0.06, vix: 19.03, marketStatus: { market: 'CLOSED' },
    factors: { nasdaq100: { level: 29123.75, chgPct: -0.06 }, spx: { level: 7704, chgPct: 0 },
        vix: { level: 19.03, chgPct: 14.09 }, us10y: { level: 4.96, chgAbs: -0.17 } } };
const core: any = { v: 1, timestamp: '2026-10-23T01:20:00Z', market: macro,
    rlsi: { score: 29.2, level: 'DANGER', session: 'CLOSED' }, sectors: [], vectors: [], targetId: null,
    rvol: { ndx: { rvol: null, status: 'CLOSED' }, dow: {} }, rotationIntensity: { direction: 'RISK_OFF', conviction: 'HIGH', breadth: 56.3 } };

for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = deriveLocaleParts(core, locale);
    assert.equal(p.divCase.caseId, 'D', 'H3: 급락 현물+낮은 RLSI는 Deep Freeze');
    assert.match(p.divCase.verdictDesc, /-2.60%/);
    assert.equal(p.tripleA.checklist.conditions[1].current, '-2.60%');
    assert.equal(p.tripleA.checklist.conditions[1].passed, false);
    assert.equal(p.tripleA.regime, 'BEAR');
    const legacy: any = { ...core, market: { ...macro, indexBasis: undefined }, coreAt: core.timestamp,
        verdictTargetId: null, verdictSourceId: null, divergence: { verdictDesc: 'NASDAQ -0.06%' },
        verdict: { title: 'TACTICAL INSIGHT', description: 'NASDAQ -0.06%' } };
    const repaired = withCashIndexBasis(legacy, basis, locale);
    assert.equal(repaired.divergence.caseId, 'D', '같은 coreAt의 기존 캐시도 판정 교정');
    assert.match(repaired.verdict.description, /-2.60%/);
}
assert.equal(guardianNumsFromMarket(macro, 29.2).NDX_CHG, -2.60);
assert.equal(guardianNumsFromMarket(macro, 29.2).SPX_CHG, -1.21);
assert.equal(guardianCashChange({}), null);
const missing = buildMarketIndexBasis({}, now);
assert.equal(deriveLocaleParts({ ...core, market: { ...macro, indexBasis: missing } }, 'ko').tripleA.checklist.conditions[1].current, '—');
assert.ok(!deriveLocaleParts({ ...core, market: { ...macro, indexBasis: missing } }, 'ko').divCase.verdictDesc.includes('이상 징후 미관측'));
assert.equal(deriveLocaleParts({ ...core, market: { ...macro, indexBasis: missing } }, 'ko').divCase.verdictTitle, 'TACTICAL INSIGHT');
assert.equal(guardianNumsFromMarket({ ...macro, indexBasis: missing }, 29).NDX_CHG, undefined);
assert.equal(basis.cash.ndx.price, null, 'M3: NQ를 NDX로 쓰지 않는다');
assert.equal(basis.cash.nasdaq.sessionDate, '2026-10-22');
assert.equal(basis.cash.nasdaq.asOf, '2026-10-22T20:00:00.000Z');
assert.equal(basis.futures.nq.asOf, '2026-10-23T01:19:00.000Z');
assert.equal(basis.futures.nq.basis, 'prior-settlement');
assert.equal(basis.futures.nq.sinceCashClosePct, null);
assert.equal(basis.futures.nq.cashCloseReferenceAt, null);
assert.match(indexContext(basis).join(' | '), /NASDAQ Composite: 26008.86 \(-2.60%\)/);
assert.match(indexContext(basis).join(' | '), /S&P 500: 7663.43 \(-1.21%\)/);
assert.match(indexContext(basis).join(' | '), /NASDAQ 100 futures: 29123.75 \(-0.06%\).*prior settlement/);
assert.ok(!indexContext(basis).join(' | ').includes('NASDAQ 100: 29123'));
for (const input of [null, { ...quote('^IXIC', 1, 1), source: 'DEFAULT' }, quote('NQ=F', 1, 1),
    quote('^IXIC', NaN, 1), quote('^IXIC', 1, 1, 'bad'), quote('^IXIC', 1, 1, '2026-10-24T20:00:00Z')]) {
    assert.equal(buildMarketIndexBasis({ nasdaq: input }, now).cash.nasdaq.changePct, null);
}
assert.equal(buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, null) }, now).cash.nasdaq.changePct, null);
assert.equal(buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, 0) }, now).cash.nasdaq.changePct, 0);
const live = buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -1, '2026-10-23T15:00:00Z') }, Date.parse('2026-10-23T15:01:00Z'));
assert.equal(live.cash.nasdaq.live, true);
const weekend = buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -1, '2026-10-23T20:00:00Z') }, Date.parse('2026-10-25T23:00:00Z'));
assert.equal(weekend.cash.nasdaq.sessionDate, '2026-10-23');
assert.equal(weekend.cash.nasdaq.live, false);
const preopen = Date.parse('2026-10-23T12:00:00Z');
assert.equal(buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -2.6) }, preopen).cash.nasdaq.sessionDate, '2026-10-22');
assert.equal(buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -2.6, '2026-10-23T11:59:00Z') }, preopen).cash.nasdaq.price, null);
const stalled = buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -2.6, '2026-10-21T20:00:00Z') }, now).cash.nasdaq;
assert.equal(stalled.price, null);
assert.equal(stalled.sessionDate, '2026-10-21');
assert.equal(buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -2.6, '2026-10-22T19:30:00Z') }, now).cash.nasdaq.price, null);
const early = buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, -1, '2026-11-27T18:00:00Z') }, Date.parse('2026-11-27T18:01:00Z'));
assert.equal(early.cash.nasdaq.live, false);
assert.equal(early.cash.nasdaq.price, 26008);
console.log('통과 H3 및 공용 세션·결측·선물 기준');

const originalLoad = (Module as any)._load;
const json = (body: unknown) => ({ json: async () => body });
let writes = 0, providerCalls = 0, prompt = '';
const articles = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, title: `Treasury yields affect markets ${i}`,
    description: 'Rates moved', published_utc: new Date().toISOString(), publisher: { name: 'fixture' } }));
const generated = articles.map(a => ({ id: a.id, headline: a.title, summaryKR: '금리 변화 관측', summaryEN: 'Rates moved', summaryJP: '金利の変化を観測',
    analysisKR: '금리 변화가 지속된다면 시장 재평가가 가능하다.', analysisEN: 'IF rates move, THEN valuations may change.', analysisJP: '金利が変化すれば評価が変わる可能性があります。' }));
const mocks: Record<string, any> = {
    'next-intl': { useTranslations: () => (key: string) => key },
    '@/services/marketIndexBasis': { loadMarketIndexBasis: async () => basis },
    'next/server': { NextResponse: { json }, after: () => {} },
    '@/services/macroHubProvider': { getMacroSnapshotSSOT: async () => macro },
    '@/services/redisClient': { getFromCache: async () => null, setInCache: async () => { writes++; } },
    '@/services/massiveClient': { CACHE_POLICY: {}, fetchMassive: async () => { providerCalls++; return { results: articles }; } },
    '@/services/bedrockClient': { MODELS: {}, callBedrock: async (args: any) => { prompt = args.userPrompt; return { text: JSON.stringify(generated) }; } },
    '@/lib/news/rss': { fetchRssPool: async () => [] },
    '@/lib/ai/creditPacing': { pacingKnobs: async () => ({}), effectiveDigestIntervalMin: () => 15 },
    '@/lib/ai/freshTier': { withFreshTier: (fn: any) => fn(), isFreshTierSkipped: () => false },
    '@/lib/news/pulseArchive': { saveToPulseArchive: async () => null },
};
(Module as any)._load = function(id: string, ...args: any[]) { return id in mocks ? mocks[id] : originalLoad.call(this, id, ...args); };
const originalFetch = global.fetch;
(async () => {
    try {
        const React = require('react');
        const { renderToStaticMarkup } = require('react-dom/server');
        const { DualGauge } = require('../src/components/guardian/MiniGauge');
        const missingGauge = renderToStaticMarkup(React.createElement(DualGauge, { priceValue: null, flowValue: 29 }));
        assert.ok(missingGauge.includes('—') && !missingGauge.includes('0.0%'));
        assert.ok(missingGauge.includes('PRICE'), '결측에도 칸과 라벨은 유지');
        const cashGauge = renderToStaticMarkup(React.createElement(DualGauge, { priceValue: guardianCashChange(macro), flowValue: 29 }));
        assert.ok(cashGauge.includes('-2.6%'));
        const { GuardianDataHub } = require('../src/services/guardian/unifiedDataStream');
        const legacy = { ...core, market: { ...macro, indexBasis: undefined }, coreAt: core.timestamp,
            verdictTargetId: null, verdictSourceId: null, divergence: { verdictDesc: 'NASDAQ -0.06%' },
            verdict: { title: 'TACTICAL INSIGHT', description: 'NASDAQ -0.06%' } };
        GuardianDataHub.computeGuardianSnapshot = async () => legacy;
        GuardianDataHub.withSharedCore = async () => ({ context: legacy, core });
        GuardianDataHub.guardVerdictOnExit = async (ctx: any) => ctx;
        const guardian = require('../src/app/api/debug/guardian/route');
        const g = await (await guardian.GET({ url: 'http://localhost/api/debug/guardian?force=false&locale=ko' })).json();
        assert.equal(g.success, true);
        assert.equal(g.data.divergence.caseId, 'D');
        assert.equal(g.data.tripleA.checklist.conditions[1].current, '-2.60%');
        assert.equal(writes, 0);
        assert.equal(providerCalls, 0);
        console.log('통과 H3 GET /api/debug/guardian — 기존 스냅샷 응답 출구·실제 게이지 결측');
        const market = require('../src/app/api/live/market/route');
        const data = await (await market.GET()).json();
        assert.equal(data.ndx.symbol, 'I:NDX');
        assert.equal(data.ndx.price, null);
        assert.equal(data.ndx.changePct, null);
        assert.equal(data.timestampET, null);
        assert.equal(data.futures.nq.symbol, 'NQ=F');
        assert.equal(data.futures.nq.price, 29123.75);
        assert.equal(data.futures.nq.asOf, basis.futures.nq.asOf);
        assert.equal(writes, 0);
        assert.equal(providerCalls, 0);
        // 실제 NDX가 주어지면 그것만 매핑된다(미래의 피드 연결에도 NQ와 혼합 없음).
        macro.indexBasis = buildMarketIndexBasis({ ndx: quote('^NDX', 28958.69, -2.88) }, now);
        const actual = await (await market.GET()).json();
        assert.equal(actual.ndx.price, 28958.69);
        assert.equal(actual.ndx.changePct, -2.88);
        macro.indexBasis = basis;
        const oldVix = macro.factors.vix.level, oldYield = macro.factors.us10y.level;
        macro.factors.vix.level = null; macro.factors.us10y.level = null;
        const missingFactors = await (await market.GET()).json();
        assert.equal(missingFactors.regime, 'NEUTRAL');
        assert.equal(missingFactors.vix.price, null);
        macro.factors.vix.level = oldVix; macro.factors.us10y.level = oldYield;
        console.log('통과 M3 GET /api/live/market');
        global.fetch = (async () => ({ ok: true, json: async () => macro })) as any;
        const news = require('../src/app/api/guardian/news-digest/route');
        const digest = await (await news.GET({ url: 'http://localhost/api/guardian/news-digest?refresh=1&locale=ko' })).json();
        assert.match(digest.marketContext, /NASDAQ Composite: 26008.86 \(-2.60%\)/);
        assert.match(digest.marketContext, /S&P 500: 7663.43 \(-1.21%\)/);
        assert.match(prompt, /NASDAQ 100 futures: 29123.75/);
        assert.match(prompt, /session 2026-10-22; as of 2026-10-22T20:00:00/);
        assert.ok(!prompt.includes('S&P 500: 7704'));
        assert.equal(providerCalls, 1, '기존 뉴스 공급사 호출만 수행');
        console.log('통과 H4 GET /api/guardian/news-digest — 실제 생성 입력');
        // 관문 P2-1: 기존 수집기의 마지막 15:59 봉도 실제 GET·AI 입력까지 유지한다.
        macro.indexBasis = buildMarketIndexBasis({
            nasdaq: quote('^IXIC', 26008.86, -2.60, '2026-10-22T19:59:00Z'),
            spx: quote('^GSPC', 7663.43, -1.21, '2026-10-22T19:59:00Z'),
        }, Date.parse('2026-10-22T21:00:00Z'));
        mocks['@/services/marketIndexBasis'].loadMarketIndexBasis = async () => macro.indexBasis;
        const closedGuardian = await (await guardian.GET({ url: 'http://localhost/api/debug/guardian?force=false&locale=ko' })).json();
        assert.equal(closedGuardian.data.divergence.caseId, 'D');
        assert.equal(closedGuardian.data.tripleA.checklist.conditions[1].current, '-2.60%');
        const closedDigest = await (await news.GET({ url: 'http://localhost/api/guardian/news-digest?refresh=1&locale=ko' })).json();
        assert.match(closedDigest.marketContext, /NASDAQ Composite: 26008.86 \(-2.60%\).*regular-session close/);
        assert.match(prompt, /session 2026-10-22; as of 2026-10-22T19:59:00/);
        assert.equal(providerCalls, 2, '각 뉴스 생성은 기존 공급사 1회만 호출');
        // 관문 P2-2: 당일 개장 시세가 15:00에도 살아 있다고 AI에 전달되지 않는다.
        macro.indexBasis = buildMarketIndexBasis({
            nasdaq: quote('^IXIC', 26008.86, -2.60, '2026-10-23T13:30:00Z'),
            spx: quote('^GSPC', 7663.43, -1.21, '2026-10-23T13:30:00Z'),
        }, Date.parse('2026-10-23T19:00:00Z'));
        const staleDigest = await (await news.GET({ url: 'http://localhost/api/guardian/news-digest?refresh=1&locale=ko' })).json();
        assert.doesNotMatch(staleDigest.marketContext, /regular session live/);
        assert.doesNotMatch(prompt, /regular session live/);
        assert.match(prompt, /regular-session observation; session 2026-10-23; as of 2026-10-23T13:30:00/);
        assert.equal(providerCalls, 3);
        macro.indexBasis = basis;
        console.log('통과 관문 P2 — 15:59 마감 보존·09:30 낡은 시세 뉴스 LIVE 금지');
    } finally { (Module as any)._load = originalLoad; global.fetch = originalFetch; }
})().catch(e => { console.error(e); process.exitCode = 1; });
