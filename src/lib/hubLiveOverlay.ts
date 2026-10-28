/**
 * 31개 이상 한 요청(벌크 경로)의 정규장 «지금 가격» — 가격 허브(실시간 WS)의 마지막 체결로 덮는다.
 *
 * 사고(10/13 정규장 · Intel 섹터 화면 / 무결성 감시기 QUOTES_OVER30): /api/live/quotes 를 31개 이상 한 요청에 보내면(Intel 화면은 섹터 70여 종목을 5초마다 한 요청으로 묻는다)
 *   서버가 종목별 실시간 스냅샷(≤30개, 정확) 대신 벌크 경로로 간다. 그 경로의 «지금 가격» = 벤더 스냅샷 CSV(securities/snapshots)의 호가 중간값인데,
 *   그 파일은 5분 간격으로 만들어지지만 내용이 약 15분 늦고(EC2 intrinio-ext-bars 로그: 12:06 GMT 에 읽은 파일의 Last-Modified 11:50:05 GMT), 우리 쪽이 5분 더 캐시한다 → 정규장에도 최대 약 20분 묵은 값이 나갔다
 *   (HOOD 109.52 vs 110.19 · MU 946.29 vs 937.53 · 90초 동안 값이 한 번도 안 바뀌는 것을 실측).
 * 가격 허브(wss://ws.signumhq.com ← EC2 price-ws, Intrinio EQUITIES_EDGE WS)는 정규장에 실시간이다(체결 지연 중앙값 0초, 10/13 실측) — 그 마지막 체결을 /last 로 읽어 와 벌크 행의 가격만 덮는다.
 *   벤더 REST 호출 0(채널 구독만 늘어난다). 허브가 느리거나 죽었거나 값이 이상하면 덮지 않는다(= 예전 값, 더 나빠지지 않는다).
 * 계약: 덮는 것은 lastTrade.p · day.c/h/l · min.c/h/l · todaysChange(Perc) 뿐. 라우트의 정규장 분기가 lastTrade.p 를 price 로 쓰고 prevDay.c 로 등락을 다시 계산한다.
 *   lastTrade.t(PRE CLOSE 판정이 읽는다)·거래량·EOD 필드는 건드리지 않는다. 정규장이 아니면 부르지 않는다(시간외는 별개 경로).
 */
import { etWallToMs } from '@/lib/earningsWeek';

/** 이 개수 이상일 때만 벌크 경로다(intrinioClient DIRECT_SNAPSHOT_MAX=30 보다 커야 벌크) · 100 초과(구조 빌드 크론의 250개 조각 등)는 허브를 부르지 않는다 */
export const HUB_OVERLAY_MIN_SYMBOLS = 31;
export const HUB_OVERLAY_MAX_SYMBOLS = 100;
/** 마지막 체결을 믿는 나이 — 허브가 받은 뒤 이 시간이 지난 체결은 쓰지 않는다(체결이 드문 종목은 예전 값으로 남는다) */
export const HUB_TICK_MAX_AGE_MS = 15 * 60_000;
/** 허브 시계 기준 원천 체결 시각의 최대 지연 */
export const HUB_TRADE_MAX_LAG_MS = 90_000;
/** 벌크 행 가격(최대 20분 묵음)과 이만큼 넘게 벗어난 체결은 믿지 않는다(이상 체결 방어 · 20분에 8% 넘게 움직인 종목은 예전 값이 남는다) */
export const HUB_MAX_DEVIATION = 0.08;
/** 전일 종가와 이만큼 넘게 벗어난 체결은 믿지 않는다(허브 값이 엉뚱한 종목 값일 때) */
export const HUB_MAX_PREV_DEVIATION = 0.35;
/** 허브 한 번 부르는 시간 상한 · 방금 채널을 연 종목의 첫 체결을 기다리는 시간(허브 쪽) */
export const HUB_TIMEOUT_MS = 2300;
export const HUB_WAIT_MS = 1500;
/** 허브 호출이 실패(시간 초과·오류)하면 이 시간 동안 부르지 않는다(인스턴스별) — 허브가 죽었을 때 모든 요청이 시간 상한을 기다리지 않게 */
export const HUB_BREAKER_MS = 30_000;

