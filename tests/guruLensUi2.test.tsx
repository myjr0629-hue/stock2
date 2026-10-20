/** 대가 렌즈 화면 1차 — 결측→«0» 금지 회귀 · 칩 생략 · 집계 분모 · API(badges=0·메모·determinedCount). 네트워크·운영 쓰기 0. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { guruCompany } from './helpers/guruCompany';
import { LENS_IDS } from '../src/lib/guruLens/types';
import { makeSnapshot, HEAD_KEY, metaKey, lensKey } from '../src/lib/guruLens/pipeline';
import {
    T, badgeTexts, chipCount, coverageText, headline, lensBody, ruleText, tickerLens, valueText, whyLine,
    type TickerLens,
} from '../src/lib/app/guruLens';

globalThis.fetch = async () => { throw new Error('Unexpected network request'); };

// ── 1. 순수 함수: 결측·0 은 숫자로 쓰지 않는다 ─────────────────────────────────
const LOCS = ['ko', 'en', 'ja'] as const;
for (const loc of LOCS) {
    const h = headline({ passCount: 0, mode: 'closest' }, loc);
    assert.ok(!/\b0\b|0종목|0銘柄|0 stocks/.test(h), `통과 0 머리글에 0 이 나오면 안 된다: ${h}`);
    assert.equal(headline({ passCount: 43, mode: 'passed' }, loc), T[loc].passed(43));
    assert.equal(coverageText({ determinedCount: null }, 495, loc), null, '분모 모르면 생략');
    assert.equal(coverageText({ determinedCount: 600 }, 495, loc), null, '분모보다 큰 값은 생략');
    assert.equal(coverageText({ determinedCount: 238 }, 495, loc), T[loc].coverage(238, 495));
}
assert.equal(chipCount(null), null);
const tl = (passed: string[]): TickerLens => ({
    available: true, asOf: '2026-10-16', financialYear: 2025, universeCount: 495, ticker: 'AAA',
    passedLenses: passed as TickerLens['passedLenses'],
    lenses: LENS_IDS.map(id => ({
        definition: { id } as never, passCount: passed.includes(id) ? 1 : 0, evaluatedCount: 495, determinedCount: 300,
        mode: passed.includes(id) ? 'passed' : 'closest',
        rows: [{ ticker: 'AAA', passed: passed.includes(id), score: 1, checks: [], reason: '', badges: null }],
    })),
});
assert.equal(chipCount(tl([])), null, '통과 0 → 칩 없음');
assert.equal(chipCount(tl(['garp', 'roc_ey'])), 2);
// 역조회 검증: passedLenses 와 행 판정이 어긋나면 칩 숫자를 믿지 않는다
const lie = tl(['garp']);
lie.passedLenses = ['garp', 'roc_ey'];
assert.equal(tickerLens(lie, 'AAA'), null);
assert.equal(tickerLens(tl(['garp']), 'BBB'), null, '다른 티커 응답');
assert.equal(tickerLens({ available: false, reason: 'no_published_snapshot' }, 'AAA'), null);
assert.ok(tickerLens(tl(['garp']), 'AAA'));
// 목록 검증: passed 모드인데 통과 0·미통과 행이 섞이면 버린다
const body = { available: true, asOf: '2026-10-16', financialYear: 2025, universeCount: 495,
    lenses: [{ definition: { id: 'garp' }, passCount: 0, mode: 'passed', rows: [] }] };
assert.equal(lensBody(body), null);
body.lenses[0] = { definition: { id: 'garp' }, passCount: 0, mode: 'closest',
    rows: [{ ticker: 'AAA', passed: true, checks: [] }] } as never;
assert.equal(lensBody(body), null);

// ── 2. «왜 걸렸나» — 값·기준은 API 값, 단위만 % ──────────────────────────────
const roe = { id: 'ROE 평균', value: 0.20060150312955657, rule: '≥0.15' };
assert.equal(valueText(roe), '20.1%');
assert.equal(ruleText(roe, 'ko'), '≥15%');
assert.equal(ruleText({ id: 'ROE 기준 충족 연수', rule: '≥8/10 (15%)' }, 'en'), '≥8/10, 15%');
assert.equal(ruleText({ id: '배당 지급 연수', rule: '=12 (축약)' }, 'ja'), '=12, 短縮');
assert.equal(ruleText({ id: '섹터 품질 백분위', rule: '≥0.70 (2개 이상 관측)' }, 'en'), '≥70%, ≥2 observed');
assert.equal(ruleText({ id: '순이익 성장률', rule: '0.10~0.50' }, 'ja'), '10%~50%');
assert.equal(ruleText({ id: '52주 고점 대비', rule: '≤-0.25' }, 'ko'), '≤-25%');
assert.equal(ruleText({ id: 'PEG', rule: 'PEG≤1 또는 (성장+배당)/PER≥1.5' }, 'en'), 'PEG≤1 or (growth+div) ÷ P/E≥1.5');
assert.equal(valueText({ id: 'PER', value: null }), null);
const line = whyLine('moat_compounder', { reason: '', passed: true, checks: [
    { ...roe, passed: true, reason: '' },
    { id: 'ROE 기준 충족 연수', value: 8, rule: '≥8/10 (15%)', passed: true, reason: '' },
] }, 'ko');
assert.equal(line, 'ROE 평균 20.1% (≥15%) · ROE 기준 충족 연수 8 (≥8/10, 15%)');
assert.equal(whyLine('defensive_value', { reason: '', passed: false, inputsComplete: true, checks: [
    { id: '배당 지급 연수', value: 0, rule: '=12 (축약)', passed: false, reason: '' }] }, 'ko'), '✕ 배당 지급 연수 0 (=12, 축약)', '미충족은 ✕');
assert.equal(whyLine('garp', { reason: '', passed: false, inputsComplete: true, checks: [{ id: 'PEG', value: null, rule: 'x', passed: false, reason: '' }] }, 'ko'),
    null, '값이 없으면 줄을 그리지 않는다');
assert.match(whyLine('financial_strength', { reason: 'F점수 8/9; …', passed: true, checks: [] }, 'en')!, /^F-score 8\/9$/);
// 관문 10201010 회귀: 결측에서 만든 0(배당 이력 없음 → «배당 지급 연수 0», 재무 전체 결측 → «F점수 0/9»)은 쓰지 않는다
for (const inputsComplete of [false, undefined]) {
    assert.equal(whyLine('defensive_value', { reason: '', passed: false, inputsComplete, checks: [
        { id: '배당 지급 연수', value: 0, rule: '=12 (축약)', passed: false, reason: '' }] }, 'ko'), null);
    assert.equal(whyLine('financial_strength', { reason: 'F점수 0/9; …', passed: false, inputsComplete, checks: [] }, 'ko'), null);
}

// ── 3. 배지 — 모르는 것은 안 그린다 ────────────────────────────────────────────
assert.deepEqual(badgeTexts('moat_compounder', null, 'ko'), []);
assert.deepEqual(badgeTexts('moat_compounder', {
    own13f: { state: 'unknown', period: '2026-06-30' },
    money: { count: 1, overlap: false, asOf: '2026-10-16' },
    earnings: { date: null, days: null, impliedMove: null },
}, 'ko'), [], '미확인 13F·겹침 없음·실적 미정 → 배지 0개');
assert.deepEqual(badgeTexts('moat_compounder', {
    own13f: { state: 'held', period: '2026-06-30' },
    money: { count: 2, overlap: true, asOf: '2026-10-16' },
    earnings: { date: '2026-10-28', days: 8, impliedMove: { impliedMovePct: 6.2 } },
}, 'ko'), ['13F 버크셔 보유 · 6/30', '돈 신호 2/4 겹침 · 10/16', '실적 D-8 · ±6.2%']);
assert.deepEqual(badgeTexts('garp', {
    own13f: { state: 'not_applicable', period: null }, money: null,
    earnings: { date: '2026-12-28', days: 69, impliedMove: null },
}, 'en'), [], '13F 없는 렌즈·35일 밖 실적');

// ── 4. 칩 렌더 — 0·결측이면 마크업 0 ──────────────────────────────────────────
const gate = { isPro: false, unlocked: true, iapAvailable: true, purchasing: false, proError: false, proNothing: false,
    openPaywall() {}, handleRestore() {}, copy: { proCta: 'SIGNUM Pro', proRestoreLabel: 'restore', modalWaitPrefix: '', proErrorLabel: '', proNothingLabel: '' },
    portals: null };
const nav = (Module as any)._load;
(Module as any)._load = function (name: string, parent: any, main: any) {
    if (name === 'next/navigation') return { useRouter: () => ({ push() {}, back() {} }) };
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_t, k) => String(k) }) };
    if (name === './ValueWall') return { useAdUnlockGate: () => gate };
    if (name === './AdFreeIcon') return { AdFreeIcon: () => null };
    if (name === './RedeemCodeLink') return { RedeemCodeLink: () => null };
    return nav.call(this, name, parent, main);
};
const { GuruLensChip } = require('../src/components/app/GuruLens');
const chip = (data: TickerLens | null, locale = 'ko') =>
    renderToStaticMarkup(React.createElement(GuruLensChip, { data, open: false, onToggle() {}, locale, controls: 'p' }));
assert.equal(chip(null), '');
assert.equal(chip(tl([])), '', '통과 0 → 칩 없음(«통과 렌즈 0» 금지)');
assert.match(chip(tl(['garp', 'roc_ey', 'max_pessimism'])), /통과 렌즈 3/);
assert.match(chip(tl(['garp']), 'ja'), /通過レンズ 1/);
assert.match(chip(tl(['garp']), 'en'), /Lenses passed 1/);
// 4~10위 = PRO 전용 — 광고 1시간 해제(unlocked)만으로는 열리지 않는다(관문 10201023)
const { GuruLensProOnly } = require('../src/components/app/GuruLens');
const pro = () => renderToStaticMarkup(React.createElement(GuruLensProOnly, { locale: 'ko', rows: 7 }, React.createElement('a', { tabIndex: 0 }, 'ROWS')));
assert.match(pro(), /guru-lens-pro-lock/, '광고 해제 상태여도 비PRO 는 잠금');
assert.match(pro(), /4~10위 · Pro/);
assert.ok(!/광고/.test(pro()), '광고 해제 버튼 없음');
assert.ok(!/ROWS|tabindex/i.test(pro()), '관문 10201058: 비PRO DOM 에 실제 행·포커스 가능한 요소 없음');
assert.equal((pro().match(/lockRow/g) ?? []).length, 7, '자리 표시만 행 수만큼');
gate.isPro = true;
assert.ok(!/guru-lens-pro-lock/.test(pro()) && /ROWS/.test(pro()), 'PRO 는 그대로 보인다');
gate.isPro = false;

// ── 5. API — determinedCount·badges=0·스냅샷 메모 ─────────────────────────────
const r = guruCompany();
r.ticker = 'AAPL';
const snap = makeSnapshot([r], { sec: 0, prices: 0, paid: 0 }, new Date('2026-10-19T12:00:00Z'));
const { lenses: _, ...meta } = snap;
const store = new Map<string, unknown>([[HEAD_KEY, { current: snap.date, previous: null }], [metaKey(snap.date), meta]]);
LENS_IDS.forEach(id => store.set(lensKey(id, snap.date), { date: snap.date, result: snap.lenses[id] }));
const readKeys: string[] = [];
let badgeCalls = 0;
(Module as any)._load = function (name: string, parent: any, main: any) {
    if (name === '@/lib/guruLens/service')
        return {
            readonlyCache: { read: async (key: string) => { readKeys.push(key); return store.get(key) ?? null; } },
            currentBadges: async () => { badgeCalls++; return {}; },
        };
    return nav.call(this, name, parent, main);
};
async function api() {
    const route = require('../src/app/api/guru-lens/route');
    let res = await route.GET(new NextRequest('http://localhost/api/guru-lens?ticker=AAPL&badges=0'));
    assert.equal(res.status, 200);
    let b = await res.json();
    assert.equal(badgeCalls, 0, 'badges=0 은 배지 읽기 0');
    assert.match(res.headers.get('cache-control'), /s-maxage=600/);
    assert.ok(tickerLens(b, 'AAPL'), '칩 응답은 화면 검증을 통과');
    assert.equal(b.lenses[0].rows[0].badges, null);
    for (const l of b.lenses) {
        const row = snap.lenses[l.definition.id as typeof LENS_IDS[number]].rows[0];
        assert.equal(l.determinedCount, row.passed || row.inputsComplete ? 1 : 0);
    }
    const before = readKeys.length;
    res = await route.GET(new NextRequest('http://localhost/api/guru-lens'));
    b = await res.json();
    assert.deepEqual(readKeys.slice(before), [HEAD_KEY], '같은 발행본은 head 만 다시 읽는다');
    assert.equal(badgeCalls, 1);
    assert.ok(lensBody(b), '목록 응답은 화면 검증을 통과');
    for (const l of b.lenses) {
        const row = snap.lenses[l.definition.id as typeof LENS_IDS[number]].rows[0];
        if (!row.passed) assert.equal(l.rows.length, row.inputsComplete === true ? 1 : 0, '근접 목록은 원입력 완전 행만');
    }
    assert.equal(b.lenses[0].rows[0].name, 'Apple Inc.', '행에 S&P 표의 회사명');
    assert.equal((await route.GET(new NextRequest('http://localhost/api/guru-lens?badges=2'))).status, 400);
    // 옛 세대(입력 출처 없음) → 분모를 주장하지 않는다
    const legacy = structuredClone(snap.lenses.garp);
    legacy.rows.forEach(x => delete (x as { inputsComplete?: boolean }).inputsComplete);
    store.set(HEAD_KEY, { current: snap.date, previous: null, asOf: 'legacy' });
    store.set(lensKey('garp', snap.date), { date: snap.date, result: legacy });
    b = await (await route.GET(new NextRequest('http://localhost/api/guru-lens?lens=garp&badges=0'))).json();
    assert.equal(b.lenses[0].determinedCount, null);
    assert.equal(coverageText(b.lenses[0], 495, 'ko'), null);
    store.clear();
    res = await route.GET(new NextRequest('http://localhost/api/guru-lens?ticker=AAPL&badges=0'));
    assert.equal(res.status, 503, '발행본 없으면 503 → 칩 없음');
    assert.equal(tickerLens(await res.json(), 'AAPL'), null);
    (Module as any)._load = nav;
    console.log('guruLens UI 1차: 결측·0 칩 생략, «0종목» 금지, 집계 분모, 배지 생략, badges=0·메모 통과');
}
api().catch(e => { console.error(e); process.exitCode = 1; });
