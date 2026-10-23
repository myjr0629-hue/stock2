import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as C from '../scripts/lambda-cross-sector/closingReport';
import { averageMeasured } from '../src/lib/app/intelMissing';
import { sessionChangeOrNull } from '../src/lib/app/intelSessionChange';
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
const source = fs.readFileSync(path, 'utf8');
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
    SECTOR_CONFIGS: [{ id: 'm7', stocks: ['AAPL', 'MSFT'] }], SECTOR_APP_COPY: { en: { m7: { name: 'M7' } } }, locale: 'en', appLocale: 'en',
    normalizeNewsDigest: (v: any) => v || [], cleanReportText: (v: any) => v, normalizeDigestLines: () => [], taggedImpliedMovePct: () => null, impliedMoveMetaOf: () => ({}), num: (v: any) => v ?? null,
    mergeStockWithQuote: (stock: any, quote: any) => { assert.equal(quote, undefined, '마감 행에 최신 시세 없음'); return stock; },
};
const compiled = ts.transpileModule(`${func('alignReportToConfig')}\n${func('avgChangeOfQuotes')}\n${func('closingReportForApp')}\nreturn { build: ${body}, view: closingReportForApp };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const { build, view } = new Function(...Object.keys(deps), compiled)(...Object.values(deps));
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
// Assert the executing report path supplies no live quotes and never refreshes from the live loader.
assert.match(source, /closingReportForApp\(raw, sec.id, appLocale, closingDate\)/);
assert.match(source, /snapshot\?sector=\$\{sec.id\}&date=\$\{closingDate\}/);
assert.match(source, /Object.values\(datedReports\).flatMap/);
const reportView = source.slice(source.indexOf('{/* CLOSING REPORT VIEW */}'), source.indexOf("intelTab === 'sector'", source.indexOf('{/* CLOSING REPORT VIEW */}')));
assert.equal(/getSectorQuotes\(|loadSectorReport\(|reportCache\[/.test(reportView), false);
const api = fs.readFileSync('src/app/api/intel/snapshot/route.ts', 'utf8');
assert.match(api, /snapshot: date \? s1.data : await overlayAiHeadline/);
assert.match(api, /snapshot: date \? s2.data : await overlayAiHeadline/);
for (const file of ['src/app/api/intel/cross-sector-brief/route.ts', 'scripts/lambda-cross-sector/index.js']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /CLOSING.sessionReading\(q, todayDate, now\)/);
    assert.match(text, /sectorInputs: sectorSummaries/);
}
console.log('ok - 10/23 장중에 10/22 보고서: 세 언어 섹터·W/L·뉴스·생성 입력 세션 분리');
