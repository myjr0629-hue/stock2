/**
 * 감사 10/23 M1·M7·M9 — 낡은 가격으로 계산된 파생값을 최신 종가로 맞추는 회귀 시험(무네트워크·환경 파일 없음).
 * 실제 소스(라우트·서비스·EOD 리더)를 트랜스파일해 실행하고, 외부 경계(Redis 프록시 fetch·DynamoDB·벤더)만 가짜로 둔다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(__dirname, '..');
const quiet = { log() {}, warn() {}, error() {} };
function load(rel: string, mocks: Record<string, any>, opts: { fetch?: any; strict?: boolean } = {}): any {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const mod = { exports: {} as any };
    new Function('require', 'module', 'exports', 'console', 'fetch', js)((id: string) => {
        if (id in mocks) return mocks[id];
        if (opts.strict === false) return new Proxy({}, { get: (_t, k) => (k === '__esModule' ? false : () => undefined) });
        throw new Error(`Unmocked import: ${id}`);
    }, mod, mod.exports, quiet, opts.fetch || (() => { throw new Error('Network forbidden'); }));
    return mod.exports;
}
let failed = 0, passed = 0;
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; console.log(`PASS ${name}`); }
    catch (e: any) { failed++; console.log(`FAIL ${name}: ${String(e?.message || e).split('\n')[0]}`); }
}
const at = (iso: string) => Date.parse(iso);
async function withNow<T>(ms: number, fn: () => Promise<T>): Promise<T> {
    const real = Date.now;
    Date.now = () => ms;
    try { return await fn(); } finally { Date.now = real; }
}

// 기본 «지금» = 금 10/23 10:00 ET (마지막으로 끝난 정규장 = 목 10/22). 시험마다 필요하면 withNow 로 바꾼다.
const REAL_NOW = Date.now;
Date.now = () => Date.parse('2026-10-23T14:00:00Z');
const calendar = load('src/lib/marketCalendar.ts', {});
const rebase = load('src/lib/valuationRebase.ts', { './marketCalendar': calendar });

/** 실제 서비스 + 가짜 EOD 리더 */
function service(eod: { closes?: Record<string, Record<string, number>>; latest?: Record<string, any>; official?: Record<string, any>; fund?: any }) {
    const intrinio = {
        peekCloseOn: async (t: string, d: string) => eod.closes?.[t]?.[d] ?? null,
        peekLatestCloseRow: async (t: string) => eod.latest?.[t] ?? null,
        peekOfficialSessionClose: async (t: string, d: string, p: string) => eod.official?.[`${t}:${d}:${p}`] ?? null,
    };
    return load('src/services/stalePriceRepair.ts', {
        './intrinioClient': intrinio, '@/lib/valuationRebase': rebase, '@/lib/marketCalendar': calendar,
        '@/lib/aws/dynamoDataProvider': { getFundamentalsData: async () => eod.fund ?? null },
    });
}

const json = { json: (data: any) => ({ json: async () => data }) };
const quarter = (year: number, q: number, revenue: any, income: any = 10) => ({ fiscal_year: year, fiscal_period: `Q${q}`, period_end: `${year}-${String(q * 3).padStart(2, '0')}-28`, revenue, consolidated_net_income_loss: income });
async function fundamentals(opts: { unified?: any; ratios?: any; svc?: any; swr?: any }) {
    const mocks: Record<string, any> = {
        'next/server': { NextResponse: json },
        '@/lib/incomeMetrics': require('../src/lib/incomeMetrics'),
        '@/lib/cache/redisSWR': { swrFetch: opts.swr || (async (_key: string, fn: any) => ({ data: await fn(), _cache: 'miss' })) },
        '@/lib/aws/unifiedCacheProvider': { getUnifiedCache: async () => opts.unified ?? null },
        '@/services/massiveClient': { fetchMassive: async (url: string) => ({ results: url.includes('income-statements') ? [quarter(2026, 2, 100, 30), quarter(2025, 2, 60)] : [opts.ratios || {}] }) },
    };
    if (opts.svc) mocks['@/services/stalePriceRepair'] = opts.svc;
    const route = load('src/app/api/live/fundamentals/route.ts', mocks);
    return (await route.GET({ nextUrl: new URL('https://offline.invalid/?t=NVDA') })).json();
}

