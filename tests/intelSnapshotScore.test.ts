/** 무네트워크: 저장 매퍼 → JSON → 마감 보충 → 실제 앱 SCORE·CTX 계산. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { sessionChangeOrNull } from '../src/lib/app/intelSessionChange';
import { averageMeasured, measuredOrNull, isFieldMissing, missingSignature } from '../src/lib/app/intelMissing';
import { snapshotScoreOrNull, snapshotScoresFromResponse, fillSnapshotScores } from '../src/lib/app/intelSnapshotScore';
import { shownRegularSessionDate } from '../src/lib/marketCalendar';

const parse = (rel: string) => ts.createSourceFile(rel, fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), ts.ScriptTarget.Latest, true, rel.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function find(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node {
    let out: ts.Node | undefined;
    const visit = (n: ts.Node) => { if (out) return; if (pred(n)) out = n; else ts.forEachChild(n, visit); };
    visit(root); assert.ok(out); return out;
}
const fn = (sf: ts.SourceFile, name: string) => find(sf, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf).replace(/^export\s+/, '');
const decl = (sf: ts.SourceFile, name: string) => find(sf, n => ts.isVariableDeclaration(n) && n.name.getText(sf) === name) as ts.VariableDeclaration;
const run = (code: string, deps: Record<string, any>) => new Function(...Object.keys(deps), ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText)(...Object.values(deps));
const page = parse('src/app/[locale]/app-view/intel/page.tsx');
const route = parse('src/app/api/intel/snapshot/route.ts');
const deps = { averageMeasured, measuredOrNull, isFieldMissing, missingSignature, sessionChangeOrNull, shownRegularSessionDate: () => '2026-10-16' };
const names = ['num', 'pickNumber', 'liveLevel', 'impliedMoveMetaOf', 'quoteToKeyStock', 'mergeStockWithQuote', 'hasStockQuoteDelta', 'alignReportToConfig', 'ctxAverageMissing', 'quoteValueSignature', 'mergeReportWithBatchResults'];
const P = (tickers: string[]) => run(`${names.map(n => fn(page, n)).join('\n')}\nreturn { ${names.join(',')} };`, { ...deps, SECTOR_CONFIGS: [{ id: 'test', stocks: tickers }] });
const q = (ticker: string, alphaScore = 0, missingFields = ['alphaScore']): any => ({ ticker, alphaScore, missingFields, price: 100, changePct: 1, grade: '-' });
const payload = (tickers: any[], date: string | undefined = '2026-10-16') => ({ success: true, snapshot_date: date, snapshot: { tickers, sector_summary: { avg_alpha: 99 } } });
const saved = (quotes: any[], batchMap: any = {}) => JSON.parse(JSON.stringify(run(`${fn(route, 'nz')}\nreturn ${decl(route, 'tickerSnapshots').initializer!.getText(route)};`, { liveData: { data: quotes }, batchMap, generateVerdict: () => '', generateAnalysisKR: () => '' })));
let count = 0;
const test = (name: string, body: () => void) => { body(); count++; console.log(`✓ ${name}`); };

function display(quotes: any[]) {
    const p = P(quotes.map(r => r.ticker));
    const stocks = quotes.map(r => p.mergeStockWithQuote({ sym: r.ticker, score: 99 }, r));
    const score = run(`return ${decl(page, 'avgScore').initializer!.getText(page)};`, { ...deps, stocks });
    const report = p.alignReportToConfig({ keyStocksData: stocks, avgAlpha: 99 }, 'test', quotes);
    assert.equal(score, averageMeasured(stocks.map((s: any) => s.score)));
    assert.equal(report.avgAlpha, score ?? 0);
    assert.equal(p.ctxAverageMissing(report.avgAlpha, stocks), score == null);
    return { score, stocks, report, p };
}

test('저장 매퍼: 결측 대체 0은 null, 실측 0·양수 유지, 배치 실측 우선', () => {
    const rows = saved([q('MISSING'), q('NULL', null as any, []), q('ZERO', 0, []), q('REAL', 61, [])]);
    assert.deepEqual(rows.map((r: any) => r.alpha_score), [null, null, 0, 61]);
    assert.deepEqual(Object.keys(snapshotScoresFromResponse(payload(rows))), ['ZERO', 'REAL']);
    assert.equal(saved([q('BATCH')], { BATCH: { alphaSnapshot: { score: 0 } } })[0].alpha_score, 0);
});

test('스냅샷 canonical null·표식 우선, 별칭·실측 0 지원, 요약 99로 복제 금지', () => {
    for (const row of [{ alpha_score: null, score: 61 }, { alpha_score: 0, missingFields: ['alphaScore'] }, { alpha_score: 61, missingFields: ['alphaScore'] }, { alpha_score: NaN }, {}]) {
        assert.equal(snapshotScoreOrNull(row), null);
        assert.deepEqual(snapshotScoresFromResponse(payload([{ ticker: 'A', ...row }])), {});
    }
    assert.equal(snapshotScoreOrNull({ score: 0 }), 0);
    assert.equal(snapshotScoreOrNull({ alphaScore: 61 }), 61);
    for (const data of [{ ...payload([]), snapshot_date: undefined }, { ...payload([]), success: false }, payload([], 'bad')]) assert.deepEqual(snapshotScoresFromResponse(data), {});
    assert.equal(display(fillSnapshotScores([q('A')], snapshotScoresFromResponse(payload([])), '2026-10-16')).score, null);
});

test('전부 결측→같은 날 종목별 실측 보충, SCORE·CTX 동등, 원본·다른 결측 보존', () => {
    // 10/19 검증 때 저장된 10/16 M7 마감 응답에서 점수 열만 옮긴 재현 자료.
    const tickers = ['AAPL', 'NVDA', 'AMZN', 'MSFT', 'TSLA', 'GOOGL', 'META'];
    const scores = [69.9, 59.6, 55.4, 92.2, 54.2, 60.3, 84.2];
    const raw = tickers.map(t => q(t, 0, ['alphaScore', 'netPremium']));
    assert.equal(display(raw).score, null, '수리 전 증상');
    const out = fillSnapshotScores(raw, snapshotScoresFromResponse(payload(tickers.map((ticker, i) => ({ ticker, alpha_score: scores[i], grade: 'B' })))), '2026-10-16');
    const view = display(out);
    assert.equal(Math.round(view.score!), 68);
    assert.equal(Math.round(view.report.avgAlpha), 68);
    assert.deepEqual(view.stocks.map((s: any) => s.alphaScoreSourceDate), tickers.map(() => '2026-10-16'));
    assert.deepEqual(raw.map(r => r.missingFields), tickers.map(() => ['alphaScore', 'netPremium']));
    assert.deepEqual(out.map(r => r.missingFields), tickers.map(() => ['netPremium']));
    assert.equal(out[0].grade, 'B');
});

test('실측 0·최신 점수 우선, 혼합 보충·없는 종목 제외: 같은 분모', () => {
    const latest = [q('ZERO', 0, []), q('LIVE', 60, []), q('CLOSE'), q('NONE')];
    const scores = snapshotScoresFromResponse(payload([{ ticker: 'ZERO', alpha_score: 90 }, { ticker: 'LIVE', alpha_score: 90 }, { ticker: 'CLOSE', alpha_score: 30 }]));
    const out = fillSnapshotScores(latest, scores, '2026-10-16');
    assert.equal(out[0], latest[0]); assert.equal(out[1], latest[1]); assert.equal(out[3], latest[3]);
    assert.equal(display(out).score, 30);
    assert.deepEqual(display(out).stocks.map((s: any) => s.score), [0, 60, 30, null]);
    assert.equal(out[0].alphaScoreSourceDate, undefined);
});

test('같은 거래일만: 주말·월요일 PRE에는 금요일, REG 전환 뒤 제거', () => {
    const raw = [q('A')]; const scores = snapshotScoresFromResponse(payload([{ ticker: 'A', alpha_score: 0 }]));
    for (const time of ['2026-10-18T12:00:00Z', '2026-10-19T12:00:00Z']) assert.equal(display(fillSnapshotScores(raw, scores, shownRegularSessionDate(Date.parse(time)))).score, 0);
    const out = fillSnapshotScores(raw, scores, shownRegularSessionDate(Date.parse('2026-10-19T13:30:00Z')));
    assert.equal(out[0], raw[0]); assert.equal(display(out).score, null);
    for (const data of [payload([{ ticker: 'A', alpha_score: 61 }], '2026-10-15'), { ...payload([{ ticker: 'A', alpha_score: 61 }]), snapshot_date: undefined }]) assert.equal(fillSnapshotScores(raw, snapshotScoresFromResponse(data), '2026-10-16')[0], raw[0]);
});

test('클라우드 실측 NET 17.8, 나머지 4개 결측: 기존 4·CTX18 분모 불일치 재현', () => {
    // /tmp/iffall.json 검증 캡처: NET 17.8, SNOW·DDOG·CRM·NOW missingFields=['alphaScore'].
    const rows = ['SNOW', 'DDOG', 'NET', 'CRM', 'NOW'].map(t => t === 'NET' ? q(t, 17.8, []) : q(t));
    assert.equal(Math.round(17.8 / 5), 4);
    assert.equal(Math.round(display(rows).score!), 18);
    // 마감 보충 뒤에는 실측 0도 포함한 최종 입력 3개로 양쪽을 다시 계산한다.
    const out = fillSnapshotScores(rows, snapshotScoresFromResponse(payload([{ ticker: 'SNOW', alpha_score: 0 }, { ticker: 'CRM', alpha_score: 60 }])), '2026-10-16');
    assert.equal(display(out).score, (0 + 17.8 + 60) / 3);
});

test('숫자가 같아도 원천 날짜 전환은 실제 행 비교·메모 지문에 반영', () => {
    const p = P(['A']); const first = { ...q('A', 0, []), alphaScoreSourceDate: '2026-10-16' };
    const live = q('A', 0, []);
    assert.notEqual(p.quoteValueSignature(first), p.quoteValueSignature(live));
    assert.equal(p.hasStockQuoteDelta(p.quoteToKeyStock(first), p.quoteToKeyStock(live)), true);
    assert.equal(p.quoteToKeyStock(first).alphaScoreSourceDate, '2026-10-16');
});

test('배치 실측 0 복구 시 마감 원천 표식 제거, 결측 배치는 보충값 유지', () => {
    const p = P(['A']);
    const stock = p.quoteToKeyStock({ ...q('A', 0, []), alphaScoreSourceDate: '2026-10-16' });
    const report = { keyStocksData: [stock], avgAlpha: 0 };
    const missing = p.mergeReportWithBatchResults(report, [{ ticker: 'A', alphaSnapshot: { score: null } }]);
    assert.equal(missing.keyStocksData[0].alphaScoreSourceDate, '2026-10-16');
    const live = p.mergeReportWithBatchResults(report, [{ ticker: 'A', alphaSnapshot: { score: 0 } }]);
    assert.equal(live.keyStocksData[0].score, 0);
    assert.equal(live.keyStocksData[0].alphaScoreSourceDate, undefined);
});

test('로드·프리페치 두 실제 스냅샷 매퍼: 원천 날짜·결측 판독 일치', () => {
    const maps: ts.PropertyAssignment[] = [];
    const visit = (n: ts.Node) => { if (ts.isPropertyAssignment(n) && ['score', 'alphaScoreSourceDate'].includes(n.name.getText(page)) && n.initializer.getText(page).includes('data.snapshot_date')) maps.push(n); ts.forEachChild(n, visit); };
    visit(page); assert.equal(maps.length, 4);
    for (const date of ['2026-10-16', '2026-10-15', undefined]) for (const score of [0, 61, null]) for (const node of maps) {
        const result = run(`return ${node.initializer.getText(page)};`, { data: { ...payload([]), snapshot_date: date }, tick: { alpha_score: score }, shownRegularSessionDate: () => '2026-10-16', snapshotScoreOrNull });
        assert.equal(result, node.name.getText(page) === 'score' ? (date === '2026-10-16' ? score : null) : date === '2026-10-16' && score != null ? date : undefined);
    }
});
console.log(`${count}건 통과`);
