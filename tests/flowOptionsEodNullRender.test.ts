/** Gate 10201018 P1: collector → real API → actual Flow activity JSX, entirely offline.
 * Run: /usr/bin/lockf -k /tmp/signum-heavy.lock node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/flowOptionsEodNullRender.test.ts
 * No env files, browser, supplier requests, or production cache access.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/flow/options-eod/route';

const collector = require('../scripts/intrinio-options-eod.js');
const source = fs.readFileSync('src/app/[locale]/app-view/flow/page.tsx', 'utf8');
const page = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const activityBlocks: ts.ArrowFunction[] = [];
(function visit(node: ts.Node) {
    if (ts.isArrowFunction(node) && ts.isBlock(node.body) && node.body.statements.some(statement =>
        ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
            ts.isIdentifier(declaration.name) && declaration.name.text === 'withDelta'))) {
        activityBlocks.push(node);
    }
    ts.forEachChild(node, visit);
})(page);
assert.equal(activityBlocks.length, 1, 'find the actual unusual activity render block');
const js = ts.transpileModule(`(${activityBlocks[0].getText(page)})()`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function screen(optionsEod: any, locale = 'en'): string {
    const element = vm.runInNewContext(js, {
        optionsEod, locale, exports: {},
        require: (id: string) => {
            assert.equal(id, 'react/jsx-runtime');
            return require(id);
        },
    });
    return renderToStaticMarkup(element);
}

const originalFetch = globalThis.fetch;
let bundle: any;
globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/get');
    assert.equal(url.searchParams.get('key'), 'intrinio:options:eod');
    return new Response(JSON.stringify({ result: JSON.stringify(bundle) }));
}) as typeof fetch;

function collect(openInterests: Array<number | null>, previous?: number[]) {
    const prevOi = previous && Object.fromEntries(previous.map((oi, i) => [`NVDA__270115C${String(200000 + i * 1000).padStart(8, '0')}`, oi]));
    const aggregator = collector.createAggregator(prevOi, { fileDate: '2026-10-16' });
    openInterests.forEach((oi, i) => {
        const row = collector.mapApiRow('NVDA', {
            option: { code: `NVDA270115C${String(200000 + i * 1000).padStart(8, '0')}`, ticker: 'NVDA', type: 'call', strike: 200 + i, expiration: '2027-01-15' },
            price: { date: '2026-10-16', volume: 500, open_interest: oi },
        });
        assert.ok(row);
        aggregator.add(row);
    });
    bundle = { date: '2026-10-16', prevDate: '2026-10-15', tickers: collector.finalizeTickers(aggregator.agg) };
}

async function response() {
    const res = await GET(new NextRequest('https://offline.invalid/api/flow/options-eod?t=NVDA&at=2026-10-20T01:00:00Z'));
    assert.equal(res.status, 200);
    return res.json();
}

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
    await fn(); passed++; console.log(`  ✓ ${name}`);
}

(async () => {
    await test('gate: OI null / volume 500, every delta missing → visible OI —, no crash (ko/en/ja)', async () => {
        collect([null, 1234]);
        assert.equal(bundle.tickers.NVDA.top[0].oi, null);
        const body = await response();
        assert.equal(body.contracts[0].openInterest, null);
        assert.ok(body.contracts.every((c: any) => c.oiChange === null && c.kind === 'UNKNOWN'));
        assert.equal(body.summary.netOiChange, null);
        for (const [locale, volume, title] of [['ko', '거래', '이상 옵션 활동'], ['en', 'vol', 'Unusual options activity'], ['ja', '出来', '異常オプション活動']]) {
            const html = screen(body, locale);
            assert.ok(html.includes(title));
            assert.ok(html.includes(`${volume} 500 · OI —`));
            assert.ok(html.includes(`${volume} 500 · OI ${(1234).toLocaleString()}`));
            assert.equal((html.match(/class="/g) || []).length, 1, 'card remains visible');
            assert.equal((html.match(/ · OI /g) || []).length, 2, 'neither row is hidden');
            assert.doesNotMatch(html, / · OI 0|NaN|undefined|>null</);
        }
    });

    await test('control: observed OI zero stays 0; positive OI keeps its existing number format', async () => {
        collect([0, 1234]);
        const body = await response();
        assert.equal(body.contracts[0].openInterest, 0);
        const html = screen(body);
        assert.ok(html.includes('vol 500 · OI 0'));
        assert.ok(html.includes(`vol 500 · OI ${(1234).toLocaleString()}`));
        assert.equal((html.match(/ · OI /g) || []).length, 2);
    });

    await test('control: positive / negative / zero changes retain classification, signs and row order', async () => {
        collect([2234, 1000, 500], [1000, 1234, 500]);
        const body = await response();
        assert.deepEqual(body.contracts.map((c: any) => c.kind), ['OPENING', 'CLOSING', 'INTRADAY']);
        const html = screen(body);
        const positive = html.indexOf(`+${(1234).toLocaleString()}`);
        const negative = html.indexOf((-234).toLocaleString());
        assert.ok(positive >= 0 && negative > positive);
        assert.ok(html.includes('Opening') && html.includes('Closing') && html.includes('Intraday'));
        assert.equal((html.match(/ · OI /g) || []).length, 3);
        assert.ok(html.includes('vol 500 · OI 500'));
        assert.doesNotMatch(html, / · OI —/);
    });

    console.log(`\n${passed}개 통과`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    globalThis.fetch = originalFetch;
});