// NVDA 감사 실측: 10/21 종가 221.97 기준 시총 5.349477T(24.10B주) · 10/22 종가 212.21 → 5.114T
const NVDA_LEGACY = {
    ticker: 'NVDA', score: 80, grade: 'A', pe: 27.7, ps: 17.7, pb: 23.3, fcfYield: 2.4, roe: 117.2, de: 0.15,
    revenueGrowth: 105.9, netMargin: 62, marketCap: 5349477000000, _incomeMetricsVersion: 1,
    breakdown: { pe: { value: '27.7', score: 12, label: 'P/E' }, de: { value: '0.15', score: 20, label: 'D/E' }, fcf: { value: '2.4%', score: 8, label: 'FCF' }, rev: { value: '+106%', score: 20, label: 'Rev' }, margin: { value: '62.0%', score: 20, label: 'Margin' } },
};
const EOD_1022 = { closes: { NVDA: { '2026-10-21': 221.97, '2026-10-22': 212.21 } }, latest: { NVDA: { date: '2026-10-22', close: 212.21, prevClose: 221.97, provisional: false } } };

(async () => {
    // ── 기준일 규칙 ─────────────────────────────────────────────
    await test('basis date: trading-day session read → previous trading day', () => {
        assert.equal(rebase.valuationBasisDate(at('2026-10-23T16:00:00Z')), '2026-10-22');   // 금 12:00 ET
        assert.equal(rebase.valuationBasisDate(at('2026-10-26T14:00:00Z')), '2026-10-23');   // 월 10:00 ET → 금
        assert.equal(rebase.valuationBasisDate(at('2026-10-24T15:00:00Z')), '2026-10-23');   // 토 11:00 ET → 금
    });
    await test('basis date: after close / before open is unknown (null, never invented)', () => {
        assert.equal(rebase.valuationBasisDate(at('2026-10-23T21:30:00Z')), null);   // 금 17:30 ET
        assert.equal(rebase.valuationBasisDate(at('2026-10-23T12:00:00Z')), null);   // 금 08:00 ET
        assert.equal(rebase.valuationBasisDate(at('2026-10-22T13:25:00Z')), '2026-10-21');   // 목 09:25 ET 수확 창
    });

    // ── 순수 환산 ────────────────────────────────────────────────
    const basis = rebase.makePriceBasis(NVDA_LEGACY, '2026-10-21', 221.97);
    const withBasis = { ...NVDA_LEGACY, _priceBasis: basis };
    await test('M1 NVDA: 10/21-basis values reprice to 10/22 close (5.114T · P/E 26.5)', () => {
        const r = rebase.rebaseFundamentals(withBasis, { date: '2026-10-22', close: 212.21 });
        assert.equal(Math.round(r.marketCap / 1e9), 5114);
        assert.equal(r.pe, 26.5); assert.equal(r.fcfYield, 2.5); assert.equal(r.ps, 16.9); assert.equal(r.pb, 22.3);
        assert.equal(r.score, 80); assert.equal(r.grade, 'A');
        assert.deepEqual(r._priceBasis, basis);   // 기준은 불변
        assert.equal(r.breakdown.pe.value, '26.5'); assert.equal(r.breakdown.de, NVDA_LEGACY.breakdown.de);
    });
    await test('same or older close date → identical object (no regression, no rounding drift)', () => {
        assert.equal(rebase.rebaseFundamentals(withBasis, { date: '2026-10-21', close: 221.97 }), withBasis);
        assert.equal(rebase.rebaseFundamentals(withBasis, { date: '2026-10-20', close: 230 }), withBasis);
        assert.equal(rebase.rebaseFundamentals(withBasis, null), withBasis);
    });
    await test('repricing is idempotent (always from immutable basis)', () => {
        const once = rebase.rebaseFundamentals(withBasis, { date: '2026-10-22', close: 212.21 });
        const twice = rebase.rebaseFundamentals(once, { date: '2026-10-22', close: 212.21 });
        assert.deepEqual(twice, once);
    });
    await test('split-like discontinuity (>50%) is not repriced', () => {
        assert.equal(rebase.rebaseFundamentals(withBasis, { date: '2026-10-22', close: 22.2 }), withBasis);
    });
    await test('gate regression case 14.96/3.04 keeps 52/B when price unchanged; real move rescored from raw', () => {
        const f = { score: 52, grade: 'B', pe: 15, fcfYield: 3, marketCap: 1e12, breakdown: { pe: { value: '15.0', score: 20, label: 'P/E' }, fcf: { value: '3.0%', score: 12, label: 'FCF' } } };
        const b = rebase.makePriceBasis(f, '2026-10-22', 100, { pe: 14.96, fcfYield: 3.04, marketCap: 1e12 });
        const g = { ...f, _priceBasis: b };
        assert.equal(rebase.rebaseFundamentals(g, { date: '2026-10-22', close: 100 }), g);
        const up = rebase.rebaseFundamentals(g, { date: '2026-10-23', close: 101 });   // 14.96×1.01=15.11 → 16점 · 3.04/1.01=3.01 → 12점
        assert.equal(up.score, 48); assert.equal(up.grade, 'C+'); assert.equal(up.breakdown.pe.score, 16); assert.equal(up.breakdown.fcf.score, 12);
        const down = rebase.rebaseFundamentals(g, { date: '2026-10-23', close: 99.9 });   // 14.945 · 3.043 → 점수 그대로
        assert.equal(down.score, 52); assert.equal(down.grade, 'B');
    });
    await test('gate ①: legacy rounded 15.0/3.0 record (stored 52/B from 14.96/3.04) keeps 52/B on an unchanged next close', () => {
        const f = { score: 52, grade: 'B', pe: 15, fcfYield: 3, marketCap: 1e12, breakdown: { pe: { value: '15.0', score: 20, label: 'P/E' }, fcf: { value: '3.0%', score: 12, label: 'FCF' } } };
        const g = { ...f, _priceBasis: rebase.makePriceBasis(f, '2026-10-21', 100, {}, true) };
        const same = rebase.rebaseFundamentals(g, { date: '2026-10-22', close: 100 });
        assert.equal(same.score, 52); assert.equal(same.grade, 'B'); assert.equal(same.pe, 15); assert.equal(same.breakdown.pe.score, 20); assert.equal(same.breakdown.fcf.score, 12);
        const up = rebase.rebaseFundamentals(g, { date: '2026-10-22', close: 110 });   // 실제 10 % 상승 → P/E 16.5(16점) · FCF 2.7(8점)
        assert.equal(up.score, 44); assert.equal(up.grade, 'C+');
    });
    await test('missing basis fields stay as stored; NO_DATA grade is not invented', () => {
        const f = { score: null, grade: 'NO_DATA', pe: null, marketCap: 1e9, breakdown: {} };
        const g = { ...f, _priceBasis: rebase.makePriceBasis(f, '2026-10-21', 10) };
        const r = rebase.rebaseFundamentals(g, { date: '2026-10-22', close: 11 });
        assert.equal(r.marketCap, 1.1e9); assert.equal(r.pe, null); assert.equal(r.score, null); assert.equal(r.grade, 'NO_DATA');
    });

    // ── live/fundamentals 실제 GET ───────────────────────────────
    const FUND = { pattern: 'FUND:NVDA', timestamp: at('2026-10-22T13:30:00Z'), marketCap: null, pe: 27.7, ps: 17.7, pb: 23.3, fcfYield: 2.4, de: 0.15, roe: 117.2 };
    const legacyRecord = { fundamentals: NVDA_LEGACY, timestamp: at('2026-10-23T13:58:00Z') };
    await test('M1 route: legacy DynamoDB record matching the harvest record is based on its read time and repriced', async () => {
        const d = await fundamentals({ unified: legacyRecord, svc: service({ ...EOD_1022, fund: FUND }) });
        assert.equal(Math.round(d.marketCap / 1e9), 5114); assert.equal(d.pe, 26.5);
        assert.equal(d._priceBasis.date, '2026-10-21'); assert.equal(d._priceBasis.inferred, true); assert.equal(d._source, 'dynamodb');
        assert.equal(d.score, 80); assert.equal(d.grade, 'A'); assert.equal(d.roe, 117.2);
    });
    await test('gate ②: preserved older fundamentals (harvest record differs) are not given a guessed basis', async () => {
        const newer = { ...FUND, pe: 26.5, ps: 16.9, pb: 22.3, fcfYield: 2.5 };
        const d = await fundamentals({ unified: legacyRecord, svc: service({ ...EOD_1022, fund: newer }) });
        assert.equal(d._priceBasis, undefined);
        for (const k of ['pe', 'ps', 'pb', 'fcfYield', 'marketCap', 'score', 'grade']) assert.equal(d[k], (NVDA_LEGACY as any)[k], k);
        const none = await fundamentals({ unified: legacyRecord, svc: service({ ...EOD_1022 }) });
        assert.equal(none._priceBasis, undefined); assert.equal(none.pe, 27.7);
    });
    await test('M1 route: without EOD closes the stored values are returned unchanged (no blanks)', async () => {
        const d = await fundamentals({ unified: legacyRecord, svc: service({ fund: FUND }) });
        for (const k of ['pe', 'ps', 'pb', 'fcfYield', 'marketCap', 'score', 'grade']) assert.equal(d[k], (NVDA_LEGACY as any)[k], k);
    });
    await test('M1 route: when the repair module is unavailable the old behavior is kept', async () => {
        const d = await fundamentals({ unified: legacyRecord });
        assert.equal(d.pe, 27.7); assert.equal(d.marketCap, 5349477000000); assert.equal(d._priceBasis, undefined);
    });
    const ratios = { price_to_earnings: 14.96, debt_to_equity: 0.5, return_on_equity: 0.2, price_to_book: 3.33, price_to_sales: 4.44, free_cash_flow: 30.4e9, market_cap: 1e12 };
    await test('M1 route fresh read: raw basis keeps the original score (gate 52/B case) and reprices after the next close', async () => {
        const fri12 = at('2026-10-23T16:00:00Z');
        const base = await withNow(fri12, () => fundamentals({ ratios }));   // 수리 모듈 없음 = 기존 동작
        const eod1022 = { closes: { NVDA: { '2026-10-22': 100 } }, latest: { NVDA: { date: '2026-10-22', close: 100, prevClose: 99 } } };
        const same = await withNow(fri12, () => fundamentals({ ratios, svc: service(eod1022) }));
        for (const k of ['score', 'grade', 'pe', 'fcfYield', 'marketCap', 'ps', 'pb']) assert.equal(same[k], base[k], k);
        assert.deepEqual(same.breakdown, base.breakdown);
        assert.equal(same._priceBasis.pe, 14.96); assert.equal(same._priceBasis.date, '2026-10-22'); assert.equal(same._priceBasis.inferred, undefined);
        const { _cache, ...stored } = same;
        const eod1023 = { latest: { NVDA: { date: '2026-10-23', close: 110, prevClose: 100 } } };
        const swr = async () => ({ data: stored, _cache: 'hit' });
        const before = await withNow(at('2026-10-23T19:58:00Z'), () => fundamentals({ svc: service(eod1023), swr }));   // 15:58 ET — 마감 전 캡처는 안 쓴다
        assert.equal(before.pe, base.pe); assert.equal(before.marketCap, base.marketCap);
        const next = await withNow(at('2026-10-23T21:00:00Z'), () => fundamentals({ svc: service(eod1023), swr }));
        assert.equal(next.marketCap, 1.1e12); assert.equal(next.pe, 16.5);
        assert.equal(next.score, base.score - 4 - 4);   // P/E 20→16 · FCF 12(3.04)→8(2.76)
    });
    await test('M1 route fresh read after close: basis unknown → not stamped, values unchanged', async () => {
        const d = await withNow(at('2026-10-23T21:30:00Z'), () => fundamentals({ ratios, svc: service({ closes: { NVDA: { '2026-10-22': 100, '2026-10-23': 110 } }, latest: { NVDA: { date: '2026-10-23', close: 110, prevClose: 100 } } }) }));
        assert.equal(d._priceBasis, undefined); assert.equal(d.marketCap, 1e12); assert.equal(d.pe, 15);
    });
    await test('M1 route: cached (SWR) payload with basis is repriced at response time, stored payload untouched', async () => {
        const stored = { ...NVDA_LEGACY, _priceBasis: basis, _source: 'dynamodb' };
        const frozen = JSON.stringify(stored);
        const d = await fundamentals({ svc: service(EOD_1022), swr: async () => ({ data: stored, _cache: 'hit' }) });
        assert.equal(d.pe, 26.5); assert.equal(d._cache, 'hit'); assert.equal(JSON.stringify(stored), frozen);
    });

    // ── M9 연관 종목 ─────────────────────────────────────────────
    const rel = { topRelated: [{ ticker: 'GOOGL', price: 344.73, change: 1.22, prevClose: 340.58, logo: null }, { ticker: 'AMZN', price: 252.36, change: 0, prevClose: 0, logo: null }, { ticker: 'XYZ', price: 50, change: 1, prevClose: 49.5 }], relatedTickers: ['GOOGL', 'AMZN', 'XYZ'], _source: 'dynamodb' };
    const relSvc = service({ latest: { GOOGL: { date: '2026-10-22', close: 324.22, prevClose: 334.76 }, AMZN: { date: '2026-10-22', close: 251.1, prevClose: 255 }, XYZ: { date: '2026-10-22', close: 51, prevClose: null } } });
    await test('M9: 3-day-old unified related prices take the latest regular close/change', async () => {
        const r = await relSvc.repriceRelated(rel, at('2026-10-19T18:00:00Z'));
        assert.deepEqual(r.topRelated[0], { ticker: 'GOOGL', price: 324.22, change: -3.15, prevClose: 334.76, logo: null });
        assert.equal(r.topRelated[1].prevClose, 255); assert.equal(r.topRelated[1].change, -1.53);
        assert.deepEqual(r.topRelated[2], rel.topRelated[2]);   // 직전 종가를 모르는 행은 그대로
        assert.deepEqual(r.relatedTickers, rel.relatedTickers);
    });
    await test('M9: cache made after the latest close (e.g. intraday next session) is kept', async () => {
        assert.equal(await relSvc.repriceRelated(rel, at('2026-10-23T14:00:00Z')), rel);    // 금 10:00 ET > 목 16:00 ET
        assert.equal(await relSvc.repriceRelated(rel, at('2026-10-22T20:30:00Z')), rel);    // 목 16:30 ET
        assert.notEqual(await relSvc.repriceRelated(rel, at('2026-10-22T19:30:00Z')), rel); // 목 15:30 ET(마감 전)
        assert.equal(await relSvc.repriceRelated(rel, NaN), rel);
    });

    await test('gate ③: a related row refilled in the next session (prevClose = latest close) is kept despite an old edition timestamp', async () => {
        const filled = { topRelated: [{ ticker: 'GOOGL', price: 330.1, change: 1.81, prevClose: 324.22 }] };
        assert.equal(await relSvc.repriceRelated(filled, at('2026-10-19T18:00:00Z')), filled);
        const sameSession = { topRelated: [{ ticker: 'GOOGL', price: 330.1, change: -1.39, prevClose: 334.76 }] };   // 10/22 장중 값 → 10/22 종가
        assert.equal((await relSvc.repriceRelated(sameSession, at('2026-10-23T14:00:00Z'))).topRelated[0].price, 324.22);
    });
    await test('gate ⑤: before the close a same-day 15:57 capture is never applied (M9 and M1)', async () => {
        const svc = service({ latest: { GOOGL: { date: '2026-10-23', close: 330, prevClose: 324.22, provisional: true } } });
        const stale = { topRelated: [{ ticker: 'GOOGL', price: 344.73, change: 1.22, prevClose: 340.58 }] };
        assert.equal(await withNow(at('2026-10-23T19:58:00Z'), () => svc.repriceRelated(stale, at('2026-10-23T19:50:00Z'))), stale);
        const after = await withNow(at('2026-10-23T20:30:00Z'), () => svc.repriceRelated(stale, at('2026-10-23T19:50:00Z')));
        assert.equal(after.topRelated[0].price, 330);
    });
    await test('unified exit: cached edition reprices fundamentals (basis) and related (pre-close) together; fresh edition untouched', async () => {
        const svc = service({ ...EOD_1022, latest: { ...EOD_1022.latest, GOOGL: { date: '2026-10-22', close: 324.22, prevClose: 334.76 } } });
        const edition = { ticker: 'NVDA', timestamp: at('2026-10-19T18:00:00Z'), fundamentals: { ...NVDA_LEGACY, _priceBasis: basis }, related: { topRelated: [{ ticker: 'GOOGL', price: 344.73, change: 1.22, prevClose: 340.58 }] }, structure: { x: 1 } };
        const out = await svc.repriceCachedDerived(edition, 'NVDA');
        assert.equal(out.fundamentals.pe, 26.5); assert.equal(out.related.topRelated[0].price, 324.22); assert.equal(out.structure, edition.structure);
        assert.equal(edition.fundamentals.pe, 27.7);   // 입력 판본은 그대로
        const fresh = { ...edition, timestamp: at('2026-10-23T14:00:00Z'), fundamentals: NVDA_LEGACY };
        assert.equal(await svc.repriceCachedDerived(fresh, 'NVDA'), fresh);
    });

    // ── M7 섹터 스냅샷 ───────────────────────────────────────────
    const snapshotData = () => ({
        meta: { snapshot_timestamp: '2026-10-22T21:30:00.000Z', sector: 'm7', locked_until: '2026-10-23T21:00:00.000Z' },
        tickers: [
            { ticker: 'MSFT', close_price: 521.62, change_pct: -2.13, call_wall: 540, put_floor: 520, gamma_regime: 'LONG', alpha_score: 40 },
            { ticker: 'AAPL', close_price: 348.32, change_pct: 1.26, call_wall: 350, put_floor: 330, gamma_regime: 'LONG', alpha_score: 60 },
            { ticker: 'NVDA', close_price: 212.5, change_pct: -4.27, call_wall: 230, put_floor: 200, gamma_regime: 'SHORT', alpha_score: 30 },
        ],
        sector_summary: { avg_alpha: 43, gainers: 1, losers: 2, dominant_regime: 'LONG', avg_pcr: 0.9, total_gex: 1, outlook: 'NEUTRAL', next_day_briefing_kr: 'old', briefing: { headline: 'old', headlineEN: 'old', headlineJP: 'old', bullets: [], bulletsEN: [], bulletsJP: [], watchpoints: [], watchpointsEN: [], watchpointsJP: [] } },
    });
    const official = { 'MSFT:2026-10-22:2026-10-21': { close: 521.08, prevClose: 532.95 }, 'AAPL:2026-10-22:2026-10-21': { close: 348.22, prevClose: 343.99 } };
    async function snapshotGet(data: any, svc: any) {
        const cache: Record<string, any> = { 'snapshot:m7:latest': { data_json: data, snapshot_date: '2026-10-22', created_at: data.meta.snapshot_timestamp } };
        const route = load('src/app/api/intel/snapshot/route.ts', {
            'next/server': { NextResponse: json }, '@/lib/supabase/snapshot': {}, '@/services/newsHubProvider': {}, '@/services/bedrockClient': {},
            '@/lib/ai/ladderGates': {}, '@/lib/ai/commonTerms': {}, '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: {} }, '@/lib/net/publicBase': {},
            '@/services/redisClient': { getFromCache: async (k: string) => cache[k] ?? null, setInCache: async () => true },
            ...(svc ? { '@/services/stalePriceRepair': svc } : {}),
        });
        return (await route.GET(new Request('https://offline.invalid/api/intel/snapshot?sector=m7'))).json();
    }
    await test('M7: post-close snapshot takes the official session close once loaded (MSFT 521.08 / −2.23)', async () => {
        const data = snapshotData();
        const frozen = JSON.stringify(data);
        const r = await snapshotGet(data, service({ official }));
        const by = Object.fromEntries(r.snapshot.tickers.map((t: any) => [t.ticker, t]));
        assert.equal(by.MSFT.close_price, 521.08); assert.equal(by.MSFT.change_pct, -2.23);
        assert.ok(by.MSFT.analysis_kr.startsWith('▼ -2.23%')); assert.equal(typeof by.MSFT.verdict, 'string');
        assert.equal(by.NVDA.analysis_kr, undefined);   // 공식 종가가 없는 행은 저장 그대로
        assert.equal(by.AAPL.close_price, 348.22); assert.equal(by.AAPL.change_pct, 1.23);
        assert.equal(by.NVDA.close_price, 212.5); assert.equal(by.NVDA.change_pct, -4.27);   // 공식 종가 없음 → 저장값
        assert.equal(r.snapshot.sector_summary.gainers, 1); assert.equal(r.snapshot.sector_summary.losers, 2);
        assert.ok(r.snapshot.sector_summary.next_day_briefing_kr.includes('+1.23%'));
        assert.ok(!r.snapshot.sector_summary.next_day_briefing_kr.includes('1.26'));
        assert.equal(r.snapshot.meta.close_basis, 'official');
        assert.equal(JSON.stringify(data), frozen);   // 저장본(캐시 객체)은 바꾸지 않는다
    });
    await test('M7: no official close yet / intraday snapshot / module unavailable → stored snapshot as before', async () => {
        const base = await snapshotGet(snapshotData(), null);
        assert.deepEqual(await snapshotGet(snapshotData(), service({})), base);
        const intraday = snapshotData(); intraday.meta.snapshot_timestamp = '2026-10-22T18:00:00.000Z';
        const ri = await snapshotGet(intraday, service({ official }));
        assert.equal(ri.snapshot.tickers[0].close_price, 521.62); assert.equal(ri.snapshot.sector_summary.next_day_briefing_kr, 'old');
        assert.equal(base.snapshot.tickers[0].close_price, 521.62);
    });

    // ── EOD 리더(실제 intrinioClient) ─────────────────────────────
    const eodPayload = { date: '2026-10-22', prevDate: '2026-10-21', rows: [['MSFT', 1, 1, 1, 521.08, 10, 521.08 - 532.95, -2.23], ['NEW', 1, 1, 1, 5, 10, 0, 0]] };
    const history = { dates: ['2026-10-20', '2026-10-21', '2026-10-22'], closes: { MSFT: [530, 532.95, 521.08], NVDA: [0, 221.97, 212.21] } };
    function intrinio(sessionClose: any) {
        const fake = async (url: string) => {
            const key = decodeURIComponent(String(url).split('key=')[1] || '');
            const body = key === 'intrinio:eod:snapshot' ? eodPayload : key === 'intrinio:eod:sessionclose' ? sessionClose : key === 'intrinio:eod:history' ? history : null;
            return { ok: body != null, json: async () => ({ result: JSON.stringify(body) }) };
        };
        return load('src/services/intrinioClient.ts', { '@/lib/marketCalendar': calendar, './redisClient': { getFromCache: async () => null, setInCache: async () => true } }, { fetch: fake, strict: false });
    }
    await test('EOD readers: official close uses bulk/history, never the 15:57 capture; capture without prev has no prevClose', async () => {
        const c = intrinio({ date: '2026-10-23', rows: { MSFT: [525.04, 100], NEW: [6, 1] } });
        assert.deepEqual(await c.peekOfficialSessionClose('MSFT', '2026-10-22', '2026-10-21'), { close: 521.08, prevClose: 532.95 });   // 캡처가 행을 덮어도 행렬에서
        assert.equal(await c.peekOfficialSessionClose('MSFT', '2026-10-23', '2026-10-22'), null);   // 10/23 은 캡처뿐
        assert.equal(await c.peekCloseOn('NVDA', '2026-10-21'), 221.97);
        assert.equal(await c.peekCloseOn('NVDA', '2026-10-20'), null);   // 행렬의 0 은 결측
        const m = await c.peekLatestCloseRow('MSFT');
        assert.equal(m.date, '2026-10-23'); assert.equal(m.provisional, true); assert.ok(Math.abs(m.prevClose - 521.08) < 1e-9);
        assert.equal((await c.peekLatestCloseRow('NEW')).prevClose, 5);
        const e = await c.peekEodCloseRow('MSFT');   // 기존 계약 그대로
        assert.equal(e.date, '2026-10-23'); assert.equal(e.close, 525.04);
    });
    await test('gate ④: basis close prefers the official history over a same-day capture', async () => {
        const c = intrinio({ date: '2026-10-23', rows: { MSFT: [525.04, 100] } });
        const h = history as any; h.dates.push('2026-10-23'); h.closes.MSFT.push(526); h.closes.NVDA.push(0);
        try { assert.equal(await c.peekCloseOn('MSFT', '2026-10-23'), 526); assert.equal(await c.peekCloseOn('NVDA', '2026-10-23'), null); }
        finally { h.dates.pop(); h.closes.MSFT.pop(); h.closes.NVDA.pop(); }
        const d = intrinio({ date: '2026-10-23', rows: { MSFT: [525.04, 100] } });
        assert.equal(await d.peekCloseOn('MSFT', '2026-10-23'), 525.04);   // 공식이 없을 때만 캡처
    });
    await test('EOD readers: bulk row without capture is official; capture row with unknown prev → prevClose null', async () => {
        const c = intrinio({ date: '2026-10-23', rows: { ZZZ: [7, 1] } });
        const o = await c.peekOfficialSessionClose('MSFT', '2026-10-22', '2026-10-21');
        assert.equal(o.close, 521.08); assert.ok(Math.abs(o.prevClose - 532.95) < 1e-9);
        assert.equal((await c.peekLatestCloseRow('ZZZ')).prevClose, null);
        assert.equal((await c.peekEodCloseRow('ZZZ')).prevClose, 7);   // 기존 함수 결과는 바꾸지 않았다
    });

    Date.now = REAL_NOW;
    console.log(`\n${passed} passed · ${failed} failed`);
    if (failed) process.exit(1);
})();
