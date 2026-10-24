import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as C from '../scripts/lambda-cross-sector/closingReport';
import { averageMeasured } from '../src/lib/app/intelMissing';
import { sessionChangeOrNull, coverageTitle } from '../src/lib/app/intelSessionChange';
import { APP_SECTOR_STOCKS } from '../src/lib/app/intelSectorLists';
import { applySectorBrief } from '../src/lib/app/intelSectorBrief';
import { snapshotChangeOrNull } from '../src/lib/app/intelSnapshotChange';
import { snapshotScoreOrNull } from '../src/lib/app/intelSnapshotScore';
import { etDateOf } from '../src/lib/marketCalendar';
const DAY = '2026-10-22';
const NOW = new Date('2026-10-23T16:00:00Z');
const q = { price: 100, changePct: -2, marketTime: '2026-10-22T20:00:00Z' };
assert.ok(C.sessionReading(q, DAY, NOW));
for (const change of [{ marketTime: '2026-10-23T15:00:00Z' }, { marketTime: undefined }, { marketTime: '2026-10-22T16:00:00' }, { isStale: true }, { marketTime: '2026-10-23T18:00:00Z' }]) {
    assert.equal(C.sessionReading({ ...q, ...change }, DAY, NOW), null);
}
const badEvidence = C.evidenceProblems({ closingNarrative: {} }, { sessionDate: DAY, regularClose: { spx: { sessionDate: '2026-10-21' } }, news: [{ publishedEt: '2026-10-21 08:30 ET' }], readings: { vix: { ...q, marketTime: '2026-10-23T15:00:00Z' } } });
for (const error of ['narrative:session-date', 'narrative:news-date', 'narrative:reading-date']) assert.ok(badEvidence.includes(error));
const path = 'src/app/[locale]/app-view/intel/page.tsx';
const source = fs.readFileSync(process.argv[2] || path, 'utf8');
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(pred: (n: ts.Node) => boolean): ts.Node {
    let result: ts.Node | undefined;
    function visit(n: ts.Node) { if (result) return; if (pred(n)) result = n; else ts.forEachChild(n, visit); }
    visit(sf); assert.ok(result); return result;
}
const func = (name: string) => find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf);
const builder = find(n => ts.isVariableDeclaration(n) && n.name.getText(sf) === 'buildSnapshotReport') as ts.VariableDeclaration;
const body = (builder.initializer as ts.CallExpression).arguments[0].getText(sf);
const deps: Record<string, any> = { averageMeasured, sessionChangeOrNull, applySectorBrief, snapshotChangeOrNull, snapshotScoreOrNull, etDateOf,
    SECTOR_CONFIGS: [{ id: 'm7', stocks: ['AAPL', 'MSFT'] }, ...Object.entries(APP_SECTOR_STOCKS).filter(([id]) => id !== 'm7').map(([id, stocks]) => ({ id, stocks }))],
    SECTOR_APP_COPY: { en: Object.fromEntries(Object.keys(APP_SECTOR_STOCKS).map(id => [id, { name: id }])) }, locale: 'en', appLocale: 'en',
    normalizeNewsDigest: (v: any) => v || [], cleanReportText: (v: any) => v, normalizeDigestLines: () => [], taggedImpliedMovePct: () => null, impliedMoveMetaOf: () => ({}), num: (v: any) => v ?? null,
    mergeStockWithQuote: (stock: any, quote: any) => { assert.equal(quote, undefined, '마감 행에 최신 시세 없음'); return stock; },
};
const compiled = ts.transpileModule(`${func('alignReportToConfig')}\n${func('avgChangeOfQuotes')}\n${func('closingReportForApp')}\nreturn { build: ${body}, view: closingReportForApp };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const { build, view } = new Function(...Object.keys(deps), compiled)(...Object.values(deps));
const rowCallback = (find(n => ts.isCallExpression(n) && n.expression.getText(sf) === 'cached.keyStocksData.slice(0, 5).map') as ts.CallExpression).arguments[0].getText(sf);
const rowJs = ts.transpileModule(`${func('rowChangeColor')}\n${func('formatRowChange')}\nreturn (${rowCallback});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const renderRow = new Function('require', 'exports', 'StockLogo', 'sessionDate', 'appCopy', rowJs)(require, {}, () => null, DAY, {});
const response = { success: true, snapshot_date: DAY, snapshot: { meta: { snapshot_timestamp: '2026-10-22T20:30:00Z' }, sector_summary: { newsDigest: [{ title: 'AAPL same-session news', tickers: ['AAPL'], publishedAt: '2026-10-22T12:30:00Z' }, { title: 'AAPL next-session news', tickers: ['AAPL'], publishedAt: '2026-10-23T12:30:00Z' }] }, tickers: [
    { ticker: 'AAPL', change_pct: -2, close_price: 100, gex: 10, pcr: 1, alpha_score: 60 },
    { ticker: 'MSFT', change_pct: 1, close_price: 200, gex: -3, pcr: 0.9, alpha_score: 50 },
] } };
for (const language of ['ko', 'en', 'ja'] as const) {
    const raw = build(response, 'm7', DAY);
    const result = view(raw, 'm7', language, DAY);
    assert.equal(result.keyStocksData[0].gex, 10); assert.equal(result.keyStocksData[0].pcr, 1);
    assert.equal(result.gainers, 1); assert.equal(result.losers, 1);
    assert.deepEqual(result.keyStocksData.map((r: any) => r.changePct), [-2, 1]);
    assert.equal(result.newsItems.length, 1);
    assert.ok(result.reportSummary.includes('-2.00%'));
    assert.equal(build(response, 'm7', '2026-10-23'), null, '다른 날짜 저장본 거절');
}
// Actual producer universe includes only IONQ from the configured quantum universe.
const apiSource = fs.readFileSync('src/app/api/intel/snapshot/route.ts', 'utf8');
const apiSf = ts.createSourceFile('route.ts', apiSource, ts.ScriptTarget.Latest, true);
let tickerLists: ts.VariableDeclaration | undefined;
const visitApi = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && n.name.getText(apiSf) === 'SECTOR_TICKERS') tickerLists = n;
    ts.forEachChild(n, visitApi);
};
visitApi(apiSf);
assert.ok(tickerLists);
const producer = new Function(`return ${tickerLists.initializer!.getText(apiSf)};`)();
for (const language of ['ko', 'en', 'ja'] as const) {
    for (const tickers of [producer.quantum_edge, ['IONQ', 'RGTI', 'QBTS'], []]) {
        const raw = build({ ...response, snapshot: { ...response.snapshot, tickers: tickers.map((ticker: string) => ({ ticker, change_pct: ticker === 'IONQ' ? 0 : -2, close_price: 100, gex: 10, pcr: 1, alpha_score: 60 })) } }, 'quantum_edge', DAY);
        const before = JSON.stringify(raw);
        const result = view(raw, 'quantum_edge', language, DAY);
        assert.equal(JSON.stringify(raw), before, '원본 저장 행 변경 없음');
        assert.deepEqual(result.keyStocksData.map((r: any) => r.sym), APP_SECTOR_STOCKS.quantum_edge);
        const measured = result.keyStocksData.filter((r: any) => sessionChangeOrNull(r, DAY) != null);
        assert.equal(result.gainers, tickers.includes('IONQ') ? 1 : 0, '실측 0은 W에 포함');
        assert.equal(result.losers, tickers.includes('RGTI') ? 2 : 0, '결측을 W/L에 넣지 않음');
        assert.equal(coverageTitle(measured.length, result.keyStocksData.length), measured.length === 3 ? undefined : `${measured.length}/3`);
        for (const row of result.keyStocksData) {
            if (tickers.includes(row.sym)) { assert.equal(row.gex, 10); assert.equal(row.pcr, 1); }
            else {
                for (const field of ['grade', 'score', 'changePct', 'closePrice', 'gex', 'pcr', 'gammaRegime']) assert.equal(row[field], null, `${row.sym} ${field} 결측`);
                const text = renderToStaticMarkup(renderRow(row)).replace(/<[^>]*>/g, '');
                assert.equal(text, `${row.sym}——`, '실제 앱 행에 종목명·결측 등급·결측 등락 유지');
            }
        }
    }
    for (const [id, tickers] of Object.entries(producer) as Array<[string, string[]]>) {
        const raw = build({ ...response, snapshot: { ...response.snapshot, tickers: tickers.map(ticker => ({ ticker, change_pct: -2, close_price: 100, gex: 10, pcr: 1, alpha_score: 60 })) } }, id, DAY);
        assert.deepEqual(view(raw, id, language, DAY).keyStocksData.map((r: any) => r.sym), deps.SECTOR_CONFIGS.find((s: any) => s.id === id).stocks, `${id} 설정 종목 전체 유지`);
    }
}
// Assert the executing report path supplies no live quotes and never refreshes from the live loader.
assert.match(source, /closingReportForApp\(raw, sec.id, appLocale, closingDate\)/);
assert.match(source, /snapshot\?sector=\$\{sec.id\}&date=\$\{closingDate\}/);
assert.match(source, /Object.values\(datedReports\).flatMap/);
const reportView = source.slice(source.indexOf('{/* CLOSING REPORT VIEW */}'), source.indexOf("intelTab === 'sector'", source.indexOf('{/* CLOSING REPORT VIEW */}')));
assert.equal(/getSectorQuotes\(|loadSectorReport\(|reportCache\[/.test(reportView), false);
const api = fs.readFileSync('src/app/api/intel/snapshot/route.ts', 'utf8');
// 날짜 지정: 같은 스냅샷 시각의 공식 종가 보정(main M7)만 — 최신 AI 제목은 덮지 않는다
assert.match(api, /snapshot: date \? await reconcileOfficialCloses\(s1.data\) : await overlayAiHeadline/);
assert.match(api, /snapshot: date \? await reconcileOfficialCloses\(s2.data\) : await overlayAiHeadline/);
for (const file of ['src/app/api/intel/cross-sector-brief/route.ts', 'scripts/lambda-cross-sector/index.js']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /CLOSING.sessionReading\(q, todayDate, now\)/);
    assert.match(text, /sectorInputs: sectorSummaries/);
}
console.log('ok - 10/23 장중에 10/22 보고서: 세 언어 섹터·W/L·뉴스·생성 입력 세션 분리');
