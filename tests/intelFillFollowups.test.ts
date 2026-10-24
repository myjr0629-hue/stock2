/** 무네트워크 재현: 실제 앱 훅·페이지의 AST를 실행해 표시 경로까지 확인한다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { applySectorBrief } from '../src/lib/app/intelSectorBrief';
import { sessionChangeOrNull, changeCoverage } from '../src/lib/app/intelSessionChange';
import { averageMeasured, isFieldMissing, measuredOrNull, missingSignature, setMissingField, sameMissingFields } from '../src/lib/app/intelMissing';
import { fillSnapshotChanges, snapshotChangesFromResponse } from '../src/lib/app/intelSnapshotChange';
import { quoteFromBatchResult, pickFiniteNumber } from '../src/lib/app/intelQuoteFromBatch';
import { fillSnapshotScores, snapshotScoresFromResponse } from '../src/lib/app/intelSnapshotScore';
import { pickExtPrice } from '../src/utils/extWsTrust';
import { APP_SECTOR_STOCKS, SECTOR_ID_TO_HOOK_KEY, rebucketBySectorLists } from '../src/lib/app/intelSectorLists';
import { prevTradingDate, shownRegularSessionDate } from '../src/lib/marketCalendar';

const parse = (rel: string) => ts.createSourceFile(rel, fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), ts.ScriptTarget.Latest, true, rel.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function find(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node {
    let found: ts.Node | undefined;
    const visit = (n: ts.Node) => { if (found) return; if (pred(n)) found = n; else ts.forEachChild(n, visit); };
    visit(root); assert.ok(found, '실제 소스 노드'); return found;
}
const fn = (sf: ts.SourceFile, name: string) => find(sf, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf).replace(/^export\s+/, '');
const decl = (sf: ts.SourceFile, name: string) => find(sf, n => ts.isVariableDeclaration(n) && n.name.getText(sf) === name) as ts.VariableDeclaration;
const run = (code: string, deps: Record<string, any>) => new Function(...Object.keys(deps), ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(...Object.values(deps));
const page = parse('src/app/[locale]/app-view/intel/page.tsx');
const heat = parse('src/app/[locale]/app-view/heatmap/page.tsx');
const hook = parse('src/hooks/useIntelSharedData.ts');
const deps = { averageMeasured, measuredOrNull, isFieldMissing, missingSignature, sessionChangeOrNull, applySectorBrief, shownRegularSessionDate: () => '2026-10-16' };
const names = ['num', 'pickNumber', 'liveLevel', 'impliedMoveMetaOf', 'mergeStockWithQuote', 'hasStockQuoteDelta', 'mergeReportWithBatchResults', 'quoteToKeyStock', 'alignReportToConfig', 'avgChangeOfQuotes', 'viewReportForApp', 'formatPercentCompact', 'formatRowChange', 'ctxAverageMissing'];
const P = run(`${names.map(n => fn(page, n)).join('\n')}\nreturn { ${names.join(',')} };`, { ...deps, SECTOR_CONFIGS: [{ id: 'test', stocks: ['A', 'B', 'C'] }] });
const quote = (ticker: string, over: any = {}): any => ({ ticker, price: 100, changePct: 0, alphaScore: 0, missingFields: ['changePct', 'alphaScore'], ...over });
const snapshot = (date = '2026-10-16', tickers: any[] = [{ ticker: 'A', close_price: 98, change_pct: -2 }, { ticker: 'B', close_price: 100, change_pct: 0 }]) => ({ success: true, snapshot_date: date, snapshot: { tickers } });
const snapshotRoute = parse('src/app/api/intel/snapshot/route.ts');
const saveTickers = (quotes: any[]) => run(`${fn(snapshotRoute, 'nz')}\nreturn ${decl(snapshotRoute, 'tickerSnapshots').initializer!.getText(snapshotRoute)};`, {
    liveData: { data: quotes }, batchMap: {}, generateVerdict: () => 'HOLD', generateAnalysisKR: () => '',
});
let count = 0;
const t = (name: string, body: () => void) => { body(); count++; console.log(`✓ ${name}`); };

t('실제 저장 매퍼→JSON→보충: 결측 0·null은 거절하고 실측 0·양수·음수만 보충', () => {
    const input = [quote('MISSING'), quote('NULL', { changePct: null, missingFields: [] }), ...[0, 2, -3].map((v, i) => quote(`REAL${i}`, { changePct: v, missingFields: [] }))];
    const stored = JSON.parse(JSON.stringify(saveTickers(input)));
    assert.deepEqual(stored.map((row: any) => row.change_pct), [null, null, 0, 2, -3]);
    const latest = input.map(q => quote(q.ticker));
    const rows = fillSnapshotChanges(latest, snapshotChangesFromResponse(snapshot('2026-10-16', stored)), '2026-10-16');
    assert.deepEqual(rows.map(q => measuredOrNull(q, 'changePct')), [null, null, 0, 2, -3]);
    assert.equal(rows[0], latest[0]); assert.equal(rows[1], latest[1]);
    assert.deepEqual(rows.slice(2).map(q => q.changePctSourceDate), ['2026-10-16', '2026-10-16', '2026-10-16']);
});

t('저장된 결측 표식·명시적 null은 대체 키의 숫자로도 복원하지 않음', () => {
    for (const row of [
        { change_pct: 0, missingFields: ['changePct'] },
        { change_pct: 3, missingFields: ['changePct'] },
        { change_pct: null, changePct: 0 },
        { change_pct: null, changePct: 3 },
    ]) {
        const latest = quote('A');
        const saved = snapshotChangesFromResponse(snapshot('2026-10-16', [{ ticker: 'A', close_price: 100, ...row }]));
        assert.deepEqual(saved, {});
        assert.equal(fillSnapshotChanges([latest], saved, '2026-10-16')[0], latest);
    }
    assert.deepEqual(snapshotChangesFromResponse(snapshot('2026-10-16', [{ ticker: 'A', price: 100, changePct: 0 }])), { A: { price: 100, changePct: 0, sourceDate: '2026-10-16' } });
});

t('fast·batch·폴링 모두 결측 → 마감 보충, 각 원천에서 실제 0 복구 → 최신 0 우선', () => {
    const merges = run(`${['normalizeSession', 'mergeFastIntoFull', 'mergeWatchlistBatchIntoQuotes'].map(n => fn(hook, n)).join('\n')}\nreturn { mergeFastIntoFull, mergeWatchlistBatchIntoQuotes };`, { ...deps, quoteFromBatchResult, pickFiniteNumber, setMissingField, sameMissingFields });
    const pipe = parse('src/hooks/useOnePipe.ts');
    const computeOnePipe = run(`${fn(pipe, 'round2')}\n${fn(pipe, 'computeOnePipe')}\nreturn computeOnePipe;`, { pickExtPrice });
    const priceFn = decl(hook, 'fetchPriceOnly');
    const pollDecl = find(priceFn, n => ts.isVariableDeclaration(n) && n.name.getText(hook) === 'updateFn') as ts.VariableDeclaration;
    const sessionDecl = find(priceFn, n => ts.isVariableDeclaration(n) && n.name.getText(hook) === 'toSession') as ts.VariableDeclaration;
    const poll = (priceMap: any) => run(`const ${sessionDecl.getText(hook)}; return ${pollDecl.initializer!.getText(hook)};`, { priceMap, computeOnePipe, setMissingField, sameMissingFields });
    const missingBatch = { ticker: 'A', realtime: { price: 100, prevClose: 100, changePct: 0, missingFields: ['changePct'], session: 'CLOSED' } };
    const first = quoteFromBatchResult(missingBatch, true)!;
    const fast = merges.mergeFastIntoFull([first], [first], true);
    const batch = merges.mergeWatchlistBatchIntoQuotes(fast, [missingBatch], true);
    const missing = poll({})(batch);
    assert.equal(isFieldMissing(missing[0], 'changePct'), true);
    const snapshots = snapshotChangesFromResponse(snapshot());
    assert.equal(fillSnapshotChanges(missing, snapshots, '2026-10-16')[0].changePct, -2);
    const restored = [
        merges.mergeFastIntoFull(missing, [{ ...first, missingFields: [] }], true),
        merges.mergeWatchlistBatchIntoQuotes(missing, [{ ...missingBatch, realtime: { ...missingBatch.realtime, missingFields: [] } }], true),
        poll({ A: { price: 100, prevClose: 100, changePercent: 0, session: 'CLOSED' } })(missing),
    ];
    for (const rows of restored) {
        assert.equal(isFieldMissing(rows[0], 'changePct'), false);
        const filled = fillSnapshotChanges(rows, snapshots, '2026-10-16');
        assert.equal(filled[0].changePct, 0); assert.equal(filled[0].changePctSourceDate, undefined);
    }
});

t('같은 거래일 마감 -2%·실제 0 보충, 원천 날짜·다른 결측 표식 보존, 원본 불변', () => {
    const raw = [quote('A'), quote('B'), quote('C')];
    const rows = fillSnapshotChanges(raw, snapshotChangesFromResponse(snapshot()), '2026-10-16');
    assert.deepEqual(rows.map(q => measuredOrNull(q, 'changePct')), [-2, 0, null]);
    assert.equal(rows[0].changePctSourceDate, '2026-10-16');
    assert.deepEqual(rows[0].missingFields, ['alphaScore']);
    assert.equal(isFieldMissing(raw[0], 'changePct'), true);
    assert.equal(raw[0].changePctSourceDate, undefined);
    assert.equal(P.formatRowChange(P.mergeStockWithQuote({ sym: 'A' }, rows[0]).changePct), '-2.00%');
    assert.equal(P.mergeStockWithQuote({ sym: 'A' }, rows[0]).changePctSourceDate, '2026-10-16');
});

t('최신 실측값은 0 포함 우선, 날짜 없는 값·다른 거래일·결측 스냅샷은 보충하지 않음', () => {
    for (const value of [0, 3]) {
        const real = quote('A', { changePct: value, missingFields: [] });
        assert.equal(fillSnapshotChanges([real], snapshotChangesFromResponse(snapshot()), '2026-10-16')[0], real);
    }
    for (const payload of [snapshot('2026-10-15'), { ...snapshot(), snapshot_date: undefined }, snapshot('2026-10-16', [{ ticker: 'A', close_price: 100, change_pct: null }]), snapshot('2026-10-16', [{ ticker: 'A', close_price: 100, change_pct: 0, missingFields: ['changePct'] }])]) {
        const q = quote('A');
        assert.equal(fillSnapshotChanges([q], snapshotChangesFromResponse(payload), '2026-10-16')[0], q);
    }
});

t('주말·월요일 프리에는 금요일만, 정규장 시작 이후 금요일 보충 금지', () => {
    for (const iso of ['2026-10-18T12:00:00Z', '2026-10-19T12:00:00Z']) {
        const date = shownRegularSessionDate(Date.parse(iso));
        assert.equal(date, '2026-10-16');
        assert.equal(fillSnapshotChanges([quote('A')], snapshotChangesFromResponse(snapshot()), date)[0].changePct, -2);
    }
    const regular = shownRegularSessionDate(Date.parse('2026-10-19T13:30:00Z'));
    assert.equal(regular, '2026-10-19');
    assert.equal(isFieldMissing(fillSnapshotChanges([quote('A')], snapshotChangesFromResponse(snapshot()), regular)[0], 'changePct'), true);
});

const sessionDate = '2026-10-16';
const sessionRows = run(`${fn(heat, 'sourceDateOf')}\n${fn(heat, 'sessionRows')}\nreturn sessionRows;`, {});
const bandsOf = (rows: any[]) => run(`return (${decl(heat, 'bands').initializer!.getText(heat)});`, { ...deps, sessionRows, sessionDate, useMemo: (f: any) => f(), SECTORS: [{ key: 'm7' }], data: { m7: rows } });
t('카드·칩·상세·히트맵은 같은 보충값, 결측 종목 표시 유지·평균과 순위 제외', () => {
    const rows = fillSnapshotChanges([quote('A'), quote('B'), quote('C')], snapshotChangesFromResponse(snapshot()), '2026-10-16');
    assert.equal(P.avgChangeOfQuotes(rows), -1);
    const band = bandsOf(rows)[0];
    assert.equal(band.rows.length, 3); assert.equal(band.avg, -1);
    assert.deepEqual(band.rows.map((r: any) => [r.t, r.p]), [['B', 0], ['A', -2], ['C', null]]);
    const flat = run(`return (${decl(heat, 'flat').initializer!.getText(heat)});`, { bands: [band], sessionRows, sessionDate, useMemo: (f: any) => f() });
    assert.deepEqual(flat.map((r: any) => r.t), ['B', 'A']);
    const none = bandsOf([quote('A'), quote('B')])[0];
    assert.equal(none.avg, null); assert.equal(none.rows.length, 2); assert.equal(none.up, 0); assert.equal(none.dn, 0);
    const chip = decl(page, 'sectorQuoteMap');
    const sectorQuoteMap = run(`return ${chip.initializer!.getText(page)};`, { ...deps, sectorQuotes: rows });
    assert.equal(sectorQuoteMap.get('A'), -2); assert.equal(sectorQuoteMap.get('C'), null);
    const leadChange = run(`return ${decl(page, 'leadChange').initializer!.getText(page)};`, { ...deps, topStock: quote('A') });
    assert.equal(P.formatPercentCompact(leadChange), '—');
});

t('SCORE·CTX·avgAlpha: 실제 0 포함, 결측 제외, 목록이 같아도 서버의 잘못된 평균 재계산', () => {
    const cases = [[0, 60, null], [null, 60, null], [0, 0, null], [null, null, null]];
    for (const scores of cases) {
        const stocks = scores.map((score, i) => ({ sym: ['A', 'B', 'C'][i], score }));
        const expected = averageMeasured(scores);
        const score = run(`return ${decl(page, 'avgScore').initializer!.getText(page)};`, { ...deps, stocks });
        assert.equal(score, expected);
        const aligned = P.alignReportToConfig({ keyStocksData: stocks, avgAlpha: 99 }, 'test', []);
        assert.equal(aligned.avgAlpha, expected ?? 0);
        assert.equal(P.ctxAverageMissing(aligned.avgAlpha, stocks), expected == null);
        const quotes = scores.map((v, i) => quote(['A', 'B', 'C'][i], { alphaScore: v ?? 0, missingFields: v == null ? ['alphaScore'] : [] }));
        assert.deepEqual(quotes.map(q => P.quoteToKeyStock(q).score), scores);
        // 설정 정렬·글로벌 행·실시간 리포트·섹터 목록의 평균 계산을 모두 실행한다.
        const averages: ts.VariableDeclaration[] = [];
        const visit = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && n.name.getText(page) === 'avgAlpha' && n.initializer?.getText(page).startsWith('averageMeasured(')) averages.push(n); ts.forEachChild(n, visit); };
        visit(page);
        assert.equal(averages.length, 4);
        for (const d of averages) assert.equal(run(`return ${d.initializer!.getText(page)};`, { ...deps, rows: stocks, keyStocksData: stocks, quotes }), expected ?? 0);
        const mergeStable = run(`${fn(page, 'mergeSectorReportStable')}\nreturn mergeSectorReportStable;`, {
            ...deps, getReportPriority: () => 0, hasRichReportPayload: () => false, reportQualityScore: () => 0,
            pickReportList: (a: any, b: any) => a || b, pickReportText: (a: any, b: any) => a || b,
        });
        const report = { avgAlpha: 99, keyStocksData: stocks };
        assert.equal(mergeStable(null, report).avgAlpha, expected ?? 0);
        assert.equal(mergeStable(report, report).avgAlpha, expected ?? 0);
    }
});

async function hookPath() {
    let base: any = { loading: true, optionsLoading: true, fetchedAt: '', refresh() {} };
    for (const key of Object.values(SECTOR_ID_TO_HOOK_KEY)) base[key] = [];
    base.m7 = [quote('A')];
    base.quantumEdge = [quote('SNOW')];
    let date = '2026-10-16';
    let failed = false;
    const calls: string[] = [];
    const timers: Array<() => Promise<void>> = [];
    const states: any[] = [], effectDeps: any[][] = [], cleanups: any[] = [], pending: any[] = [];
    let si = 0, ei = 0;
    const useState = (initial: any) => { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; };
    const useEffect = (body: any, next: any[]) => { const i = ei++; if (effectDeps[i]?.length === next.length && next.every((d, k) => Object.is(d, effectDeps[i][k]))) return; cleanups[i]?.(); effectDeps[i] = next; pending.push(() => { cleanups[i] = body(); }); };
    const wrap = run(`${fn(hook, 'useIntelSharedDataForApp')}\nreturn useIntelSharedDataForApp;`, {
        ...deps, useState, useEffect, useMemo: (f: any) => f(), useIntelSharedData: () => base,
        APP_SECTOR_STOCKS, SECTOR_ID_TO_HOOK_KEY, configTickersMissingFrom: () => [], ALL_INTEL_TICKERS: [],
        mergeExtraOptions: (rows: any[]) => rows, rebucketBySectorLists, useRealtimeData: () => ({ prices: new Map() }),
        shownRegularSessionDate: () => date, prevTradingDate, fillSnapshotChanges, snapshotChangesFromResponse, fillSnapshotScores, snapshotScoresFromResponse,
        safeFetch: async (url: string) => { calls.push(url); return failed ? null : snapshot('2026-10-16', [{ ticker: 'A', close_price: 98, change_pct: -2 }, { ticker: 'SNOW', close_price: 104, change_pct: 4, alpha_score: 61 }]); },
        setInterval: (f: () => Promise<void>) => { timers.push(f); return timers.length; }, clearInterval() {},
    });
    const render = () => { si = 0; ei = 0; const result = wrap({ sectorBasis: 'config' }); pending.splice(0).forEach(f => f()); return result; };
    render(); assert.equal(calls.length, 0, '3원천 병합 전에는 보충 요청 없음');
    base = { ...base, loading: false, optionsLoading: false };
    render(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.sort(), ['/api/intel/snapshot?sector=m7', '/api/intel/snapshot?sector=quantum_edge']);
    // A는 설정 밖이므로 제거되지만, 엔진 quantum의 SNOW는 앱 cloud로 이동해도 보충된다.
    let out = render();
    assert.equal(out.cloudFortress[0].changePct, 4); assert.equal(out.cloudFortress[0].changePctSourceDate, '2026-10-16');
    assert.equal(out.cloudFortress[0].alphaScore, 61); assert.equal(out.cloudFortress[0].alphaScoreSourceDate, '2026-10-16');
    assert.equal(isFieldMissing(base.quantumEdge[0], 'alphaScore'), true);
    assert.equal(isFieldMissing(base.quantumEdge[0], 'changePct'), true);
    failed = true; await timers[timers.length - 1]();
    out = render(); assert.equal(out.cloudFortress[0].changePct, 4, '일시 재조회 실패는 같은 날의 정상 마감값을 지우지 않음');
    base = { ...base, quantumEdge: [quote('SNOW', { changePct: 0, missingFields: [] })] };
    out = render(); assert.equal(out.cloudFortress[0].changePct, 0); assert.equal(out.cloudFortress[0].changePctSourceDate, undefined);
    date = '2026-10-19'; base = { ...base, quantumEdge: [quote('SNOW')] };
    out = render(); assert.equal(isFieldMissing(out.cloudFortress[0], 'changePct'), true, '거래일 전환 직후 이전 보충 제거');
    // 등락이 모두 실측이어도 점수 결측만으로 마감 API를 요청한다.
    failed = false; date = '2026-10-16';
    base = { ...base, m7: [], quantumEdge: [quote('SNOW', { changePct: 0, missingFields: ['alphaScore'] })] };
    render(); await new Promise(resolve => setImmediate(resolve));
    out = render(); assert.equal(out.cloudFortress[0].alphaScore, 61);
    assert.equal(out.cloudFortress[0].changePct, 0);
    base = { ...base, quantumEdge: [quote('SNOW', { changePct: 0, alphaScore: 0, missingFields: [] })] };
    out = render(); assert.equal(out.cloudFortress[0].alphaScore, 0);
    assert.equal(out.cloudFortress[0].alphaScoreSourceDate, undefined);
    cleanups.forEach(f => f?.());
    count++; console.log('✓ 실제 앱 훅: 초기 대기→스냅샷 요청·보충→최신 0 복구→거래일 전환, 웹 core 무변경');
}

hookPath().then(() => console.log(`${count}건 통과`)).catch(e => { console.error(e); process.exitCode = 1; });


t('nightly 중간2: 이전 날짜 보충은 칸에만 유지, Intel 평균·W/L·관찰 문장·캐시 합산에서 제외', () => {
    const date = '2026-10-19';
    const rows = fillSnapshotChanges([
        quote('A', { session: 'POST', changePct: -5, missingFields: [] }),
        quote('B', { session: 'POST' }),
    ], snapshotChangesFromResponse(snapshot('2026-10-16', [{ ticker: 'B', close_price: 120, change_pct: 20 }])), date);
    assert.equal(averageMeasured(rows.map(q => measuredOrNull(q, 'changePct'))), 7.5, '수정 전 오집계 재현');
    assert.equal(P.avgChangeOfQuotes(rows, date), -5);
    const raw = { keyStocksData: rows.map(P.quoteToKeyStock), avgAlpha: 0, gainers: 1, losers: 1, verdict: '', catalysts: [], bullets: [], sentiment: 'NEUTRAL' };
    const view = P.viewReportForApp(raw, 'test', rows, 'ko', date);
    assert.deepEqual([view.gainers, view.losers], [0, 1]);
    assert.match(view.verdict, /상승 0·하락 1/);
    assert.match(view.verdict, /평균 -5.0%/);
    assert.doesNotMatch(view.verdict, /B|20.00%|7.5%/);
    assert.deepEqual([view.keyStocksData[1].changePct, view.keyStocksData[1].changePctSourceDate], [20, '2026-10-16']);
    assert.equal(changeCoverage(view.gainers + view.losers, view.keyStocksData.length), ' 1/2');
    // 목록·점수 평균이 같아도 저장 당시의 W/L을 재사용하지 않는다.
    const aligned = P.alignReportToConfig(raw, 'test', rows, date);
    assert.deepEqual([aligned.gainers, aligned.losers], [0, 1]);
    const stable = P.alignReportToConfig(aligned, 'test', rows, date);
    assert.equal(stable, aligned, '재계산 후 값이 같으면 객체 안정성 유지');
    // 글로벌 리포트·시세 리포트의 실제 집계문도 같은 입력으로 실행한다.
    const visit = (n: ts.Node) => {
        if (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(page) === 'gainers')
            && /keyStocksData.filter|quotes.filter/.test(n.getText(page))) {
            const block = n.parent as ts.Block;
            const loser = block.statements.find(st => ts.isVariableStatement(st) && st.declarationList.declarations.some(d => d.name.getText(page) === 'losers'))!;
            const result = run(`${n.getText(page)}\n${loser.getText(page)}\nreturn [gainers, losers];`, { sessionChangeOrNull, sessionDate: date, quotes: rows, keyStocksData: view.keyStocksData });
            assert.deepEqual(result, [0, 1]);
        }
        ts.forEachChild(n, visit);
    };
    visit(page);
    const breadth = run(['breadthRows', 'breadthValues', 'totalGainers', 'totalLosers'].map(name => `const ${decl(page, name).getText(page)};`).join('\n') + '\nreturn [totalGainers, totalLosers, breadthValues.length];', {
        SECTOR_CONFIGS: [{ id: 'test' }], getSectorQuotes: () => rows, sessionChangeOrNull, sessionDate: date,
        datedReports: { test: { keyStocksData: rows } }, closingDate: date,
        reportCache: { old: { gainers: 99, losers: 99 } },
    });
    assert.deepEqual(breadth, [0, 1, 1]);
});

t('기준 세션의 실제 0 포함·결측 제외·전부 이전 날짜면 평균 null과 0/N', () => {
    const date = '2026-10-19';
    const rows = [
        quote('A', { changePct: 0, changePctSourceDate: date, missingFields: [] }),
        quote('B', { changePct: 20, changePctSourceDate: '2026-10-16', missingFields: [] }),
        quote('C'),
    ];
    assert.deepEqual(rows.map(q => sessionChangeOrNull(q, date)), [0, null, null]);
    assert.equal(P.avgChangeOfQuotes(rows, date), 0);
    const old = rows.slice(1, 2);
    assert.equal(P.avgChangeOfQuotes(old, date), null);
    assert.equal(changeCoverage(0, 1), ' 0/1');
    assert.equal(changeCoverage(2, 2), '');
    // 월요일 프리·주말 화면은 달력상 금요일이 기준이므로 금요일 값은 포함한다.
    for (const iso of ['2026-10-18T12:00:00Z', '2026-10-19T12:00:00Z']) {
        assert.equal(sessionChangeOrNull(rows[1], shownRegularSessionDate(Date.parse(iso))), 20);
    }
});


t('Intel 배치 실측 복구는 이전 보충 날짜를 지우고, 결측 배치는 값·날짜 보존', () => {
    const stock = { sym: 'A', changePct: 20, changePctSourceDate: '2026-10-16', score: 0 };
    const raw = { keyStocksData: [stock], avgAlpha: 0 };
    const fresh = P.mergeReportWithBatchResults(raw, [{ ticker: 'A', realtime: { changePct: 0 }, alphaSnapshot: {} }]);
    assert.equal(fresh.keyStocksData[0].changePct, 0);
    assert.equal(fresh.keyStocksData[0].changePctSourceDate, undefined);
    assert.equal(sessionChangeOrNull(fresh.keyStocksData[0], '2026-10-19'), 0);
    const missing = P.mergeReportWithBatchResults(raw, [{ ticker: 'A', realtime: { changePct: 0, missingFields: ['changePct'] }, alphaSnapshot: {} }]);
    assert.deepEqual([missing.keyStocksData[0].changePct, missing.keyStocksData[0].changePctSourceDate], [20, '2026-10-16']);
});

t('시세 없는 리포트의 날짜 없는 등락은 집계하지 않고, 날짜가 있는 저장값은 개별 행에 보존', () => {
    const unknown = P.mergeStockWithQuote({ sym: 'A', changePct: 20 });
    assert.equal(unknown.changePct, null);
    const dated = P.mergeStockWithQuote({ sym: 'A', changePct: 20, changePctSourceDate: '2026-10-16' });
    assert.equal(dated.changePct, 20);
    assert.equal(sessionChangeOrNull(dated, '2026-10-19'), null);
});
