/** H3/H4/M3: 감사 수치와 실제 GET 매핑을 재생. 외부 통신·운영 쓰기 없음. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildMarketIndexBasis, guardianCashChange, indexContext } from '@/lib/marketIndexBasis';
import { guardianNumsFromMarket } from '@/lib/ai/guardianNumbers';
import { deriveLocaleParts, VERDICT_TEXTS, withCashIndexBasis } from '@/services/guardian/guardianCore';

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
assert.equal(guardianNumsFromMarket(macro, 29.2).NDX_CHG, -0.06);
assert.equal(guardianNumsFromMarket(macro, 29.2).SPX_CHG, 0);
assert.equal(guardianCashChange({}), null);
const missing = buildMarketIndexBasis({}, now);
// 3차 관문: 결측은 기존 입력(-0.06)을 써서 origin/main과 같은 판정을 낸다.
for (const locale of ['ko', 'en', 'ja'] as const) {
    const missingCore = { ...core, market: { ...macro, nqChangePercent: -1, indexBasis: missing } };
    const parts = deriveLocaleParts(missingCore, locale);
    assert.equal(parts.divCase.caseId, 'D', '결측을 동기화로 단정하지 않는다');
    assert.match(parts.divCase.verdictDesc, /-1.00%/);
    assert.equal(parts.tripleA.checklist.conditions[1].current, '-1.00%');
    assert.equal(guardianCashChange(missingCore.market), null, '원천 null 자체는 보존');
    const zero = buildMarketIndexBasis({ nasdaq: quote('^IXIC', 26008, 0) }, now);
    assert.equal(deriveLocaleParts({ ...core, market: { ...macro, indexBasis: zero } }, locale).tripleA.checklist.conditions[1].current, '0.00%');
}
assert.equal(guardianNumsFromMarket({ ...macro, indexBasis: missing }, 29).NDX_CHG, -0.06);
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
        const missingGauge = renderToStaticMarkup(React.createElement(DualGauge, { priceValue: 0, flowValue: 65 }));
        assert.ok(missingGauge.includes('+0.0%') && missingGauge.includes('bullMomentum'));
        assert.ok(missingGauge.includes('#10b981') && missingGauge.includes('stroke-dasharray="40 '));
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
        // 같은 coreAt의 기존 응답도 결측 원천과 기존 문구 템플릿을 함께 유지한다.
        mocks['@/services/marketIndexBasis'].loadMarketIndexBasis = async () => missing;
        for (const locale of ['ko', 'en', 'ja'] as const) {
            const response = await (await guardian.GET({ url: `http://localhost/api/debug/guardian?force=false&locale=${locale}` })).json();
            assert.equal(response.success, true);
            assert.equal(response.data.market.indexBasis.cash.nasdaq.changePct, null);
            assert.equal(response.data.divergence.verdictTitle, 'MARKET SYNCHRONIZED');
            assert.match(response.data.divergence.verdictDesc, /NASDAQ -0.06%/);
            assert.match(response.data.divergence.verdictDesc, /RLSI 29/);
            assert.equal(response.data.tripleA.checklist.conditions[1].passed, false);
        }
        mocks['@/services/marketIndexBasis'].loadMarketIndexBasis = async () => basis;
        assert.equal(writes, 0);
        assert.equal(providerCalls, 0, '결측 응답 재판정에 공급사 호출을 추가하지 않는다');
        console.log('통과 H3 GET /api/debug/guardian — 기존 스냅샷 응답 출구·실제 게이지 결측');
        // 관문 P2-1: 기존 수집기의 마지막 15:59 봉도 실제 GET·AI 입력까지 유지한다.
        macro.indexBasis = buildMarketIndexBasis({
            nasdaq: quote('^IXIC', 26008.86, -2.60, '2026-10-22T19:59:00Z'),
            spx: quote('^GSPC', 7663.43, -1.21, '2026-10-22T19:59:00Z'),
        }, Date.parse('2026-10-22T21:00:00Z'));
        mocks['@/services/marketIndexBasis'].loadMarketIndexBasis = async () => macro.indexBasis;
        const closedGuardian = await (await guardian.GET({ url: 'http://localhost/api/debug/guardian?force=false&locale=ko' })).json();
        assert.equal(closedGuardian.data.divergence.caseId, 'D');
        assert.equal(closedGuardian.data.tripleA.checklist.conditions[1].current, '-2.60%');
        // 관문 P2-2: 당일 개장 시세가 15:00에도 살아 있다고 AI에 전달되지 않는다.
        macro.indexBasis = buildMarketIndexBasis({
            nasdaq: quote('^IXIC', 26008.86, -2.60, '2026-10-23T13:30:00Z'),
            spx: quote('^GSPC', 7663.43, -1.21, '2026-10-23T13:30:00Z'),
        }, Date.parse('2026-10-23T19:00:00Z'));
        macro.indexBasis = basis;
        console.log('통과 관문 P2 — 15:59 마감 보존(가디언)');
    } finally { (Module as any)._load = originalLoad; global.fetch = originalFetch; }
})().catch(e => { console.error(e); process.exitCode = 1; });
