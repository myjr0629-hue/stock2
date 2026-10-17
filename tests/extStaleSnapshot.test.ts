/**
 * 마감 뒤 «큰 가격 = 오늘 정규장 종가 · 등락 = 오늘 등락 · POST = 오늘 애프터» 가 벤더 429 속에서도 지켜지는가
 *   — src/services/intrinioClient.ts resolveSessionPrices · getTickerSnapshot (+ 화면 계산 calcPriceDisplay)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extStaleSnapshot.test.ts
 *
 * 사고(대표 10/13 08:19 KST = 10/12 19:19 ET, iPhone Flow, MSTR 애프터마켓):
 *   큰 가격 $154.34 ▲+1.89%(= 금요일 종가·금요일 등락) · POST $153.61 −0.48%(= 16시대 옛 애프터 체결). 같은 순간 TSLA 는 정상.
 *   운영 로그 19:18:49~51 ET: MSTR 처음 열림 → 일봉·집계·open-close·macd·sma 가 전부 429 → live/ticker «이번 계산 실패(prevClose=0) → 마지막 정상값과 병합».
 *   뿌리 둘(둘 다 공유 스냅샷 어댑터 getTickerSnapshot):
 *     ① 일봉이 비면 regularClose 가 벤더 eod_close_price(= 직전 «완료된» 세션 = 금요일 종가)로 남아 «오늘 종가»로 나갔다.
 *     ② 실시간 호출이 실패하면 Redis 마지막 정상값(12시간)으로 답하는데, 그 안의 «마지막 체결»(몇 시간 전 애프터 체결)을 시각(오늘 16:00~20:00)만 보고 지금 POST 로 받았다.
 */
import assert from 'node:assert/strict';
import { calcPriceDisplay } from '../src/utils/calcPriceDisplay';

