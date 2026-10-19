/** 관문 10191814: 원천 날짜와 REG→CLOSED 폴링을 실제 화면 계산·앱 훅으로 재현. 무네트워크. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { test } from 'node:test';
import { fillSnapshotChanges, snapshotChangesFromResponse } from '../src/lib/app/intelSnapshotChange';
import { fillSnapshotScores, snapshotScoresFromResponse } from '../src/lib/app/intelSnapshotScore';
import { isFieldMissing } from '../src/lib/app/intelMissing';
import { etLastClosedSessionDate, prevTradingDate, shownRegularSessionDate } from '../src/lib/marketCalendar';

const read = (rel: string) => fs.readFileSync(`${__dirname}/../${rel}`, 'utf8');
const compile = (code: string, deps: Record<string, any>) => new Function(...Object.keys(deps), ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText)(...Object.values(deps));
const page = read('src/app/[locale]/app-view/intel/page.tsx');
const labelCode = page.slice(page.indexOf('  const sessionLabel ='), page.indexOf('  // Session-accurate status badge'));
const now = Date.parse('2026-10-17T01:00:00Z'); // 10/16 CLOSED, 달력상 마지막 마감 10/16
const quote = (session = 'CLOSED', over: any = {}): any => ({ ticker: 'A', session, price: 100, prevClose: 100, changePct: 0, regularCloseToday: null, missingFields: ['changePct'], ...over });
const payload = (date: string, rows: any[]) => ({ success: true, snapshot_date: date, snapshot: { tickers: rows } });
const previous = payload('2026-10-15', [{ ticker: 'A', close_price: 98, change_pct: -2 }]);
const label = (rows: any[], session = 'closed', time = now) => compile(`${labelCode}\nreturn closedAsOfLabel;`, {
    isMarketLive: session === 'regular', marketStatus: { session, isHoliday: false },
    appCopy: { closedAsOf: (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))} 마감 기준` },
    SECTOR_CONFIGS: [{ id: 'm7' }], getSectorQuotes: () => rows, isFieldMissing,
    etLastClosedSessionDate: () => etLastClosedSessionDate(time), shownRegularSessionDate: () => shownRegularSessionDate(time),
});

test('관문 원천 날짜: 10/16 결측→10/15 $98/-2%이면 표시도 10/15', () => {
    const out = fillSnapshotChanges([quote()], snapshotChangesFromResponse(previous), '2026-10-16');
    assert.deepEqual(out.map(q => [q.price, q.changePct, q.changePctSourceDate]), [[98, -2, '2026-10-15']]);
    assert.equal(label(out), '10/15 마감 기준');
});

test('당일·직전 실측 혼합은 두 원천 날짜를 보존하고 결측 행 날짜는 넣지 않음', () => {
    const rows = fillSnapshotChanges([quote()], snapshotChangesFromResponse(previous), '2026-10-16');
    rows.push(quote('CLOSED', { ticker: 'B', price: 105, changePct: 5, missingFields: [] }), quote());
    assert.equal(label(rows), '10/15 마감 기준 · 10/16 마감 기준');
    assert.equal(label([quote()]), null, '실제 채택한 값이 없으면 날짜도 만들지 않음');
    assert.equal(label([rows[1]]), '10/16 마감 기준');
});

test('날짜 기준은 기존 달력: 주말·월요일 PRE의 금요일 값, REG 복구 후 이전 날짜 제거', () => {
    const friday = snapshotChangesFromResponse(payload('2026-10-16', [{ ticker: 'A', close_price: 98, change_pct: -2 }]));
    const sunday = Date.parse('2026-10-18T12:00:00Z');
    assert.equal(label(fillSnapshotChanges([quote()], friday, shownRegularSessionDate(sunday)), 'closed', sunday), '10/16 마감 기준');
    const latest = quote('REG', { price: 100, changePct: 0, missingFields: [] });
    const out = fillSnapshotChanges([latest], friday, '2026-10-19');
    assert.equal(out[0], latest);
    assert.equal(label(out, 'regular', Date.parse('2026-10-19T14:00:00Z')), null);
});

const hookSource = ts.createSourceFile('hook.ts', read('src/hooks/useIntelSharedData.ts'), ts.ScriptTarget.Latest, true);
const hookFn = hookSource.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'useIntelSharedDataForApp')!;
function harness() {
    let base = { m7: [quote('REG')], loading: false, optionsLoading: false };
    let latest = payload('2026-10-16', []);
    const calls: string[] = [], states: any[] = [], effectDeps: any[][] = [], cleanups: any[] = [], pending: any[] = [];
    const timers = new Map<number, () => Promise<void>>();
    let si = 0, ei = 0, timerId = 0;
    const useState = (initial: any) => { const i = si++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; };
    const useEffect = (body: any, next: any[]) => { const i = ei++; if (effectDeps[i]?.length === next.length && next.every((d, k) => Object.is(d, effectDeps[i][k]))) return; cleanups[i]?.(); effectDeps[i] = next; pending.push(() => { cleanups[i] = body(); }); };
    const wrap = compile(`${hookFn.getText(hookSource).replace(/^export\s+/, '')}\nreturn useIntelSharedDataForApp;`, {
        useState, useEffect, useMemo: (f: any) => f(), useIntelSharedData: () => base,
        SECTOR_ID_TO_HOOK_KEY: { m7: 'm7' }, APP_SECTOR_STOCKS: { m7: ['A'] }, ALL_INTEL_TICKERS: [],
        mergeExtraOptions: (rows: any[]) => rows, useRealtimeData: () => ({ prices: new Map() }),
        shownRegularSessionDate: () => '2026-10-16', prevTradingDate, isFieldMissing,
        fillSnapshotChanges, snapshotChangesFromResponse, fillSnapshotScores, snapshotScoresFromResponse,
        safeFetch: async (url: string) => { calls.push(url); return url.includes('&date=') ? previous : latest; },
        setInterval: (f: () => Promise<void>) => { timers.set(++timerId, f); return timerId; }, clearInterval: (id: number) => timers.delete(id),
    });
    return {
        calls,
        render: () => { si = 0; ei = 0; const out = wrap(); pending.splice(0).forEach(f => f()); return out; },
        session: (session: string, over: any = {}) => { base = { ...base, m7: [quote(session, over)] }; },
        latest: (data: any) => { latest = data; },
        poll: async () => { for (const f of timers.values()) await f(); },
        cleanup: () => cleanups.forEach(f => f?.()),
    };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('관문 장 전환: 결측 목록·거래일 동일한 REG→CLOSED 뒤 날짜 지정 요청과 쌍·날짜 보충', async () => {
    const h = harness();
    try {
        h.render(); await flush();
        assert.deepEqual(h.calls, ['/api/intel/snapshot?sector=m7']);
        h.session('CLOSED'); h.render(); await flush(); await h.poll();
        const out = h.render();
        assert.ok(h.calls.includes('/api/intel/snapshot?sector=m7&date=2026-10-15'));
        assert.deepEqual(out.m7.map((q: any) => [q.price, q.changePct, q.changePctSourceDate]), [[98, -2, '2026-10-15']]);
        assert.equal(label(out.m7), '10/15 마감 기준');
        assert.equal(h.calls.filter(url => url.includes('&date=')).length, 2, '장 전환 1회·폴링 1회, 추가 반복 없음');
        h.session('CLOSED', { price: 101 }); h.render(); await flush();
        assert.equal(h.calls.length, 5, '세션·결측이 같으면 가격 갱신마다 요청하지 않음');
    } finally { h.cleanup(); }
});

test('장 전환 뒤 당일 쌍 도착·실측 0 복구, REG에서는 직전 값 제거', async () => {
    const h = harness();
    try {
        h.render(); await flush();
        h.session('POST'); h.render(); await flush();
        assert.deepEqual(h.render().m7.map((q: any) => [q.price, q.changePct, q.changePctSourceDate]), [[98, -2, '2026-10-15']]);
        h.latest(payload('2026-10-16', [{ ticker: 'A', close_price: 99, change_pct: 0 }]));
        await h.poll();
        assert.deepEqual(h.render().m7.map((q: any) => [q.price, q.changePct, q.changePctSourceDate]), [[99, 0, '2026-10-16']]);
        h.session('REG', { price: 101, changePct: 0, missingFields: [] });
        const out = h.render();
        assert.deepEqual(out.m7.map((q: any) => [q.price, q.changePct, q.changePctSourceDate]), [[101, 0, undefined]]);
    } finally { h.cleanup(); }
});
