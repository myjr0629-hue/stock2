/**
 * 가격 채택 시험 공용 하네스 — 실제 생산 코드(앱 Intel 폴링 갱신식·소켓 덮개, 웹 대시보드 저장소)를 고정 시계·무네트워크로 실행한다.
 * 쓰는 곳: tests/priceAcceptanceGates.test.ts · tests/priceBundleInvariant.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.join(__dirname, '..', '..');
export const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
export const compile = (s: string) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
export function load(file: string, deps: Record<string, any>, globals: any = {}) {
    const modExports = {};
    const ctx = vm.createContext({ exports: modExports, module: { exports: modExports }, console: { log() {}, warn() {}, error() {} }, Date, AbortController,
        require: (name: string) => { assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`); return deps[name]; }, ...globals });
    vm.runInContext(compile(read(file)), ctx);
    return (ctx as any).module.exports;
}
export const EDT = (ymd: string, hh: number, mm = 0, ss = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}-04:00`);
export const EST = (ymd: string, hh: number, mm = 0, ss = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}-05:00`);

/** 앱 Intel 의 실제 폴링 갱신식(fetchPriceOnly.updateFn)·소켓 덮개(overlay)를 고정 시계로 실행한다 */
export function intelAt(nowMs: number) {
    class Clock extends Date { constructor(...a: any[]) { super(...((a.length ? a : [nowMs]) as [])); } static now() { return nowMs; } }
    const pipe = load('src/hooks/useOnePipe.ts', {
        react: {}, swr: {}, '@/providers/WebSocketProvider': {}, '@/hooks/useMarketStatus': {},
        '@/utils/extWsTrust': require('../../src/utils/extWsTrust'),
        '@/lib/sourceStamp': require('../../src/lib/sourceStamp'), '@/lib/marketCalendar': require('../../src/lib/marketCalendar'),
        ...(read('src/hooks/useOnePipe.ts').includes("'@/lib/priceAcceptance'") ? { '@/lib/priceAcceptance': require('../../src/lib/priceAcceptance') } : {}),
    }, { Date: Clock });
    const sf = ts.createSourceFile('intel.ts', read('src/hooks/useIntelSharedData.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const find = (root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node => {
        let hit: ts.Node | undefined;
        const walk = (n: ts.Node) => { if (!hit && pred(n)) hit = n; if (!hit) ts.forEachChild(n, walk); };
        walk(root); assert.ok(hit); return hit!;
    };
    const varInit = (root: ts.Node, name: string) => find(root, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) as ts.VariableDeclaration;
    const fnText = (name: string) => find(sf, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf);
    const missing = require('../../src/lib/app/intelMissing');
    const PA = fs.existsSync(path.join(root, 'src/lib/priceAcceptance.ts')) ? require('../../src/lib/priceAcceptance') : { serverRegularPriceUsable: undefined };
    const make = (code: string, names: string[]) => { const box: any = { module: { exports: null }, Date: Clock }; vm.runInNewContext(compile(`module.exports = function(${names.join(',')}) { ${code} };`), box); return box.module.exports; };
    const priceFn = varInit(sf, 'fetchPriceOnly');
    const serverObs = new Map();
    const update = (priceMap: any) => make(`const ${varInit(priceFn, 'toSession').getText(sf)};\nreturn (${varInit(priceFn, 'updateFn').initializer!.getText(sf)});`,
        ['priceMap', 'computeOnePipe', 'setMissingField', 'sameMissingFields', 'serverRegularPriceUsable', 'intelServerObs', 'isOlderObservation'])(priceMap, pipe.computeOnePipe, missing.setMissingField, missing.sameMissingFields, PA.serverRegularPriceUsable, serverObs, PA.isOlderObservation);
    const normalizeSession = make(`${fnText('normalizeSession')}\nreturn normalizeSession;`, [])();
    const overlay = (ws: Map<string, any>) => make(`return (${varInit(sf, 'overlay').initializer!.getText(sf)});`,
        ['wsPrices', 'computeOnePipe', 'normalizeSession', 'setMissingField', 'sameMissingFields', 'intelServerObs'])(ws, pipe.computeOnePipe, normalizeSession, missing.setMissingField, missing.sameMissingFields, serverObs);
    return { update, overlay, serverObs };
}
export const intelRow = (o: any) => ({ ticker: 'AAPL', price: 0, changePct: 0, prevClose: 0, volume: 0, extendedPrice: 0, extendedChangePct: 0, extendedLabel: '', session: 'regular', ...o });

/** 대시보드 저장소를 고정 시계로(소켓 채택이 시계를 쓰는 경로) */
export function makeStoreAt(quoteRows: Record<string, any>, session: string, nowMs: number) {
    class Clock extends Date { constructor(...a: any[]) { super(...((a.length ? a : [nowMs]) as [])); } static now() { return nowMs; } }
    const pipe = load('src/hooks/useOnePipe.ts', {
        react: {}, swr: {}, '@/providers/WebSocketProvider': {}, '@/hooks/useMarketStatus': {},
        '@/utils/extWsTrust': require('../../src/utils/extWsTrust'),
        '@/lib/sourceStamp': require('../../src/lib/sourceStamp'), '@/lib/marketCalendar': require('../../src/lib/marketCalendar'),
        '@/lib/priceAcceptance': require('../../src/lib/priceAcceptance'),
    }, { Date: Clock });
    return load('src/stores/dashboardStore.ts', {
        zustand: require('zustand'), 'zustand/middleware': { persist: (init: any) => init },
        '@/hooks/useOnePipe': pipe, '@/lib/storage/dashboardTickerStore': {},
        '@/lib/impliedMove': { copyImpliedMoveGroup: () => ({}) }, '@/lib/vwap': { normalizeVwap: (v: any) => v },
        '@/lib/priceAcceptance': require('../../src/lib/priceAcceptance'),
    }, { Date: Clock, fetch: async () => ({ ok: true, json: async () => ({ data: quoteRows, session, timestamp: nowMs }) }) }).useDashboardStore;
}
