/** Offline replay of the actual app Flow fetch effect and display expressions.
 * SNAPSHOT_DIR optionally supplies the saved ivp/ticker responses. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';
import { shownRegularSessionDate } from '../src/lib/marketCalendar';
import { ivRankIsCollecting, ivRankCollectingText } from '../src/lib/ivRank';
import { ivHistoryUnavailable, notProvidedText } from '../src/lib/app/flowEmptyStates';
import { flowSqueeze } from '../src/lib/app/flowSqueeze';

const source = fs.readFileSync('src/app/[locale]/app-view/flow/page.tsx', 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.VariableDeclaration>();
let effect = '';
let rankCell = '';
let squeezeCell = '';
function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && !declarations.has(n.name.text)) declarations.set(n.name.text, n);
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.getText(ast).includes('async function fetchFlow()')) effect = n.arguments[0].getText(ast);
    if (ts.isJsxExpression(n) && n.expression) {
        const text = n.expression.getText(ast);
        if (text.startsWith('ivRankVal != null ?')) rankCell = text;
        if (text.startsWith('squeezeProb == null ?') && text.includes('`${squeezeProb}')) squeezeCell = text;
    }
    ts.forEachChild(n, visit);
}
visit(ast);
function run(code: string, ctx: Record<string, any>) {
    return vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, ctx);
}
function value(name: string, ctx: Record<string, any>) {
    const init = declarations.get(name)?.initializer;
    assert.ok(init, name);
    return run(`(${init.getText(ast)})`, { useMemo: (fn: () => any) => fn(), ...ctx });
}
const settle = async () => { for (let i = 0; i < 15; i++) await new Promise<void>(r => setImmediate(r)); };
const response = (body: any, ok = true) => ({ ok, json: async () => body });
const good = (percentile = 89) => ({ ticker: 'TSLA', percentile, currentIv: 46.95, metric: 'iv30', currentSession: '2026-10-19', sampleSize: 79, _source: 'dynamodb-true-percentile' });
const tickerData = { ticker: 'TSLA', session: 'REG', flow: { ivRank: null, shortVolPct: 47.1, shortVolSource: 'FINRA' } };

async function harness(options: { data?: any; iv?: any; now?: string; delayed?: boolean; brokenSibling?: boolean; blockedSibling?: boolean; blockedTicker?: boolean; tickerResponse?: () => Promise<void>; initial?: any; tickerFailures?: number; quickRetries?: number; ivRequest?: (request: number) => Promise<any> } = {}) {
    const state: Record<string, any> = { ivRankFeed: null, ivRankOverride: null, ivUnavailable: false, ivCollecting: false, ...options.initial };
    const data = options.data ?? tickerData;
    let now = Date.parse(options.now ?? '2026-10-19T17:08:00Z');
    let elapsed = 0;
    let refresh: () => void = () => {};
    let ivResponse = response(options.iv ?? good());
    let resolveIv: (r: any) => void = () => {};
    let failed = false;
    let tickerRequests = 0;
    let tickerFail = false;
    let ivRequests = 0;
    const timers = new Map<number, { at: number; fn: () => void }>();
    let timerId = 0;
    class FixedDate extends Date {
        constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); }
        static now() { return now; }
    }
    const ctx: Record<string, any> = {
        ticker: data.ticker, initialLoadRef: { current: true }, AbortController, Date: FixedDate,
        FLOW_TICKER_TTFB_MS: 15000, FLOW_QUICK_RETRIES: options.quickRetries ?? 0, FLOW_QUICK_RETRY_MS: 3000,
        shownRegularSessionDate: (ms = now) => shownRegularSessionDate(ms),
        ivHistoryUnavailable, ivRankIsCollecting,
        window: {
            setTimeout: (fn: () => void, ms: number) => { timers.set(++timerId, { at: elapsed + ms, fn }); return timerId; },
            clearTimeout: (id: number) => timers.delete(id),
        },
        setInterval: (fn: () => void) => { refresh = fn; return 1; }, clearInterval: () => {},
        fetchWithTtfbLimit: async () => {
            if (tickerFail) throw new Error('ticker transport failure');
            if (options.tickerResponse) await options.tickerResponse();
            if (++tickerRequests <= (options.tickerFailures ?? 0)) throw new Error('ticker transport failure');
            return options.blockedTicker ? new Promise(() => {}) : response(data);
        },
        fetch: async (url: string, init: any) => {
            if (url.includes('/iv-percentile')) {
                if (options.ivRequest) return options.ivRequest(++ivRequests);
                if (failed) throw new Error('offline transport failure');
                if (options.delayed) return new Promise((resolve, reject) => {
                    resolveIv = resolve;
                    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
                });
                return ivResponse;
            }
            if (url.includes('/dark-pool') && options.brokenSibling) return { ok: true, json: async () => { throw new Error('invalid sibling JSON'); } };
            if (url.includes('/dark-pool') && options.blockedSibling) return new Promise(() => {});
            return response({ items: [], unavailable: true });
        },
        selectWhaleSession: () => ({ items: [], meta: null, sessionDate: null, basis: null }),
    };
    for (const setter of effect.match(/\bset[A-Z]\w*/g) ?? []) {
        if (setter === 'setInterval' || setter === 'setTimeout') continue;
        const key = setter[3].toLowerCase() + setter.slice(4);
        ctx[setter] = (next: any) => { state[key] = typeof next === 'function' ? next(state[key]) : next; };
    }
    const cleanup = run(`(${effect})()`, ctx);
    await settle();
    function display(ticker = data.ticker) {
        const c = { ...ctx, ...state, ticker, tickerData: state.tickerData, locale: 'ko', ivRankCollectingText, notProvidedText };
        // Include both the old and repaired declarations so the regression runs against either version.
        for (const key of ['ivFeedCurrent', 'ivRankOverride', 'ivUnavailable', 'ivCollecting', 'rawIvRankVal', 'ivRankVal', 'ivNotProvided', 'ivCollectingNow']) {
            const d = declarations.get(key);
            if (d?.initializer && !d.initializer.getText(ast).startsWith('useState')) c[key] = value(key, c);
        }
        const rank = c.ivRankVal;
        const shortPressureNum = value('shortPressureNum', { tickerData: c.tickerData, pctNumber: (x: any) => typeof x === 'number' ? x : null });
        c.shortPct = value('shortPct', { shortPressureNum });
        // [T37] 스퀴즈 칸은 같은 ticker 응답의 flow.squeezeScore·squeezeRisk 만 — IV Rank·공매도 비중과 무관.
        c.squeezeCurrent = value('squeezeCurrent', c);
        c.squeezeReading = value('squeezeReading', { ...c, flowSqueeze });
        const squeeze = value('squeezeProb', c);
        const sentence = value('regimeInsightText', { ...c, flowCopy: value('APP_FLOW_COPY', ctx).ko, pcText: '0.62', premiumBiasLabel: '중립' });
        return { rank, squeeze, sentence, rankCell: run(`(${rankCell})`, c), squeezeCell: run(`(${squeezeCell})`, { ...c, squeezeProb: squeeze }), unavailable: c.ivNotProvided, collecting: c.ivCollectingNow };
    }
    return {
        state, cleanup, display,
        fail: () => { failed = true; },
        reply: (body: any, ok = true) => { failed = false; ivResponse = response(body, ok); },
        brokenJson: () => { ivResponse = { ok: true, json: async () => { throw new Error('invalid IV JSON'); } }; },
        refresh: async () => { refresh(); await settle(); },
        advance: async (ms: number) => {
            elapsed += ms;
            for (const [id, t] of timers) if (t.at <= elapsed) { timers.delete(id); t.fn(); }
            await settle();
        },
        resolveIv: async () => { resolveIv(ivResponse); await settle(); },
        setNow: (iso: string) => { now = Date.parse(iso); },
        setTickerFail: (v: boolean) => { tickerFail = v; },
    };
}

