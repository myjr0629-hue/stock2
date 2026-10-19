/**
 * 가격 채택 통합(fix/price-acceptance) — 관문 보류 지적의 «재현 입력 → 실제 생산 함수 → 최종 표시 값» 시험(무네트워크).
 * 실행: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/priceAcceptanceGates.test.ts
 *
 * 이 파일은 «이미 있던» 공개 함수만 부른다(새 모듈 직접 호출 없음) — 통합 전 코드에서 같은 입력이 실패하는지 대조할 수 있다.
 *   B1-10191713  웹 Dashboard 초기 진입(SSR) → 저장소 → 실제 화면 계산식: 목 98·금 100·월 PRE 100 → 본장 100 · PRE 0.00%(본장 98 · +2.04% 금지)
 *   B4-10191403① POST 확정 종가 110(+10%) 뒤 같은 날 15:55 REST 105 → Flow/CMD 110 · +10% 유지
 *   B4-10191403② 금 POST 행(종가 100·전일 98) 보존 → 월 REG 신선 틱 100.50 → +0.50%(+2.55% 금지)
 *   S-10191700①  11/27 13:30 벌크 «정규장 가격» 자리의 마감 뒤 중간값 111 → 직전 실제 정규장 110 · +10% 유지(설계서 T35)
 *   S-10191741   조기 폐장 3일 13:30 UC AI 입력 마감 시각 13:00 ET · «16:00 마감» 문장은 출력 검사가 잡는다(T40~T43)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { calcPriceDisplay } from '../src/utils/calcPriceDisplay';
import { liveDisplay, mergeQuotesByStamp, stampedPriceDisplay, type RestQuote } from '../src/utils/liveQuote';
import { regularPriceStamp } from '../src/lib/sourceStamp';
import { buildBackdrop, factsBlock, timeLabelViolation } from '../src/lib/marketBackdrop';

let n = 0, failed = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
    try { await fn(); n++; console.log(`  ✓ ${name}`); }
    catch (e: any) { failed++; process.exitCode = 1; console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split('\n')[0]}`); }
};
const root = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
// 2026-10 은 EDT(UTC−4) · 11/27·12/24 는 EST(UTC−5)
const EDT = (ymd: string, hh: number, mm = 0, ss = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}-04:00`);
const EST = (ymd: string, hh: number, mm = 0, ss = 0) => Date.parse(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}-05:00`);
const near = (a: number | null | undefined, b: number, eps = 1e-6, msg = '') => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b} ${msg}`);

// ── 실제 저장소(dashboardStore)를 무네트워크로 ──────────────────────────────
const compile = (s: string) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(file: string, deps: Record<string, any>, globals: any = {}) {
    const exports = {};
    const ctx = vm.createContext({ exports, module: { exports }, console: { log() {}, warn() {}, error() {} }, Date, AbortController,
        require: (name: string) => { assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`); return deps[name]; }, ...globals });
    vm.runInContext(compile(read(file)), ctx);
    return (ctx as any).module.exports;
}
const pipeMod = load('src/hooks/useOnePipe.ts', {
    react: {}, swr: {}, '@/providers/WebSocketProvider': {}, '@/hooks/useMarketStatus': {},
    '@/utils/extWsTrust': require('../src/utils/extWsTrust'),
    '@/lib/sourceStamp': require('../src/lib/sourceStamp'), '@/lib/marketCalendar': require('../src/lib/marketCalendar'),
    ...(read('src/hooks/useOnePipe.ts').includes("'@/lib/priceAcceptance'") ? { '@/lib/priceAcceptance': require('../src/lib/priceAcceptance') } : {}),
});
function makeStore(quoteRows: Record<string, any>, session: string) {
    const deps: Record<string, any> = {
        zustand: require('zustand'), 'zustand/middleware': { persist: (init: any) => init },
        '@/hooks/useOnePipe': pipeMod, '@/lib/storage/dashboardTickerStore': {},
        '@/lib/impliedMove': { copyImpliedMoveGroup: () => ({}) }, '@/lib/vwap': { normalizeVwap: (v: any) => v },
    };
    if (read('src/stores/dashboardStore.ts').includes("'@/lib/priceAcceptance'")) deps['@/lib/priceAcceptance'] = require('../src/lib/priceAcceptance');
    return load('src/stores/dashboardStore.ts', deps, {
        fetch: async (url: string) => {
            assert.ok(url.startsWith('/api/live/quotes?'), 'no network: quotes fixture only');
            return { ok: true, json: async () => ({ data: quoteRows, session, timestamp: Date.now() }) };
        },
    }).useDashboardStore;
}

/** 대시보드 화면 파일의 실제 calcPriceDisplay 호출식(+ 그 앞의 ext* 지역 변수)을 그대로 실행한다 */
function screenCalls(file: string): Array<(data: any) => any> {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const out: Array<(data: any) => any> = [];
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.getText(sf) === 'calcPriceDisplay') {
            // 이 호출이 든 문장과 같은 블록의 앞 문장 중 ext* 변수 선언
            let stmt: ts.Node = node;
            while (stmt.parent && !ts.isBlock(stmt.parent)) stmt = stmt.parent;
            const block = stmt.parent as ts.Block | undefined;
            const pre: string[] = [];
            if (block) {
                for (const s of block.statements) {
                    if (s === stmt) break;
                    if (ts.isVariableStatement(s) && s.declarationList.declarations.every((d) => ts.isIdentifier(d.name) && /^ext/.test(d.name.text))) pre.push(s.getText(sf));
                }
            }
            const code = compile(`${pre.join('\n')}\n__out = ${node.getText(sf)};`);
            out.push((data: any) => { const box: any = { data, calcPriceDisplay, __out: null }; vm.runInNewContext(code, box); return box.__out; });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}

