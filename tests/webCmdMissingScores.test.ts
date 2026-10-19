/** Offline N4 web regression: execute production memo/card/AI payload, with no services or env. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeVwap, vwapDistancePct } from '../src/lib/vwap';
import { convictionInputsOf, retainConvictionInputs, scoreCommandConviction, webConvictionSnapshot, webConvictionState,
    type ConvictionField, type ConvictionRawInputs, type ConvictionSnapshot } from '../src/lib/commandConviction';

const file = 'src/components/LiveTickerDashboard.tsx';
const current = fs.readFileSync(file, 'utf8');
const before = fs.readFileSync('tests/fixtures/webCmdConviction.before.tsx.txt', 'utf8');
function find(source: string, predicate: (n: ts.Node) => boolean) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches: string[] = [];
    const visit = (n: ts.Node) => { if (predicate(n)) matches.push(n.getText(ast)); ts.forEachChild(n, visit); };
    visit(ast); assert.equal(matches.length, 1); return matches[0];
}
function decl(name: string) { return find(current, n => ts.isVariableDeclaration(n) && n.name.getText() === name); }
const memo = decl('convictionSnapshot');
const score = decl('convictionResult');
const conviction = decl('conviction');
const effect = find(current, n => ts.isCallExpression(n) && n.expression.getText() === 'useEffect'
    && !!n.arguments[0]?.getText().includes('convictionHistory.current.set'));
const card = (source: string) => find(source, n => ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'ProGate'
    && n.openingElement.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText() === 'title'
        && p.initializer?.getText() === '"Conviction Matrix"'));
const ai = find(current, n => ts.isPropertyAssignment(n) && n.name.getText() === 'conviction'
    && n.initializer.getText().includes('conviction?.score'));
const legacy = find(before, n => ts.isVariableDeclaration(n) && n.name.getText() === 'calculateConviction');
function run(code: string, context: Record<string, any> = {}): any {
    const js = ts.transpileModule(code, { compilerOptions: {
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
    } }).outputText;
    return vm.runInNewContext(js, {
        React: { ...React, useMemo: (fn: () => unknown) => fn() },
        useEffect: (fn: () => void) => fn(), webConvictionSnapshot, webConvictionState, scoreCommandConviction,
        normalizeVwap, vwapDistancePct, ...context,
    });
}
const stock = { symbol: 'TEST', price: 100, vwap: null };
function web(data: Record<string, any> = {}, history = new Map<string, ConvictionSnapshot>()) {
    return run(`const ${memo}; ${effect}; const ${score}; const ${conviction};
        ({ conviction, snapshot: convictionSnapshot, ai: ({ ${ai} }).conviction });`, {
        ticker: 'TEST', initialUnifiedData: {}, initialStockData: stock, unifiedData: {},
        liveQuote: { ticker: 'TEST', price: 100, flow: null }, displayPrice: 100, newsScore: null,
        convictionHistory: { current: history }, td: (key: string) => key, ...data,
    });
}
const dates = '2026-10-16';
const healthy = {
    unifiedData: { ticker: 'TEST', sma: { cross: 'GOLDEN', date: dates }, structure: { pcRatio: 0.5, netGex: 1e6, chainDate: dates } },
    liveQuote: { ticker: 'TEST', vwap: 98, vwapDate: dates, flow: { netPremium: 1e6, contractsProcessed: 2, dataFreshness: { chainDate: dates } } },
};
function rendered(value: any, locale: string, source = current) {
    const messages = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8'));
    const passthrough = ({ children }: any) => React.createElement(React.Fragment, null, children);
    const element = run(`(${card(source)})`, {
        conviction: value.conviction, convictionSnapshot: value.snapshot,
        td: (key: string) => messages.dashboard[key], tg: (key: string) => messages.gate?.[key] ?? key,
        ProGate: passthrough, CardTooltip: passthrough, Target: () => null,
        COMMAND_TOOLTIPS: { CONVICTION: { tooltip: {} } },
    });
    return renderToStaticMarkup(element);
}

test('reproduce frozen legacy price-only -> 50/C, repaired web -> no score and AI null', () => {
    let old: any;
    run(`const ${legacy}; calculateConviction();`, {
        smaData: null, newsScore: null, liveQuote: { price: 100 }, initialStockData: stock,
        displayPrice: 100, structure: null, td: (key: string) => key, setConviction: (value: any) => { old = value; },
    });
    assert.equal(old.score, 50); assert.equal(old.grade, 'C');
    const result = web();
    assert.equal(result.conviction, null); assert.equal(result.ai.score, null); assert.equal(result.ai.grade, null);
});
test('all missing/invalid/legacy failure inputs produce no vote; observed zero remains 50/C', () => {
    for (const flow of [null, {}, { netPremium: 0 }, { netPremium: 0, contractsProcessed: 0 },
        { netPremium: 1e6, dataSource: 'NONE' }, { netPremium: 1e6, error: 'offline' }, { netFlow: 1e6 }]) {
        assert.equal(web({ liveQuote: { flow } }).conviction, null);
    }
    for (const bad of [undefined, null, '', '0', false, NaN, Infinity, -Infinity]) {
        assert.equal(scoreCommandConviction(convictionInputsOf({ cross: 'UNKNOWN', price: bad, vwap: bad, pcr: bad, gex: bad, flow: { netPremium: bad }, news: bad })), null);
    }
    for (const raw of [{ flow: { netPremium: 0, contractsProcessed: 2 } }, { flow: { netPremium: 0, premiumContracts: 2 } }, { pcr: 0 }, { gex: 0 }, { cross: 'NONE' }]) {
        assert.equal(scoreCommandConviction(convictionInputsOf(raw))?.score, 50);
    }
});
test('partial missing refresh carries each normal input and its original date before scoring', () => {
    const history = new Map<string, ConvictionSnapshot>();
    const good = web(healthy, history);
    assert.equal(good.conviction.score, 90);
    // An empty refresh omits VWAP (absent → carried). An explicit null would be the route invalidating a stale VWAP.
    const empty = web({ liveQuote: { flow: { netPremium: 0, dataSource: 'NONE' } } }, history);
    assert.equal(empty.conviction.score, 90);
    for (const key of ['cross', 'vwap', 'pcr', 'gex', 'netPremium']) {
        assert.equal(empty.snapshot.sourceDates[key], dates, key);
        assert.equal(empty.snapshot.inputs[key], good.snapshot.inputs[key], key);
    }
    // Live omits VWAP: the retained value stands. A NEW undated SSR payload (revisit) is a later
    // arrival, so it is the newer observation (shared rule) — shown without a borrowed date.
    const omitted = web({ initialStockData: stock }, history);
    assert.equal(omitted.snapshot.inputs.vwap, 98);
    assert.equal(omitted.snapshot.sourceDates.vwap, dates);
    const revisit = web({ initialStockData: { ...stock, vwap: 105 } }, new Map(history));
    assert.equal(revisit.snapshot.inputs.vwap, 105);
    assert.equal(revisit.snapshot.sourceDates.vwap, null);
    const partial = web({ unifiedData: { structure: { netGex: 0, chainDate: '2026-10-19' } } }, history);
    assert.equal(partial.conviction.score, 85); // updated measured GEX zero, all other prior inputs retained
    assert.equal(partial.snapshot.sourceDates.gex, '2026-10-19');
    assert.equal(partial.snapshot.sourceDates.pcr, dates);
    const zero = web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 2, dataFreshness: { chainDate: '2026-10-19' } } } }, history);
    assert.equal(zero.snapshot.inputs.netPremium, 0); assert.equal(zero.conviction.score, 80);
});
test('SSR normal inputs seed a failed first refresh without manufactured UI NONE', () => {
    const result = web({ initialUnifiedData: healthy.unifiedData });
    assert.equal(result.conviction.score, 77);
    assert.equal(web({ initialUnifiedData: { sma: {} }, unifiedData: { sma: {} } }).conviction, null);
});
test('a dated older response cannot replace newer observations; unknown dates are never invented', () => {
    const history = new Map<string, ConvictionSnapshot>();
    web(healthy, history);
    const result = web({ unifiedData: { structure: { netGex: -1e6, chainDate: '2026-10-15' } } }, history);
    assert.equal(result.snapshot.inputs.gex, 1e6); assert.equal(result.snapshot.sourceDates.gex, dates);
    const unknown = web({ unifiedData: { timestamp: Date.now(), sma: { cross: 'GOLDEN' } } });
    assert.equal(unknown.conviction.score, 65); assert.equal(unknown.snapshot.sourceDates.cross, null);
});
test('ticker navigation and late old ticker responses cannot leak inputs; returning to ticker retains history', () => {
    const history = new Map<string, ConvictionSnapshot>();
    web(healthy, history);
    const other = web({ ticker: 'OTHER', initialStockData: { symbol: 'OTHER', price: 100 }, ...healthy }, history);
    assert.equal(other.conviction, null);
    assert.equal(web({}, history).conviction.score, 90);
    const crossStock = web({ ticker: 'OTHER', ...healthy }, new Map());
    assert.equal(crossStock.conviction, null);
});
test('web refresh reacts to VWAP/display price and observation count changes', () => {
    assert.equal(web({ liveQuote: { vwap: 100, vwapDate: dates } }).conviction.score, 50);
    assert.equal(web({ liveQuote: { vwap: 100, vwapDate: dates }, displayPrice: 102 }).conviction.score, 58);
    assert.equal(web({ liveQuote: { vwap: 102, vwapDate: dates } }).conviction.score, 42);
    assert.equal(web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 0 } } }).conviction, null);
    assert.equal(web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 2 } } }).conviction.score, 50);
    assert.equal(web({ liveQuote: { flow: { netPremium: 0, contractsProcessed: 0 } } }).conviction, null);
});
test('ticker revisit uses newer SSR VWAP when live omits it: 42 instead of stale 58', () => {
    const history = new Map<string, ConvictionSnapshot>();
    const old = web({ liveQuote: { ticker: 'TEST', vwap: 98, vwapDate: dates } }, history);
    assert.equal(old.conviction.score, 58);
    web({ ticker: 'OTHER', initialStockData: { symbol: 'OTHER', price: 100 } }, history);
    const result = web({
        initialStockData: { ...stock, vwap: 102, vwapDate: '2026-10-19' },
        liveQuote: { ticker: 'TEST', price: 100 },
    }, history);
    assert.equal(result.snapshot.inputs.vwap, 102);
    assert.equal(result.snapshot.sourceDates.vwap, '2026-10-19');
    assert.equal(result.conviction.score, 42);
    assert.equal(result.ai.score, 42);
});
test('ticker revisit compares newer SSR GEX with history even when live structure is missing', () => {
    const history = new Map<string, ConvictionSnapshot>();
    const old = web({ unifiedData: { ticker: 'TEST', structure: { netGex: 1e6, chainDate: dates } } }, history);
    assert.equal(old.conviction.score, 55);
    web({ ticker: 'OTHER', initialStockData: { symbol: 'OTHER', price: 100 } }, history);
    const result = web({
        initialUnifiedData: { ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } },
        unifiedData: { ticker: 'TEST', structure: null },
    }, history);
    assert.equal(result.snapshot.inputs.gex, -1e6);
    assert.equal(result.snapshot.sourceDates.gex, '2026-10-19');
    assert.equal(result.conviction.score, 45);
    assert.equal(result.ai.score, 45);
});
test('gate 10191604: the same SSR is observed once — SSR +1M → live −1M → live structure missing keeps −1M (45)', () => {
    for (const ssrDate of [undefined, dates]) for (const liveDate of [undefined, dates]) {
        const history = new Map<string, ConvictionSnapshot>();
        // One page load: the SSR payload object stays the same across re-renders.
        const initialUnifiedData = { ticker: 'TEST', structure: { netGex: 1e6, chainDate: ssrDate } };
        const first = web({ initialUnifiedData, unifiedData: initialUnifiedData }, history);
        assert.equal(first.conviction.score, 55);
        const live = web({ initialUnifiedData, unifiedData: { ticker: 'TEST', structure: { netGex: -1e6, chainDate: liveDate } } }, history);
        assert.equal(live.conviction.score, 45);
        for (const unifiedData of [{ ticker: 'TEST', structure: null }, { error: 'Failed' }, { _source: 'unavailable' }, null]) {
            const missing = web({ initialUnifiedData, unifiedData }, history);
            assert.equal(missing.snapshot.inputs.gex, -1e6, `${ssrDate}/${liveDate}/${JSON.stringify(unifiedData)}`);
            assert.equal(missing.conviction.score, 45); assert.equal(missing.ai.score, 45);
        }
        // A NEW SSR (revisit) is a new observation and is folded once.
        const revisit = web({ initialUnifiedData: { ticker: 'TEST', structure: { netGex: 1e6, chainDate: '2026-10-19' } },
            unifiedData: { ticker: 'TEST', structure: null } }, history);
        assert.equal(revisit.snapshot.inputs.gex, 1e6); assert.equal(revisit.snapshot.sourceDates.gex, '2026-10-19');
    }
});
test('webConvictionState folds SSR once per payload; a stale later SSR cannot beat a newer dated observation', () => {
    const ssr = { unified: { ticker: 'TEST', structure: { netGex: 1e6, chainDate: '2026-10-16' } }, stock };
    const a = webConvictionState('TEST', ssr, { unified: { ticker: 'TEST', structure: { netGex: -1e6, chainDate: '2026-10-19' } }, stock, price: 100 });
    const b = webConvictionState('TEST', ssr, { unified: { ticker: 'TEST', structure: null }, stock, price: 100 }, a);
    assert.equal(b.inputs.gex, -1e6); assert.equal(b.sourceDates.gex, '2026-10-19');
    const staleSsr = { unified: { ticker: 'TEST', structure: { netGex: 5e6, chainDate: '2026-10-15' } }, stock };
    const c = webConvictionState('TEST', staleSsr, { unified: null, stock, price: 100 }, b);
    assert.equal(c.inputs.gex, -1e6, 'older-dated SSR loses to the newer observation');
});
test('all seven inputs share source-time ordering, missing-value fallback and observed-zero rules', () => {
    const oldRaw = { cross: 'GOLDEN', price: 110, vwap: 98, pcr: 0.5, gex: 1e6,
        flow: { netPremium: 1e6, contractsProcessed: 2 }, news: 80 };
    const nextRaw = { cross: 'NONE', price: 100, vwap: 102, pcr: 0, gex: 0,
        flow: { netPremium: 0, contractsProcessed: 2 }, news: 0 };
    const expectedOld = { cross: 'GOLDEN', price: 110, vwap: 98, pcr: 0.5, gex: 1e6, netPremium: 1e6, news: 80 };
    const expectedNext = { cross: 'NONE', price: 100, vwap: 102, pcr: 0, gex: 0, netPremium: 0, news: 0 };
    const fields = Object.keys(expectedOld) as ConvictionField[];
    const allDates = (date?: string) => Object.fromEntries(fields.map(key => [key, date]));
    const cases: { name: string; oldDate?: string; date?: string; incoming?: ConvictionRawInputs; wins: boolean }[] = [
        { name: 'newer incoming', oldDate: dates, date: '2026-10-19', wins: true },
        { name: 'older incoming', oldDate: dates, date: '2026-10-15', wins: false },
        { name: 'equal date prefers incoming', oldDate: dates, date: dates, wins: true },
        // Shared rule (lib/metrics/observation): an unknown source time cannot be ordered, so arrival
        // order decides; the winner keeps no date (a date is never borrowed or invented).
        { name: 'undated arrival replaces dated, without a date', oldDate: dates, wins: true },
        { name: 'invalid date is unknown: arrival replaces, without a date', oldDate: dates, date: 'invalid', wins: true },
        { name: 'dated replaces undated', date: dates, wins: true },
        { name: 'both undated prefer incoming', wins: true },
        { name: 'compare instants across offsets', oldDate: '2026-10-19T02:00:00Z', date: '2026-10-19T10:00:00+09:00', wins: false },
        { name: 'missing cannot lend newer date', oldDate: dates, date: '2026-10-20', incoming: {}, wins: false },
        { name: 'invalid cannot lend newer date', oldDate: dates, date: '2026-10-20', incoming: {
            cross: 'UNKNOWN', price: 0, vwap: 0, pcr: -1, gex: NaN,
            flow: { netPremium: 1e6, error: 'offline' }, news: 101,
        }, wins: false },
    ];
    for (const row of cases) {
        const previous = retainConvictionInputs('TEST', oldRaw, allDates(row.oldDate));
        const result = retainConvictionInputs('TEST', row.incoming ?? nextRaw, allDates(row.date), previous);
        for (const key of fields) {
            assert.equal(result.inputs[key], (row.wins ? expectedNext : expectedOld)[key], `${row.name}: ${key}`);
            const validDate = (d?: string) => d && Number.isFinite(Date.parse(d)) ? d : null;
            assert.equal(result.sourceDates[key], row.wins ? validDate(row.date) : validDate(row.oldDate), `${row.name}: ${key} date`);
        }
    }
    const empty = retainConvictionInputs('TEST', {}, allDates('2026-10-20'));
    const filled = retainConvictionInputs('TEST', nextRaw, allDates(dates), empty);
    const otherTicker = retainConvictionInputs('OTHER', nextRaw, {},
        retainConvictionInputs('TEST', oldRaw, allDates('2026-10-20')));
    for (const key of fields) {
        assert.equal(filled.inputs[key], expectedNext[key], `empty newer response: ${key}`);
        assert.equal(filled.sourceDates[key], dates);
        assert.equal(otherTicker.inputs[key], expectedNext[key], `other ticker: ${key}`);
        assert.equal(otherTicker.sourceDates[key], null);
    }
});
test('web memo compares history, SSR and live for all SSR inputs before card and AI scoring', () => {
    const history = new Map<string, ConvictionSnapshot>();
    web({ ...healthy, initialStockData: { ...stock, price: 110, freshness: { asOfISO: dates } }, displayPrice: 110 }, history);
    const ssr = {
        initialUnifiedData: { ticker: 'TEST', sma: { cross: 'DEAD', date: '2026-10-19' },
            structure: { pcRatio: 1.5, netGex: -1e6, chainDate: '2026-10-19' } },
        initialStockData: { ...stock, vwap: 102, vwapDate: '2026-10-19', freshness: { asOfISO: '2026-10-19' } },
    };
    const olderLive = web({ ...healthy, ...ssr }, history);
    const expected = { cross: 'DEAD', price: 100, vwap: 102, pcr: 1.5, gex: -1e6 };
    for (const key of Object.keys(expected) as (keyof typeof expected)[]) {
        assert.equal(olderLive.snapshot.inputs[key], expected[key], key);
        assert.equal(olderLive.snapshot.sourceDates[key], '2026-10-19', key);
    }
    assert.equal(olderLive.conviction.score, 20); // SSR technical votes plus retained positive premium
    assert.equal(olderLive.ai.score, 20);
    const newerLive = web({ ...ssr,
        unifiedData: { ticker: 'TEST', sma: { cross: 'NONE', date: '2026-10-20' },
            structure: { pcRatio: 0, netGex: 0, chainDate: '2026-10-20' } },
        liveQuote: { ticker: 'TEST', vwap: 100, vwapDate: '2026-10-20',
            flow: { netPremium: 0, contractsProcessed: 2, dataFreshness: { premiumDate: '2026-10-20' } } },
    }, history);
    assert.equal(newerLive.conviction.score, 50);
    assert.equal(newerLive.ai.score, 50);
    for (const key of ['cross', 'vwap', 'pcr', 'gex', 'netPremium']) {
        assert.equal(newerLive.snapshot.sourceDates[key], '2026-10-20', key);
    }
});
test('VWAP uses newest source date, ties prefer live then SSR then history, and dates stay paired', () => {
    const previous = webConvictionSnapshot('TEST', {
        stock: { ...stock, vwap: 98, vwapDate: '2026-10-16' }, price: 100,
    });
    const cases = [
        { name: 'new live', live: 101, liveDate: '2026-10-20', ssrDate: '2026-10-19', expected: 101, date: '2026-10-20' },
        { name: 'new SSR beats older live', live: 101, liveDate: '2026-10-17', ssrDate: '2026-10-19', expected: 102, date: '2026-10-19' },
        { name: 'history beats both older sources', live: 101, liveDate: '2026-10-14', ssrDate: '2026-10-15', expected: 98, date: '2026-10-16' },
        { name: 'live wins equal dates', live: 101, liveDate: '2026-10-16', ssrDate: '2026-10-16', expected: 101, date: '2026-10-16' },
        { name: 'SSR wins equal history date', live: undefined, liveDate: undefined, ssrDate: '2026-10-16', expected: 102, date: '2026-10-16' },
        { name: 'compare instants across offsets', live: 101, liveDate: '2026-10-19T10:00:00+09:00', ssrDate: '2026-10-19T02:00:00Z', expected: 102, date: '2026-10-19T02:00:00Z' },
        { name: 'absent live cannot lend its newer date', live: undefined, liveDate: '2026-10-20', ssrDate: '2026-10-15', expected: 98, date: '2026-10-16' },
        // VWAP is session-scoped: the ticker route sends an explicit null for a previous-session VWAP — not carried.
        { name: 'explicit null live invalidates (no carry)', live: null, liveDate: undefined, ssrDate: '2026-10-19', expected: null, date: null },
        { name: 'invalid live falls back to new SSR', live: 0, liveDate: '2026-10-20', ssrDate: '2026-10-19', expected: 102, date: '2026-10-19' },
        // Unknown live time: arrival order (live after SSR) wins, and it never borrows the SSR date.
        { name: 'undated live cannot borrow SSR date', live: 101, liveDate: undefined, ssrDate: '2026-10-19', expected: 101, date: null },
        { name: 'invalid live date is unknown, never outranks by invention', live: 101, liveDate: 'invalid', ssrDate: undefined, expected: 101, date: null },
    ];
    for (const row of cases) {
        const result = webConvictionSnapshot('TEST', {
            stock: { ...stock, vwap: 102, vwapDate: row.ssrDate },
            quote: { ticker: 'TEST', vwap: row.live, vwapDate: row.liveDate }, price: 100,
        }, previous);
        assert.equal(result.inputs.vwap, row.expected, row.name);
        assert.equal(result.sourceDates.vwap, row.date, row.name);
    }
    const undated = webConvictionSnapshot('TEST', {
        stock: { ...stock, vwap: 102 }, quote: { vwap: 101 }, price: 100,
    });
    assert.equal(undated.inputs.vwap, 101);
    assert.equal(undated.sourceDates.vwap, null);
    const mismatched = webConvictionSnapshot('OTHER', {
        stock: { ...stock, vwap: 102, vwapDate: '2026-10-20' },
        quote: { ticker: 'TEST', vwap: 101, vwapDate: '2026-10-21' }, price: 100,
    }, previous);
    assert.equal(mismatched.inputs.vwap, null);
    assert.equal(mismatched.sourceDates.vwap, null);
});
test('normal web weights/news/grades match frozen legacy and app uses the identical helper', () => {
    for (const cross of ['GOLDEN', 'DEAD', 'NONE']) for (const pcr of [0, 0.5, 1, 1.5]) {
        for (const gex of [-1e6, 0, 1e6]) for (const premium of [-1e6, 0, 1e6]) for (const news of [20, 50, 80]) {
            let old: any;
            run(`const ${legacy}; calculateConviction();`, {
                smaData: { cross }, newsScore: { score: news }, structure: { pcRatio: pcr, netGex: gex },
                liveQuote: { vwap: 98, flow: { netPremium: premium } }, initialStockData: stock, displayPrice: 100,
                td: (key: string) => key, setConviction: (value: any) => { old = value; },
            });
            const now = scoreCommandConviction(convictionInputsOf({ cross, price: 100, vwap: 98, pcr, gex, flow: { netPremium: premium, contractsProcessed: 2 }, news }));
            assert.equal(now?.score, old.score); assert.equal(now?.grade, old.grade); assert.equal(now?.labelKey, old.label);
        }
    }
    const app = fs.readFileSync('src/app/[locale]/app-view/cmd/page.tsx', 'utf8');
    assert.match(app, /scoreCommandConviction\(convSnap \? convSnap\.inputs\s*: convictionInputsOf\(/);
});
test('ko/en/ja retain CONVICTION label/card/normal HTML; unavailable values keep main\'s placeholders (no fake 50/C)', () => {
    for (const locale of ['ko', 'en', 'ja']) {
        const good = web(healthy);
        const html = rendered(good, locale);
        const withoutDates = html.replace(/ data-source-dates="[^"]*"/, '').replace(/ title="[^"]*"/, '');
        assert.equal(withoutDates, rendered(good, locale, before));
        assert.match(html, /2026-10-16/);
        const empty = rendered(web(), locale);
        assert.match(empty, /CONVICTION/); assert.match(empty, /\/100/);
        // Gate 10191903: the missing state keeps main's placeholders (grade «...», score «--», description
        // convDescCalc) — no display change outside the CEO's decisions, and still never a fabricated 50/C.
        assert.match(empty, />\.\.\.</); assert.match(empty, />--</);
        const calc = JSON.parse(fs.readFileSync(`src/messages/${locale}.json`, 'utf8')).dashboard.convDescCalc;
        assert.ok(calc && empty.includes(renderToStaticMarkup(React.createElement(React.Fragment, null, calc))), 'convDescCalc');
        assert.doesNotMatch(empty, />50<|>C<|NaN|Infinity/);
    }
});
