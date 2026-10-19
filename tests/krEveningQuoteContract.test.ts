/** 시세 API → PRE 배경/섹터 입력의 실제 계약. 외부 호출·저장은 전부 모의한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { etClock, lastClosedSessionDate } from '../src/lib/marketSession';
import { etLastClosedSessionDate, sessionCloseMinutes } from '../src/lib/marketCalendar';
import { generationSession, sessionQuote } from '../src/lib/ai/preMarketContext';
import { calcPriceDisplay } from '../src/utils/calcPriceDisplay';

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
// 초기화 경로만 시험한다. 스토리지·네트워크를 연결하지 않는다.
mock('../src/lib/storage/dashboardTickerStore', {});
mock('../src/providers/WebSocketProvider', {});
mock('../src/hooks/useMarketStatus', {});
mock('zustand', { create: () => (init: any) => {
    let state: any;
    const set = (patch: any) => { state = { ...state, ...patch }; };
    state = init(set, () => state);
    return { getState: () => state };
} });
mock('zustand/middleware', { persist: (init: any) => init });
const quoteRoute = require('../src/app/api/live/quotes/route');
const { readPickPreQuotes } = require('../src/services/preMarketContext');
const { useDashboardStore } = require('../src/stores/dashboardStore');
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

test('2차 관문 재현: API PRE 100·직전 종가 100·그 전 103.0928 → 초기 대시보드 보합 0%', async () => {
    const now = Date.parse('2026-10-19T08:40:00Z');
    const body = await quoteBody(now, 'pre', [snapshot('FLAT', 100, now - 60_000)], ['FLAT']);
    useDashboardStore.getState().initializeStore(['FLAT'], body.data);
    const t = useDashboardStore.getState().tickers.FLAT;
    assert.equal(t.extended.prePrice, 100);
    assert.equal(t.extended.preChangePct, 0, 'API 실측 0을 그 전 종가 기준 -3%로 재계산하면 안 됨');
    // DashboardClient의 WatchlistItem과 같은 표시 입력.
    const display = calcPriceDisplay({
        livePrice: t.display.price, liveChangePct: t.display.changePctPct,
        liveExtPrice: t.extended.prePrice, liveExtChangePct: t.extended.preChangePct,
        liveExtLabel: 'PRE', session: t.session, prevRegularClose: t.prevRegularClose,
        prevClose: t.prevClose, extended: t.extended,
    });
    assert.equal(display.activeExtLabel, 'PRE');
    assert.equal(display.activeExtPctKnown, true);
    assert.equal(display.activeExtPct, 0);
    assert.equal(display.displayPrice, 100);
    assert.equal(t.prevClose, 100 / 0.97, '정규장 등락 계산용 D-2는 보존');
    // 다음 폴링에서도 D-2로 되돌아가지 않아야 한다. 실제 computeOnePipe를 거친다.
    globalThis.fetch = async () => Response.json(body);
    await useDashboardStore.getState().fetchPriceOnly(['FLAT']);
    const polled = useDashboardStore.getState().tickers.FLAT;
    assert.equal(polled.prevRegularClose, 100);
    assert.equal(polled.extended.preChangePct, 0);
    assert.equal(calcPriceDisplay({ session: polled.session, prevRegularClose: polled.prevRegularClose,
        prevClose: polled.prevClose, extended: polled.extended }).activeExtPct, 0);
    body.data.FLAT.extendedMissing = true;
    await useDashboardStore.getState().fetchPriceOnly(['FLAT']);
    assert.equal(useDashboardStore.getState().tickers.FLAT.extended.prePrice, undefined,
        '폴링도 명시적 missing을 숫자보다 우선');
});

test('대시 초기화: PRE 비보합·레거시 등락률 없음·PRE CLOSE·명시적 결측', () => {
    const base = { price: 100, previousClose: 100 / 0.97, changePercent: -3,
        extendedPrice: 100, extendedLabel: 'PRE', extendedMissing: false, session: 'pre' };
    const init = (q: any) => {
        useDashboardStore.getState().initializeStore(['TEST'], { TEST: q });
        return useDashboardStore.getState().tickers.TEST;
    };
    assert.equal(init({ ...base, extendedPrice: 102, extendedChangePercent: 2 }).extended.preChangePct, 2);
    assert.equal(init(base).extended.preChangePct, 0, '레거시 PRE도 직전 정규 종가(price)가 기준');
    assert.ok(Math.abs(init({ ...base, session: 'regular' }).extended.preChangePct + 3) < 1e-9,
        '정규장 중 PRE CLOSE는 전일 종가가 기준');
    const missing = init({ ...base, extendedPrice: 100, extendedChangePercent: 0, extendedMissing: true });
    assert.equal(missing.extended?.prePrice, undefined, 'missing이 숫자보다 우선하고 이전값을 남기지 않음');
    assert.equal(missing.extended?.preChangePct, undefined);
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
