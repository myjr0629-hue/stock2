/**
 * 감사 10/23 M7·M9 — 낡은 가격으로 계산된 파생값을 최신 공식 종가로 맞추는 회귀 시험(무네트워크·환경 파일 없음). M1 은 별도 재설계.
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

/** 실제 서비스 + 가짜 EOD 리더 */
function service(eod: { latest?: Record<string, any>; official?: Record<string, any> }) {
    const intrinio = {
        peekLatestCloseRow: async (t: string) => eod.latest?.[t] ?? null,
        peekOfficialSessionClose: async (t: string, d: string, p: string) => eod.official?.[`${t}:${d}:${p}`] ?? null,
    };
    return load('src/services/stalePriceRepair.ts', { './intrinioClient': intrinio, '@/lib/marketCalendar': calendar });
}

const json = { json: (data: any) => ({ json: async () => data }) };
(async () => {
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
    await test('gate ⑤/5-①: a 15:57 capture is never used as the latest close (before or after the close)', async () => {
        const svc = service({ latest: { GOOGL: { date: '2026-10-23', close: 330, prevClose: 324.22, provisional: true } } });
        const stale = { topRelated: [{ ticker: 'GOOGL', price: 344.73, change: 1.22, prevClose: 340.58 }] };
        assert.equal(await withNow(at('2026-10-23T19:58:00Z'), () => svc.repriceRelated(stale, at('2026-10-23T19:50:00Z'))), stale);
        assert.equal(await withNow(at('2026-10-23T20:30:00Z'), () => svc.repriceRelated(stale, at('2026-10-23T19:50:00Z'))), stale);
    });
    await test('unified exit: cached edition reprices related only (fundamentals untouched — M1 out of scope); fresh edition untouched', async () => {
        const svc = service({ latest: { GOOGL: { date: '2026-10-22', close: 324.22, prevClose: 334.76 } } });
        const fundamentals = { pe: 27.7, marketCap: 5349477000000, score: 80, grade: 'A' };
        const edition = { ticker: 'NVDA', timestamp: at('2026-10-19T18:00:00Z'), fundamentals, related: { topRelated: [{ ticker: 'GOOGL', price: 344.73, change: 1.22, prevClose: 340.58 }] }, structure: { x: 1 } };
        const out = await svc.repriceCachedDerived(edition, 'NVDA');
        assert.equal(out.related.topRelated[0].price, 324.22); assert.equal(out.fundamentals, fundamentals); assert.equal(out.structure, edition.structure);
        assert.equal(edition.related.topRelated[0].price, 344.73);   // 입력 판본은 그대로
        const fresh = { ...edition, timestamp: at('2026-10-23T14:00:00Z') };
        assert.equal(await svc.repriceCachedDerived(fresh, 'NVDA'), fresh);
        const noRelated = { fundamentals, timestamp: 1 };
        assert.equal(await svc.repriceCachedDerived(noRelated, 'NVDA'), noRelated);
    });
    await test('gate 2-③: tiny move day (100 → 100.05) — a same-session intraday row is still replaced by the close', async () => {
        const svc = service({ latest: { TINY: { date: '2026-10-22', close: 100.05, prevClose: 100 } } });
        const r = await svc.repriceRelated({ topRelated: [{ ticker: 'TINY', price: 105, change: 5, prevClose: 100 }] }, at('2026-10-22T18:00:00Z'));
        assert.equal(r.topRelated[0].price, 100.05); assert.equal(r.topRelated[0].change, 0.05);
        const nextSession = { topRelated: [{ ticker: 'TINY', price: 101, change: 0.95, prevClose: 100.05 }] };
        assert.equal(await svc.repriceRelated(nextSession, at('2026-10-19T18:00:00Z')), nextSession);
    });

    await test('gate 4-③: flat day (previous two closes equal) keeps a next-session refilled row instead of overwriting it', async () => {
        const svc = service({ latest: { FLAT: { date: '2026-10-22', close: 100, prevClose: 100 } } });
        const row = { topRelated: [{ ticker: 'FLAT', price: 105, change: 5, prevClose: 100 }] };
        assert.equal(await svc.repriceRelated(row, at('2026-10-19T18:00:00Z')), row);
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
        const m = await c.peekLatestCloseRow('MSFT');
        assert.equal(m.date, '2026-10-23'); assert.equal(m.provisional, true); assert.ok(Math.abs(m.prevClose - 521.08) < 1e-9);
        assert.equal((await c.peekLatestCloseRow('NEW')).prevClose, 5);
        const e = await c.peekEodCloseRow('MSFT');   // 기존 계약 그대로
        assert.equal(e.date, '2026-10-23'); assert.equal(e.close, 525.04);
    });
    await test('gate 2-②: latest close row prefers the official close once the history has that date', async () => {
        const h = history as any; h.dates.push('2026-10-23'); h.closes.MSFT.push(526); h.closes.NVDA.push(0);
        try {
            const c = intrinio({ date: '2026-10-23', rows: { MSFT: [525.04, 100] } });
            const m = await c.peekLatestCloseRow('MSFT');
            assert.equal(m.close, 526); assert.equal(m.provisional, false); assert.equal(m.date, '2026-10-23');
        } finally { h.dates.pop(); h.closes.MSFT.pop(); h.closes.NVDA.pop(); }
    });
    await test('gate 3-②: bulk two sessions behind — official close and previous close both come from the history', async () => {
        const saved = JSON.parse(JSON.stringify(eodPayload));
        const h = history as any;
        Object.assign(eodPayload, { date: '2026-10-20', prevDate: '2026-10-19', rows: [['NVDA', 1, 1, 1, 220, 10, 2, 0.9]] });
        try {
            const c = intrinio({ date: '2026-10-22', rows: { NVDA: [212.5, 100] } });
            const n = await c.peekLatestCloseRow('NVDA');
            assert.equal(n.date, '2026-10-22'); assert.equal(n.close, 212.21); assert.equal(n.prevClose, 221.97); assert.equal(n.provisional, false);
            assert.equal(Math.round(((n.close - n.prevClose) / n.prevClose) * 10000) / 100, -4.4);
        } finally { Object.assign(eodPayload, saved); void h; }
    });
    await test('gate 4-②: bulk one session behind and no capture — the history\'s newer official close is the latest', async () => {
        const saved = JSON.parse(JSON.stringify(eodPayload));
        Object.assign(eodPayload, { date: '2026-10-21', prevDate: '2026-10-20', rows: [['NVDA', 1, 1, 1, 221.97, 10, 1.97, 0.9]] });
        try {
            const c = intrinio(null);
            const n = await c.peekLatestCloseRow('NVDA');
            assert.equal(n.date, '2026-10-22'); assert.equal(n.close, 212.21); assert.equal(n.prevClose, 221.97); assert.equal(n.provisional, false);
            const svc = load('src/services/stalePriceRepair.ts', { './intrinioClient': c, '@/lib/marketCalendar': calendar });
            const r = await svc.repriceRelated({ topRelated: [{ ticker: 'NVDA', price: 225, change: 1.4, prevClose: 221.9 }] }, at('2026-10-22T15:00:00Z'));
            assert.equal(r.topRelated[0].price, 212.21); assert.equal(r.topRelated[0].change, -4.4);
        } finally { Object.assign(eodPayload, saved); }
    });
    await test('gate 7: a same-day capture does not hide the last closed session\'s official close (15:58 ET, MSFT 521.08); after the close it waits for the official close', async () => {
        const c = intrinio({ date: '2026-10-23', rows: { MSFT: [525.04, 100] } });
        const svc = load('src/services/stalePriceRepair.ts', { './intrinioClient': c, '@/lib/marketCalendar': calendar });
        const r = await withNow(at('2026-10-23T19:58:00Z'), () => svc.repriceRelated({ topRelated: [{ ticker: 'MSFT', price: 550, change: 1, prevClose: 544.5 }] }, at('2026-10-21T15:00:00Z')));
        assert.equal(r.topRelated[0].price, 521.08); assert.equal(r.topRelated[0].change, -2.23);
        const stale = { topRelated: [{ ticker: 'MSFT', price: 550, change: 1, prevClose: 544.5 }] };
        assert.equal(await withNow(at('2026-10-23T20:30:00Z'), () => svc.repriceRelated(stale, at('2026-10-21T15:00:00Z'))), stale);   // 마감 뒤 10/23 공식 종가 전: 캡처로 덮지 않고 그대로
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
