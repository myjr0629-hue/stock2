/** Offline regressions for integrity audit 2, Flow IDs 01–04.
 * Executes the page's actual expressions and fetch effect with mocked responses.
 * No browser, network, environment file, Redis, or database access.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { calcPriceDisplay } from '../src/utils/calcPriceDisplay';
import { putCallRatio, cpText, pcBiasOf, PC_AI_DEFINITION } from '../src/lib/app/flowPcRatio';
import { renderToStaticMarkup } from 'react-dom/server';
import { activeOptionRows, optionChainVolumes } from '../src/lib/optionDisplayGate';
import { selectWhaleSession } from '../src/lib/app/flowWhaleSession';

const source = fs.readFileSync('src/app/[locale]/app-view/flow/page.tsx', 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.VariableDeclaration>();
let fetchEffect = '';
function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && !declarations.has(node.name.text)) declarations.set(node.name.text, node);
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.getText(ast).includes('async function fetchFlow()')) {
        fetchEffect = node.arguments[0].getText(ast);
    }
    ts.forEachChild(node, visit);
}
visit(ast);
function run(code: string, context: Record<string, any>) {
    const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    return vm.runInNewContext(js, context);
}
function value(name: string, context: Record<string, any> = {}) {
    const init = declarations.get(name)?.initializer;
    assert.ok(init, `page declaration ${name}`);
    return run(`(${init.getText(ast)})`, { useMemo: (fn: () => any) => fn(), activeOptionRows: (rows: any[]) => activeOptionRows(rows, REG_NOW), optionChainVolumes, optionSampleOk: true, ...context });
}
function functionOf(name: string) {
    const fn = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(fn, `page function ${name}`);
    return run(`${fn.getText(ast)}; ${name}`, {});
}
function volumes(ticker: string, data: any) {
    const rawChain = value('rawChain', { ticker, tickerData: data });
    return value('chainVolumes', { rawChain });
}
function pcContext(totals: any) {
    const ctx: Record<string, any> = { chainVolumes: totals, putCallRatio, cpText, pcBiasOf };
    for (const name of ['pcCallVol', 'pcPutVol', 'callPct', 'pcRatio', 'pcKnown', 'pcText', 'cpVol']) ctx[name] = value(name, ctx);
    return ctx;
}
const contract = (type: string, volume: number, expiry = '2026-10-23') => ({
    details: { contract_type: type, strike_price: 100, expiration_date: expiry },
    day: { volume, close: 2 }, last_quote: { midpoint: 2 }, greeks: { delta: 0.7 },
});
/** 실제 체결 필드(last_trade: 체결 시각·가격·수량)가 붙은 계약 */
const traded = (c: any, iso: string, price: number, size: number) => ({
    ...c, details: { ...c.details, ticker: `O:A${iso.slice(0, 10)}${c.details.contract_type}` },
    last_trade: { price, size, sip_timestamp: Date.parse(iso) * 1e6 },
});
const whaleContext = (items: any[], chain: any[] = []) => ({ whaleTradesFeed: items, rawChain: chain, WHALE_PREMIUM_FLOOR: 50_000 });
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise<void>(r => setImmediate(r)); };
const REG_NOW = Date.parse('2026-10-16T15:00:00Z'); // Friday 11:00 ET

async function fetchHarness(initial: Record<string, any>, data: any, overrides: Record<string, any> = {}) {
    const state = { ...initial };
    let refresh: () => void = () => {};
    const context: Record<string, any> = {
        ticker: data.ticker, initialLoadRef: { current: true }, AbortController,
        FLOW_TICKER_TTFB_MS: 10000, FLOW_QUICK_RETRIES: 0, FLOW_QUICK_RETRY_MS: 100,
        ivHistoryUnavailable: () => true, ivRankIsCollecting: () => false,
        window: { setTimeout: () => 1, clearTimeout: () => {} },
        setInterval: (fn: () => void) => { refresh = fn; return 1; }, clearInterval: () => {},
        fetchWithTtfbLimit: async () => ({ ok: true, json: async () => data }),
        fetch: async () => ({ ok: true, json: async () => ({ items: [], unavailable: true }) }),
        selectWhaleSession: (data: any, session: string) => selectWhaleSession(data, session, REG_NOW),
        ...overrides,
    };
    // Capture every React setter used by this effect, including future ones.
    for (const setter of fetchEffect.match(/\bset[A-Z]\w*/g) ?? []) {
        if (setter === 'setInterval' || setter === 'setTimeout') continue;
        const key = setter[3].toLowerCase() + setter.slice(4);
        context[setter] = (next: any) => { state[key] = typeof next === 'function' ? next(state[key]) : next; };
    }
    const cleanup = run(`(${fetchEffect})()`, context);
    await settle();
    return { state, context, cleanup, refresh: async () => { refresh(); await settle(); } };
}

