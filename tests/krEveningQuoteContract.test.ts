/** 시세 API → PRE 배경/섹터 입력의 실제 계약. 외부 호출·저장은 전부 모의한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { etClock, lastClosedSessionDate } from '../src/lib/marketSession';
import { etLastClosedSessionDate, sessionCloseMinutes } from '../src/lib/marketCalendar';
import { generationSession, sessionQuote } from '../src/lib/ai/preMarketContext';

function mock(name: string, exports: any) {
    const p = require.resolve(name);
    require.cache[p] = { id: p, filename: p, loaded: true, exports } as Module;
}
let phase = 'pre';
let rows: any[] = [];
mock('../src/services/massiveClient', { fetchMassive: async () => ({ tickers: rows }) });
mock('../src/services/marketStatusProvider', { getMarketStatusSSOT: async () => ({ session: phase, isHoliday: false }) });
mock('../src/services/lastSession', { reconstructLastSession: async () => ({}) });
mock('../src/lib/hubLiveOverlay', { HUB_OVERLAY_MIN_SYMBOLS: 31, HUB_OVERLAY_MAX_SYMBOLS: 100 });
mock('../src/services/extendedSessionClose', {
    peekExtendedSessionClosesAndWarm: async (need: string[]) => ({ values: need.map(() => undefined), warm: null }),
    recallProvisionalPreCloses: async (need: string[]) => need.map(() => null),
    rememberProvisionalPreClose: () => {},
    pickRegularPreClose: () => null,
    isTradeInExtSession: (ms: number, date: string, kind: string) => {
        if (!ms) return false;
        const c = etClock(ms);
        return c.date === date && (kind === 'pre' ? c.minutes >= 240 && c.minutes < 570
            : c.minutes >= sessionCloseMinutes(date) && c.minutes < 1200);
    },
});
mock('../src/services/redisClient', { mgetFromCache: async () => [null, null, null] });
const quoteRoute = require('../src/app/api/live/quotes/route');
const { readPickPreQuotes } = require('../src/services/preMarketContext');
const realNow = Date.now, realFetch = globalThis.fetch;
const tests: Array<[string, () => unknown]> = [];
const test = (name: string, fn: () => unknown) => tests.push([name, fn]);
const snapshot = (ticker: string, price: number, tradeMs: number) => ({
    ticker, day: { c: 100, v: 1 }, prevDay: { c: 100 / 0.97 },
    lastTrade: { p: price, t: tradeMs * 1e6 },
});
async function quoteBody(now: number, session: string, snapshots: any[], symbols: string[]) {
    Date.now = () => now; phase = session; rows = snapshots;
    const res = await quoteRoute.GET(new Request(`http://localhost/api/live/quotes?symbols=${symbols.join(',')}`));
    assert.equal(res.status, 200);
    return res.json();
}

test('관문 재현: 월요일 실제 PRE 0.00%와 미체결/전일/오류를 구분하고 두 AI 입력에 전달', async () => {
    const now = Date.parse('2026-10-19T08:40:00Z');
    const body = await quoteBody(now, 'pre', [
        snapshot('FLAT', 100, now - 60_000),
        snapshot('MISSING', 0, 0),
        snapshot('OLD', 100, Date.parse('2026-10-16T23:00:00Z')),
    ], ['FLAT', 'MISSING', 'OLD', 'ERROR']);
    const flat = body.data.FLAT;
    assert.equal(flat.extendedPrice, 100, '실제 API가 같다는 이유로 버렸던 가격');
    assert.equal(flat.extendedChangePercent, 0);
    assert.equal(flat.extendedDate, '2026-10-19');
    assert.equal(flat.extendedMissing, false);
    // 섹터 크론과 동일한 입력 함수
    const sector = sessionQuote('FLAT', flat, body.session, now);
    assert.equal(sector.basis, 'PRE'); assert.equal(sector.changePct, 0);
    assert.equal(sector.date, '2026-10-19');
    for (const ticker of ['MISSING', 'OLD', 'ERROR']) assert.equal(body.data[ticker].extendedMissing, true);
    const missing = sessionQuote('MISSING', body.data.MISSING, body.session, now);
    assert.equal(missing.basis, 'REG'); assert.equal(missing.date, '2026-10-16');
    assert.ok(Math.abs(missing.changePct! + 3) < 1e-9);
    // 오늘 볼 것의 실제 로더까지 연결
    globalThis.fetch = async () => Response.json(body);
    const picks = await readPickPreQuotes(['FLAT', 'MISSING'], now);
    assert.deepEqual(picks[0], sector); assert.deepEqual(picks[1], missing);
});

test('명시적 결측 플래그는 숫자 0%/날짜보다 우선하며 실제 0%는 보존', () => {
    const now = Date.parse('2026-10-19T08:40:00Z');
    const r = { price: 100, changePercent: -3, extendedPrice: 100, extendedChangePercent: 0,
        extendedDate: '2026-10-19', extendedLabel: 'PRE', extendedMissing: true };
    assert.equal(sessionQuote('AAPL', r, 'pre', now).basis, 'REG');
    assert.equal(sessionQuote('AAPL', { ...r, extendedMissing: false }, 'pre', now).basis, 'PRE');
});

test('POST 실측 0%도 날짜·세션을 보존하고 미체결과 구분', async () => {
    const now = Date.parse('2026-11-27T18:05:00Z');
    const body = await quoteBody(now, 'post', [snapshot('AAPL', 100, now - 60_000)], ['AAPL']);
    assert.equal(body.data.AAPL.extendedMissing, false);
    const q = sessionQuote('AAPL', body.data.AAPL, body.session, now);
    assert.equal(q.price, 100); assert.equal(q.changePct, 0);
    assert.equal(q.date, '2026-11-27'); assert.equal(q.basis, 'POST');
});

test('관문 재현: 11/27 13:05 ET POST 미체결은 당일 REG 날짜·종가·등락', async () => {
    const now = Date.parse('2026-11-27T18:05:00Z');
    const body = await quoteBody(now, 'post', [snapshot('AAPL', 100, now - 10 * 60_000)], ['AAPL']);
    const q = sessionQuote('AAPL', body.data.AAPL, body.session, now);
    assert.equal(q.basis, 'REG'); assert.equal(q.date, '2026-11-27');
    assert.equal(q.price, 100); assert.ok(Math.abs(q.changePct! + 3) < 1e-9);
    assert.equal(body.data.AAPL.extendedMissing, true);
    assert.equal(generationSession(now), 'AFTER HOURS');
});

test('직전 정규장 달력: 조기 폐장 전/경계/뒤·휴장·주말·정상 마감·DST', () => {
    for (const [iso, date] of [
        ['2026-11-27T17:59:00Z', '2026-11-25'],
        ['2026-11-27T18:00:00Z', '2026-11-27'],
        ['2026-11-27T18:05:00Z', '2026-11-27'],
        ['2026-11-26T19:00:00Z', '2026-11-25'],
        ['2026-11-28T18:05:00Z', '2026-11-27'],
        ['2026-11-29T18:05:00Z', '2026-11-27'],
        ['2026-12-24T17:59:00Z', '2026-12-23'],
        ['2026-12-24T18:00:00Z', '2026-12-24'],
        ['2026-12-25T18:05:00Z', '2026-12-24'],
        ['2026-10-19T19:59:00Z', '2026-10-16'],
        ['2026-10-19T20:00:00Z', '2026-10-19'],
        ['2026-11-02T20:59:00Z', '2026-10-30'],
        ['2026-11-02T21:00:00Z', '2026-11-02'],
    ]) {
        const now = Date.parse(iso);
        assert.equal(etLastClosedSessionDate(now), date, `marketCalendar ${iso}`);
        assert.equal(lastClosedSessionDate(now), date, `marketSession ${iso}`);
    }
});

(async () => {
    let failed = 0;
    globalThis.fetch = async () => { throw new Error('모의하지 않은 외부 요청'); };
    try {
        for (const [name, fn] of tests) {
            try { await fn(); console.log('ok -', name); }
            catch (e) { failed++; console.error('FAIL -', name, (e as Error).message); }
        }
        console.log(`${tests.length - failed}/${tests.length} passed`);
        if (failed) process.exitCode = 1;
    } finally { Date.now = realNow; globalThis.fetch = realFetch; }
})();
