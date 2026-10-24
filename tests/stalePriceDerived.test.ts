/**
 * 감사 10/23 M7 — 마감 뒤 섹터 스냅샷 가격을 그 세션의 공식 종가로 맞추는 회귀 시험(무네트워크·환경 파일 없음). M1·M9 는 별도 재설계.
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

// 기본 «지금» = 금 10/23 10:00 ET (마지막으로 끝난 정규장 = 목 10/22).
const REAL_NOW = Date.now;
Date.now = () => Date.parse('2026-10-23T14:00:00Z');
const calendar = load('src/lib/marketCalendar.ts', {});

/** 실제 서비스 + 가짜 EOD 리더 */
function service(eod: { official?: Record<string, any> }) {
    const intrinio = {
        peekOfficialSessionClose: async (t: string, d: string, p: string) => eod.official?.[`${t}:${d}:${p}`] ?? null,
    };
    return load('src/services/stalePriceRepair.ts', { './intrinioClient': intrinio, '@/lib/marketCalendar': calendar });
}

const json = { json: (data: any) => ({ json: async () => data }) };
(async () => {
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
            'next/server': { NextResponse: json }, '@/lib/app/reportLink': { reportDate: (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null) }, '@/lib/supabase/snapshot': {}, '@/services/newsHubProvider': {}, '@/services/bedrockClient': {},
            '@/lib/ai/ladderGates': {}, '@/lib/ai/commonTerms': {}, '@/services/yahooFinanceHub': { YAHOO_CACHE_KEYS: {} }, '@/lib/net/publicBase': {},
            '@/services/redisClient': { getFromCache: async (k: string) => cache[k] ?? null, setInCache: async () => true },
            // 최신 조회의 알파 덮기(감사 H2) — 이 시험은 종가만 본다: 알파 출구는 «값 없음»으로 두어 저장 점수 그대로
            '@/services/optionAlphaService': { readOptionAlpha: async () => new Map() },
            '@/services/xsScores': { ensureXsScores: async () => {}, xsSnapshotOverride: (_t: string, s: any) => s },
            '@/services/lastKnownAlpha': { readLastKnownAlpha: async () => new Map() },
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
    await test('official close reader: bulk/history only, never the 15:57 capture', async () => {
        const c = intrinio({ date: '2026-10-23', rows: { MSFT: [525.04, 100], NEW: [6, 1] } });
        assert.deepEqual(await c.peekOfficialSessionClose('MSFT', '2026-10-22', '2026-10-21'), { close: 521.08, prevClose: 532.95 });   // 캡처가 행을 덮어도 행렬에서
        assert.equal(await c.peekOfficialSessionClose('MSFT', '2026-10-23', '2026-10-22'), null);   // 10/23 은 캡처뿐
        assert.equal(await c.peekOfficialSessionClose('NVDA', '2026-10-21', '2026-10-20'), null);   // 행렬의 0 은 결측
        assert.equal(await c.peekOfficialSessionClose('MSFT', '2026-10-22', '2026-10-20'), null);   // 이웃 날짜가 직전 거래일이 아니면 없음
        const e = await c.peekEodCloseRow('MSFT');   // 기존 계약 그대로(캡처 병합)
        assert.equal(e.date, '2026-10-23'); assert.equal(e.close, 525.04); assert.ok(Math.abs(e.prevClose - 521.08) < 1e-9);
    });
    await test('official close reader: bulk row without capture is official; existing peekEodCloseRow unchanged for a capture without prev', async () => {
        const c = intrinio({ date: '2026-10-23', rows: { ZZZ: [7, 1] } });
        const o = await c.peekOfficialSessionClose('MSFT', '2026-10-22', '2026-10-21');
        assert.equal(o.close, 521.08); assert.ok(Math.abs(o.prevClose - 532.95) < 1e-9);
        assert.equal((await c.peekEodCloseRow('ZZZ')).prevClose, 7);   // 기존 함수 결과는 바꾸지 않았다
        const d = intrinio(null);   // 캡처 없음 — 벌크 행 그대로
        assert.deepEqual(await d.peekOfficialSessionClose('MSFT', '2026-10-22', '2026-10-21'), { close: 521.08, prevClose: 521.08 - (521.08 - 532.95) });
    });

    await test('gate 9: a bulk row with chg 0 (previous close missing at load) is not taken as a 0% flat close', async () => {
        const c = intrinio(null);   // NEW: 벌크 close 5 · chg 0 · 행렬에 없음
        assert.equal(await c.peekOfficialSessionClose('NEW', '2026-10-22', '2026-10-21'), null);
        const h = history as any; h.closes.NEW = [0, 5, 5];   // 진짜 보합이면 행렬이 확인해 준다
        try { assert.deepEqual(await intrinio(null).peekOfficialSessionClose('NEW', '2026-10-22', '2026-10-21'), { close: 5, prevClose: 5 }); }
        finally { delete h.closes.NEW; }
    });

    Date.now = REAL_NOW;
    console.log(`\n${passed} passed · ${failed} failed`);
    if (failed) process.exit(1);
})();