// Execute the real API route with in-memory dependencies only.
async function whaleApi(snapshot: any[], cached: any = null, nowMs?: number) {
    const exports: Record<string, any> = {};
    // 라우트의 «지금»(new Date())을 고정한다 — 다음 거래일 11:00 같은 재현에 필요
    const clock: Record<string, any> = {};
    if (nowMs != null) {
        class FixedDate extends Date {
            constructor(...args: any[]) { if (args.length === 0) super(nowMs); else super(...(args as [any])); }
            static now() { return nowMs!; }
        }
        clock.Date = FixedDate;
    }
    const response = (payload: any, options?: { status: number }) => ({
        ok: (options?.status ?? 200) < 400, status: options?.status ?? 200,
        json: async () => payload,
    });
    run(fs.readFileSync('src/app/api/live/options/trades/route.ts', 'utf8'), {
        exports, URL, ...clock,
        require: (id: string) => {
            if (id === 'next/server') return { NextResponse: { json: response } };
            if (id === '@/services/redisClient') return { getFromCache: async () => cached, setInCache: async () => {} };
            if (id === '@/services/massiveClient') return { getOptionSnapshot: async () => snapshot, fetchMarketStatus: async () => ({ exchanges: { nyse: 'open' } }) };
            throw new Error(`Unexpected route dependency: ${id}`);
        },
    });
    return exports.GET({ url: 'http://offline.test/api/live/options/trades?t=A' });
}

function whaleScreen(state: Record<string, any>) {
    const ctx: Record<string, any> = { ticker: 'A', tickerData: state.tickerData, whaleFeed: state.whaleFeed,
        WHALE_PREMIUM_FLOOR: 50000, dpDayValue: null, formatCompactMoney: functionOf('formatCompactMoney'),
        dpBiasScore: null, shortPressureNum: null, dpDayPct: null, require, exports: {},
        locale: 'ko', whaleCopy: { liveBadge: '실시간 추적', prints: '건', chase: 'chase', hedge: 'hedge', mixed: 'mixed' } };
    for (const name of ['whaleFeedCurrent', 'whaleTradesFeed', 'whaleMeta', 'whaleSessionDate', 'whaleBasis', 'whaleSweeps', 'whaleSummary', 'whaleDayTotal', 'whaleDayCount', 'institutionalTotal', 'whaleCallShare', 'whaleBiasScore', 'pressureScore', 'convictionPct', 'psychologyLabel', 'largestWhalePrint']) ctx[name] = value(name, ctx);
    ctx.whaleTotalVol = ctx.institutionalTotal;
    const money = (call: string) => {
        let expression = '';
        function find(node: ts.Node) {
            if (ts.isJsxExpression(node) && node.expression?.getText(ast).includes(call)) expression = node.expression.getText(ast);
            ts.forEachChild(node, find);
        }
        find(ast);
        assert.ok(expression, `actual money expression: ${call}`);
        return run(`(${expression})`, ctx);
    };
    let teaser = '';
    function findTeaser(node: ts.Node) {
        if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'teaser'
            && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression
            && ts.isObjectLiteralExpression(node.initializer.expression)) {
            const prop = node.initializer.expression.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ast) === 'value');
            if (prop && ts.isPropertyAssignment(prop)) teaser = prop.initializer.getText(ast);
        }
        ts.forEachChild(node, findTeaser);
    }
    findTeaser(ast);
    return { ...ctx, whaleMoney: money('formatCompactMoney(whaleDayTotal, 1)'), totalMoney: money('formatCompactMoney(whaleTotalVol, 2)'),
        sessionBadge: renderToStaticMarkup(money('whaleSessionDate ?')),
        teaserText: run(`(${teaser})`, { ...ctx, flowTab: 'whale' }) };
}

