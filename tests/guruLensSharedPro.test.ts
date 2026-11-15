/**
 * 대가 렌즈 4~10위 — 공유 PRO 상태(11/16 FIX-PRO «범위 밖» 수리).
 * 재현: 렌즈 쪽 초기 PRO 조회(proEntitlement·useProStatus)가 실패해 isPro=false 인데 스토어가 PRO 를 확인한(공유 신호) 사용자
 *   → 전: 무료 요청 → 4~10위 잠금 자리 → 잠금 화면 · 후: PRO 요청 → 서버 PRO 판정 → 4~10위 열림. 무료는 잠금 유지.
 * 합성 스냅샷·메모리 어댑터만. 실제 네트워크·결제·운영 쓰기 0. 실행: npx tsx tests/guruLensSharedPro.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { guruCompany } from './helpers/guruCompany';
import { LENS_IDS } from '../src/lib/guruLens/types';
import { GURU_UNIVERSE } from '../src/lib/guruLens/sources';
import { makeSnapshot, HEAD_KEY, metaKey, lensKey } from '../src/lib/guruLens/pipeline';
import { storeProSignal, createStoreProSignal, STORE_PRO_TTL_MS } from '../src/lib/app/gatePaywall';

globalThis.fetch = async () => { throw new Error('실제 네트워크 금지'); };

// ── 합성 스냅샷(14종목 · 모든 렌즈 통과) ───────────────────────────────────────
const snap = makeSnapshot(GURU_UNIVERSE.slice(0, 14).map(({ t }) => ({ ...guruCompany(), ticker: t })),
    { sec: 0, prices: 0, paid: 0 }, new Date());
for (const id of LENS_IDS) {
    const l = snap.lenses[id];
    l.passCount = 14;
    l.rows.forEach((r, i) => { r.passed = true; r.inputsComplete = true; r.score = 100 - i; });
}
const { lenses: _l, ...meta } = snap;
const store = new Map<string, unknown>([[HEAD_KEY, { current: snap.date, previous: null }], [metaKey(snap.date), meta]]);
LENS_IDS.forEach(id => store.set(lensKey(id, snap.date), { date: snap.date, result: snap.lenses[id] }));

// ── 모의 의존성 ─────────────────────────────────────────────────────────────
const ent = { isPro: false, ready: true, preview: false }; // proEntitlement — «초기 조회 실패» = isPro false · ready true
const gate = { isPro: false, unlocked: false, iapAvailable: true, purchasing: false, proError: false, proNothing: false,
    openPaywall() {}, handleRestore() {}, portals: null,
    copy: { proCta: 'SIGNUM Pro', proRestoreLabel: '복원', modalWaitPrefix: '', proErrorLabel: '', proNothingLabel: '' } };
let serverVerdict: 'pro' | 'free' = 'pro';
let snapshotMode: 'client' | 'server' = 'client';
let hooks: { effects: (() => any)[]; writes: any[]; index: number } | null = null;
let rcInit = false;
let answers: boolean[] = [];
let lensPro: any; // 실제 src/lib/app/guruLensPro 를 모의 react 로 컴파일한 인스턴스

const mockReact = {
    ...React,
    useSyncExternalStore: (_sub: any, get: () => any, server: () => any) => (snapshotMode === 'server' ? server() : get()),
};
const originalLoad = (Module as any)._load;
(Module as any)._load = function(name: string, parent: any, main: any) {
    if (name === 'react' && parent?.filename?.endsWith('guruLensPro.ts')) return mockReact;
    if (name === 'react' && hooks) return { ...mockReact,
        useEffect: (effect: () => any) => hooks!.effects.push(effect),
        useState: (initial: any) => [hooks!.index++ === 0 ? undefined : null, (value: any) => hooks!.writes.push(value)],
    };
    if (name === '@/lib/app/proEntitlement') return { useWatchlistPro: () => ent };
    if (name === '@/config/iap') return { IAP_LIVE: false, PRO_ENTITLEMENT_ID: 'pro' };
    if (name === '@/services/revenueCat') return { initRevenueCat: async () => rcInit, isProFromCustomerInfo: (i: any) => i?.pro === true };
    if (name === '@revenuecat/purchases-capacitor') return { Purchases: {
        invalidateCustomerInfoCache: async () => {}, syncPurchases: async () => {},
        getCustomerInfo: async () => ({ customerInfo: { pro: answers.shift() === true } }),
        getAppUserID: async () => ({ appUserID: 'fixture-user' }),
    } };
    if (name === '@/lib/app/guruLensPro') return lensPro;
    if (name === '@/lib/guruLens/service') return {
        readonlyCache: { read: async (key: string) => store.get(key) ?? null },
        currentBadges: async (tickers: string[]) => Object.fromEntries(tickers.map(t => [t, null])),
    };
    if (name === '@/lib/guruLens/proAccess') return { clientIpFrom: () => null,
        guruProAccess: async () => ({ pro: serverVerdict === 'pro', via: 'provider' }) };
    if (name === './watchlistAlerts') return { rcAppUserId: async () => 'fixture-user' };
    if (name === 'next/navigation') return { useRouter: () => ({ push() {}, back() {} }),
        useParams: () => ({ locale: 'ko' }), useSearchParams: () => new URLSearchParams() };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
    if (name === './ValueWall') return { useAdUnlockGate: () => gate };
    if (name === './AdFreeIcon' || name === './RedeemCodeLink') return new Proxy({}, { get: () => () => null });
    if (name === '@/components/app/AppTickerLogo') return { AppTickerLogo: ({ symbol }: any) => React.createElement('span', null, symbol) };
    if (name === '@/components/app/SessionErrorMark') return { SessionErrorMark: () => null };
    return originalLoad.call(this, name, parent, main);
};
function compile(file: string, append = '') {
    const filename = path.resolve(file);
    const m = new (Module as any)(filename, module);
    m.filename = filename; m.paths = (Module as any)._nodeModulePaths(path.dirname(filename));
    m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8') + append, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020,
    } }).outputText, filename);
    return m.exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
// 실제 시계와 맞춘다(조회 자리가 Date.now() 로 기록하므로) — 같은 밀리초 충돌만 +1 로 피한다
let clock = 0;
const tick = () => (clock = Math.max(clock + 1, Date.now()));
const markProNow = () => { assert.equal(storeProSignal.mark(tick()), true); };
const revokeNow = () => { assert.equal(storeProSignal.revoke(tick()), true); };

async function main() {
    lensPro = compile('src/lib/app/guruLensPro.ts');
    const { lensProNow, subscribeLensProSignal, useGuruLensPro } = lensPro;

    // ── 1. 판정 규칙(게이트 공유 상태와 같은 원칙) ────────────────────────────
    assert.equal(lensProNow(true, false), true, '스토어가 확인한 PRO 는 훅 초기 조회 실패와 무관하게 PRO');
    assert.equal(lensProNow(false, true), false, '더 최신 무료 응답(만료·회수)은 즉시 반영');
    assert.equal(lensProNow(null, false), false, '응답 기록 없음 + 훅 무료 → 무료');
    assert.equal(lensProNow(null, false, true), true, '응답 기록 없음이면 훅 중 하나라도 PRO 면 PRO(불확실하면 잠그지 않음)');
    assert.equal(lensProNow(null), false);

    // ── 2. 신호 구독 · 렌즈는 PRO 1시간 만료 없이 마지막 응답(서버가 다시 확인하므로) ──────
    let t = 1_000_000;
    const sig = createStoreProSignal({ now: () => t, storage: () => null });
    let calls = 0;
    const off = subscribeLensProSignal(() => { calls++; }, sig);
    sig.mark(t); assert.equal(calls, 1, 'PRO 기록 → 다시 그림');
    sig.revoke(t + 1); assert.equal(calls, 2, '무료 기록 → 다시 그림');
    off(); sig.mark(t + 2); assert.equal(calls, 2, '정리 뒤 호출 0');
    t += STORE_PRO_TTL_MS + 1;
    assert.equal(sig.latest(), null, '게이트용 값은 1시간 뒤 «기록 없음»(origin 동작 그대로)');
    assert.equal(sig.lastAnswer(), true, '렌즈용 마지막 응답은 만료 없이 PRO — 1시간 뒤에도 한쪽 훅 실패로 다시 잠기지 않음');
    sig.revoke(t); assert.equal(sig.lastAnswer(), false, '더 최신 무료 응답은 즉시 반영');

    // ── 3. 훅 — 실제 모듈 · 실제 공유 신호 ───────────────────────────────────
    ent.isPro = false;
    assert.equal(storeProSignal.lastAnswer(), null, '시작 시 기록 없음');
    assert.equal(useGuruLensPro().isPro, false, '무료(기록 없음 + 초기 조회 실패) → 잠금 유지');
    markProNow();
    assert.equal(useGuruLensPro().isPro, true, '렌즈 초기 조회 실패 + 공유 상태 PRO → PRO');
    snapshotMode = 'server';
    assert.equal(useGuruLensPro().isPro, false, '첫 렌더(서버·hydration)는 신호를 읽지 않는다');
    assert.equal(useGuruLensPro(true).isPro, true, '첫 렌더에도 호출부 PRO(useProStatus)는 인정');
    snapshotMode = 'client';
    revokeNow();
    ent.isPro = true;
    assert.equal(useGuruLensPro(true).isPro, false, '더 최신 무료 응답이면 옛 훅 PRO 로 열린 채 남지 않는다');
    ent.isPro = false;
    ent.preview = true;
    assert.equal(useGuruLensPro().isPro, true, '프리뷰 강제 표시는 그대로');
    ent.preview = false;

    // ── 4. 서버 — PRO 요청만 4~10위 실제 값 · 무료/무료 판정은 잠금 자리 ───────
    const route = require('../src/app/api/guru-lens/route');
    const get = (pro: boolean) => route.GET(new NextRequest(`http://localhost/api/guru-lens${pro ? '?access=pro' : ''}`,
        pro ? { headers: { 'x-rc-app-user-id': 'fixture-user' } } : undefined));
    serverVerdict = 'pro';
    const full = await (await get(true)).json();
    assert.equal(typeof full.lenses[0].rows[3].ticker, 'string', '서버 PRO 판정 → 4위 실제 값');
    const free = await (await get(false)).json();
    assert.deepEqual(free.lenses[0].rows[3], { rank: 4, locked: true });
    serverVerdict = 'free';
    assert.deepEqual((await (await get(true)).json()).lenses[0].rows[3], { rank: 4, locked: true }, '무료 사용자가 PRO 로 요청해도 서버가 잠근다');
    serverVerdict = 'pro';

    // ── 5. 페이지 effect — 공유 상태 PRO 면 초기 조회 실패여도 PRO 로 요청한다 ──
    const pageWindow = new EventTarget();
    const pageDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    (globalThis as any).window = pageWindow;
    (globalThis as any).document = pageDocument;
    const waiting: { url: string; resolve: (value: Response) => void }[] = [];
    globalThis.fetch = ((url: any) => new Promise<Response>(resolve => waiting.push({ url, resolve }))) as typeof fetch;
    hooks = { effects: [], writes: [], index: 0 };
    const inner = compile('src/app/[locale]/app-view/lenses/page.tsx', '\nexport { LensesInner };').LensesInner;
    ent.isPro = false; gate.isPro = false;
    markProNow();
    inner();
    const proCleanup = hooks.effects[0]();
    await flush();
    assert.equal(waiting[0].url, '/api/guru-lens?access=pro', '렌즈 초기 조회 실패 + 공유 상태 PRO → PRO 요청');
    waiting[0].resolve(Response.json(full));
    await flush();
    assert.equal(hooks.writes.at(-1).lenses[0].rows[3].ticker, full.lenses[0].rows[3].ticker, '4~10위 실제 값 수신');
    proCleanup();

    hooks.effects = []; hooks.index = 0;
    revokeNow();
    inner();
    const freeCleanup = hooks.effects[0]();
    await flush();
    assert.equal(waiting[1].url, '/api/guru-lens', '무료(최신 응답 무료) → 무료 요청');
    waiting[1].resolve(Response.json(free));
    await flush();
    assert.ok(hooks.writes.at(-1).lenses[0].rows[3].locked, '무료 → 잠금 자리 유지');
    freeCleanup();
    hooks = null;
    delete (globalThis as any).window;
    delete (globalThis as any).document;

    // ── 6. 잠금 자리(GuruLensProOnly) — 같은 판정으로 열고 잠근다 ─────────────
    const { GuruLensProOnly } = compile('src/components/app/GuruLens.tsx');
    const child = React.createElement('i', { 'data-row': 'r4' }, 'ROW4');
    const render = (locked: boolean) => renderToStaticMarkup(React.createElement(GuruLensProOnly, { locale: 'ko', rows: 7, locked }, child));
    gate.isPro = false; ent.isPro = false;
    markProNow();
    let html = render(false);
    assert.ok(html.includes('ROW4') && !html.includes('guru-lens-pro-lock'), '초기 조회 실패(두 훅 무료) + 공유 상태 PRO → 4~10위 열림');
    html = render(true);
    assert.ok(html.includes('guru-lens-pro-lock') && !html.includes('ROW4'), '데이터가 잠금 자리면 PRO 여도 값 없는 자리만');
    revokeNow();
    html = render(false);
    assert.ok(html.includes('guru-lens-pro-lock') && !html.includes('ROW4'), '무료 → 잠김 유지(실제 행 DOM 0)');
    gate.isPro = true;
    assert.ok(render(false).includes('guru-lens-pro-lock'), '더 최신 무료 응답이면 옛 useProStatus PRO 로 열지 않는다');
    gate.isPro = false;

    // ── 7. 공유 신호 기록 자리 — 스토어 조회가 «그 조회의 시작 시각»으로 PRO 를 기록, 옛 훅 값 알림은 기록 안 함 ──
    const entMod = compile('src/lib/app/proEntitlement.ts');
    revokeNow();
    entMod.notifyProPurchased(true);
    assert.equal(storeProSignal.latest(), false, '시각 없는 알림(옛 훅 값일 수 있음)은 더 최신 무료 응답을 덮지 않는다');
    // 코드 사용 재조회(쿠폰 시트·코드 화면 복귀 공용 refreshProAfterRedeem): 첫 조회 무료 → 대기 중 다른 곳이 무료 기록 → 3초 재조회 PRO
    rcInit = true; answers = [false, true];
    const redeem = compile('src/lib/app/redeem.ts');
    const refreshing = redeem.refreshProAfterRedeem('sheet');
    await new Promise(r => setTimeout(r, 50));
    revokeNow();
    assert.equal(await refreshing, true);
    assert.equal(storeProSignal.latest(), true, '재조회가 확인한 PRO 는 그 조회의 시작 시각으로 기록 → 중간 무료 기록보다 최신이라 인정');
    ent.isPro = false; gate.isPro = false;
    assert.ok(!render(false).includes('guru-lens-pro-lock'), '코드 사용 확인 PRO → 4~10위 열림');
    revokeNow();
    answers = [false, false, false];
    assert.equal(await redeem.refreshProAfterRedeem('sheet', { check: async () => false, sync: async () => {}, wait: async () => {} }), false);
    assert.equal(storeProSignal.latest(), false, '무료 확인은 아무것도 바꾸지 않는다');
    const src = (f: string) => fs.readFileSync(f, 'utf8');
    assert.match(src('src/lib/app/foregroundProSync.ts'),
        /const askedAt = Date\.now\(\);\s*const \{ customerInfo \} = await Purchases\.getCustomerInfo\(\);[\s\S]{0,200}if \(pro\) storeProSignal\.mark\(askedAt\);/,
        '안드 복귀 동기화: 첫 조회(already_pro) 포함 모든 PRO 확인을 조회 시작 시각으로 기록');

    (Module as any)._load = originalLoad;
    console.log('대가 렌즈 공유 PRO 통과: 초기 조회 실패 + 공유 PRO → PRO 요청·4~10위 열림 · 무료 → 잠김 유지 · 서버 판정 · 회수 즉시 반영');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