test('valid API percentile is used without a second sample-size or current-session gate', async () => {
    const h = await harness({ iv: { ...good(), sampleSize: 1, currentSession: '2026-10-16' } });
    assert.equal(h.display().rank, 89);
    assert.equal(h.display().squeeze, null, 'IV Rank 89 는 스퀴즈 칸 입력이 아니다');
    assert.equal(h.display().rankCell, '89%');
    assert.equal(h.display().squeezeCell, '—');
    assert.match(h.display().sentence, /IV Rank 89%/);
    h.cleanup();
});
test('IV response at 5.1 seconds survives the old 4.5-second cutoff', async () => {
    const h = await harness({ delayed: true });
    await h.advance(5100); await h.resolveIv();
    assert.equal(h.display().rank, 89);
    h.cleanup();
});
test('another auxiliary JSON failure cannot discard a valid IV response', async () => {
    const h = await harness({ brokenSibling: true });
    assert.equal(h.display().rank, 89);
    h.cleanup();
});
test('IV is committed while another auxiliary request is still pending', async () => {
    const h = await harness({ blockedSibling: true });
    assert.equal(h.display().rank, 89);
    h.cleanup();
});
test('IV starts and commits even while the primary ticker request is pending', async () => {
    const h = await harness({ blockedTicker: true });
    assert.equal(h.display().rank, 89);
    h.cleanup();
});
test('transport failure retains the same ticker and displayed session, not a different ticker', async () => {
    const h = await harness(); h.fail(); await h.refresh();
    assert.equal(h.display().rank, 89);
    assert.equal(h.display('AAPL').rank, null);
    h.cleanup();
});
test('weekend / premarket retain the shown Friday session; Monday open expires retained data', async () => {
    const h = await harness({ now: '2026-10-16T20:10:00Z', iv: { ...good(), currentSession: '2026-10-16' } });
    h.fail();
    for (const now of ['2026-10-18T17:00:00Z', '2026-10-19T13:00:00Z']) {
        h.setNow(now); await h.refresh(); assert.equal(h.display().rank, 89);
    }
    h.setNow('2026-10-19T13:30:00Z'); await h.refresh();
    assert.equal(h.display().rank, null);
    h.cleanup();
});
test('explicit missing and collecting responses clear the previous number; 0% remains measured', async () => {
    const h = await harness();
    h.reply({ ticker: 'TSLA', percentile: null, _source: 'dynamodb-stale' }); await h.refresh();
    assert.equal(h.display().rank, null); assert.equal(h.display().unavailable, true); assert.equal(h.display().squeeze, null); assert.equal(h.display().squeezeCell, '—');
    h.reply({ ticker: 'TSLA', percentile: null, _source: 'dynamodb-collecting' }); await h.refresh();
    assert.equal(h.display().rank, null); assert.equal(h.display().collecting, true);
    h.reply(good(0)); await h.refresh();
    assert.equal(h.display().rank, 0); assert.equal(h.display().squeeze, null);
    assert.match(h.display().sentence, /IV Rank 0%/);
    h.cleanup();
});
test('HTTP error, malformed JSON and invalid percentile do not erase or invent values', async () => {
    const h = await harness();
    for (const body of [{ error: 'timeout' }, { ...good(), percentile: '' }, { ...good(), percentile: true }, good(-1), good(101), { ...good(), ticker: 'AAPL' }]) {
        h.reply(body); await h.refresh(); assert.equal(h.display().rank, 89);
    }
    h.reply(null, false); await h.refresh(); assert.equal(h.display().rank, 89);
    h.brokenJson(); await h.refresh(); assert.equal(h.display().rank, 89);
    h.cleanup();
});
test('a delayed response crossing the regular-session boundary is discarded', async () => {
    const h = await harness({ delayed: true, now: '2026-10-19T13:29:59Z' });
    h.setNow('2026-10-19T13:30:01Z'); await h.resolveIv();
    assert.equal(h.display().rank, null);
    h.cleanup();
});
test('cancelled ticker requests cannot write their delayed result', async () => {
    const h = await harness({ delayed: true }); h.cleanup(); await h.resolveIv();
    assert.equal(h.display().rank, null);
});
test('quick retry commits IV 95%; first-round IV 89% at five seconds cannot overwrite it', async () => {
    let first!: (r: any) => void;
    const h = await harness({ tickerFailures: 1, quickRetries: 1, ivRequest: async request =>
        request === 1 ? new Promise(resolve => { first = resolve; }) : response(good(95)) });
    await h.advance(3000);
    assert.equal(h.display().rank, 95);
    await h.advance(2000);
    first(response(good(89))); await settle();
    assert.equal(h.display().rank, 95);
    assert.equal(h.display().squeeze, null);
    assert.equal(h.display().rankCell, '95%');
    assert.equal(h.display().squeezeCell, '—');
    assert.match(h.display().sentence, /IV Rank 95%/);
    h.cleanup();
});
test('old missing response cannot clear a retry value, including a delayed JSON body', async () => {
    let firstBody!: (body: any) => void;
    const h = await harness({ tickerFailures: 1, quickRetries: 1, ivRequest: async request =>
        request === 1 ? { ok: true, json: () => new Promise(resolve => { firstBody = resolve; }) } : response(good(95)) });
    await h.advance(3000);
    firstBody({ ticker: 'TSLA', percentile: null, _source: 'dynamodb-stale' }); await settle();
    assert.equal(h.display().rank, 95);
    assert.equal(h.display().unavailable, false);
    h.cleanup();
});
test('newer explicit missing response cannot be resurrected by an old numeric response', async () => {
    let first!: (r: any) => void;
    const h = await harness({ tickerFailures: 1, quickRetries: 1, ivRequest: async request =>
        request === 1 ? new Promise(resolve => { first = resolve; }) : response({ ticker: 'TSLA', percentile: null, _source: 'dynamodb-stale' }) });
    await h.advance(3000);
    assert.equal(h.display().unavailable, true);
    first(response(good(89))); await settle();
    assert.equal(h.display().rank, null);
    assert.equal(h.display().squeeze, null);
    assert.equal(h.display().unavailable, true);
    h.cleanup();
});
test('retry transport failure does not discard an older valid response with no newer accepted data', async () => {
    let first!: (r: any) => void;
    const h = await harness({ tickerFailures: 1, quickRetries: 1, ivRequest: async request => {
        if (request === 1) return new Promise(resolve => { first = resolve; });
        throw new Error('IV transport failure');
    } });
    await h.advance(3000);
    first(response(good(89))); await settle();
    assert.equal(h.display().rank, 89);
    assert.equal(h.display().squeeze, null);
    h.cleanup();
});
test('[T37] squeeze cell shows the ticker API squeeze score/level, never IV Rank (NVDA 10/31: IV 98 vs API 36 MEDIUM)', async () => {
    const nvda = { ticker: 'NVDA', session: 'REG', flow: { ivRank: null, shortVolPct: 38.4, shortVolSource: 'FINRA', squeezeScore: 36, squeezeRisk: 'MEDIUM' } };
    const h = await harness({ data: nvda, iv: { ...good(98), ticker: 'NVDA' } });
    assert.equal(h.display().rank, 98);
    assert.equal(h.display().squeeze, 36);
    assert.equal(h.display().squeezeCell, '36%', '칸 표기 형식은 그대로(«N%»)');
    assert.equal(h.state.tickerData.flow.squeezeRisk, 'MEDIUM');
    assert.equal(h.display('AAPL').squeeze, null, '다른 종목 화면에는 이 응답의 점수를 그리지 않는다');
    h.cleanup();
});
test('[T37] refresh replaces the squeeze score; a failed refresh keeps the same-ticker value; ticker switch clears it', async () => {
    const body = { ticker: 'NVDA', session: 'REG', flow: { squeezeScore: 36, squeezeRisk: 'MEDIUM' } };
    const h = await harness({ data: body, iv: { ...good(98), ticker: 'NVDA' } });
    assert.equal(h.display().squeeze, 36);
    body.flow = { squeezeScore: 72, squeezeRisk: 'EXTREME' }; await h.refresh();
    assert.equal(h.display().squeeze, 72);
    body.flow = { squeezeScore: null, squeezeRisk: null } as any; await h.refresh();
    assert.equal(h.display().squeeze, null);
    assert.equal(h.display().squeezeCell, '—');
    h.cleanup();
});
test('[T37] ticker transport failure keeps the same-session value; a session change without a new response clears it', async () => {
    const body = { ticker: 'NVDA', session: 'REG', flow: { squeezeScore: 36, squeezeRisk: 'MEDIUM' } };
    let failTicker = false;
    const h = await harness({ data: body, iv: { ...good(98), ticker: 'NVDA' }, now: '2026-10-16T18:00:00Z' });
    assert.equal(h.display().squeeze, 36);
    h.setTickerFail(true); await h.refresh();
    assert.equal(h.display().squeeze, 36, '같은 세션 갱신 실패 — 마지막 값 유지(다른 칸과 같은 규칙)');
    h.setNow('2026-10-19T13:30:01Z'); await h.refresh();   // 다음 정규장 개장 — 새 응답 없음
    assert.equal(h.display().squeeze, null, '지난 세션 점수는 그리지 않는다');
    assert.equal(h.display().squeezeCell, '—');
    h.setTickerFail(false); await h.refresh();
    assert.equal(h.display().squeeze, 36, '새 세션 응답이 오면 다시 그린다');
    void failTicker;
    h.cleanup();
});
test('[T37] a ticker response requested before the regular open but arriving after it is not used for the squeeze cell', async () => {
    const body = { ticker: 'NVDA', session: 'PRE', flow: { squeezeScore: 36, squeezeRisk: 'MEDIUM' } };
    let release!: () => void;
    let calls = 0;
    const h = await harness({ data: body, iv: { ...good(98), ticker: 'NVDA' }, now: '2026-10-19T13:29:50Z', tickerResponse: () => (++calls === 1 ? new Promise<void>((r) => { release = r; }) : Promise.resolve()) });
    h.setNow('2026-10-19T13:30:05Z'); release(); await new Promise<void>((r) => setImmediate(r)); for (let i = 0; i < 15; i++) await new Promise<void>((r) => setImmediate(r));
    assert.equal(h.state.tickerData?.ticker, 'NVDA', '응답 자체는 반영(다른 칸은 기존 규칙)');
    assert.equal(h.display().squeeze, null, '경계를 넘긴 응답의 점수는 그리지 않는다');
    h.setTickerFail(true); await h.refresh();
    assert.equal(h.display().squeeze, null, '이후 갱신 실패에도 지난 세션 점수가 현재 값이 되지 않는다');
    h.setTickerFail(false); await h.refresh();
    assert.equal(h.display().squeeze, 36, '새 세션 안에서 요청·도착한 응답은 표시');
    h.cleanup();
});
test('[T37] flowSqueeze maps API score/risk; missing or invalid is null (cell stays with —)', () => {
    assert.deepEqual(flowSqueeze({ squeezeScore: 36, squeezeRisk: 'MEDIUM' }), { score: 36, level: 'moderate' });
    assert.deepEqual(flowSqueeze({ squeezeScore: 0, squeezeRisk: 'LOW' }), { score: 0, level: 'low' });
    assert.deepEqual(flowSqueeze({ squeezeScore: 55, squeezeRisk: 'HIGH' }), { score: 55, level: 'high' });
    assert.deepEqual(flowSqueeze({ squeezeScore: 81, squeezeRisk: 'EXTREME' }), { score: 81, level: 'high' });
    assert.deepEqual(flowSqueeze({ squeezeScore: 81, squeezeRisk: 'CRITICAL' }), { score: 81, level: 'high' });
    assert.deepEqual(flowSqueeze({ squeezeScore: 25 }), { score: 25, level: 'moderate' }, 'risk 없으면 같은 기준(squeezeRiskOf)으로');
    for (const flow of [null, undefined, {}, { squeezeScore: null }, { squeezeScore: '36' }, { squeezeScore: NaN }, { squeezeScore: -1 }, { squeezeScore: 101 }, { ivRank: 98 }, { shortVolPct: 47.1 }]) {
        assert.deepEqual(flowSqueeze(flow), { score: null, level: null }, JSON.stringify(flow));
    }
});