let passed = 0, failed = 0;
async function test(name: string, fn: () => any) {
    try { await fn(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${(error as Error).message}`); }
}

(async () => {
    await test('NVDA insider net: sell-only, buy-only, mixed, balanced and missing agree in all three visible cells', () => {
        // Saved /api/command/insider?ticker=NVDA: 0B / 10S, $414,989,603 sold.
        const nvdaSales = [2773638, 3006253, 1006642, 297942896, 2204199, 1020525, 4461161, 2166946, 45431041, 54976302];
        const trade = (code: string, value: number) => ({ code, value });
        for (const [transactions, expected, color] of [
            [nvdaSales.map(v => trade('S', v)), '-$415.0M', '#f43f5e'],
            [[trade('P', 415000000)], '+$415.0M', '#10b981'],
            [[trade('P', 10000000), trade('S', 25000000), trade('A', 999000000)], '-$15.0M', '#f43f5e'],
            [[trade('P', 25000000), trade('S', 10000000)], '+$15.0M', '#10b981'],
            [[trade('P', 10000000), trade('S', 10000000)], '+$0', '#10b981'],
            [[], '—', 'var(--text-muted)'],
            [[trade('A', 999000000)], '—', 'var(--text-muted)'],
        ] as const) {
            const ctx: Record<string, any> = { insiderData: { transactions }, formatCompactMoney: functionOf('formatCompactMoney'),
                whaleCopy: {}, largestInstitutionalPrint: null, flowFreshness: '', isSessionClosed: true, require, exports: {} };
            for (const name of ['insiderTrades', 'insiderStats', 'insiderNetDisplay', 'insiderNetColor']) ctx[name] = value(name, ctx);
            // Render the actual JSX cards, so a correct computed net cannot mask a wrong cell binding/color.
            for (const label of ['darkBlocks', 'dpDominance']) {
                let card: ts.JsxElement | undefined;
                (function find(node: ts.Node) {
                    if (ts.isJsxExpression(node) && node.expression?.getText(ast) === `whaleCopy.${label}`) {
                        const parent = node.parent.parent;
                        assert.ok(ts.isJsxElement(parent));
                        card = parent;
                    }
                    ts.forEachChild(node, find);
                })(ast);
                assert.ok(card, `visible ${label} card`);
                const markup = renderToStaticMarkup(run(`(${card.getText(ast)})`, { ...ctx }));
                assert.ok(markup.includes(`color:${color}`), markup);
                assert.ok(markup.includes(`>${expected}</div>`), markup);
            }
            const preview = value('flowPreviewStats', ctx)[1];
            assert.equal(preview.value, expected);
            assert.equal(preview.color, color);
        }
    });
    await test('gate: no source snapshot and no cache yields dashes, never $0, through the real API and fetch effect', async () => {
        // getOptionSnapshot also returns [] when its supplier request fails.
        const response = await whaleApi([]);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).items.length, 0);
        const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => response });
        try {
            const screen = whaleScreen(h.state);
            assert.equal(screen.whaleMoney, '—');
            assert.equal(screen.totalMoney, '—');
            assert.equal(screen.whaleMeta, null);
        } finally { h.cleanup(); }
    });
    await test('gate: a successful source scan with zero qualifying prints remains measured $0', async () => {
        // 4차 관문: «관측된 0»은 실제 last_trade 가 있는 스캔에서만 — 고래 기준 미만 체결 1건(2×10×100=$2K)
        const response = await whaleApi([traded(contract('call', 2000), '2026-10-16T14:30:00Z', 2, 10)]);
        assert.equal((await response.json()).debug.totalContractsScanned, 1);
        assert.equal((await response.json()).debug.tradesObserved, 1);
        const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => response });
        try {
            const screen = whaleScreen(h.state);
            assert.equal(screen.whaleMoney, '$0');
            assert.equal(screen.totalMoney, '$0');
            assert.equal(screen.teaserText, '0 건 / $0');
            assert.equal(screen.pressureScore, null);
            assert.equal(screen.convictionPct, null);
            assert.notEqual(screen.whaleMeta, null);
        } finally { h.cleanup(); }
    });
    await test('session: after-close/weekend/pre-open empty scans are missing, including cached zero', async () => {
        const response = await whaleApi([contract('call', 2000)]);
        for (const [session, iso] of [
            ['POST', '2026-10-16T20:05:00Z'],
            ['CLOSED', '2026-10-18T16:00:00Z'],
            ['PRE', '2026-10-19T12:00:00Z'],
            ['REG', '2026-10-18T16:00:00Z'], // stale session flag on a Sunday
        ]) {
            const h = await fetchHarness({}, { ticker: 'A', session }, {
                fetch: async () => response,
                selectWhaleSession: (d: any, s: string) => selectWhaleSession({ ...d, _cached: true }, s, Date.parse(iso)),
            });
            try {
                const screen = whaleScreen(h.state);
                assert.equal(screen.whaleMoney, '—');
                assert.equal(screen.totalMoney, '—');
                assert.equal(screen.teaserText, '— 건 / —');
                assert.equal(screen.pressureScore, null);
                assert.equal(screen.convictionPct, null);
                assert.equal(screen.whaleSessionDate, null);
            } finally { h.cleanup(); }
        }
    });
    await test('session: real last-session prints supply the same amounts, psychology and existing date badge', async () => {
        const print = (iso: string, type: string, premium: number) => ({
            tradeDate: iso, timestamp: Date.parse(iso) * 1e6, timeET: '15:55:00', type, premium,
        });
        const response = await whaleApi([], { ticker: 'A', items: [
            print('2026-10-16T19:55:00Z', 'CALL', 400000),
            print('2026-10-16T19:55:00Z', 'PUT', 200000),
            print('2026-10-15T19:55:00Z', 'CALL', 900000), // wrong session
            print('2026-10-16T12:00:00Z', 'CALL', 900000), // premarket
            print('2026-10-16T21:00:00Z', 'CALL', 900000), // after hours
            { type: 'CALL', premium: 900000 }, // undated is not a historical observation
        ] });
        for (const [session, iso] of [
            ['POST', '2026-10-16T20:05:00Z'],
            ['CLOSED', '2026-10-18T16:00:00Z'],
            ['PRE', '2026-10-19T12:00:00Z'],
        ]) {
            const h = await fetchHarness({}, { ticker: 'A', session }, {
                fetch: async () => response,
                selectWhaleSession: (d: any, s: string) => selectWhaleSession(d, s, Date.parse(iso)),
            });
            try {
                const screen = whaleScreen(h.state);
                assert.equal(screen.whaleMoney, '$600K');
                assert.equal(screen.totalMoney, '$600K');
                assert.equal(screen.teaserText, '2 건 / $400K');
                assert.equal(screen.whaleSweeps.length, 2);
                assert.equal(screen.pressureScore, 53);
                assert.ok(screen.convictionPct > 0);
                assert.equal(screen.sessionBadge, '2026-10-16 · 마감 기준');
                assert.equal(screen.whaleSweeps[0].dir, null);
            } finally { h.cleanup(); }
        }
    });
    await test('session: older/malformed/undated history and absent source never become zero or fabricated prints', async () => {
        for (const data of [
            { items: [], debug: { totalContractsScanned: 100 } },
            { items: [], unavailable: true },
            { items: [{ type: 'CALL', premium: 400000, tradeDate: '2026-10-15T19:55:00Z' }] },
            { items: [{ type: 'CALL', premium: 400000, tradeDate: 'invalid' }] },
            { items: [{ type: 'CALL', premium: 400000 }] },
            { items: [{ type: 'UNKNOWN', premium: 400000, tradeDate: '2026-10-16T19:55:00Z' }] },
            { items: [{ type: 'CALL', premium: 49999, tradeDate: '2026-10-16T19:55:00Z' }] },
        ]) {
            const h = await fetchHarness({}, { ticker: 'A', session: 'CLOSED' }, {
                fetch: async () => ({ ok: true, json: async () => data }),
                selectWhaleSession: (d: any, s: string) => selectWhaleSession(d, s, Date.parse('2026-10-18T16:00:00Z')),
            });
            try {
                const screen = whaleScreen(h.state);
                assert.equal(screen.whaleMoney, '—');
                assert.equal(screen.totalMoney, '—');
                assert.equal(screen.teaserText, '— 건 / —');
                assert.equal(screen.whaleSweeps.length, 0);
                assert.equal(screen.pressureScore, null);
            } finally { h.cleanup(); }
        }
    });
    await test('session: holiday, DST and early close use the existing trading calendar', () => {
        const choose = (now: string, trade: string) => selectWhaleSession({ items: [{ tradeDate: trade, type: 'CALL', premium: 50000 }] }, 'CLOSED', Date.parse(now));
        assert.equal(choose('2026-11-26T18:00:00Z', '2026-11-25T20:59:00Z').sessionDate, '2026-11-25');
        assert.equal(choose('2026-11-27T18:05:00Z', '2026-11-27T17:59:00Z').sessionDate, '2026-11-27');
        assert.equal(choose('2026-11-27T18:05:00Z', '2026-11-27T18:01:00Z').meta, null);
        assert.equal(choose('2026-11-01T17:00:00Z', '2026-10-30T19:59:00Z').sessionDate, '2026-10-30');
    });
    await test('gate: cached measured zero and genuine cached prints retain their observed values', async () => {
        for (const cached of [
            { ticker: 'A', count: 0, items: [], debug: { totalContractsScanned: 1, tradesObserved: 1 } },
            { ticker: 'A', count: 1, items: [{ type: 'CALL', premium: 400000 }] },
        ]) {
            const response = await whaleApi([], cached);
            const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => response });
            try {
                const screen = whaleScreen(h.state);
                assert.equal(screen.whaleMeta._cached, true);
                assert.equal(screen.whaleMoney, cached.count ? '$400K' : '$0');
            } finally { h.cleanup(); }
        }
    });
    await test('gate: empty responses without valid scan evidence stay missing, including cached responses', async () => {
        for (const scanned of [undefined, null, 0, -1, '1', NaN, Infinity]) {
            const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, {
                fetch: async () => ({ ok: true, json: async () => ({ items: [], _cached: true, debug: { totalContractsScanned: scanned } }) }),
            });
            try { assert.equal(whaleScreen(h.state).whaleMoney, '—', `scan evidence: ${scanned}`); }
            finally { h.cleanup(); }
        }
    });
    await test('gate: same ticker refresh from real prints to unavailable source clears the displayed amount', async () => {
        let response = await whaleApi([], { ticker: 'A', items: [{ type: 'CALL', premium: 400000 }] });
        const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => response });
        try {
            assert.equal(whaleScreen(h.state).whaleMoney, '$400K');
            response = await whaleApi([]);
            await h.refresh();
            const screen = whaleScreen(h.state);
            assert.equal(screen.whaleMoney, '—');
            assert.equal(screen.totalMoney, '—');
            assert.equal(screen.whaleSweeps.length, 0);
        } finally { h.cleanup(); }
    });
    await test('ID01: empty trade feed cannot turn daily chain volume into a $400K print', () => {
        assert.equal(value('whaleSweeps', whaleContext([], [contract('call', 2000)])).length, 0);
    });
    await test('ID01: missing trade side/time stay missing, never inferred from option type or clock', () => {
        const prints = value('whaleSweeps', whaleContext([{ type: 'CALL', strike: 100, size: 2000, price: 2, premium: 400000 }]));
        assert.equal(prints.length, 1);
        assert.equal(prints[0].dir, null);
        assert.equal(prints[0].time, null);
    });
    await test('ID02: A volumes cannot survive B empty chain, including refresh', async () => {
        const h = await fetchHarness({ pcCallVol: 100, pcPutVol: 200, callPct: 33.3, rawChain: [contract('call', 100)] }, { ticker: 'B', session: 'REG', flow: { rawChain: [] } });
        try {
            // State-based legacy implementation, or totals derived directly from the response.
            const ctx = { ...h.state, ticker: 'B', tickerData: h.state.tickerData };
            if (!declarations.has('pcCallVol')) {
                assert.equal(h.state.pcCallVol, null);
            } else {
                const totals = value('chainVolumes', { ...ctx, rawChain: value('rawChain', ctx) });
                assert.equal(totals.call, null);
                assert.equal(totals.put, null);
                assert.equal(totals.callPct, null);
            }
            await h.refresh();
        } finally { h.cleanup(); }
    });
    await test('ID03: +2% then 0% commits zero on the next response', async () => {
        const data = { ticker: 'B', display: { price: 100, changePctPct: 2 }, flow: { rawChain: [] } };
        const h = await fetchHarness({}, data);
        try {
            assert.equal(h.state.change, 2);
            data.display.changePctPct = 0;
            await h.refresh();
            assert.equal(h.state.change, 0);
        } finally { h.cleanup(); }
    });
    await test('ID03: API and websocket zero reach the existing session-aware price calculator', () => {
        const ctx = {
            tickerData: { display: { price: 100, changePctPct: 0 }, rawTickerData: { display: { changePctPct: 2 } } },
            wsPrice: null, livePrice: null, price: 100, change: 2, effectiveSession: 'REG', calcPriceDisplay,
        };
        // Read the actual calculator call from its destructured declaration.
        const call = (() => { let found = ''; function scan(n: ts.Node) { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'calcPriceDisplay') found = n.getText(ast); ts.forEachChild(n, scan); } scan(ast); return found; })();
        assert.equal(run(call, ctx).displayChangePct, 0);
        assert.equal(run(call, { ...ctx, wsPrice: { price: 100, changePct: 0 }, livePrice: { price: 100, changePercent: 2 } }).displayChangePct, 0);
    });
    await test('ID04: missing short volume adds no bullish pressure to balanced whale prints', () => {
        const ctx: Record<string, any> = { tickerData: { flow: { shortVolPct: null } }, whaleDayTotal: 200000, whaleSummary: { callSum: 100000, putSum: 100000 }, callPct: 50, shortPct: '—', pctNumber: functionOf('pctNumber'), dpUnavailable: true, institutionalTotal: 200000, dpDayValue: null, dpNetBuyValue: null };
        for (const name of ['whaleCallShare', 'shortPressureNum', 'whaleBiasScore', 'dpBiasScore']) ctx[name] = value(name, ctx);
        assert.equal(value('pressureScore', ctx), 0);
    });
    await test('ID01: real prints remain sorted and keep supplied side/time', () => {
        const prints = value('whaleSweeps', whaleContext([
            { type: 'PUT', premium: 50000, timeET: '10:15:30', side: 'BID', price: 1, size: 500 },
            { type: 'CALL', premium: 400000, timeET: '10:16:00', side: 'ASK', price: 2, size: 2000 },
            { type: 'CALL', premium: 49999 },
        ]));
        assert.equal(prints.length, 2);
        assert.equal(prints[0].premium, 400000);
        assert.equal(prints[0].time, '10:16:00');
        assert.equal(prints[1].dir, 'BID');
        assert.equal(prints[1].strike, null);
    });
    await test('ID01: prior ticker/session print snapshots cannot populate the current feed', () => {
        const base = { ticker: 'B', tickerData: { ticker: 'B', session: 'REG' }, whaleFeed: { ticker: 'A', session: 'REG', items: [{ premium: 400000 }] } };
        assert.equal(value('whaleFeedCurrent', base), false);
        assert.equal(value('whaleFeedCurrent', { ...base, whaleFeed: { ...base.whaleFeed, ticker: 'B', session: 'PRE' } }), false);
        assert.equal(value('whaleFeedCurrent', { ...base, whaleFeed: { ...base.whaleFeed, ticker: 'B' } }), true);
    });
    await test('ID02: nearest expiry definition, missing versus measured zero, P/C versus C/P', () => {
        const chain = [contract('call', 100), contract('put', 200), contract('call', 9000, '2026-10-30')];
        const ctx = pcContext(volumes('A', { ticker: 'A', session: 'REG', flow: { rawChain: chain } }));
        assert.equal(ctx.pcText, '2.00');
        assert.equal(ctx.cpVol.text, '0.50');
        assert.equal(ctx.callPct, 33.3);
        for (const data of [{ ticker: 'B', flow: { rawChain: [] } }, { ticker: 'B' }, { ticker: 'A', flow: { rawChain: chain } }, null]) {
            const empty = pcContext(volumes('B', data));
            assert.equal(empty.pcCallVol, null);
            assert.equal(empty.pcPutVol, null);
            assert.equal(empty.callPct, null);
            assert.equal(empty.pcText, '—');
            assert.equal(empty.cpVol.text, '—');
        }
        const zero = pcContext(volumes('A', { ticker: 'A', flow: { rawChain: [contract('call', 0), contract('put', 0)] } }));
        assert.equal(zero.pcCallVol, 0);
        assert.equal(zero.pcPutVol, 0);
        assert.equal(zero.callPct, null);
        const noPuts = pcContext(volumes('A', { ticker: 'A', flow: { rawChain: [contract('call', 100), contract('put', 0)] } }));
        assert.equal(noPuts.pcText, '0.00');
        assert.equal(noPuts.callPct, 100);
        const noCalls = pcContext(volumes('A', { ticker: 'A', flow: { rawChain: [contract('call', 0), contract('put', 100)] } }));
        assert.equal(noCalls.callPct, 0);
        assert.equal(noCalls.cpVol.text, '0.00');
        const missingVolume = contract('put', 100); delete (missingVolume.day as any).volume;
        assert.equal(volumes('A', { ticker: 'A', flow: { rawChain: [contract('call', 100), missingVolume] } }).callPct, null);
    });
    await test('ID02: the real AI payload receives N/A after an empty chain instead of prior P/C', () => {
        const ctx = pcContext(volumes('B', { ticker: 'B', flow: { rawChain: [] } }));
        let pcPayload = '';
        function find(n: ts.Node) {
            if (ts.isPropertyAssignment(n) && n.name.getText(ast) === 'pcRatio' && n.initializer.getText(ast).includes('PC_AI_DEFINITION')) pcPayload = n.initializer.getText(ast);
            ts.forEachChild(n, find);
        }
        find(ast);
        const result = run(`(${pcPayload})`, { ...ctx, pcScore: 0, PC_AI_DEFINITION });
        assert.equal(result.value, 'N/A');
        assert.equal(result.score, 0);
    });
    await test('ID04: percent parsing preserves missing, 0, and existing percent/fraction units', () => {
        const parse = functionOf('pctNumber');
        for (const missing of [null, undefined, '', ' ', '—', 'N/A', NaN, Infinity]) assert.equal(parse(missing), null);
        assert.equal(parse(0), 0);
        assert.equal(parse('0%'), 0);
        assert.equal(parse(0.45), 45);
        assert.equal(parse(45), 45);
        assert.equal(parse('45.0%'), 45);
        assert.equal(value('shortPct', { shortPressureNum: 0 }), '0.0%');
        assert.equal(value('squeezeProb', { shortPct: '0.0%', ivRankVal: null }), 0);
    });
    await test('ID04: all inputs missing leaves score, label, confidence missing', () => {
        const pressureScore = value('pressureScore', { whaleBiasScore: null, dpBiasScore: null, shortPressureNum: null });
        assert.equal(pressureScore, null);
        assert.equal(value('psychologyLabel', { pressureScore }), '—');
        assert.equal(value('convictionPct', { pressureScore }), null);
        assert.equal(value('whaleCallShare', { whaleDayTotal: 0, callPct: 100 }), null);
    });
    await test('ID04: a dark-pool total without any net-buy observation cannot become a neutral score input', () => {
        const dpNetBuyValue = value('dpNetBuyValue', { dpUnavailable: false, tickerData: { flow: {} }, dpSummary: { count: 0, buySum: 0, sellSum: 0 } });
        assert.equal(dpNetBuyValue, null);
        assert.equal(value('dpBiasScore', { dpUnavailable: false, institutionalTotal: 1000000, dpDayValue: 1000000, dpNetBuyValue }), null);
    });
    await test('ID04: valid inputs keep the previous formula, missing weights are excluded', () => {
        const score = (whaleBiasScore: number | null, dpBiasScore: number | null, shortPressureNum: number | null) => value('pressureScore', { whaleBiasScore, dpBiasScore, shortPressureNum });
        assert.equal(score(40, 20, 50), 22); // 40*.5 + 20*.3 - (50-45)*.8
        assert.equal(score(40, null, 50), 28); // prior no-DP path: 40*.8 - (50-45)*.8
        assert.equal(score(0, null, 0), 36); // measured zero is genuine evidence
        assert.equal(score(0, null, null), 0);
        assert.equal(score(null, null, 45), 0);
        assert.equal(score(100, null, null), 100);
    });
    await test('ID01: actual card retains missing time/side/strike/cost/BEP fields as dashes', () => {
        const print = value('whaleSweeps', whaleContext([{ type: 'CALL', premium: 50000 }]))[0];
        const render = value('renderWhaleCard', { require, exports: {}, ticker: 'B', displayPrice: 100,
            whaleCopy: { premium: 'PREMIUM', strike: 'STRIKE', cost: 'COST', bep: 'BEP', impactLow: 'LOW' } });
        const html = renderToStaticMarkup(render(print, 0));
        assert.ok(html.includes('COST') && html.includes('BEP') && html.includes('STRIKE'));
        assert.equal((html.match(/—/g) ?? []).length, 6); // expiry, strike, cost, BEP, time, side
        assert.ok(!html.includes('ASK') && !html.includes('BID') && !html.includes('$0.00'));
    });
    await test('ID02: same ticker session refresh with an empty or absent flow clears all derived totals', async () => {
        const data: any = { ticker: 'A', session: 'REG', flow: { rawChain: [contract('call', 100), contract('put', 200)] } };
        const h = await fetchHarness({}, data);
        try {
            assert.equal(pcContext(volumes('A', h.state.tickerData)).pcText, '2.00');
            data.session = 'POST';
            data.flow = { rawChain: [] };
            await h.refresh();
            assert.equal(pcContext(volumes('A', h.state.tickerData)).pcText, '—');
            delete data.flow;
            await h.refresh();
            assert.equal(volumes('A', h.state.tickerData).callPct, null);
        } finally { h.cleanup(); }
    });
    await test('ID02: a canceled ticker request cannot commit late optional responses', async () => {
        let release!: (v: any) => void;
        const pending = new Promise(r => { release = r; });
        const h = await fetchHarness({}, { ticker: 'A', flow: { rawChain: [] } }, { fetch: () => pending });
        h.cleanup();
        const before = JSON.stringify(h.state);
        release({ ok: true, json: async () => ({ items: [{ premium: 50000 }], insider: { count: 1 } }) });
        await settle();
        assert.equal(JSON.stringify(h.state), before);
    });
    await test('ID02: interval refresh cannot overtake an unfinished response', async () => {
        let release!: (v: any) => void;
        let calls = 0;
        const pending = new Promise(r => { release = r; });
        const data = { ticker: 'A', flow: { rawChain: [] } };
        const h = await fetchHarness({}, data, { fetch: () => pending,
            fetchWithTtfbLimit: async () => { calls++; return { ok: true, json: async () => data }; } });
        try {
            await h.refresh();
            assert.equal(calls, 1);
            release({ ok: true, json: async () => ({ items: [] }) });
            await settle();
            assert.equal(h.state.flowPhaseDone, true);
        } finally { h.cleanup(); }
    });
    // ══ 4차 관문(10190151) — 체인 조회 성공 ≠ 체결 관측 / 0건 판정은 «현재 세션 필터 후» ══
    await test('G4-1 regular session chain without last_trade is source-missing, never $0 or "0 건 / $0"', async () => {
        const noTrade = [contract('call', 2000), contract('put', 1500), contract('call', 900, '2026-10-30')];
        const brokenTrade = [
            { ...contract('call', 2000), last_trade: { price: 0, size: 10, sip_timestamp: 1 } },
            { ...contract('put', 2000), last_trade: { price: 2, size: 0, sip_timestamp: 1 } },
            { ...contract('call', 2000), last_trade: { price: 2, size: 10 } }, // 체결 시각 없음
        ];
        for (const chain of [noTrade, brokenTrade]) {
            const response = await whaleApi(chain);
            const body = await response.json();
            assert.equal(body.debug.totalContractsScanned, chain.length);
            assert.equal(body.debug.tradesObserved, 0);
            const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => response });
            try {
                const screen = whaleScreen(h.state);
                assert.equal(screen.whaleMoney, '—');
                assert.equal(screen.totalMoney, '—');
                assert.equal(screen.teaserText, '— 건 / —');
                assert.equal(screen.whaleMeta, null);
                assert.equal(screen.pressureScore, null);
            } finally { h.cleanup(); }
        }
        // 옛 모양 캐시(스캔 수만 있고 체결 관측 근거 없음)도 결측
        const cachedScanOnly = await whaleApi([], { ticker: 'A', count: 0, items: [], debug: { totalContractsScanned: 1 } });
        const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => cachedScanOnly });
        try { assert.equal(whaleScreen(h.state).whaleMoney, '—'); } finally { h.cleanup(); }
    });
    await test('G4-2 next trading day 11:00 with only prior-day 15:55 whale print is measured $0 for today', async () => {
        const now = Date.parse('2026-10-20T15:00:00Z'); // 화 11:00 ET
        const priorPrint = traded(contract('call', 2000), '2026-10-19T19:55:00Z', 5, 200); // 월 15:55 ET · $100K
        const response = await whaleApi([priorPrint], null, now);
        const body = await response.json();
        assert.equal(body.items.length, 1, 'route returns the prior-day print (inside its 20h window)');
        assert.equal(body.debug.tradesObserved, 1);
        for (const payload of [body, { ...body, debug: undefined }, { ...body, debug: { totalContractsScanned: 1 } }]) {
            const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, {
                fetch: async () => ({ ok: true, json: async () => payload }),
                selectWhaleSession: (d: any, s: string) => selectWhaleSession(d, s, now),
            });
            try {
                const screen = whaleScreen(h.state);
                assert.equal(screen.whaleMoney, '$0');
                assert.equal(screen.totalMoney, '$0');
                assert.equal(screen.teaserText, '0 건 / $0');
                assert.equal(screen.whaleSweeps.length, 0, 'prior-day print is not today');
                assert.equal(screen.whaleSessionDate, null);
                assert.notEqual(screen.whaleMeta, null);
            } finally { h.cleanup(); }
        }
    });
    await test('G4-3 regular session today print keeps its real value; prior-day print does not leak into the total', async () => {
        const now = Date.parse('2026-10-20T15:00:00Z');
        const response = await whaleApi([
            traded(contract('call', 2000), '2026-10-20T14:30:00Z', 4, 1000), // 오늘 10:30 · $400K
            traded(contract('put', 2000, '2026-10-30'), '2026-10-19T19:55:00Z', 5, 200), // 전일 · $100K
        ], null, now);
        const h = await fetchHarness({}, { ticker: 'A', session: 'REG' }, {
            fetch: async () => response,
            selectWhaleSession: (d: any, s: string) => selectWhaleSession(d, s, now),
        });
        try {
            const screen = whaleScreen(h.state);
            assert.equal(screen.whaleMoney, '$400K');
            assert.equal(screen.teaserText, '1 건 / $400K');
            assert.equal(screen.whaleSessionDate, null);
        } finally { h.cleanup(); }
    });
    await test('G4-4 three base cases stay fixed: regular 0 = $0, closed last session = value + date badge, no source = dash', async () => {
        const regular = await whaleApi([traded(contract('call', 2000), '2026-10-16T14:30:00Z', 2, 10)], null, REG_NOW);
        const reg = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => regular });
        try { const s = whaleScreen(reg.state); assert.equal(s.whaleMoney, '$0'); assert.equal(s.teaserText, '0 건 / $0'); } finally { reg.cleanup(); }
        const sunday = Date.parse('2026-10-18T16:00:00Z');
        const last = { ticker: 'A', items: [{ tradeDate: '2026-10-16T19:55:00Z', timestamp: Date.parse('2026-10-16T19:55:00Z') * 1e6, type: 'CALL', premium: 400000, price: 4, size: 1000 }] };
        const closed = await fetchHarness({}, { ticker: 'A', session: 'CLOSED' }, {
            fetch: async () => ({ ok: true, json: async () => last }),
            selectWhaleSession: (d: any, s: string) => selectWhaleSession(d, s, sunday),
        });
        try {
            const s = whaleScreen(closed.state);
            assert.equal(s.whaleMoney, '$400K'); assert.equal(s.sessionBadge, '2026-10-16 · 마감 기준');
        } finally { closed.cleanup(); }
        // 장 마감에 체결 관측은 있으나 직전 세션 고래가 없으면 0 이 아니라 «—»
        const closedZero = await fetchHarness({}, { ticker: 'A', session: 'CLOSED' }, {
            fetch: async () => ({ ok: true, json: async () => ({ ticker: 'A', items: [], debug: { totalContractsScanned: 1, tradesObserved: 1 } }) }),
            selectWhaleSession: (d: any, s: string) => selectWhaleSession(d, s, sunday),
        });
        try { assert.equal(whaleScreen(closedZero.state).whaleMoney, '—'); } finally { closedZero.cleanup(); }
        const none = await fetchHarness({}, { ticker: 'A', session: 'REG' }, { fetch: async () => whaleApi([]) });
        try { const s = whaleScreen(none.state); assert.equal(s.whaleMoney, '—'); assert.equal(s.teaserText, '— 건 / —'); } finally { none.cleanup(); }
    });
    await test('G4-5 invalid tradesObserved evidence values cannot create a measured zero', async () => {
        for (const counted of [0, -1, '1', NaN, Infinity, null]) {
            const d = selectWhaleSession({ items: [], debug: { totalContractsScanned: 5, tradesObserved: counted } }, 'REG', REG_NOW);
            assert.equal(d.meta, null, `tradesObserved: ${counted}`);
        }
        assert.notEqual(selectWhaleSession({ items: [], debug: { tradesObserved: 3 } }, 'REG', REG_NOW).meta, null);
    });
    console.log(`flowIntegrity2: ${passed} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
})();
