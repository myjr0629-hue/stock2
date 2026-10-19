/** 관문 10191750: CLOSED 전일 가격에 당일 등락만 붙는 경로를 실제 상세 행까지 재현. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { fillSnapshotChanges, snapshotChangesFromResponse } from '../src/lib/app/intelSnapshotChange';
import { averageMeasured, isFieldMissing, measuredOrNull, missingSignature } from '../src/lib/app/intelMissing';
import { prevTradingDate } from '../src/lib/marketCalendar';
import { fillSnapshotScores, snapshotScoresFromResponse } from '../src/lib/app/intelSnapshotScore';

const source = ts.createSourceFile('page.tsx', fs.readFileSync(`${__dirname}/../src/app/[locale]/app-view/intel/page.tsx`, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['num', 'pickNumber', 'liveLevel', 'impliedMoveMetaOf', 'mergeStockWithQuote'];
const functions = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text || '')).map(n => n.getText(source));
assert.equal(functions.length, names.length);
const mergeStockWithQuote = new Function('averageMeasured', 'isFieldMissing', 'measuredOrNull', 'missingSignature', ts.transpileModule(`${functions.join('\n')}\nreturn mergeStockWithQuote;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText)(averageMeasured, isFieldMissing, measuredOrNull, missingSignature);

const quote = (over: any = {}): any => ({ ticker: 'A', session: 'CLOSED', price: 100, prevClose: 100, changePct: 0, regularCloseToday: null, missingFields: ['changePct', 'alphaScore'], ...over });
const payload = (date = '2026-10-16', rows: any[] = [{ ticker: 'A', close_price: 98, change_pct: -2 }]) => ({ success: true, snapshot_date: date, snapshot: { tickers: rows } });
let count = 0;
const test = (name: string, body: () => void) => { body(); count++; console.log(`✓ ${name}`); };

test('관문 입력 그대로: CLOSED $100 대체 + 같은 거래일 $98/-2% → 상세 $98/-2%', () => {
    const raw = quote();
    const out = fillSnapshotChanges([raw], snapshotChangesFromResponse(payload()), '2026-10-16')[0];
    const detail = mergeStockWithQuote({ sym: 'A', closePrice: 100 }, out);
    assert.deepEqual([detail.closePrice, detail.changePct, detail.changePctSourceDate], [98, -2, '2026-10-16']);
    assert.equal(out.regularCloseToday, 98);
    assert.deepEqual(out.missingFields, ['alphaScore']);
    assert.deepEqual([raw.price, raw.changePct, raw.regularCloseToday], [100, 0, null]);
});

test('실측 보합도 가격과 함께 채택하고 가격 결측 표식만 해제', () => {
    const raw = quote({ missingFields: ['price', 'changePct', 'alphaScore'] });
    const out = fillSnapshotChanges([raw], snapshotChangesFromResponse(payload('2026-10-16', [{ ticker: 'A', close_price: 97, change_pct: 0 }])), '2026-10-16')[0];
    assert.deepEqual([out.price, out.changePct, out.changePctSourceDate], [97, 0, '2026-10-16']);
    assert.deepEqual(out.missingFields, ['alphaScore']);
});

test('가격·등락 중 한쪽 결측이면 쌍 전체 거절, 명시적 null·표식은 대체 키보다 우선', () => {
    for (const fields of [
        { close_price: null, price: 98 }, { close_price: 0 }, { close_price: -1 }, { close_price: NaN },
        { close_price: Infinity }, { close_price: '98' }, { close_price: undefined },
        { missingFields: ['price'] }, { change_pct: null, changePct: -2 }, { missingFields: ['changePct'] },
    ]) {
        const saved = snapshotChangesFromResponse(payload('2026-10-16', [{ ticker: 'A', close_price: 98, change_pct: -2, ...fields }]));
        assert.deepEqual(saved, {});
        const raw = quote();
        assert.equal(fillSnapshotChanges([raw], saved, '2026-10-16')[0], raw);
    }
});

test('장외에서 같은 날 쌍이 없으면 직전 정규장 실측 쌍과 날짜를 함께 사용', () => {
    for (const session of ['CLOSED', 'POST', 'PRE']) {
        const out = fillSnapshotChanges([quote({ session })], snapshotChangesFromResponse(payload('2026-10-15', [{ ticker: 'A', close_price: 100, change_pct: 1.25 }])), '2026-10-16')[0];
        const detail = mergeStockWithQuote({ sym: 'A' }, out);
        assert.deepEqual([detail.closePrice, detail.changePct, detail.changePctSourceDate], [100, 1.25, '2026-10-15']);
        assert.equal(out.regularCloseToday, null, '어제 가격을 오늘 종가 잠금으로 쓰지 않음');
    }
});

test('정규장 전환·미래·직전보다 오래된 값 거절, 실제 원천이 없으면 결측 유지', () => {
    for (const [session, date] of [['REG', '2026-10-15'], ['CLOSED', '2026-10-14'], ['CLOSED', '2026-10-19']]) {
        const raw = quote({ session });
        assert.equal(fillSnapshotChanges([raw], snapshotChangesFromResponse(payload(date)), '2026-10-16')[0], raw);
    }
    const raw = quote();
    assert.equal(fillSnapshotChanges([raw], {}, '2026-10-16')[0], raw);
    assert.equal(measuredOrNull(raw, 'changePct'), null);
});

test('최신 실측이 복구되면 실제 0 포함 가격·등락 쌍 우선', () => {
    for (const changePct of [0, 3]) {
        const raw = quote({ price: 103, changePct, missingFields: ['alphaScore'] });
        assert.equal(fillSnapshotChanges([raw], snapshotChangesFromResponse(payload()), '2026-10-16')[0], raw);
    }
});

// 실제 앱 훅의 로딩·날짜 지정 재조회·섹터 병합을 무네트워크로 실행한다.
const hookSource = ts.createSourceFile('hook.ts', fs.readFileSync(`${__dirname}/../src/hooks/useIntelSharedData.ts`, 'utf8'), ts.ScriptTarget.Latest, true);
const hookFn = hookSource.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'useIntelSharedDataForApp')!;
async function hookCase(session: string, latest: any, previous: any) {
    const base = { m7: [quote({ session }), quote({ ticker: 'B', session })], loading: false, optionsLoading: false };
    const calls: string[] = [], states: any[] = [], effects: Array<() => any> = [];
    let si = 0;
    const useState = (initial: any) => { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; };
    const deps = {
        useState, useEffect: (f: () => any) => effects.push(f), useMemo: (f: () => any) => f(), useIntelSharedData: () => base,
        SECTOR_ID_TO_HOOK_KEY: { m7: 'm7' }, APP_SECTOR_STOCKS: { m7: ['A', 'B'] }, ALL_INTEL_TICKERS: [],
        mergeExtraOptions: (rows: any[]) => rows, useRealtimeData: () => ({ prices: new Map() }),
        shownRegularSessionDate: () => '2026-10-16', prevTradingDate, isFieldMissing,
        fillSnapshotChanges, snapshotChangesFromResponse, fillSnapshotScores, snapshotScoresFromResponse,
        safeFetch: async (url: string) => { calls.push(url); return url.includes('&date=') ? previous : latest; },
        setInterval: () => 1, clearInterval() {},
    };
    const wrap = new Function(...Object.keys(deps), ts.transpileModule(`${hookFn.getText(hookSource).replace(/^export\s+/, '')}\nreturn useIntelSharedDataForApp;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText)(...Object.values(deps));
    wrap();
    const cleanups = effects.splice(0).map(f => f());
    await new Promise(resolve => setImmediate(resolve));
    si = 0;
    const out = wrap();
    cleanups.forEach(f => f?.());
    return { out, calls };
}

async function hookTests() {
    const prior = payload('2026-10-15', [{ ticker: 'A', close_price: 100, change_pct: 1.25 }, { ticker: 'B', close_price: 75, change_pct: -1.5 }]);
    const latest = payload('2026-10-16', [{ ticker: 'A', close_price: 98, change_pct: -2 }, { ticker: 'B', close_price: null, change_pct: 3 }]);
    const { out, calls } = await hookCase('CLOSED', latest, prior);
    test('실제 훅: 당일 쌍 우선, 불완전 종목만 직전 거래일을 1회 재조회해 쌍·날짜 보충', () => {
        assert.deepEqual(calls, ['/api/intel/snapshot?sector=m7', '/api/intel/snapshot?sector=m7&date=2026-10-15']);
        assert.deepEqual(out.m7.map((q: any) => [q.price, q.changePct, q.changePctSourceDate]), [[98, -2, '2026-10-16'], [75, -1.5, '2026-10-15']]);
    });
    const old = await hookCase('CLOSED', prior, null);
    test('실제 훅: 최신 응답 자체가 직전 정규장 실측이면 추가 요청 없이 채택', () => {
        assert.equal(old.calls.length, 1);
        assert.deepEqual(old.out.m7.map((q: any) => [q.price, q.changePct, q.changePctSourceDate]), [[100, 1.25, '2026-10-15'], [75, -1.5, '2026-10-15']]);
    });
    const missing = await hookCase('CLOSED', payload('2026-10-16', []), null);
    test('실제 훅: 직전 원천도 없을 때만 결측 유지, 상수 등락을 만들지 않음', () => {
        assert.equal(missing.calls.length, 2);
        assert.deepEqual(missing.out.m7.map((q: any) => measuredOrNull(q, 'changePct')), [null, null]);
    });
    const regular = await hookCase('REG', prior, prior);
    test('실제 훅: 정규장에는 직전 날짜 재조회·보충 없음', () => {
        assert.equal(regular.calls.length, 1);
        assert.deepEqual(regular.out.m7.map((q: any) => measuredOrNull(q, 'changePct')), [null, null]);
    });
}
hookTests().then(() => console.log(`${count}건 통과`)).catch(e => { console.error(e); process.exitCode = 1; });
