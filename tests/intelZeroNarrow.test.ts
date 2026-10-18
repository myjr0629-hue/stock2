/**
 * 무결성 3차 N2·N3 좁힌 수리(2026-10-19) — «실제 0» vs «결측을 채운 0» 을 결측 표식(missingFields)으로 가른다.
 *
 * 원 결함(integ-audit-rest N2·N3): Intel 화면 병합(pickNumber)이 최신 «실제 0»을 이전 값으로 되돌렸고, 섹터 스퀴즈 평균이 filter(v>0)로 실제 0 을 뺐다.
 * 재설계: 생산자 값 모양(0)은 그대로 · 못 잰 칸 이름만 missingFields 로 덧붙인다 · Intel 화면의 병합·평균만 표식을 읽는다.
 * 판단 기준(src/lib/app/intelMissing.ts): missingFields 에 칸 이름이 있거나 값이 숫자가 아니면 결측 → 행 null(«—»)·이전 값 미유지·평균 제외. 표식 없는 0 = 실제 0.
 * 앞선 세 관문(10190542·10190642·10190722)이 잡은 회귀도 여기서 막는다: 가격·등락 0 덮어쓰기 · prevClose 덮어쓰기 · 가격 결측 위험 문장 · 점수 전부 결측 NaN.
 *
 * 무네트워크. 페이지·훅·서비스의 «실제 소스»를 AST 로 떼어 실행한다(React·서비스 모듈을 불러오지 않는다).
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/intelZeroNarrow.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { averageMeasured, isFieldMissing, measuredOrNull, missingSignature, sameMissingFields, setMissingField } from '../src/lib/app/intelMissing';
import { batchMissingFields, pickFiniteNumber, quoteFromBatchResult } from '../src/lib/app/intelQuoteFromBatch';
import { pickExtPrice } from '../src/utils/extWsTrust';

const ROOT = path.resolve(__dirname, '..');
const parse = (rel: string) => {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    return ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
};
function findNode(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node {
    let found: ts.Node | undefined;
    const visit = (n: ts.Node) => { if (found) return; if (pred(n)) { found = n; return; } ts.forEachChild(n, visit); };
    visit(root);
    assert.ok(found, '소스에서 노드를 찾지 못했다');
    return found!;
}
const fnText = (sf: ts.SourceFile, name: string) => findNode(sf, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf).replace(/^export\s+/, '');
const varDecl = (root: ts.Node, sf: ts.SourceFile, name: string) => findNode(root, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) as ts.VariableDeclaration;
function compile(code: string, args: string[] = []): (...a: any[]) => any {
    const out = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true });
    assert.equal(out.diagnostics?.length ?? 0, 0, '떼어낸 코드가 변환돼야 한다');
    return new Function(...args, out.outputText) as any;
}

// ── 페이지(app-view/intel) ──
const page = parse('src/app/[locale]/app-view/intel/page.tsx');
const pageNames = ['num', 'pickNumber', 'liveLevel', 'impliedMoveMetaOf', 'mergeStockWithQuote', 'hasStockQuoteDelta', 'mergeReportWithBatchResults',
    'quoteToKeyStock', 'safeAverage', 'formatRowChange', 'rowChangeColor', 'ctxAverageMissing', 'ctxText'];
const helperArgs = ['averageMeasured', 'isFieldMissing', 'measuredOrNull', 'missingSignature'];
const helpers = [averageMeasured, isFieldMissing, measuredOrNull, missingSignature];
const P = compile(`${pageNames.map((n) => fnText(page, n)).join('\n')}\nreturn { ${pageNames.join(', ')} };`, helperArgs)(...helpers);

// 섹터 카드 스퀴즈 평균(sectorSummaries 안의 avgSqueeze 문장) + 카드 칸(displaySqueeze → tapeMetrics 의 스퀴즈 값)
const summaries = varDecl(page, page, 'sectorSummaries');
const summaryBlock = findNode(summaries, ts.isBlock) as ts.Block;
const avgStmt = summaryBlock.statements.find((st) => ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'avgSqueeze'))!;
assert.ok(avgStmt, 'sectorSummaries 의 avgSqueeze');
const displayDecl = varDecl(page, page, 'displaySqueeze');
const tape = varDecl(page, page, 'tapeMetrics');
const sqMetric = findNode(tape, (n) => ts.isObjectLiteralExpression(n) && n.properties.some((p) => ts.isPropertyAssignment(p) && p.name.getText(page) === 'label' && p.initializer.getText(page) === 'labels.squeeze')) as ts.ObjectLiteralExpression;
const sqValue = (sqMetric.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(page) === 'value') as ts.PropertyAssignment).initializer.getText(page);
const sectorSqueeze = compile(`${avgStmt.getText(page)}\nconst sec = { avgSqueeze };\nconst ${displayDecl.getText(page)};\nreturn { avg: avgSqueeze, text: ${sqValue} };`, ['quotes', ...helperArgs]);
const squeezeCard = (quotes: any[]) => sectorSqueeze(quotes, ...helpers);

// 보고서 행 평균 점수(buildSectorReportFromQuotes 계열 · keyStocksData 의 avgAlpha 문장) — NaN 이 나오면 안 된다
const alphaStmtNode = findNode(page, (n) => ts.isVariableStatement(n) && /^const avgAlpha = safeAverage\(keyStocksData\.map/.test(n.getText(page)));
const rowAvgAlpha = compile(`${fnText(page, 'safeAverage')}\n${alphaStmtNode.getText(page)}\nreturn avgAlpha;`, ['keyStocksData']);

// ── 훅(useIntelSharedData) ──
const hook = parse('src/hooks/useIntelSharedData.ts');
const H = compile(`${['normalizeSession', 'mergeFastIntoFull', 'mergeWatchlistBatchIntoQuotes'].map((n) => fnText(hook, n)).join('\n')}\nreturn { normalizeSession, mergeFastIntoFull, mergeWatchlistBatchIntoQuotes };`,
    ['quoteFromBatchResult', 'pickFiniteNumber', 'isFieldMissing', 'setMissingField', 'sameMissingFields'])(quoteFromBatchResult, pickFiniteNumber, isFieldMissing, setMissingField, sameMissingFields);
// computeOnePipe(실제 소스) — 훅 파일은 브라우저 모듈을 불러오므로 함수만 뗀다
const pipeSf = parse('src/hooks/useOnePipe.ts');
const computeOnePipe = compile(`${fnText(pipeSf, 'round2')}\n${fnText(pipeSf, 'computeOnePipe')}\nreturn computeOnePipe;`, ['pickExtPrice'])(pickExtPrice);
// 앱 WS 덧씌우기(overlay)·가격 폴링(updateFn) — 실제 화살표 함수
const overlayDecl = varDecl(hook, hook, 'overlay');
const makeOverlay = compile(`return (${overlayDecl.initializer!.getText(hook)});`, ['wsPrices', 'computeOnePipe', 'normalizeSession', 'setMissingField', 'sameMissingFields']);
const overlayWith = (ws: Map<string, any>) => makeOverlay(ws, computeOnePipe, H.normalizeSession, setMissingField, sameMissingFields);
const priceFn = findNode(hook, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'fetchPriceOnly') as ts.VariableDeclaration;
const toSessionDecl = varDecl(priceFn, hook, 'toSession');
const updateDecl = varDecl(priceFn, hook, 'updateFn');
const makeUpdate = compile(`const ${toSessionDecl.getText(hook)};\nreturn (${updateDecl.initializer!.getText(hook)});`, ['priceMap', 'computeOnePipe', 'setMissingField', 'sameMissingFields']);
const pollWith = (priceMap: Record<string, any>) => makeUpdate(priceMap, computeOnePipe, setMissingField, sameMissingFields);

// ── 배치 서비스 buildBasePrice(실제 소스) ──
const svc = parse('src/services/watchlistBatchService.ts');
const baseDecl = varDecl(svc, svc, 'buildBasePrice');
const basePrice = (snap: any, currentSession: string, dailyCloses?: number[]) =>
    compile(`return (${baseDecl.initializer!.getText(svc)})(dailyCloses);`, ['snap', 'currentSession', 'dailyCloses', 'isTradeInExtSession', 'extTodayET', 'extShownDate', 'postCloseMap'])(
        snap, currentSession, dailyCloses, () => false, '2026-10-16', '2026-10-16', {});

// ── 웹 순위 행의 «벽까지 거리»(실제 소스) — 가격이 남아야 위험 문장이 거짓이 아니다 ──
const rankSf = parse('src/components/intel/SectorRankingRow.tsx');
const squeezeDecl = varDecl(rankSf, rankSf, 'squeeze');
const rankSqueeze = compile(`return ${squeezeDecl.initializer!.getText(rankSf)};`, ['quotes']);

// ── /api/intel/fast 의 등락 계산부(실제 소스: 종목 한 줄 함수의 «const prevClose …» ~ «if (session === 'PRE') {…}» 문장들) ──
const fastSf = parse('src/app/api/intel/fast/route.ts');
const prevCloseStmt = findNode(fastSf, (nd) => ts.isVariableStatement(nd) && /^const prevClose = snap\?\.prevDay\?\.c \|\| 0;/.test(nd.getText(fastSf)));
const fastBlock = prevCloseStmt.parent as ts.Block;
const fi = fastBlock.statements.indexOf(prevCloseStmt as ts.Statement);
const fj = fastBlock.statements.findIndex((st, k) => k > fi && ts.isIfStatement(st) && st.expression.getText(fastSf) === "session === 'PRE'");
assert.ok(fi >= 0 && fj > fi, 'fast 라우트 등락 계산부');
const fastChange = compile(`${fastBlock.statements.slice(fi, fj + 1).map((st) => st.getText(fastSf)).join('\n')}\nreturn { displayPrice, displayChangePct, changeMeasured };`, ['snap', 'session', 'aggMap', 'ticker', 'cached']);

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

const prevRow = { sym: 'TEST', grade: 'A', score: 80, changePct: 2, closePrice: 100, gex: 1, pcr: 0.9, gammaRegime: 'LONG', maxPain: 95, callWall: 110, putFloor: 90,
    rsi: 60, rvol: 1.2, netPremium: 1_000_000, squeezeScore: 60, ivSkew: 1.1, impliedMovePct: 3, whaleIndex: 50, darkPoolPct: 40 };
const latestQuote = (over: any = {}) => ({ ticker: 'TEST', price: 100, changePct: 0, prevClose: 100, alphaScore: 0, grade: 'C', netPremium: 0, squeezeScore: 0, gex: 0, pcr: 0, ...over });

console.log('N2 — 병합: 실제 0 은 0, 결측은 null(이전 값 미유지)');
t('이전 +2%·80·100만·60 → 최신 실제 0(표식 없음) → 네 칸 모두 0', () => {
    const m = P.mergeStockWithQuote(prevRow, latestQuote());
    assert.deepEqual([m.changePct, m.score, m.netPremium, m.squeezeScore], [0, 0, 0, 0]);
    assert.equal(P.hasStockQuoteDelta(prevRow, m), true, '0 으로 바뀐 것도 변경이다');
    assert.equal(P.formatRowChange(m.changePct), '+0.00%');
    assert.equal(P.ctxText(m.score), '0');
});
t('최신 결측(missingFields) → 네 칸 모두 null · 이전 값(+2·80·100만·60)을 남기지 않는다 · 등락 «—»', () => {
    const q = latestQuote({ grade: '', missingFields: ['changePct', 'alphaScore', 'netPremium', 'squeezeScore'] });
    const m = P.mergeStockWithQuote(prevRow, q);
    assert.deepEqual([m.changePct, m.score, m.netPremium, m.squeezeScore], [null, null, null, null]);
    assert.equal(m.grade, null, '점수를 못 쟀으면 이전 등급 A 도 남기지 않는다');
    assert.equal(P.formatRowChange(m.changePct), '—');
    assert.equal(P.rowChangeColor(m.changePct), '#94a3b8');
    assert.equal(P.ctxText(m.score), '—');
});
t('최신 결측(null·NaN 값) → null · 가격은 0 을 건너뛰는 예전 규칙 그대로(가격 0 은 실제 값이 아니다)', () => {
    const m = P.mergeStockWithQuote(prevRow, latestQuote({ price: 0, prevClose: 0, changePct: NaN, alphaScore: null, netPremium: null, squeezeScore: undefined }));
    assert.deepEqual([m.changePct, m.score, m.netPremium, m.squeezeScore], [null, null, null, null]);
    assert.equal(m.closePrice, 100, '가격 결측 → 이전 가격(0·null 아님)');
});
t('음수·양수는 그대로 · 시세가 없으면 예전과 같다(행 유지, GEX·PCR 만 비움)', () => {
    const m = P.mergeStockWithQuote(prevRow, latestQuote({ changePct: -1.5, alphaScore: 42, netPremium: -5e5, squeezeScore: 12 }));
    assert.deepEqual([m.changePct, m.score, m.netPremium, m.squeezeScore], [-1.5, 42, -5e5, 12]);
    assert.deepEqual(P.mergeStockWithQuote(prevRow, undefined), { ...prevRow, gex: null, pcr: null, gammaRegime: null });
});
t('배치 직접 병합: 잰 0 은 0 · 배치가 못 잰 칸(null · 스냅샷 없음 표식)은 시세 병합 값을 그대로', () => {
    const report = { keyStocksData: [prevRow] };
    const zero = P.mergeReportWithBatchResults(report, [{ ticker: 'TEST', alphaSnapshot: { score: 0 }, realtime: { price: 100, changePct: 0, netPremium: 0, squeezeScore: 0 } }]);
    const r0 = zero.keyStocksData[0];
    assert.deepEqual([r0.changePct, r0.score, r0.netPremium, r0.squeezeScore], [0, 0, 0, 0]);
    const noSnap = P.mergeReportWithBatchResults(report, [{ ticker: 'TEST', alphaSnapshot: null, realtime: { price: 0, changePct: 0, netPremium: null, squeezeScore: null, missingFields: ['price', 'changePct'] } }]);
    const rn = noSnap.keyStocksData[0];
    assert.deepEqual([rn.changePct, rn.score, rn.netPremium, rn.squeezeScore, rn.closePrice], [2, 80, 1_000_000, 60, 100], '못 잰 칸은 0 으로 덮지 않는다');
});
t('시세 → 행(quoteToKeyStock): 등락·순프리미엄·스퀴즈는 실제 0 은 0, 결측은 null (점수는 기존 규칙 «0 이하 = 없음» 그대로)', () => {
    const real = P.quoteToKeyStock(latestQuote({ price: 50 }));
    assert.deepEqual([real.changePct, real.score, real.netPremium, real.squeezeScore], [0, null, 0, 0]);
    const miss = P.quoteToKeyStock(latestQuote({ price: 50, missingFields: ['changePct', 'alphaScore', 'netPremium', 'squeezeScore'] }));
    assert.deepEqual([miss.changePct, miss.score, miss.netPremium, miss.squeezeScore], [null, null, null, null]);
});

console.log('N3 — 섹터 스퀴즈 평균: 실제 0 포함 · 결측 제외');
t('[0, 60] → 30 · 칸 «30%»', () => {
    const r = squeezeCard([latestQuote({ squeezeScore: 0 }), latestQuote({ squeezeScore: 60 })]);
    assert.equal(r.avg, 30); assert.equal(r.text, '30%');
});
t('[결측(표식), 60] → 60 · [결측(null), 60] → 60', () => {
    assert.equal(squeezeCard([latestQuote({ squeezeScore: 0, missingFields: ['squeezeScore'] }), latestQuote({ squeezeScore: 60 })]).text, '60%');
    assert.equal(squeezeCard([latestQuote({ squeezeScore: null }), latestQuote({ squeezeScore: 60 })]).avg, 60);
});
t('전부 결측 → «—» · 전부 실제 0 → «0%»', () => {
    const none = squeezeCard([latestQuote({ squeezeScore: 0, missingFields: ['squeezeScore'] }), latestQuote({ squeezeScore: null })]);
    assert.equal(none.avg, null); assert.equal(none.text, '—');
    assert.equal(squeezeCard([latestQuote({ squeezeScore: 0 }), latestQuote({ squeezeScore: 0 })]).text, '0%');
});
t('관문 1 재현: 배치로 만든 RGTI·QBTS(스퀴즈 결측 → 0+표식) + IONQ 60 → 60(20 아님) · 전부 결측 → «—»(0% 아님)', () => {
    const rg = quoteFromBatchResult({ ticker: 'RGTI', realtime: { price: 10, changePct: 1 }, alphaSnapshot: null }, true)!;
    const qb = quoteFromBatchResult({ ticker: 'QBTS', realtime: { price: 10, changePct: 1 }, alphaSnapshot: null }, true)!;
    assert.equal(rg.squeezeScore, 0, '값 모양은 예전 그대로(0)');
    assert.ok(rg.missingFields?.includes('squeezeScore'));
    assert.equal(squeezeCard([latestQuote({ squeezeScore: 60 }), rg, qb]).text, '60%');
    assert.equal(squeezeCard([rg, qb]).text, '—');
});

console.log('훅 병합 — 결측 0 으로 덮지 않기 · 실제 0 반영 · 관문 회귀');
const existing = { ticker: 'TEST', price: 102, changePct: 2, prevClose: 100, volume: 1, extendedPrice: 0, extendedChangePct: 0, extendedLabel: '', session: 'REG',
    alphaScore: 80, grade: 'A', maxPain: 95, callWall: 110, putFloor: 90, gex: 1, pcr: 0.9, gammaRegime: 'LONG', sparkline: [], netPremium: 1e6, rsi: 50, rvol: 1,
    squeezeScore: 60, ivSkew: 1, impliedMovePct: 3, whaleIndex: 0, darkPoolPct: 0 };
t('관문 1 재현: 시세 스냅샷 없는 배치(가격·등락 0 + 표식) → 기존 $102·+2% 유지(0·0% 아님)', () => {
    const base = basePrice(undefined, 'regular');
    assert.deepEqual(base.missingFields, ['price', 'changePct']);
    const [m] = H.mergeWatchlistBatchIntoQuotes([existing], [{ ticker: 'TEST', alphaSnapshot: { score: 80, grade: 'A' }, realtime: { price: base.displayPrice, changePct: base.changePct, missingFields: base.missingFields, squeezeScore: 60, netPremium: 1e6 } }], true);
    assert.equal(m.price, 102); assert.equal(m.changePct, 2); assert.equal(m.prevClose, 100);
    assert.equal(isFieldMissing(m, 'changePct'), false);
});
t('배치가 잰 실제 0(보합·점수 0·순프리미엄 0·스퀴즈 0) → 0 반영, 표식 없음', () => {
    const [m] = H.mergeWatchlistBatchIntoQuotes([existing], [{ ticker: 'TEST', alphaSnapshot: { score: 0 }, realtime: { price: 100, changePct: 0, netPremium: 0, squeezeScore: 0 } }], true);
    assert.deepEqual([m.changePct, m.alphaScore, m.netPremium, m.squeezeScore], [0, 0, 0, 0]);
    assert.equal(m.missingFields, undefined);
    const row = P.mergeStockWithQuote(prevRow, m);
    assert.deepEqual([row.changePct, row.score, row.netPremium, row.squeezeScore], [0, 0, 0, 0]);
});
t('기존 스퀴즈가 null(빠른 응답 «못 잼») + 배치도 못 잼 → 값 0 이지만 결측 표식(평균·행에서 결측)', () => {
    const [m] = H.mergeWatchlistBatchIntoQuotes([{ ...existing, squeezeScore: null }], [{ ticker: 'TEST', realtime: { price: 100, changePct: 1 } }], true);
    assert.equal(m.squeezeScore, 0);
    assert.equal(isFieldMissing(m, 'squeezeScore'), true);
    assert.equal(P.mergeStockWithQuote(prevRow, m).squeezeScore, null);
});
t('빠른 응답 병합: 등락 실제 0 → 0(예전 `||` 는 +2% 로 되돌렸다) · 등락 결측(표식·가격 없음) → 기존 값 유지', () => {
    const [z] = H.mergeFastIntoFull([existing], [{ ...existing, price: 100, changePct: 0 }], true);
    assert.equal(z.changePct, 0);
    const [k] = H.mergeFastIntoFull([existing], [{ ...existing, price: 100, changePct: 0, missingFields: ['changePct'] }], true);
    assert.equal(k.changePct, 2); assert.equal(isFieldMissing(k, 'changePct'), false);
    const [np] = H.mergeFastIntoFull([existing], [{ ...existing, price: 0, changePct: 0, prevClose: 0 }], true);
    assert.equal(np.price, 102); assert.equal(np.changePct, 2); assert.equal(np.prevClose, 100);
});
t('관문 3 재현: 배치 병합 뒤 prevClose 를 덮지 않는다 → WS 102 → +2%(0% 아님)', () => {
    const [m] = H.mergeWatchlistBatchIntoQuotes([existing], [{ ticker: 'TEST', alphaSnapshot: { score: 70 }, realtime: { price: 102, changePct: 2 } }], true);
    assert.equal(m.prevClose, 100);
    const [o] = overlayWith(new Map([['TEST', { price: 102 }]]))([{ ...m, price: 101.5 }]);
    assert.equal(o.prevClose, 100); assert.equal(o.changePct, 2);
});
t('WS·폴링이 등락을 «쟀으면» 결측 표식을 끈다 · 못 쟀으면 그대로', () => {
    const missingQ = { ...existing, changePct: 0, missingFields: ['changePct'] };
    const [o] = overlayWith(new Map([['TEST', { price: 101 }]]))([missingQ]);
    assert.equal(isFieldMissing(o, 'changePct'), false); assert.equal(o.changePct, 1);
    const [p] = pollWith({ TEST: { price: 100, prevClose: 100, changePercent: 0, session: 'REG' } })([missingQ]);
    assert.equal(p.changePct, 0); assert.equal(isFieldMissing(p, 'changePct'), false, '실제 보합 0 — 표식 해제');
    const [pre] = pollWith({ TEST: { price: 100, session: 'PRE' } })([{ ...missingQ, session: 'PRE' }]);
    assert.equal(isFieldMissing(pre, 'changePct'), true, 'PRE 에 등락률이 안 왔으면 결측 그대로');
});
t('관문 3 재현: 가격 결측 배치 뒤에도 가격이 남아 «벽까지 거리»가 유한 — «리스크 낮음» 오판정 없음', () => {
    const [m] = H.mergeWatchlistBatchIntoQuotes([existing], [{ ticker: 'TEST', realtime: { price: 0, changePct: 0, missingFields: ['price', 'changePct'] } }], true);
    const [sq] = rankSqueeze([m]);
    assert.ok(Number.isFinite(sq.value), `거리 ${sq.value}`);
    assert.equal(sq.label, `${((110 - 102) / 102 * 100).toFixed(1)}%`);
    assert.equal(typeof m.price, 'number'); assert.ok(m.price > 0);
});
t('관문 3 재현: 점수 전부 결측 → 행 «—» · 평균은 숫자(NaN 없음) · CTX «—»', () => {
    const qs = ['A', 'B', 'C'].map((s) => ({ ...latestQuote({ ticker: s, alphaScore: 0, missingFields: ['alphaScore'] }) }));
    const rows = qs.map((q) => P.mergeStockWithQuote({ ...prevRow, sym: q.ticker }, q));
    assert.ok(rows.every((r: any) => r.score === null && P.ctxText(r.score) === '—'));
    const avg = rowAvgAlpha(rows);
    assert.ok(Number.isFinite(avg), `평균 ${avg}`);
    assert.equal(P.ctxAverageMissing(avg, rows), true);
    assert.equal(P.ctxAverageMissing(NaN, rows), true, 'NaN 은 그리지 않는다');
    assert.equal(P.ctxAverageMissing(0, [{ score: 0 }]), false, '실제 0 점은 0');
    assert.equal(P.ctxAverageMissing(62, []), false, '서버 평균이 있으면 그대로');
});

t('관문 2 재현 방지: 훅을 지난 시세 값은 늘 숫자(정렬·히트맵·합계가 NaN·null 을 만나지 않는다)', () => {
    const outs = [
        ...H.mergeWatchlistBatchIntoQuotes([existing], [{ ticker: 'TEST', realtime: { price: 0, changePct: 0, missingFields: ['price', 'changePct'] } }], true),
        ...H.mergeWatchlistBatchIntoQuotes([{ ...existing, squeezeScore: null }], [{ ticker: 'TEST', realtime: {} }], true),
        ...H.mergeFastIntoFull([existing], [{ ...existing, price: 0, changePct: 0, missingFields: ['changePct'] }], true),
        ...H.mergeWatchlistBatchIntoQuotes([], [{ ticker: 'NEW', realtime: { price: 0, changePct: 0, missingFields: ['price', 'changePct'] } }], true),
    ];
    for (const q of outs) for (const k of ['price', 'changePct', 'prevClose', 'alphaScore', 'squeezeScore']) assert.ok(Number.isFinite(q[k]), `${q.ticker}.${k}=${q[k]}`);
});

console.log('생산자 표식');
t('관문 10190755 재현: intel/fast — day.c 없이 전일 종가로 채운 0% 는 결측(POST·CLOSED·PRE) · day.c 있는 보합 0 은 잰 값', () => {
    for (const session of ['POST', 'CLOSED', 'PRE']) {
        const r = fastChange({ prevDay: { c: 100 }, day: { c: 0 }, lastTrade: { p: 0 } }, session, {}, 'T', null);
        assert.equal(r.displayChangePct, 0, session);
        assert.equal(r.changeMeasured, false, `${session}: 채운 0% 는 결측`);
        const flat = fastChange({ prevDay: { c: 100 }, day: { c: 100 }, lastTrade: { p: 100 } }, session, {}, 'T', null);
        assert.deepEqual([flat.displayChangePct, flat.changeMeasured], [0, true], `${session}: 실제 보합`);
    }
    assert.equal(fastChange(undefined, 'REG', {}, 'T', null).changeMeasured, false, '스냅샷 없음');
    assert.equal(fastChange({ prevDay: { c: 100 }, day: { c: 101 }, todaysChangePerc: 0 }, 'REG', {}, 'T', null).changeMeasured, true, '정규장 등락률 0 은 잰 값');
    assert.equal(fastChange({ prevDay: { c: 0 }, day: { c: 0 } }, 'PRE', { T: { prevClose: 100, prevPrevClose: 100 } }, 'T', null).changeMeasured, true, 'PRE 일봉 보합');
    // 결측 표식이 붙은 빠른 응답은 기존 +2% 를 0% 로 덮지 않는다(훅 mergeFastIntoFull)
    const [k] = H.mergeFastIntoFull([existing], [{ ...existing, price: 100, changePct: 0, missingFields: ['changePct'] }], true);
    assert.equal(k.changePct, 2);
});
t('관문 10190755 재현: 상세 칸 SQUEEZE·NET PREM — 잰 0 은 «0%»·«$0.0M», 결측은 «-»', () => {
    const tapeSq = findNode(page, (nd) => ts.isObjectLiteralExpression(nd) && nd.properties.some((pp) => ts.isPropertyAssignment(pp) && pp.name.getText(page) === 'label' && pp.initializer.getText(page) === "'SQUEEZE'")) as ts.ObjectLiteralExpression;
    const tapeNp = findNode(page, (nd) => ts.isObjectLiteralExpression(nd) && nd.properties.some((pp) => ts.isPropertyAssignment(pp) && pp.name.getText(page) === 'label' && pp.initializer.getText(page) === "'NET PREM'")) as ts.ObjectLiteralExpression;
    const valueOf = (obj: ts.ObjectLiteralExpression) => (obj.properties.find((pp) => ts.isPropertyAssignment(pp) && pp.name.getText(page) === 'value') as ts.PropertyAssignment).initializer.getText(page);
    const cell = compile(`${fnText(page, 'num')}\nreturn [${valueOf(tapeSq)}, ${valueOf(tapeNp)}];`, ['stock']);
    assert.deepEqual(cell(P.mergeStockWithQuote(prevRow, latestQuote())), ['0%', '$0.0M']);
    assert.deepEqual(cell(P.mergeStockWithQuote(prevRow, latestQuote({ missingFields: ['netPremium', 'squeezeScore'] }))), ['-', '-']);
    assert.deepEqual(cell({ squeezeScore: 61.6, netPremium: -2_500_000 }), ['62%', '$2.5M']);
});
t('buildBasePrice: 정규장 실시간·전일 종가 → 잰 값(표식 없음) · 프리 최후 폴백 0 → 등락 결측', () => {
    assert.deepEqual(basePrice({ lastTrade: { p: 100, t: 0 }, day: { c: 100 }, prevDay: { c: 100 } }, 'regular').missingFields, [], '보합 0 은 실제 0');
    const pre = basePrice({ lastTrade: { p: 0 }, day: { c: 0 }, prevDay: { c: 99 } }, 'pre');
    assert.equal(pre.changePct, 0); assert.deepEqual(pre.missingFields, ['changePct']);
    assert.deepEqual(basePrice({ lastTrade: { p: 0 }, day: { c: 0 }, prevDay: { c: 99 } }, 'pre', [98, 99]).missingFields, []);
});
t('quoteFromBatchResult: 값은 예전 그대로(0·웹 50) + 결측 칸 이름', () => {
    const app = quoteFromBatchResult({ ticker: 'X', realtime: { price: 0, changePct: 0, missingFields: ['price', 'changePct'] } }, true)!;
    assert.equal(app.changePct, 0); assert.equal(app.alphaScore, 0);
    assert.deepEqual(app.missingFields, ['changePct', 'alphaScore', 'netPremium', 'squeezeScore']);
    const web = quoteFromBatchResult({ ticker: 'X', realtime: { price: 5, changePct: 0, netPremium: 0, squeezeScore: 0 }, alphaSnapshot: { score: 0 } }, false)!;
    assert.equal(web.missingFields, undefined, '실제 0 만 있으면 표식 없음(필드도 없다)');
    assert.deepEqual(batchMissingFields({ realtime: { changePct: 1, netPremium: 1, squeezeScore: 1 }, alphaSnapshot: { score: 1 } }), []);
});
t('표식 도구: 켜고 끄기 · 순서 무시 비교 · 지문', () => {
    assert.deepEqual(setMissingField(undefined, 'changePct', true), ['changePct']);
    assert.equal(setMissingField(['changePct'], 'changePct', false), undefined);
    assert.equal(sameMissingFields(['a', 'b'], ['b', 'a']), true);
    assert.equal(sameMissingFields(undefined, []), true);
    assert.equal(missingSignature({ missingFields: ['squeezeScore', 'alphaScore'] }), 'alphaScore,squeezeScore');
    assert.equal(averageMeasured([0, 60]), 30); assert.equal(averageMeasured([null, 60]), 60); assert.equal(averageMeasured([null, undefined, NaN]), null);
    assert.equal(isFieldMissing({ price: 0 }, 'price'), true);
});

console.log(`\n${n}건 통과`);
