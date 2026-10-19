/** 무네트워크 재현: 실제 앱 훅·페이지의 AST를 실행해 표시 경로까지 확인한다. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { averageMeasured, isFieldMissing, measuredOrNull, missingSignature, setMissingField, sameMissingFields } from '../src/lib/app/intelMissing';
import { fillSnapshotChanges, snapshotChangesFromResponse } from '../src/lib/app/intelSnapshotChange';
import { quoteFromBatchResult, pickFiniteNumber } from '../src/lib/app/intelQuoteFromBatch';
import { pickExtPrice } from '../src/utils/extWsTrust';
import { APP_SECTOR_STOCKS, SECTOR_ID_TO_HOOK_KEY, rebucketBySectorLists } from '../src/lib/app/intelSectorLists';
import { shownRegularSessionDate } from '../src/lib/marketCalendar';

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
const deps = { averageMeasured, measuredOrNull, isFieldMissing, missingSignature };
const names = ['num', 'pickNumber', 'liveLevel', 'impliedMoveMetaOf', 'mergeStockWithQuote', 'hasStockQuoteDelta', 'quoteToKeyStock', 'alignReportToConfig', 'avgChangeOfQuotes', 'formatPercentCompact', 'formatRowChange', 'ctxAverageMissing'];
const P = run(`${names.map(n => fn(page, n)).join('\n')}\nreturn { ${names.join(',')} };`, { ...deps, SECTOR_CONFIGS: [{ id: 'test', stocks: ['A', 'B', 'C'] }] });
const quote = (ticker: string, over: any = {}): any => ({ ticker, price: 100, changePct: 0, alphaScore: 0, missingFields: ['changePct', 'alphaScore'], ...over });
const snapshot = (date = '2026-10-16', tickers: any[] = [{ ticker: 'A', change_pct: -2 }, { ticker: 'B', change_pct: 0 }]) => ({ success: true, snapshot_date: date, snapshot: { tickers } });
let count = 0;
const t = (name: string, body: () => void) => { body(); count++; console.log(`✓ ${name}`); };

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
    for (const payload of [snapshot('2026-10-15'), { ...snapshot(), snapshot_date: undefined }, snapshot('2026-10-16', [{ ticker: 'A', change_pct: null }]), snapshot('2026-10-16', [{ ticker: 'A', change_pct: 0, missingFields: ['changePct'] }])]) {
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

const bandsOf = (rows: any[]) => run(`return (${decl(heat, 'bands').initializer!.getText(heat)});`, { ...deps, useMemo: (f: any) => f(), SECTORS: [{ key: 'm7' }], data: { m7: rows } });
t('카드·칩·상세·히트맵은 같은 보충값, 결측 종목 표시 유지·평균과 순위 제외', () => {
    const rows = fillSnapshotChanges([quote('A'), quote('B'), quote('C')], snapshotChangesFromResponse(snapshot()), '2026-10-16');
    assert.equal(P.avgChangeOfQuotes(rows), -1);
    const band = bandsOf(rows)[0];
    assert.equal(band.rows.length, 3); assert.equal(band.avg, -1);
    assert.deepEqual(band.rows.map((r: any) => [r.t, r.p]), [['B', 0], ['A', -2], ['C', null]]);
    const flat = run(`return (${decl(heat, 'flat').initializer!.getText(heat)});`, { bands: [band], useMemo: (f: any) => f() });
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
        shownRegularSessionDate: () => date, fillSnapshotChanges, snapshotChangesFromResponse,
        safeFetch: async (url: string) => { calls.push(url); return failed ? null : snapshot('2026-10-16', [{ ticker: 'A', change_pct: -2 }, { ticker: 'SNOW', change_pct: 4 }]); },
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
    assert.equal(isFieldMissing(base.quantumEdge[0], 'changePct'), true);
    failed = true; await timers[timers.length - 1]();
    out = render(); assert.equal(out.cloudFortress[0].changePct, 4, '일시 재조회 실패는 같은 날의 정상 마감값을 지우지 않음');
    base = { ...base, quantumEdge: [quote('SNOW', { changePct: 0, missingFields: [] })] };
    out = render(); assert.equal(out.cloudFortress[0].changePct, 0); assert.equal(out.cloudFortress[0].changePctSourceDate, undefined);
    date = '2026-10-19'; base = { ...base, quantumEdge: [quote('SNOW')] };
    out = render(); assert.equal(isFieldMissing(out.cloudFortress[0], 'changePct'), true, '거래일 전환 직후 이전 보충 제거');
    cleanups.forEach(f => f?.());
    count++; console.log('✓ 실제 앱 훅: 초기 대기→스냅샷 요청·보충→최신 0 복구→거래일 전환, 웹 core 무변경');
}

hookPath().then(() => console.log(`${count}건 통과`)).catch(e => { console.error(e); process.exitCode = 1; });
