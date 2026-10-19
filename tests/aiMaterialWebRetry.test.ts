/** Execute the web component's real hooks with fake time/fetch, without a browser or API. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { test } from 'node:test';
import { buildDeepSnapshot } from '../src/lib/ai/deepSnapshot';
import { deepMaterialIssues } from '../src/lib/ai/deepTrust';
import { earningsWithin } from '../src/lib/earningsDate';

const file = process.env.SIGNUM_WEB_RETRY_SOURCE || 'src/components/AIDeepAnalysis.tsx';
const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'AIDeepAnalysis') as ts.FunctionDeclaration;
const statements = component.body!.statements;
const end = statements.findIndex(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(tree) === 'riskConfig'));
assert.ok(end > 0);
const declarations = tree.statements.filter(n =>
    (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['REFRESH_INTERVALS', 'MATERIAL_RETRY_BACKOFF_MS', 'MAX_MATERIAL_RETRIES'].includes(d.name.getText(tree)))) ||
    (ts.isFunctionDeclaration(n) && n.name?.text === 'getEffectiveInterval'));
const source = `${declarations.map(n => n.getText(tree)).join('\n')}
    (function({ ticker, displayPrice, session, snapshot, gexStats }) {
        ${statements.slice(0, end).map(n => n.getText(tree)).join('\n')}
        return { analysis, error, loading, fetchAnalysis };
    })`;
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;

type Request = { body: any; signal: AbortSignal; at: number };
const response = (status: number, data: any) => ({ ok: status === 200, status, json: async () => data });
const success = (ticker: string) => response(200, { currentState: `analysis:${ticker}`, triggerReason: 'FIRST_VIEW', model: 'test' });
const insufficient = () => response(422, { error: 'insufficient_snapshot' });

function harness(fetcher?: (request: Request, index: number) => Promise<any> | any) {
    type Slot = { value?: any; deps?: any[]; cleanup?: any; effect?: () => any };
    const slots: Slot[] = [];
    const pending: number[] = [];
    const timers = new Map<number, { at: number; callback: () => void; interval: number }>();
    const requests: Request[] = [];
    let now = 0, timerId = 0, cursor = 0, dirty = false, mounted = true;
    let currentProps: any, state: any;
    const changed = (a?: any[], b?: any[]) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
    const useState = (initial: any) => {
        const i = cursor++;
        if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
        return [slots[i].value, (v: any) => {
            const next = typeof v === 'function' ? v(slots[i].value) : v;
            if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
        }];
    };
    const useRef = (initial: any) => {
        const i = cursor++;
        if (!slots[i]) slots[i] = { value: { current: initial } };
        return slots[i].value;
    };
    const useMemo = (fn: () => any, deps: any[]) => {
        const i = cursor++;
        if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
        return slots[i].value;
    };
    const useEffect = (effect: () => any, deps: any[]) => {
        const i = cursor++;
        if (!slots[i] || changed(slots[i].deps, deps)) {
            slots[i] = { ...slots[i], deps, effect };
            pending.push(i);
        }
    };
    const addTimer = (callback: () => void, ms: number, interval = 0) => {
        timers.set(++timerId, { callback, at: now + ms, interval });
        return timerId;
    };
    const renderComponent = vm.runInNewContext(js, {
        useState, useRef, useEffect, useCallback: (fn: any, deps: any[]) => useMemo(() => fn, deps),
        useLocale: () => 'ko', deepMaterialIssues, earningsWithin, AbortController,
        Date: class extends Date { static now() { return now; } },
        setTimeout: addTimer, clearTimeout: (id: number) => timers.delete(id),
        setInterval: (fn: () => void, ms: number) => addTimer(fn, ms, ms), clearInterval: (id: number) => timers.delete(id),
        console: { error: () => {} },
        fetch: async (url: string, options: any) => {
            assert.equal(url, '/api/command/deep-analysis');
            const request = { body: JSON.parse(options.body), signal: options.signal, at: now };
            requests.push(request);
            if (fetcher) return fetcher(request, requests.length);
            return deepMaterialIssues({ ...request.body.snapshot, materialPhase: 'complete' }).ok
                ? success(request.body.ticker) : insufficient();
        },
    });
    const render = (props = currentProps) => {
        assert.ok(mounted);
        currentProps = props;
        cursor = 0;
        dirty = false;
        state = renderComponent(props);
        for (const i of pending.splice(0)) { slots[i].cleanup?.(); slots[i].cleanup = slots[i].effect!(); }
        return state;
    };
    const settle = async () => {
        for (let i = 0; i < 24; i++) {
            await Promise.resolve();
            if (dirty && mounted) render();
        }
    };
    const advance = async (ms: number) => {
        await settle();
        const target = now + ms;
        for (;;) {
            const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            const [id, timer] = next;
            now = timer.at;
            if (timer.interval) timer.at += timer.interval;
            else timers.delete(id);
            timer.callback();
            await settle();
        }
        now = target;
        await settle();
    };
    const strictReplay = () => {
        for (const slot of slots) if (slot.effect) slot.cleanup?.();
        for (const slot of slots) if (slot.effect) slot.cleanup = slot.effect();
    };
    const unmount = () => { mounted = false; for (const slot of slots) slot.cleanup?.(); };
    return { render, requests, settle, advance, strictReplay, unmount, state: () => state };
}

function props(ticker: string, ready = false, price = 100, session = 'CLOSED') {
    const snapshot = buildDeepSnapshot({ ticker, price, priceChange: 0, session,
        // B5: a lone GEX is a partial regime input (no score); the third observed group is the squeeze card.
        unified: ready ? { structure: { netGex: 10_000_000 }, sma: { cross: 'GOLDEN', sma50: 99 }, squeeze: { siPercent: 12.5 } } : null,
        rawTickerData: {}, insider: null, technicals: null, creditSpread: null });
    return { ticker, displayPrice: price, session, snapshot: { ...snapshot, trustLayer: 0 }, gexStats: undefined };
}

test('web PRO: first 422 recovers once after material arrives, with five-second backoff and latest snapshot', async () => {
    const h = harness();
    h.render(props('WEB_RETRY'));
    await h.settle();
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().analysis, null);
    assert.equal(h.state().error, 'insufficient_snapshot');
    await h.advance(1000);
    h.render(props('WEB_RETRY', true));
    await h.advance(3999);
    assert.equal(h.requests.length, 1, 'must respect backoff');
    h.render(props('WEB_RETRY', true, 102));
    await h.advance(1);
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].at, 5000);
    assert.equal(h.requests[1].body.snapshot.price, 102);
    assert.equal(h.requests[1].body.triggerReason, 'FIRST_VIEW');
    assert.equal(h.state().analysis.currentState, 'analysis:WEB_RETRY');
    assert.equal(h.state().error, null);
    assert.equal(h.state().loading, false);
    for (let i = 0; i < 8; i++) { h.render(props('WEB_RETRY', false, 103 + i)); h.render(props('WEB_RETRY', true, 103 + i)); }
    await h.advance(60_000);
    assert.equal(h.requests.length, 2, 'quote churn/readiness flaps cannot reset budget');
    h.unmount();
});

test('web: material arriving while the initial 422 response is in flight still recovers', async () => {
    let release: (r: any) => void = () => {};
    const h = harness((_req, i) => i === 1 ? new Promise(resolve => { release = resolve; }) : success('WEB_RACE'));
    h.render(props('WEB_RACE'));
    h.render(props('WEB_RACE', true));
    release(insufficient());
    await h.advance(5000);
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().analysis.currentState, 'analysis:WEB_RACE');
    h.unmount();
});

test('web: no requests while material is missing; readiness loss cancels timer and late arrival recovers', async () => {
    const h = harness();
    h.render(props('WEB_LATE'));
    await h.advance(1000);
    h.render(props('WEB_LATE', true));
    await h.advance(1000);
    h.render(props('WEB_LATE'));
    await h.advance(60_000);
    assert.equal(h.requests.length, 1);
    h.render(props('WEB_LATE', true));
    await h.advance(0);
    assert.equal(h.requests.length, 2);
    assert.ok(h.state().analysis);
    h.unmount();
});

test('web: repeated 422 stops at one recovery even during regular-session quote/readiness changes; manual retry remains available', async () => {
    const h = harness(() => insufficient());
    h.render(props('WEB_CAP', false, 100, 'REG'));
    h.render(props('WEB_CAP', true, 100, 'REG'));
    await h.advance(5000);
    assert.equal(h.requests.length, 2);
    for (let i = 0; i < 8; i++) {
        h.render(props('WEB_CAP', false, 102 + i, 'REG'));
        h.render(props('WEB_CAP', true, 102 + i, 'REG'));
        await h.advance(10_000);
    }
    assert.equal(h.requests.length, 2);
    assert.equal(h.state().error, 'insufficient_snapshot');
    await h.state().fetchAnalysis('FIRST_VIEW');
    await h.settle();
    assert.equal(h.requests.length, 3);
    await h.advance(60_000);
    assert.equal(h.requests.length, 3, 'manual action cannot reset automatic budget');
    h.unmount();
});

for (const [status, error] of [[429, 'rate_limited'], [500, 'server_error'], [422, 'other_validation']] as const) {
    test(`web: ${status}/${error} does not arm material retry`, async () => {
        const h = harness(() => response(status, { error }));
        h.render(props(`WEB_ERROR_${status}`));
        await h.settle();
        h.render(props(`WEB_ERROR_${status}`, true));
        await h.advance(60_000);
        assert.equal(h.requests.length, 1);
        assert.equal(h.state().error, error);
        h.unmount();
    });
}

test('web: a cached result before material arrives and initially complete material each request once', async () => {
    for (const ready of [false, true]) {
        const h = harness(() => success('WEB_CACHE'));
        h.render(props('WEB_CACHE', ready));
        await h.settle();
        h.render(props('WEB_CACHE', true));
        await h.advance(60_000);
        assert.equal(h.requests.length, 1);
        assert.ok(h.state().analysis);
        h.unmount();
    }
});

test('web: network failure does not arm material retry', async () => {
    const h = harness(() => { throw new Error('offline'); });
    h.render(props('WEB_NETWORK'));
    await h.settle();
    h.render(props('WEB_NETWORK', true));
    await h.advance(60_000);
    assert.equal(h.requests.length, 1);
    assert.equal(h.state().error, 'offline');
    h.unmount();
});

test('web: scheduled and price-move refresh still work after a normal successful request', async () => {
    const h = harness();
    h.render(props('WEB_REFRESH', true, 100, 'REG'));
    await h.advance(20 * 60_000);
    assert.deepEqual(h.requests.map(r => r.body.triggerReason), ['FIRST_VIEW', 'SCHEDULED']);
    h.render(props('WEB_REFRESH', true, 102, 'REG'));
    await h.settle();
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests[2].body.triggerReason, 'PRICE_MOVE');
    assert.equal(h.state().loading, false);
    h.unmount();
});

test('web: fallback returned by material retry cannot start another fallback retry', async () => {
    const h = harness((_req, i) => i === 1 ? insufficient() : response(200, { currentState: 'fallback', model: 'fallback', triggerReason: 'FALLBACK' }));
    h.render(props('WEB_FALLBACK'));
    h.render(props('WEB_FALLBACK', true));
    await h.advance(60_000);
    assert.equal(h.requests.length, 2);
    h.unmount();
});

test('web: ticker switch/unmount cancels pending retry, and new ticker has its own budget', async () => {
    const h = harness();
    h.render(props('WEB_CANCEL_OLD'));
    await h.settle();
    h.render(props('WEB_CANCEL_OLD', true));
    h.render(props('WEB_CANCEL_NEW'));
    await h.settle();
    h.render(props('WEB_CANCEL_NEW', true));
    await h.advance(5000);
    assert.deepEqual(h.requests.map(r => r.body.ticker), ['WEB_CANCEL_OLD', 'WEB_CANCEL_NEW', 'WEB_CANCEL_NEW']);
    h.render(props('WEB_UNMOUNT'));
    await h.settle();
    h.render(props('WEB_UNMOUNT', true));
    h.unmount();
    await h.advance(60_000);
    assert.equal(h.requests.length, 4);
    assert.equal(h.requests[3].signal.aborted, true);
});

test('web: stale response/finally cannot overwrite or unlock an active request after ticker switch', async () => {
    const releases: Array<(r: any) => void> = [];
    const h = harness(() => new Promise(resolve => releases.push(resolve)));
    h.render(props('WEB_STALE_OLD', true, 100, 'REG'));
    h.render(props('WEB_STALE_NEW', true, 100, 'REG'));
    releases[0](success('WEB_STALE_OLD'));
    await h.settle();
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.state().analysis, null);
    assert.equal(h.state().loading, true);
    await h.state().fetchAnalysis('FIRST_VIEW');
    assert.equal(h.requests.length, 2, 'stale finally must not unlock loadingRef');
    releases[1](success('WEB_STALE_NEW'));
    await h.settle();
    assert.equal(h.state().analysis.currentState, 'analysis:WEB_STALE_NEW');
    assert.equal(h.state().loading, false);
    h.unmount();
});

test('web: StrictMode abort/replay still permits one completed material recovery', async () => {
    const h = harness();
    h.render(props('WEB_STRICT'));
    h.strictReplay();
    await h.settle();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[0].signal.aborted, true);
    h.render(props('WEB_STRICT', true));
    await h.advance(5000);
    assert.equal(h.requests.length, 3);
    assert.equal(h.state().analysis.currentState, 'analysis:WEB_STRICT');
    h.unmount();
});