let n = 0;
let failed = 0;
const pending: Array<[string, (() => void | Promise<void>) | null]> = [];
const t = (name: string, fn: () => void | Promise<void>) => { pending.push([name, fn]); };
const head = (title: string) => { pending.push([title, null]); };
const near = (a: number, b: number, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// ── 시계 고정: new Date() · Date.now() 만 바꾼다(그 밖의 Date 사용은 그대로) ──
const RealDate = Date;
function setNow(ms: number) {
    class FakeDate extends RealDate {
        constructor(...a: any[]) { if (a.length === 0) super(ms); else super(...(a as [any])); }
        static now() { return ms; }
    }
    (globalThis as any).Date = FakeDate;
}
function restoreNow() { (globalThis as any).Date = RealDate; }
const ET_1918 = RealDate.UTC(2026, 9, 12, 23, 18, 51);   // 2026-10-12 19:18:51 ET (EDT = UTC-4)

// ── 운영 실측(MSTR) ──
const FRI = '2026-10-09', MON = '2026-10-12';
const MSTR_RT_AH_1625 = {   // 16:25 ET 에 저장된 실시간(= 애프터 초반 체결 $153.61, 벤더 EOD 는 아직 금요일)
    eod_close_price: 154.34, eod_close_date: FRI,
    normal_market_hours_last_price: 152.68, normal_market_hours_last_time: '2026-10-12T19:59:59.000Z',
    last_price: 153.61, last_time: '2026-10-12T20:25:10.000Z', last_size: 100,
    bid_price: 153.5, ask_price: 153.7, bid_size: 1, ask_size: 5, open_price: 151.2, high_price: 158.34, low_price: 150.88,
    market_volume: 9_000_000, updated_on: '2026-10-12T20:25:11.000Z',
};
const MSTR_RT_LIVE_1903 = {  // 지연 피드의 지금 값(19:03 체결 $150.50)
    ...MSTR_RT_AH_1625, last_price: 150.5, last_time: '2026-10-12T23:03:50.000Z',
};

(async () => {
    process.env.INTRINIO_API_KEY = 'test-key';
    // ── Redis 대역(마지막 정상 실시간을 시험이 심는다) + 벤더(fetch) 대역 ──
    const store = new Map<string, any>();
    const redisPath = require.resolve('../src/services/redisClient');
    (require as any).cache[redisPath] = {
        id: redisPath, filename: redisPath, loaded: true, children: [], paths: [],
        exports: {
            getFromCache: async (k: string) => (store.has(k) ? store.get(k) : null),
            setInCache: async (k: string, v: any) => { store.set(k, v); return true; },
            mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? store.get(k) : null)),
        },
    };
    type Plan = { realtime: 'ok' | '429'; hist: 'ok' | '429' };
    let plan: Plan = { realtime: 'ok', hist: '429' };
    let liveRt: any = MSTR_RT_LIVE_1903;
    const HIST_OK = { stock_prices: [{ date: FRI, close: 154.34 }, { date: '2026-10-08', close: 151.47 }, { date: '2026-10-07', close: 149.0 }] };
    (globalThis as any).fetch = async (url: string) => {
        const u = String(url);
        const res = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
        if (/\/securities\/MSTR\/prices\/realtime/.test(u)) return plan.realtime === 'ok' ? res(200, liveRt) : res(429, {});
        if (/\/securities\/MSTR\/prices(\?|$)/.test(u)) return plan.hist === 'ok' ? res(200, HIST_OK) : res(429, {});
        return res(404, {});
    };
    const { resolveSessionPrices, getTickerSnapshot, staleExtTradeUntrusted, SNAP_STALE_EXT_TRUST_MS } = require('../src/services/intrinioClient');

    head('━━━ 1. resolveSessionPrices — 일봉이 비었을 때 «지난 종가»를 «오늘 종가»로 내지 않는다 ━━━');
    const base = { bars: [] as any[], eodClosePrice: 154.34, eodCloseDate: FRI, regularLastPrice: 152.68, regularLastTime: '2026-10-12T19:59:59.000Z' };
    t('★ 월 마감 뒤(POST) · 일봉 없음 · 벤더 EOD 는 금요일 → 오늘 종가 152.68 · 직전 종가 154.34 (예전: 154.34 · null)', () => {
        const r = resolveSessionPrices({ ...base, session: 'POST', todayEt: MON });
        near(r.regularClose, 152.68); near(r.prevClose, 154.34); assert.equal(r.regularDate, MON);
    });
    t('월 20:30 CLOSED 도 같다', () => {
        const r = resolveSessionPrices({ ...base, session: 'CLOSED', todayEt: MON });
        near(r.regularClose, 152.68); near(r.prevClose, 154.34);
    });
    t('벤더 EOD 가 오늘(월)까지 게시됐으면 그 값이 오늘 종가(바뀌지 않는다)', () => {
        const r = resolveSessionPrices({ ...base, eodClosePrice: 152.68, eodCloseDate: MON, session: 'CLOSED', todayEt: MON });
        near(r.regularClose, 152.68); assert.equal(r.prevClose, null); assert.equal(r.regularDate, MON);
    });
    t('월 프리마켓(05:00) · 일봉 없음 → 마지막 정규장 = 금요일 종가 154.34 (바뀌지 않는다)', () => {
        const r = resolveSessionPrices({ ...base, regularLastTime: '2026-10-09T19:59:59.000Z', regularLastPrice: 154.34, session: 'PRE', todayEt: MON });
        near(r.regularClose, 154.34); assert.equal(r.regularDate, FRI);
    });
    t('정규장 중(REG)은 바뀌지 않는다 — 실시간 vs 직전 종가', () => {
        const r = resolveSessionPrices({ ...base, regularLastPrice: 153.0, regularLastTime: '2026-10-12T15:00:00.000Z', session: 'REG', todayEt: MON });
        near(r.regularClose, 153.0); near(r.prevClose, 154.34); assert.equal(r.regularDate, MON);
    });
    t('토요일(CLOSED) · 금요일 EOD 미게시(벤더는 목요일) → 금요일 종가 · 직전은 목요일', () => {
        const r = resolveSessionPrices({
            bars: [], eodClosePrice: 151.47, eodCloseDate: '2026-10-08', regularLastPrice: 154.34,
            regularLastTime: '2026-10-09T19:59:59.000Z', session: 'CLOSED', todayEt: FRI,
        });
        near(r.regularClose, 154.34); near(r.prevClose, 151.47); assert.equal(r.regularDate, FRI);
    });
    t('일봉이 있으면 기존 규칙 그대로(post-before-publish): 금요일 봉 + 월요일 체결 → 오늘 종가 152.68 · 직전 154.34', () => {
        const r = resolveSessionPrices({ ...base, bars: [{ date: FRI, close: 154.34 }, { date: '2026-10-08', close: 151.47 }], session: 'POST', todayEt: MON });
        near(r.regularClose, 152.68); near(r.prevClose, 154.34); assert.equal(r.basis, 'post-before-publish');
    });
    t('오늘 정규장 체결 정보가 없으면(정규장 체결 시각이 어제) 추측하지 않고 기본값 유지', () => {
        const r = resolveSessionPrices({ ...base, regularLastTime: '2026-10-09T19:59:59.000Z', session: 'POST', todayEt: MON });
        near(r.regularClose, 154.34); assert.equal(r.regularDate, FRI);
    });

    head('━━━ 2. getTickerSnapshot — 사고 순간(10/12 19:18:51 ET) 재현 ━━━');
    const day = (s: any) => s.ticker.day.c;
    t('★ 일봉 429 + 실시간 정상: 오늘 종가 152.68 · 직전 154.34 · 애프터 체결은 지금 값(150.50)', async () => {
        setNow(ET_1918); store.clear(); plan = { realtime: 'ok', hist: '429' };
        const s = await getTickerSnapshot('MSTR'); restoreNow();
        near(day(s), 152.68); near(s.ticker._intrinio.prevClose, 154.34); near(s.ticker.prevDay.c, 154.34);
        assert.equal(s.ticker._intrinio.hasExtendedTrade, true); near(s.ticker.afterHours, 150.5); near(s.ticker.lastTrade.p, 150.5);
        assert.equal(s.ticker._rtStale, false);
    });
    t('★★ 일봉 429 + 실시간 429 → 16:25 ET 저장본(2시간 53분 전)으로 답함: 정규장 값은 정확 · 옛 애프터 체결 $153.61 은 «지금 POST» 가 아니다', async () => {
        setNow(ET_1918); store.clear(); plan = { realtime: '429', hist: '429' };
        store.set('intrinio:snap:lastgood:v1:MSTR', { rt: MSTR_RT_AH_1625, at: ET_1918 - (2 * 3600 + 53 * 60) * 1000 });
        const s = await getTickerSnapshot('MSTR'); restoreNow();
        near(day(s), 152.68); near(s.ticker._intrinio.prevClose, 154.34); near(s.ticker._intrinio.regularClose, 152.68);
        assert.equal(s.ticker._intrinio.hasExtendedTrade, false);
        assert.equal(s.ticker.afterHours, undefined);
        assert.equal(s.ticker.lastTrade.t / 1e6, RealDate.parse(MSTR_RT_AH_1625.normal_market_hours_last_time), '옛 시간외 시각 대신 선택된 정규장 체결 시각을 보존한다');
        assert.equal(s.ticker.lastTrade.basis, 'trade');
        assert.equal(s.ticker.lastTrade.source, 'intrinio_realtime');
        near(s.ticker.lastTrade.p, 152.68);
        assert.equal(s.ticker._rtStale, true);
    });
    t('저장본이 5분 이내(벤더 일시 끊김)면 시간외 체결을 그대로 쓴다', async () => {
        setNow(ET_1918); store.clear(); plan = { realtime: '429', hist: '429' };
        store.set('intrinio:snap:lastgood:v1:MSTR', { rt: MSTR_RT_LIVE_1903, at: ET_1918 - 2 * 60 * 1000 });
        const s = await getTickerSnapshot('MSTR'); restoreNow();
        assert.ok(2 * 60 * 1000 < SNAP_STALE_EXT_TRUST_MS);
        assert.equal(s.ticker._intrinio.hasExtendedTrade, true); near(s.ticker.afterHours, 150.5);
    });
    t('일봉·실시간 모두 정상이면 예전과 같다(일봉 bars → post-before-publish)', async () => {
        setNow(ET_1918); store.clear(); plan = { realtime: 'ok', hist: 'ok' };
        const s = await getTickerSnapshot('MSTR'); restoreNow();
        near(day(s), 152.68); near(s.ticker._intrinio.prevClose, 154.34); near(s.ticker.afterHours, 150.5);
    });
    t('정규장(REG) 중에는 저장본의 마지막 체결을 건드리지 않는다', async () => {
        const REG = RealDate.UTC(2026, 9, 12, 17, 30, 0);   // 13:30 ET
        setNow(REG); store.clear(); plan = { realtime: '429', hist: '429' };
        store.set('intrinio:snap:lastgood:v1:MSTR', { rt: { ...MSTR_RT_AH_1625, last_price: 153.0, last_time: '2026-10-12T17:00:00.000Z' }, at: REG - 3 * 3600 * 1000 });
        const s = await getTickerSnapshot('MSTR'); restoreNow();
        near(s.ticker.lastTrade.p, 153.0);
    });

    head('━━━ 2b. staleExtTradeUntrusted — 저장본의 시간외 체결을 «지금 값»으로 믿는 조건 ━━━');
    const at = (iso: string) => RealDate.parse(iso);
    t('POST · 저장 후 2시간 53분 → 믿지 않는다 / 2분 → 믿는다 / 저장본 아님(null) → 믿는다', () => {
        assert.equal(staleExtTradeUntrusted('POST', (2 * 60 + 53) * 60_000, MON, ET_1918), true);
        assert.equal(staleExtTradeUntrusted('POST', 2 * 60_000, MON, ET_1918), false);
        assert.equal(staleExtTradeUntrusted('POST', null, MON, ET_1918), false);
    });
    t('PRE · 오래된 저장본(전날 밤 애프터 체결)은 믿지 않는다', () => assert.equal(staleExtTradeUntrusted('PRE', 6 * 3600_000, MON, at('2026-10-13T08:00:00Z')), true));
    t('REG · 대상이 아니다', () => assert.equal(staleExtTradeUntrusted('REG', 3 * 3600_000, MON, at('2026-10-12T17:00:00Z')), false));
    t('CLOSED 20:10 ET · 19:59 에 저장(시간외 중) → 믿지 않는다 · 20:03 에 저장(시간외 끝난 뒤) → 믿는다 · 16:25 저장 → 믿지 않는다', () => {
        const now = at('2026-10-13T00:10:00Z');                                  // 월 20:10 EDT
        assert.equal(staleExtTradeUntrusted('CLOSED', now - at('2026-10-12T23:59:00Z'), MON, now), true);
        assert.equal(staleExtTradeUntrusted('CLOSED', now - at('2026-10-13T00:03:00Z'), MON, now), false);   // 7분 전 = 5분 초과이지만 20:00 뒤 저장
        assert.equal(staleExtTradeUntrusted('CLOSED', now - at('2026-10-12T20:25:00Z'), MON, now), true);
    });
    t('토요일 12:00(CLOSED) · 거래일 금요일 · 금요일 20:30 에 저장 → 믿는다 / 금요일 18:00 저장 → 믿지 않는다', () => {
        const now = at('2026-10-10T16:00:00Z');
        assert.equal(staleExtTradeUntrusted('CLOSED', now - at('2026-10-10T00:30:00Z'), FRI, now), false);
        assert.equal(staleExtTradeUntrusted('CLOSED', now - at('2026-10-09T22:00:00Z'), FRI, now), true);
    });

    head('━━━ 3. 화면 계산 — 사고 입력 그대로, 고친 입력 그대로 ━━━');
    const UI = {
        livePrice: undefined, liveChangePct: undefined, session: 'POST',
        prevRegularClose: 154.34, prevClose: 154.34, prevChangePct: 1.89, fallbackChangePct: -2.68, apiDisplayPrice: 153.61,
        extended: {}, prices: {} as any,
    };
    t('사고 재현: regularCloseToday 가 금요일 종가(154.34)로 오면 큰 가격 $154.34 ▲+1.89% · POST $153.61 −0.47%', () => {
        const r = calcPriceDisplay({ ...UI, regularCloseToday: 154.34, extended: { postPrice: 153.61 }, prices: { postPrice: 153.61 } } as any);
        near(r.displayPrice, 154.34); near(r.displayChangePct, 1.89); near(r.activeExtPrice, 153.61); near(r.activeExtPct, -0.473, 0.01);
    });
    t('★ 고친 입력: 오늘 종가 152.68 → 큰 가격 $152.68 ▼−1.08% · 애프터 체결이 없으면 POST 자리는 오늘 PRE CLOSE 를 잇는다(기존 규칙)', () => {
        const r = calcPriceDisplay({ ...UI, regularCloseToday: 152.68, extended: { prePrice: 153.58, postPrice: null }, prices: { prePrice: 153.58 } } as any);
        near(r.displayPrice, 152.68); near(r.displayChangePct, -1.0758, 0.01);
        assert.equal(r.activeExtLabel, 'PRE CLOSE'); near(r.activeExtPrice, 153.58); assert.equal(r.activeExtCarry, true);
    });
    t('★ 고친 입력(정상): 애프터 체결 150.09 → POST $150.09 −1.70% (오늘 종가 대비)', () => {
        const r = calcPriceDisplay({ ...UI, regularCloseToday: 152.68, extended: { prePrice: 153.58, postPrice: 150.09 }, prices: { prePrice: 153.58, postPrice: 150.09 } } as any);
        near(r.displayPrice, 152.68); assert.equal(r.activeExtLabel, 'POST'); near(r.activeExtPrice, 150.09); near(r.activeExtPct, -1.696, 0.01);
    });

    for (const [name, fn] of pending) {
        if (!fn) { console.log(name); continue; }
        try { await fn(); n++; console.log(`  ✓ ${name}`); }
        catch (e: any) { restoreNow(); failed++; console.log(`  ✗ ${name}\n      ${String(e?.message || e).split('\n')[0]}`); }
    }
    console.log(`\n${n}개 통과 · ${failed}개 실패`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { restoreNow(); console.error(e); process.exit(1); });
