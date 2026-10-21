/** 합성 스냅샷·메모리 어댑터만 사용한다. 실제 네트워크·운영 쓰기 0. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { guruCompany } from './helpers/guruCompany';
import { LENS_IDS } from '../src/lib/guruLens/types';
import { GURU_UNIVERSE } from '../src/lib/guruLens/sources';
import { makeSnapshot, HEAD_KEY, metaKey, lensKey } from '../src/lib/guruLens/pipeline';
import { lensBody, tickerLens } from '../src/lib/app/guruLens';
import { createRevenueCatVerifier, proStatusFromSubscriber } from '../src/lib/alerts/revenuecat';

globalThis.fetch = async () => { throw new Error('실제 네트워크 금지'); };
const fixed = Date.parse('2026-10-21T01:00:00Z');
const RealDate = Date;
(globalThis as any).Date = class extends RealDate {
    constructor(value?: any) { super(value === undefined ? fixed : value); }
    static now() { return fixed; }
};
const snap = makeSnapshot(GURU_UNIVERSE.slice(0, 14).map(({ t }) => ({ ...guruCompany(), ticker: t })),
    { sec: 0, prices: 0, paid: 0 }, new Date());
for (const id of LENS_IDS) {
    const l = snap.lenses[id];
    l.passCount = id === 'garp' ? 0 : 14;
    l.rows.forEach((r, i) => {
        r.passed = id !== 'garp'; r.inputsComplete = true; r.score = 100 - i;
    });
}
const { lenses: _, ...meta } = snap;
const store = new Map<string, unknown>([[HEAD_KEY, { current: snap.date, previous: null }], [metaKey(snap.date), meta]]);
LENS_IDS.forEach(id => store.set(lensKey(id, snap.date), { date: snap.date, result: snap.lenses[id] }));
let verification: 'pro' | 'free' | 'error' = 'pro', verifyCalls = 0;
const badgeQueries: string[][] = [];
const gate = { isPro: false, unlocked: true, iapAvailable: false, purchasing: false, proError: false, proNothing: false,
    openPaywall() {}, handleRestore() {}, portals: null,
    copy: { proCta: 'SIGNUM Pro', proRestoreLabel: '복원', modalWaitPrefix: '', proErrorLabel: '', proNothingLabel: '' } };
let guruComponent: any;
let hooks: { effects: (() => any)[]; writes: any[]; index: number } | null = null;
let requestUid: string | null = 'fixture-user';
let uidCalls = 0;
const originalLoad = (Module as any)._load;
(Module as any)._load = function(name: string, parent: any, main: any) {
    if (name === 'react' && hooks) return { ...React,
        useEffect: (effect: () => any) => hooks!.effects.push(effect),
        useState: (initial: any) => [hooks!.index++ === 0 ? undefined : 'moat_compounder',
            (value: any) => hooks!.writes.push(value)],
    };
    if (name === '@/lib/guruLens/service') return {
        readonlyCache: { read: async (key: string) => store.get(key) ?? null },
        currentBadges: async (tickers: string[]) => {
            badgeQueries.push(tickers);
            return Object.fromEntries(tickers.map(t => [t, {
                holdingIndex: { holders: [{ cik: '1067983', shares: 100, marketValue: 5000, period: '2026-06-30' }] },
                money: { count: 3, overlap: true, asOf: '2026-10-20' },
                earnings: { date: '2026-10-28', days: 7, impliedMove: { impliedMovePct: 6.2 } },
            }]));
        },
    };
    if (name === '@/lib/alerts/revenuecat') return { createRevenueCatVerifier: () => async () => {
        verifyCalls++;
        if (verification === 'error') throw new Error('합성 검증 장애');
        return { active: verification === 'pro', expiresAtMs: null };
    } };
    if (name === './watchlistAlerts') return { rcAppUserId: async () => { uidCalls++; return requestUid; } };
    if (name === 'next/navigation') return { useRouter: () => ({ push() {}, back() {} }),
        useParams: () => ({ locale: 'ko' }), useSearchParams: () => new URLSearchParams() };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
    if (name === './ValueWall') return { useAdUnlockGate: () => gate };
    if (name === './AdFreeIcon' || name === './RedeemCodeLink') return new Proxy({}, { get: () => () => null });
    if (name === '@/components/app/AppTickerLogo') return { AppTickerLogo: ({ symbol }: any) => <span>{symbol}</span> };
    if (name === '@/components/app/GuruLens') return guruComponent;
    if (name === '@/lib/app/proEntitlement') return { useWatchlistPro: () => ({ isPro: gate.isPro }) };
    return originalLoad.call(this, name, parent, main);
};
// 작업 전 커밋의 실제 함수를 메모리에서 컴파일해 응답 바이트와 마크업을 직접 대조한다.
const BASE = 'df149853d';
function compile(file: string, baseline = false, append = '') {
    const source = baseline ? execFileSync('git', ['show', `${BASE}:${file}`], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
    const filename = path.resolve(file);
    const m = new (Module as any)(filename, module);
    m.filename = filename; m.paths = (Module as any)._nodeModulePaths(path.dirname(filename));
    m._compile(ts.transpileModule(source + append, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020,
    } }).outputText, filename);
    return m.exports;
}
const oldRoute = compile('src/app/api/guru-lens/route.ts', true);
const route = require('../src/app/api/guru-lens/route');
const get = (query = '', pro = false, uid = 'fixture-user') => route.GET(new NextRequest(`http://localhost/api/guru-lens?${query}${pro ? '&access=pro' : ''}`,
    pro ? { headers: { 'x-rc-app-user-id': uid } } : undefined));
const bodyOf = async (query = '', pro = false) => (await get(query, pro)).json();

async function main() {
    for (const query of ['', 'badges=0', 'lens=moat_compounder&badges=0', 'limit=50', 'limit=1', 'limit=3', 'lens=garp']) {
        const old = await oldRoute.GET(new NextRequest(`http://localhost/api/guru-lens?${query}`));
        const authorized = await get(query, true);
        assert.equal(await authorized.text(), await old.text(), `PRO 응답 바이트 동일: ${query}`);
        assert.equal(authorized.headers.get('cache-control'), 'private, no-store');
        const free = await get(query);
        assert.match(free.headers.get('cache-control')!, /^public, s-maxage=/);
        const b = await free.json();
        assert.ok(lensBody(b));
        for (const l of b.lenses) {
            assert.ok(l.rows.slice(0, 3).every((r: any) => typeof r.ticker === 'string'));
            l.rows.slice(3).forEach((r: any, i: number) => assert.deepEqual(r, { rank: i + 4, locked: true }));
        }
    }
    assert.equal((await get('badges=0')).headers.get('cache-control'), 'public, s-maxage=600, stale-while-revalidate=3600');
    const beforeBadges = badgeQueries.length;
    await get();
    assert.ok(badgeQueries[beforeBadges].length <= 3, '무료 요청은 유료 행 배지도 읽지 않는다');
    const free = await bodyOf();
    const full = await bodyOf('', true);
    assert.equal(free.lenses[0].rows.slice(3).filter((r: any) => 'ticker' in r || 'score' in r || 'checks' in r || 'badges' in r).length, 0);
    const malformed = structuredClone(free);
    malformed.lenses[0].rows[3].ticker = '유출';
    assert.equal(lensBody(malformed), null, '값이 섞인 잠금 행 거절');
    malformed.lenses[0].rows[3] = { rank: 1, locked: true };
    assert.equal(lensBody(malformed), null, '잘못된 자리표 순번 거절');
    const before = verifyCalls;
    for (const uid of ['bad/id', 'short', '$RCAnonymousID:invalid']) {
        const b = await (await get('badges=0', true, uid)).json();
        assert.deepEqual(b.lenses[0].rows[3], { rank: 4, locked: true });
    }
    assert.equal(verifyCalls, before, '잘못된 ID는 검증 호출 0');
    for (const state of ['free', 'error'] as const) {
        verification = state;
        const res = await get('badges=0', true);
        assert.equal(res.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual((await res.json()).lenses[0].rows[3], { rank: 4, locked: true });
    }
    verification = 'pro';
    const noId = await get('access=pro&sgpro=1&isPro=true&badges=0');
    assert.equal(noId.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual((await noId.json()).lenses[0].rows[3], { rank: 4, locked: true });
    const headerOnly = await route.GET(new NextRequest('http://localhost/api/guru-lens?badges=0', { headers: { 'x-rc-app-user-id': 'fixture-user' } }));
    assert.deepEqual((await headerOnly.json()).lenses[0].rows[3], { rank: 4, locked: true }, '공개 URL에서는 PRO 응답 생성 금지');

    // Top 10 밖 종목도 칩·이유는 무료. 순위 점수와 다른 종목 행은 제공하지 않는다.
    const ticker = snap.lenses.moat_compounder.rows[13].ticker;
    for (const badges of [0, 1]) {
        const query = `ticker=${ticker}&badges=${badges}`;
        const original = await (await oldRoute.GET(new NextRequest(`http://localhost/api/guru-lens?${query}`))).text();
        const authorized = await get(query, true);
        assert.equal(await authorized.text(), original, 'PRO 역조회 바이트 동일');
        const b = await bodyOf(query);
        assert.ok(tickerLens(b, ticker));
        assert.ok(b.lenses.every((l: any) => l.rows.length === 1 && l.rows[0].ticker === ticker && !('score' in l.rows[0])));
    }

    const oldGuru = compile('src/components/app/GuruLens.tsx', true);
    const newGuru = require('../src/components/app/GuruLens');
    guruComponent = oldGuru;
    const oldCard = compile('src/app/[locale]/app-view/lenses/page.tsx', true, '\nexport { LensCard };').LensCard;
    guruComponent = newGuru;
    const newCard = compile('src/app/[locale]/app-view/lenses/page.tsx', false, '\nexport { LensCard };').LensCard;
    let comparisons = 0;
    for (const isPro of [false, true]) for (const iap of [false, true]) for (const loc of ['ko', 'en', 'ja']) for (const open of [false, true]) {
        gate.isPro = isPro; gate.iapAvailable = iap;
        for (let i = 0; i < full.lenses.length; i++) {
            const props = { open, onToggle() {}, universe: full.universeCount, loc, locale: loc };
            assert.equal(renderToStaticMarkup(React.createElement(newCard, { ...props, lens: (isPro ? full : free).lenses[i] })),
                renderToStaticMarkup(React.createElement(oldCard, { ...props, lens: full.lenses[i] })), '변경 전후 카드 마크업 동일');
            comparisons++;
        }
    }
    const oldTicker = JSON.parse(await (await oldRoute.GET(new NextRequest(`http://localhost/api/guru-lens?ticker=${ticker}&badges=0`))).text());
    const newTicker = await bodyOf(`ticker=${ticker}&badges=0`);
    for (const loc of ['ko', 'en', 'ja']) for (const key of ['GuruLensChip', 'GuruLensWhy']) {
        const props = { locale: loc, open: true, onToggle() {}, controls: 'fixture', id: 'fixture' };
        assert.equal(renderToStaticMarkup(React.createElement(newGuru[key], { ...props, data: newTicker })),
            renderToStaticMarkup(React.createElement(oldGuru[key], { ...props, data: oldTicker })), '무료 역조회 칩·설명 마크업 동일');
    }

    const { fetchGuruLenses } = require('../src/lib/app/guruLensRequest');
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = async (url: any, init: any) => { calls.push({ url, init }); return Response.json({}); };
    await fetchGuruLenses(false, new AbortController().signal);
    assert.equal(uidCalls, 0, '무료는 SDK 식별 조회 0');
    assert.equal(calls[0].url, '/api/guru-lens');
    await fetchGuruLenses(true, new AbortController().signal);
    assert.equal(calls[1].url, '/api/guru-lens?access=pro');
    assert.equal(calls[1].init.cache, 'no-store');
    assert.deepEqual(calls[1].init.headers, { 'x-rc-app-user-id': 'fixture-user' });
    requestUid = null;
    await fetchGuruLenses(true, new AbortController().signal);
    assert.equal(calls[2].url, '/api/guru-lens', 'SDK 없음은 무료로');
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(fetchGuruLenses(true, aborted.signal));
    assert.equal(calls.length, 3, '취소 후 fetch 0');

    // 실제 페이지 effect: 구매·복원 권한 전환에 재요청, 이전 무료 요청은 취소·무시한다.
    hooks = { effects: [], writes: [], index: 0 };
    const inner = compile('src/app/[locale]/app-view/lenses/page.tsx', false, '\nexport { LensesInner };').LensesInner;
    const waiting: { url: string; signal: AbortSignal; resolve: (value: Response) => void }[] = [];
    globalThis.fetch = (url: any, init: any) => new Promise(resolve => waiting.push({ url, signal: init.signal, resolve }));
    gate.isPro = false;
    inner();
    const freeCleanup = hooks.effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(waiting[0].url, '/api/guru-lens');
    freeCleanup();
    assert.equal(waiting[0].signal.aborted, true);
    hooks.effects = []; hooks.index = 0; gate.isPro = true; requestUid = 'fixture-user';
    inner();
    const proCleanup = hooks.effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(waiting[1].url, '/api/guru-lens?access=pro');
    waiting[1].resolve(Response.json(full));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hooks.writes.length, 1);
    assert.equal(hooks.writes[0].lenses[0].rows[3].ticker, full.lenses[0].rows[3].ticker);
    waiting[0].resolve(Response.json(free));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(hooks.writes.length, 1, '늦은 무료 응답은 구매 후 PRO 데이터를 덮지 않는다');
    proCleanup(); hooks = null;
    assert.match(fs.readFileSync('src/app/[locale]/app-view/lenses/page.tsx', 'utf8'), /\[pro\.isPro\]/,
        '실제 effect가 권한 변경을 구독한다');

    const entitlement = (ent: any) => ({ subscriber: { entitlements: { pro: ent } } });
    assert.equal(proStatusFromSubscriber(entitlement({ expires_date: '2026-10-22' }), fixed).active, true);
    assert.equal(proStatusFromSubscriber(entitlement({ expires_date: '2026-10-20' }), fixed).active, false);
    assert.equal(proStatusFromSubscriber(entitlement({ expires_date: '2026-10-20', grace_period_expires_date: '2026-10-22' }), fixed).active, true);
    assert.equal(proStatusFromSubscriber(entitlement({ expires_date: null, purchase_date: '2026-10-20' }), fixed).active, true);
    assert.equal(proStatusFromSubscriber(entitlement({}), fixed).active, false);
    await assert.rejects(createRevenueCatVerifier({ apiKey: '' })('fixture-user'), { code: 'unconfigured' });
    let rcReads = 0;
    const verifier = createRevenueCatVerifier({ apiKey: 'fixture', now: () => fixed,
        fetchImpl: async (_url, init) => {
            rcReads++; assert.equal(init?.method, 'GET'); assert.equal(init?.cache, 'no-store');
            return Response.json(entitlement({ expires_date: '2026-10-22' }));
        } });
    assert.equal((await verifier('fixture-user')).active, true);
    await verifier('fixture-user');
    assert.equal(rcReads, 1, '기존 검증기 메모리 캐시 재사용');

    store.clear();
    const missing = await get('badges=0', true);
    assert.equal(missing.status, 503); assert.equal(missing.headers.get('cache-control'), 'private, no-store');
    const invalid = await get('limit=0', true);
    assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('cache-control'), 'private, no-store');
    (Module as any)._load = originalLoad;
    globalThis.Date = RealDate;
    console.log(`PRO 게이트 통과: 유료 행 실제 값 0, PRO 바이트 동일, 캐시·역조회·클라이언트 요청·RevenueCat 검증, 카드 마크업 ${comparisons}쌍 동일, 운영 쓰기 0`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