const snapshotDir = process.env.SNAPSHOT_DIR;
test('saved intraday ivp/ticker replay: TSLA, SPY, NVDA, AAPL, WTFC', { skip: !snapshotDir }, async () => {
    for (const ticker of ['TSLA', 'SPY', 'NVDA', 'AAPL', 'WTFC']) {
        const read = (prefix: string) => JSON.parse(fs.readFileSync(path.join(snapshotDir!, `${prefix}-${ticker}-2310.json`), 'utf8'));
        const iv = read('ivp');
        const h = await harness({ data: read('ticker'), iv, now: '2026-10-19T14:10:00Z' });
        assert.equal(h.display().rank, iv.percentile, ticker);
        const tk = read('ticker');
        assert.equal(h.display().squeeze, typeof tk?.flow?.squeezeScore === 'number' ? Math.round(tk.flow.squeezeScore) : null, `${ticker}: API squeeze score only`);
        if (iv.percentile != null) {
            assert.match(h.display().sentence, new RegExp(`IV Rank ${iv.percentile}%`));
            assert.equal(h.display().rankCell, `${iv.percentile}%`);
        } else {
            assert.equal(h.display().unavailable, true);
            assert.equal(h.display().rankCell, '미제공');
        }
        console.log(`replay ${ticker}: IV=${h.display().rank}, squeeze=${h.display().squeeze}, sourceSession=${iv.currentSession ?? 'missing'}`);
        h.cleanup();
    }
});