export interface HubTick { p: number; trade: number; rx: number; joined?: number }
export interface HubLast { now: number; live?: boolean; ticks: Record<string, HubTick>; pending?: string[] }

export interface BulkRowLike {
    day?: Record<string, any>;
    min?: Record<string, any>;
    prevDay?: { c?: number } & Record<string, any>;
    lastTrade?: { p?: number; t?: number } & Record<string, any>;
    _eodDate?: string;
    [k: string]: any;
}

/** 오늘 정규장 개장(09:30 ET)의 epoch ms */
export function regularOpenMs(etDate: string): number | null {
    return etWallToMs(etDate, '09:30');
}

/**
 * 허브 체결 하나를 쓸 수 있는가 — 쓸 수 있으면 가격, 아니면 null. 순수 함수.
 *  · 오늘 정규장 개장 이후의 체결(프리마켓 체결·지난 세션 값 금지) · 허브가 받은 지 HUB_TICK_MAX_AGE_MS 안(허브 시계 기준 — 서버 시계 차이 무관)
 *  · 벌크 행 가격과 8% 안 · 전일 종가와 35% 안
 */
export function acceptHubTick(
    tick: HubTick | null | undefined,
    ctx: { hubNowMs: number; openMs: number; refPrice: number; prevClose: number },
): number | null {
    if (!tick) return null;
    const p = Number(tick.p), trade = Number(tick.trade), rx = Number(tick.rx);
    if (!(p > 0) || !Number.isFinite(p) || !Number.isFinite(trade) || !Number.isFinite(rx)) return null;
    if (trade < ctx.openMs - 2000) return null;
    if (trade > ctx.hubNowMs + 60_000) return null;
    if (rx - trade > HUB_TRADE_MAX_LAG_MS) return null;
    const age = ctx.hubNowMs - rx;
    if (age > HUB_TICK_MAX_AGE_MS || age < -60_000) return null;
    if (ctx.refPrice > 0 && Math.abs(p - ctx.refPrice) / ctx.refPrice > HUB_MAX_DEVIATION) return null;
    if (ctx.prevClose > 0 && Math.abs(p - ctx.prevClose) / ctx.prevClose > HUB_MAX_PREV_DEVIATION) return null;
    return p;
}

/** 벌크 행의 가격 필드만 허브 체결가로 덮는다(순수 — 새 객체). 등락은 전일 종가(prevDay.c) 기준으로 다시 계산한다. */
export function overlayBulkRow<T extends BulkRowLike>(S: T, price: number, tick?: HubTick): T {
    const prev = Number(S.prevDay?.c) || 0;
    const day = S.day || {};
    const min = S.min || {};
    const hi = (b: Record<string, any>) => Math.max(Number(b.h) || 0, price);
    const lo = (b: Record<string, any>) => (Number(b.l) > 0 ? Math.min(Number(b.l), price) : price);
    const change = prev > 0 ? price - prev : Number(S.todaysChange) || 0;
    const changePerc = prev > 0 ? (change / prev) * 100 : Number(S.todaysChangePerc) || 0;
    return {
        ...S,
        day: { ...day, c: price, h: hi(day), l: lo(day) },
        min: { ...min, c: price, h: hi(min), l: lo(min) },
        lastTrade: { ...(S.lastTrade || {}), p: price, basis: 'fair_value', source: 'equities_edge' },
        // PRE CLOSE 판정에는 원래 가격·시각 쌍을 준다. 허브의 정규장 가격을 CSV의 PRE 시각과 합치면 안 된다.
        _preCloseSnapshot: S._preCloseSnapshot ?? S.lastTrade,
        priceBasis: 'fair_value',
        priceSource: 'equities_edge',
        priceTime: tick?.trade ?? 0,
        receivedAt: tick?.rx ?? null,
        todaysChange: Math.round(change * 10000) / 10000,
        todaysChangePerc: Math.round(changePerc * 10000) / 10000,
        _hubLive: true,
    };
}