/** 앱 Intel 의 실제 폴링 갱신식(fetchPriceOnly.updateFn)·소켓 덮개(overlay)를 고정 시계로 실행한다 */
function intelAt(nowMs: number) {
    class Clock extends Date { constructor(...a: any[]) { super(...((a.length ? a : [nowMs]) as [])); } static now() { return nowMs; } }
    const pipe = load('src/hooks/useOnePipe.ts', {
        react: {}, swr: {}, '@/providers/WebSocketProvider': {}, '@/hooks/useMarketStatus': {},
        '@/utils/extWsTrust': require('../src/utils/extWsTrust'),
        '@/lib/sourceStamp': require('../src/lib/sourceStamp'), '@/lib/marketCalendar': require('../src/lib/marketCalendar'),
        ...(read('src/hooks/useOnePipe.ts').includes("'@/lib/priceAcceptance'") ? { '@/lib/priceAcceptance': require('../src/lib/priceAcceptance') } : {}),
    }, { Date: Clock });
    const sf = ts.createSourceFile('intel.ts', read('src/hooks/useIntelSharedData.ts'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const find = (root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node => {
        let hit: ts.Node | undefined;
        const walk = (n: ts.Node) => { if (!hit && pred(n)) hit = n; if (!hit) ts.forEachChild(n, walk); };
        walk(root); assert.ok(hit); return hit!;
    };
    const varInit = (root: ts.Node, name: string) => find(root, (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) as ts.VariableDeclaration;
    const fnText = (name: string) => find(sf, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf);
    const missing = require('../src/lib/app/intelMissing');
    const PA = fs.existsSync(path.join(root, 'src/lib/priceAcceptance.ts')) ? require('../src/lib/priceAcceptance') : { serverRegularPriceUsable: undefined };
    const make = (code: string, names: string[]) => { const box: any = { module: { exports: null }, Date: Clock }; vm.runInNewContext(compile(`module.exports = function(${names.join(',')}) { ${code} };`), box); return box.module.exports; };
    const priceFn = varInit(sf, 'fetchPriceOnly');
    const update = (priceMap: any) => make(`const ${varInit(priceFn, 'toSession').getText(sf)};\nreturn (${varInit(priceFn, 'updateFn').initializer!.getText(sf)});`,
        ['priceMap', 'computeOnePipe', 'setMissingField', 'sameMissingFields', 'serverRegularPriceUsable'])(priceMap, pipe.computeOnePipe, missing.setMissingField, missing.sameMissingFields, PA.serverRegularPriceUsable);
    const normalizeSession = make(`${fnText('normalizeSession')}\nreturn normalizeSession;`, [])();
    const overlay = (ws: Map<string, any>) => make(`return (${varInit(sf, 'overlay').initializer!.getText(sf)});`,
        ['wsPrices', 'computeOnePipe', 'normalizeSession', 'setMissingField', 'sameMissingFields'])(ws, pipe.computeOnePipe, normalizeSession, missing.setMissingField, missing.sameMissingFields);
    return { update, overlay };
}
const intelRow = (o: any) => ({ ticker: 'AAPL', price: 0, changePct: 0, prevClose: 0, volume: 0, extendedPrice: 0, extendedChangePct: 0, extendedLabel: '', session: 'regular', ...o });

async function main() {
    console.log('━━━ B1-10191713 — 웹 Dashboard 초기 진입(SSR) → 저장소 → 실제 화면 계산식 ━━━');
    // 목 10/15 종가 98 · 금 10/16 종가 100 · 월 10/19 PRE 체결 100(08:00) — 시세 계약: PRE 행 price = 금 종가 · previousClose = 목 종가
    const monPreIso = new Date(EDT('2026-10-19', 8)).toISOString();
    const row = { price: 100, previousClose: 98, prevClose: 98, changePercent: 200 / 98, extendedPrice: 100, extendedChangePercent: 0,
        extendedLabel: 'PRE', extendedTime: monPreIso, session: 'pre' };
    const screens = [
        ...screenCalls('src/app/[locale]/dashboard/DashboardClient.tsx'),
        ...screenCalls('src/components/mobile/MobileDashboardShell.tsx'),
    ];
    assert.ok(screens.length >= 3, `dashboard price expressions found: ${screens.length}`);
    await t('T11 SSR 첫 진입(첫 폴링 전) — 본장 100 · 금요일 일간 +2.04% · PRE 0.00% (본장 98 · PRE +2.04% 금지)', () => {
        const store = makeStore({ XLK: row }, 'pre');
        store.getState().initializeStore(['XLK'], { XLK: row });
        const data = store.getState().tickers.XLK;
        for (const render of screens) {
            const p = render(data);
            assert.equal(p.displayPrice, 100, 'PRE 본장 = 금요일 종가');
            near(p.displayChangePct, 200 / 98, 1e-6, '본장 등락 = 금요일 일간');
        }
        const p = screens[1](data);   // 데스크톱 카드(시간외 배지 포함)
        assert.equal(p.activeExtPrice, 100);
        near(p.activeExtPct, 0, 1e-9, 'PRE 실제 0%');
        assert.equal(p.activeExtPctKnown, true);
    });
    await t('T07·T11 폴링(fetchPriceOnly) 뒤 · 금요일 소켓 99.8 · 월 소켓 100.1 — 화면 본장 100 유지, PRE 는 체결 시각으로만 갱신', async () => {
        const store = makeStore({ XLK: row }, 'pre');
        store.getState().initializeStore(['XLK'], { XLK: row });
        await store.getState().fetchPriceOnly(['XLK']);
        let p = screens[1](store.getState().tickers.XLK);
        assert.equal(p.displayPrice, 100); near(p.activeExtPct, 0, 1e-9);
        store.getState().updateRealtimePrice('XLK', 99.8, 0, EDT('2026-10-16', 19, 59));   // 금요일 애프터 체결
        p = screens[1](store.getState().tickers.XLK);
        assert.equal(p.activeExtPrice, 100); near(p.activeExtPct, 0, 1e-9);
        store.getState().updateRealtimePrice('XLK', 100.1, 0, EDT('2026-10-19', 8, 0, 30));
        p = screens[1](store.getState().tickers.XLK);
        assert.equal(p.displayPrice, 100);
        assert.equal(p.activeExtPrice, 100.1); near(p.activeExtPct, 0.1, 1e-9, 'PRE 등락은 금요일 종가 대비');
    });

    console.log('━━━ B4-10191403 — Flow/CMD 확정 종가 역전 · POST→REG 기준 종가 ━━━');
    await t('T28 POST 확정 종가 110(+10%) 뒤 같은 날 15:55 관측 REST 105 → 110 · +10% 유지', () => {
        const NOW = EDT('2026-10-19', 16, 30);
        const input = { apiDisplayPrice: 110, apiDisplayChangePct: 10, session: 'POST', prevRegularClose: 100, prevClose: 100, regularCloseToday: 110,
            prevChangePct: 10, fallbackChangePct: 10, lastTrade: 110, extended: {}, prices: {} };
        const tickerStamp = { sourceSessionDate: '2026-10-19', observedAt: null, receivedAt: NOW - 5000, basis: 'eod' as const };
        const late: RestQuote = { price: 105, previousClose: 100, changePercent: 5, session: 'regular',
            sourceSessionDate: '2026-10-19', observedAt: EDT('2026-10-19', 15, 55), receivedAt: NOW, basis: 'live' };
        const r = stampedPriceDisplay(input as any, { rest: late, connected: false, stamp: tickerStamp }, NOW);
        assert.equal(r.displayPrice, 110);
        near(r.displayChangePct, 10, 1e-9);
    });
    await t('T29·T22 금 POST 행(종가 100·전일 98) 보존 → 월 REG 결측 응답 → 신선 틱 100.50 = +0.50%(+2.55% 금지)', () => {
        const MON = EDT('2026-10-19', 10, 30);
        const fri: Record<string, RestQuote> = { NVDA: { price: 100, previousClose: 98, prevClose: 98, changePercent: 200 / 98, session: 'post',
            sourceSessionDate: '2026-10-16', basis: 'eod', receivedAt: EDT('2026-10-16', 19) } };
        const missing: Record<string, RestQuote> = { NVDA: { price: 0, error: 'no data', session: 'regular' } as any };
        const m = mergeQuotesByStamp(fri, missing, MON, { asked: ['NVDA'], session: 'regular' });
        const d = liveDisplay(m.data.NVDA, { price: 100.5, changePct: 2.55, ts: MON, priceTime: MON - 2000 }, { wsConnected: true, session: 'reg', restAt: MON - 1000, nowMs: MON })!;
        assert.equal(d.price, 100.5); assert.equal(d.live, true);
        near(d.changePct, 0.5, 1e-9, '월 REG 기준 = 금 종가 100');
        // 같은 규칙: 금 PRE·CLOSED 행 보존도 같은 기준
        for (const session of ['pre', 'closed']) {
            const mm = mergeQuotesByStamp({ NVDA: { ...fri.NVDA, session } }, missing, MON, { asked: ['NVDA'], session: 'regular' });
            near(liveDisplay(mm.data.NVDA, { price: 100.5, changePct: 0, ts: MON, priceTime: MON - 2000 }, { wsConnected: true, session: 'reg', nowMs: MON })!.changePct, 0.5, 1e-9, session);
        }
    });

    console.log('━━━ S-10191700 / T35 — 조기 폐장 13:30 벌크 «정규장 가격» 자리의 마감 뒤 중간값 ━━━');
    await t('T35 11/27 13:30 · 12:59 정규장 110 을 본 뒤 벌크 행 111(13:25 호가 중간값·EOD 11/25) → 110 · +10% (111 · +11% 금지)', () => {
        const NOW = EST('2026-11-27', 13, 30);
        // 서버(/api/live/quotes)가 그 행에 싣는 스탬프 — 정규장 밖 관측이라 proxy(정규장 종가 아님)
        const stamp = regularPriceStamp({ session: 'post', regularDate: null, tradeMs: EST('2026-11-27', 13, 25), priceBasis: 'quote_mid', hasPrice: true, lastClosed: '2026-11-27', nowMs: NOW });
        assert.equal(stamp.basis, 'proxy'); assert.equal(stamp.observedAt, EST('2026-11-27', 13, 25));
        const prev: Record<string, RestQuote> = { AAPL: { price: 110, previousClose: 100, changePercent: 10, session: 'regular',
            sourceSessionDate: '2026-11-27', observedAt: EST('2026-11-27', 12, 59, 50), basis: 'live', receivedAt: EST('2026-11-27', 12, 59, 55) } };
        const bulk: Record<string, RestQuote> = { AAPL: { price: 111, previousClose: 100, changePercent: 11, session: 'post', ...stamp } as any };
        const m = mergeQuotesByStamp(prev, bulk, NOW, { asked: ['AAPL'], session: 'post' });
        const d = liveDisplay(m.data.AAPL, undefined, { wsConnected: false, restAt: NOW, nowMs: NOW })!;
        assert.equal(d.price, 110);
        near(d.changePct, 10, 1e-9);
        // 정상일 16:00 뒤 확정 종가(eod)는 그대로 받는다(회귀 없음)
        const eod = regularPriceStamp({ session: 'post', regularDate: '2026-10-19', tradeMs: null, priceBasis: null, hasPrice: true, lastClosed: '2026-10-19', nowMs: EDT('2026-10-19', 16, 30) });
        assert.equal(eod.basis, 'eod');
    });


    console.log('━━━ price-acceptance-10191930 — 앱 Intel 폴링·소켓 덮개 ━━━');
    await t('P1 정규장 11:09 서버 110(11:08:50 체결) 위에 90분 전 받은 09:40 틱 100 → 110·+10% 유지 · 방금 받은 11:09:30 틱 111 은 채택', () => {
        const NOW = EDT('2026-10-19', 11, 9, 31);
        const { update, overlay } = intelAt(NOW);
        const [polled] = update({ AAPL: { price: 110, previousClose: 100, changePercent: 10, session: 'regular', sourceSessionDate: '2026-10-19',
            observedAt: EDT('2026-10-19', 11, 8, 50), basis: 'live' } })([intelRow({ price: 109, prevClose: 100, changePct: 9 })]);
        assert.equal(polled.price, 110);
        const old = EDT('2026-10-19', 9, 40);
        const [kept] = overlay(new Map([['AAPL', { price: 100, changePct: 0, priceTime: old, ts: old, receivedAt: old }]]))([polled]);
        assert.equal(kept.price, 110); near(kept.changePct, 10, 1e-6);
        const fresh = EDT('2026-10-19', 11, 9, 30);
        const [live] = overlay(new Map([['AAPL', { price: 111, changePct: 11, priceTime: fresh, ts: fresh + 500, receivedAt: fresh + 500 }]]))([polled]);
        assert.equal(live.price, 111);
    });
    await t('P2 PRE 100(09:25 체결) 행이 남은 채 09:30:02 정규장 틱 110 → PRE 칸 100 유지(정규장 체결을 PRE 로 쓰지 않음) · 09:28 PRE 틱 100.3 은 채택', () => {
        const NOW = EDT('2026-10-19', 9, 30, 3);
        const { overlay } = intelAt(NOW);
        const row = intelRow({ price: 100, prevClose: 98, changePct: 200 / 98, extendedPrice: 100, extendedChangePct: 0, extendedLabel: 'PRE',
            extendedTime: new Date(EDT('2026-10-19', 9, 25)).toISOString(), session: 'pre' });
        const t1 = EDT('2026-10-19', 9, 30, 2);
        const [r] = overlay(new Map([['AAPL', { price: 110, changePct: 12, priceTime: t1, ts: t1 + 500, receivedAt: t1 + 500 }]]))([row]);
        assert.equal(r.extendedPrice, 100); near(r.extendedChangePct, 0, 1e-9);
        const t2 = EDT('2026-10-19', 9, 28);
        const [r2] = overlay(new Map([['AAPL', { price: 100.3, changePct: 0, priceTime: t2, ts: NOW - 500, receivedAt: NOW - 500 }]]))([row]);
        assert.equal(r2.extendedPrice, 100.3);
    });
    await t('P1·T35 11/27 13:30 Intel 폴링 — 벌크 행 111(13:25 중간값·proxy) 은 종가로 잠그지 않는다 → 110·+10% · regularCloseToday 110', () => {
        const NOW = EST('2026-11-27', 13, 30);
        const { update } = intelAt(NOW);
        const stamp = regularPriceStamp({ session: 'post', regularDate: null, tradeMs: EST('2026-11-27', 13, 25), priceBasis: 'quote_mid', hasPrice: true, lastClosed: '2026-11-27', nowMs: NOW });
        const [r] = update({ AAPL: { price: 111, previousClose: 100, changePercent: 11, session: 'post', ...stamp } })([intelRow({ price: 110, prevClose: 100, changePct: 9.9 })]);
        assert.equal(r.price, 110); near(r.changePct, 10, 1e-6); assert.equal(r.regularCloseToday, 110);
        // 직전 값이 없으면(첫 진입) 칸을 비우지 않는다
        const [first] = update({ AAPL: { price: 111, previousClose: 100, changePercent: 11, session: 'post', ...stamp } })([intelRow({ price: 0, prevClose: 100 })]);
        assert.equal(first.price, 111);
    });

    console.log('━━━ S-10191741 / T40~T43 — 조기 폐장 뒤 UC AI 입력 마감 시각 ━━━');
    const backdrop = (nowMs: number) => buildBackdrop({ nowMs, nasdaq: { price: 18000, changePct: 0.4, marketTime: new Date(nowMs - 30 * 60_000).toISOString() } as any,
        dow: { price: 44000, changePct: 0.3, marketTime: new Date(nowMs - 30 * 60_000).toISOString() } as any, spx: null, nq: null, es: null, us10y: null });
    for (const [id, nowMs, date] of [['T40', EST('2026-11-27', 13, 30), '11/27'], ['T41', EST('2026-12-24', 13, 30), '12/24'], ['T42', EST('2027-11-26', 13, 30), '2027-11-26']] as const) {
        await t(`${id} ${date} 13:30 ET — AI 입력은 «13:00 ET 에 마감» · «16:00» 없음`, () => {
            const b = backdrop(nowMs);
            assert.equal(b.clock.phase, 'after-close');
            const facts = factsBlock(b);
            assert.match(facts, /CLOSED for the day at 13:00 ET/);
            assert.doesNotMatch(facts, /16:00/);
        });
    }
    await t('T43 출력 검사 — 조기 폐장일 «16:00 마감» 문장은 위반, «13:00 마감» 문장은 통과(ko·en·ja) · 정상일 16:00 문장은 통과', () => {
        for (const nowMs of [EST('2026-11-27', 13, 30), EST('2026-12-24', 13, 30), EST('2027-11-26', 13, 30)]) {
            const b = backdrop(nowMs);
            assert.ok(timeLabelViolation('The US stock market closed at 16:00 ET today.', b, 'en'));
            assert.ok(timeLabelViolation('Wall Street closed at 4 p.m. ET.', b, 'en'));
            assert.ok(timeLabelViolation('미국 증시는 오늘 16:00 ET에 마감했습니다.', b, 'ko'));
            assert.ok(timeLabelViolation('米国株は本日16:00に取引を終えました。', b, 'ja'));
            assert.equal(timeLabelViolation('The US stock market closed early at 13:00 ET today.', b, 'en'), null);
            assert.equal(timeLabelViolation('미국 증시는 오늘 13:00 ET에 조기 마감했습니다.', b, 'ko'), null);
            assert.equal(timeLabelViolation('米国株は本日13:00に取引を終えました。', b, 'ja'), null);
        }
        const normal = backdrop(EDT('2026-10-19', 16, 30));
        assert.equal(timeLabelViolation('The US stock market closed at 16:00 ET today.', normal, 'en'), null);
        assert.match(factsBlock(normal), /CLOSED for the day at 16:00 ET/);
    });

    console.log(`\n${failed ? '❌' : '✅'} priceAcceptanceGates: ${n}개 통과 · ${failed}개 실패`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
