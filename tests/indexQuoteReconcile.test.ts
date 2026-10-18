/**
 * 지수 종가 정본 — 야후 meta 가 하루 묵은 날 시계열로 바로잡는가 (src/lib/indexQuoteReconcile.ts)
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/indexQuoteReconcile.test.ts
 *
 * 사고(10/13 마감 뒤): ^DJI meta.regularMarketPrice 51850.6(10/12 종가, 시각 10/12 20:00Z) · previousClose 51654.9(10/9) 인데 1분봉 마지막 정규장 봉은 51672.15.
 *   앱 /api/market/index-close 가 «DOW 51850.6, +0.38%» (실제 51672.15, −0.34%). 실측값 그대로 시험한다. 외부 통신 없음.
 */
import assert from 'node:assert/strict';
import { reconcileIndexQuote, META_STALE_SEC } from '../src/lib/indexQuoteReconcile';

const U = (y: number, mo: number, d: number, h: number, mi: number) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
const near = (a: number | null, b: number, eps = 0.01) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≠ ${b}`);
let n = 0;
let failed = 0;
const t = (name: string, fn: () => void) => {
    try { fn(); n++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.error(`  ✗ ${name}`, e); }
};

const END_1013 = U(2026, 10, 13, 20, 0);
const barsDJI = [
    { ts: U(2026, 10, 13, 13, 30), c: 51500 }, { ts: U(2026, 10, 13, 19, 57), c: 51661.93 }, { ts: U(2026, 10, 13, 19, 58), c: 51673.3 },
    { ts: U(2026, 10, 13, 19, 59), c: 51672.1484375 }, { ts: U(2026, 10, 13, 20, 17), c: 51670.1 },   // 마감 뒤 봉은 무시
];
const dailyDJI = [
    { ts: U(2026, 10, 8, 13, 30), c: 51231.64 }, { ts: U(2026, 10, 9, 13, 30), c: 51654.949 }, { ts: U(2026, 10, 12, 13, 30), c: 51850.5508 },
    { ts: U(2026, 10, 13, 13, 30), c: null },   // 오늘 일봉은 아직 비었다
];

t('^DJI 10/13 마감 뒤 — meta 가 10/12 종가에 멈춤 → 마지막 정규장 봉 + 10/12 종가 대비', () => {
    const r = reconcileIndexQuote({ metaPrice: 51850.6, metaTimeSec: U(2026, 10, 12, 20, 0), metaPrevClose: 51654.9, bars: barsDJI, regularEndSec: END_1013, daily: dailyDJI });
    near(r.price, 51672.1484375); near(r.prevClose, 51850.5508);
    assert.equal(r.priceFromBars, true); assert.equal(r.prevFromDaily, true);
    const pct = ((r.price - r.prevClose!) / r.prevClose!) * 100;
    assert.ok(Math.abs(pct - -0.3445) < 0.001, String(pct));
});

t('^DJI 일봉을 못 받으면 — origin/main 가격·기준 종가를 함께 복원', () => {
    const r = reconcileIndexQuote({ metaPrice: 51850.6, metaTimeSec: U(2026, 10, 12, 20, 0), metaPrevClose: 51654.9, bars: barsDJI, regularEndSec: END_1013, daily: null });
    near(r.price, 51672.1484375); near(r.prevClose, 51850.6); assert.equal(r.prevFromDaily, false);
});

t('^GSPC meta 가격은 새로워졌는데 previousClose 가 늦은 경우 — 가격 유지·직전 종가만 일봉으로', () => {
    const bars = [{ ts: U(2026, 10, 13, 19, 59), c: 7805.59 }, { ts: U(2026, 10, 13, 20, 0), c: 7805.4501953125 }];
    const daily = [{ ts: U(2026, 10, 9, 13, 30), c: 7811.54 }, { ts: U(2026, 10, 12, 13, 30), c: 7807.2402 }, { ts: U(2026, 10, 13, 13, 30), c: null }];
    const r = reconcileIndexQuote({ metaPrice: 7805.45, metaTimeSec: U(2026, 10, 13, 20, 33), metaPrevClose: 7811.54, bars, regularEndSec: END_1013, daily });
    near(r.price, 7805.45); near(r.prevClose, 7807.2402); assert.equal(r.priceFromBars, false);
});

t('^IXIC 정상(meta 가 새롭고 직전 종가도 맞음) — 값 불변', () => {
    const bars = [{ ts: U(2026, 10, 13, 19, 59), c: 27204.5 }, { ts: U(2026, 10, 13, 20, 0), c: 27204.3809 }];
    const daily = [{ ts: U(2026, 10, 12, 13, 30), c: 27245.9004 }, { ts: U(2026, 10, 13, 13, 30), c: 27204.3809 }];   // 오늘 봉이 있어도 «오늘»은 건너뛴다
    const r = reconcileIndexQuote({ metaPrice: 27204.38, metaTimeSec: U(2026, 10, 13, 21, 15), metaPrevClose: 27245.902, bars, regularEndSec: END_1013, daily });
    near(r.price, 27204.38); near(r.prevClose, 27245.9004); assert.equal(r.priceFromBars, false);
});

t('정규장 중 — meta 가 몇 분 안에 있으면 meta 가격 그대로 · 직전 종가는 어제', () => {
    const now = U(2026, 10, 13, 15, 10);
    const bars = [{ ts: now - 60, c: 51600 }, { ts: now, c: 51610 }];
    const daily = [{ ts: U(2026, 10, 12, 13, 30), c: 51850.55 }, { ts: U(2026, 10, 13, 13, 30), c: 51610 }];
    const r = reconcileIndexQuote({ metaPrice: 51609, metaTimeSec: now - 120, metaPrevClose: 51850.55, bars, regularEndSec: END_1013, daily });
    near(r.price, 51609); near(r.prevClose, 51850.55);
});

t('주말 — 금요일 종가와 목요일 종가', () => {
    const bars = [{ ts: U(2026, 10, 9, 19, 59), c: 51654.95 }];
    const daily = [{ ts: U(2026, 10, 8, 13, 30), c: 51231.64 }, { ts: U(2026, 10, 9, 13, 30), c: 51654.949 }];
    const r = reconcileIndexQuote({ metaPrice: 51654.9, metaTimeSec: U(2026, 10, 9, 20, 0), metaPrevClose: 51654.9, bars, regularEndSec: U(2026, 10, 9, 20, 0), daily });
    near(r.price, 51654.9); near(r.prevClose, 51231.64);
});

t('봉이 없으면 meta 그대로(보정하지 않는다)', () => {
    const r = reconcileIndexQuote({ metaPrice: 51850.6, metaTimeSec: U(2026, 10, 12, 20, 0), metaPrevClose: 51654.9, bars: [], regularEndSec: END_1013, daily: null });
    near(r.price, 51850.6); near(r.prevClose, 51654.9);
});

t('낡음 기준은 10분 — 9분 차이는 meta 유지', () => {
    assert.equal(META_STALE_SEC, 600);
    const r = reconcileIndexQuote({ metaPrice: 100, metaTimeSec: 1000, metaPrevClose: 99, bars: [{ ts: 1000 + 540, c: 101 }], regularEndSec: null, daily: null });
    near(r.price, 100);
});

t('근거 부족: REG 일봉 실패는 origin/main 계산 전체 유지', () => {
    const r = reconcileIndexQuote({ metaPrice: 100.4, metaTimeSec: U(2026, 10, 13, 14, 0), metaPrevClose: 100,
        bars: [{ ts: U(2026, 10, 13, 14, 20), c: 100.2 }], regularEndSec: END_1013, daily: null });
    near(r.price, 100.2); near(r.prevClose, 100.4);
});

t('근거 부족: 10/12 일봉 누락 — origin/main 계산 전체 유지', () => {
    const r = reconcileIndexQuote({ metaPrice: 100.2, metaTimeSec: U(2026, 10, 13, 20, 0), metaPrevClose: 100,
        bars: [], regularEndSec: END_1013, daily: [{ ts: U(2026, 10, 9, 13, 30), c: 100.5 }] });
    near(r.price, 100.2); near(r.prevClose, 100.5); assert.equal(r.prevFromDaily, true);
});

t('직전 거래일은 주말·노동절을 건너뛰며 일봉 정렬 순서에 기대지 않는다', () => {
    const r = reconcileIndexQuote({ metaPrice: 101, metaTimeSec: U(2026, 9, 8, 20, 0), metaPrevClose: 98,
        bars: [], regularEndSec: U(2026, 9, 8, 20, 0), daily: [
            { ts: U(2026, 9, 4, 13, 30), c: 100 }, { ts: U(2026, 9, 3, 13, 30), c: 99 },
        ] });
    near(r.prevClose, 100); assert.equal(r.prevFromDaily, true);
});

t('시각 근거가 없으면 origin/main 계산 전체 유지', () => {
    const r = reconcileIndexQuote({ metaPrice: 100.4, metaTimeSec: null, metaPrevClose: 100,
        bars: [{ ts: END_1013, c: 100.2 }], regularEndSec: END_1013, daily: null });
    near(r.price, 100.2); near(r.prevClose, 100.4); assert.equal(r.priceFromBars, true);
});

// 유일한 운영 호출자도 실제 함수 본문으로 실행한다. cron/Redis 쓰기 경로는 로드하지 않는다.
(async () => {
    const fs = require('node:fs');
    const ts = require('typescript');
    const source = fs.readFileSync(require('node:path').join(__dirname, '../src/app/api/cron/market-feed/route.ts'), 'utf8');
    const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find((x: any) => ts.isFunctionDeclaration(x) && x.name?.text === 'fetchOneQuote');
    assert.ok(fn, 'fetchOneQuote 운영 본문');
    const compiled = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    for (const failDaily of [false, true]) {
        const calls: string[] = [];
        const fetchStub = async (url: string) => {
            calls.push(url);
            if (url.includes('interval=1m')) return { ok: true, json: async () => ({ chart: { result: [{
                meta: { regularMarketPrice: 100.002, regularMarketTime: END_1013, previousClose: 100, currentTradingPeriod: { regular: { end: END_1013 } } },
                timestamp: [END_1013], indicators: { quote: [{ close: [100.002] }] },
            }] } }) };
            return { ok: !failDaily, json: async () => ({ chart: { result: [{ timestamp: [U(2026, 10, 9, 13, 30)], indicators: { quote: [{ close: [99.8] }] } }] } }) };
        };
        const fetchQuote = new Function('fetch', 'reconcileIndexQuote', 'REAL_INDEX_SYMBOLS', `${compiled}; return fetchOneQuote;`)(fetchStub, reconcileIndexQuote, new Set(['^IXIC', '^DJI', '^GSPC']));
        for (const symbol of ['^DJI', '^IXIC', '^GSPC']) {
            const q = await fetchQuote(symbol);
            t(`호출자: ${symbol} 거의 보합·일봉 ${failDaily ? '실패' : '직전일 누락'}에도 날짜 보정 후 실제 미세 등락 유지`, () => {
                assert.equal(q.prevClose, failDaily ? 100 : 99.8); assert.equal(q.price, 100.002);
            });
        }
        t(`호출자: 실제 지수 일봉 ${failDaily ? '실패' : '누락'} 때 실제 지수는 값 비교 재조회 없음`, () => assert.equal(calls.filter((u) => u.includes('interval=1d')).length, 3));
    }
    console.log(`\n${n} passed, ${failed} failed`);
    if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