/** 허브 /last 응답을 벌크 결과 행에 적용(순수). 적용한 종목 수와 거른 사유별 수를 같이 돌려준다. */
export function applyHubLast<R extends { ticker: string; snapshot: any }>(
    results: R[],
    hub: HubLast,
    openMs: number,
): { results: R[]; applied: number; rejected: number; missing: number } {
    let applied = 0, rejected = 0, missing = 0;
    const out = results.map((r) => {
        const S = r.snapshot as BulkRowLike | null | undefined;
        if (!S || !S._eodDate) return r;                       // 벌크 경로 행만(개별 실시간 행·빈 행은 그대로)
        const tick = hub.ticks?.[r.ticker];
        if (!tick) { missing++; return r; }
        const px = acceptHubTick(tick, { hubNowMs: hub.now, openMs, refPrice: Number(S.lastTrade?.p) || Number(S.day?.c) || 0, prevClose: Number(S.prevDay?.c) || 0 });
        if (px == null) { rejected++; return r; }
        applied++;
        return { ...r, snapshot: overlayBulkRow(S, px, tick) };
    });
    return { results: out, applied, rejected, missing };
}

// ── 허브 호출 ───────────────────────────────────────────────────────────────
type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;

let _breakerUntil = 0;
/** 시험용 */
export function __resetHubBreaker(): void { _breakerUntil = 0; }

/** 허브 /last 를 읽는다. 실패·시간 초과·형식 오류는 null(그리고 HUB_BREAKER_MS 동안 부르지 않는다). 던지지 않는다. */
export async function fetchHubLast(
    symbols: string[],
    opts: { baseUrl?: string; timeoutMs?: number; waitMs?: number; fetchImpl?: FetchLike; nowMs?: number } = {},
): Promise<HubLast | null> {
    const nowMs = opts.nowMs ?? Date.now();
    if (nowMs < _breakerUntil) return null;
    const base = (opts.baseUrl || process.env.PRICE_HUB_HTTP || 'https://ws.signumhq.com').replace(/\/$/, '');
    const url = `${base}/last?symbols=${encodeURIComponent(symbols.join(','))}&wait=${opts.waitMs ?? HUB_WAIT_MS}`;
    const f: FetchLike = opts.fetchImpl || ((u, init) => fetch(u, init) as any);
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), opts.timeoutMs ?? HUB_TIMEOUT_MS) : null;
    try {
        const res = await f(url, { cache: 'no-store', signal: ctl?.signal });
        if (!res.ok) throw new Error(`hub ${res.status}`);
        const j = await res.json();
        if (!j || typeof j !== 'object' || typeof j.now !== 'number' || !j.ticks || typeof j.ticks !== 'object') throw new Error('hub shape');
        return j as HubLast;
    } catch {
        _breakerUntil = nowMs + HUB_BREAKER_MS;
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * 라우트가 부르는 한 줄 — 정규장 + 31~100개 요청의 벌크 행을 허브 실시간 체결로 덮는다. 던지지 않는다 · 실패하면 입력 그대로.
 * (허브를 못 쓰는 모든 경우 = 예전 값이다 — 이 함수는 값을 나쁘게 만들 수 없다.)
 */
export async function overlayBulkWithHub<R extends { ticker: string; snapshot: any }>(
    results: R[],
    etDate: string,
    opts: Parameters<typeof fetchHubLast>[1] = {},
): Promise<{ results: R[]; applied: number; rejected: number; missing: number; used: boolean }> {
    const none = { results, applied: 0, rejected: 0, missing: 0, used: false };
    try {
        const bulk = results.filter((r) => r.snapshot && r.snapshot._eodDate);
        if (!bulk.length) return none;
        const openMs = regularOpenMs(etDate);
        if (openMs == null) return none;
        const hub = await fetchHubLast(bulk.map((r) => r.ticker), opts);
        if (!hub) return none;
        return { ...applyHubLast(results, hub, openMs), used: true };
    } catch {
        return none;
    }
}
