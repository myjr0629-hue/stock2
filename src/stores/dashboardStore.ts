import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { computeOnePipe, type MarketSession } from '@/hooks/useOnePipe';
import {
    getDashboardTickers as fetchDbTickers,
    toggleDashboardTicker as toggleDbTicker,
} from '@/lib/storage/dashboardTickerStore';
import { copyImpliedMoveGroup } from '@/lib/impliedMove';
import { normalizeVwap } from '@/lib/vwap';
import { etLastClosedSessionDate } from '@/lib/marketCalendar';

// ============================================================================
// Types — 100% 기존 인터페이스 유지 (LiveTickerDashboard, DashboardClient 호환)
// ============================================================================

interface TickerData {
    underlyingPrice: number | null;
    changePercent: number | null;
    prevClose: number | null;
    regularCloseToday: number | null;
    intradayChangePct: number | null;
    display: { price?: number; changePctPct?: number } | null;
    prevChangePct: number | null;
    prevRegularClose: number | null;
    extended: {
        postPrice?: number;
        postChangePct?: number;
        prePrice?: number;
        preChangePct?: number;
        preClose?: number;
    } | null;
    session: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    netGex: number | null;
    maxPain: number | null;
    pcr: number | null;
    isGammaSqueeze: boolean;
    gammaFlipLevel: number | null;
    atmIv: number | null;
    atmIvExpiry: string | null;
    squeezeScore: number | null;
    squeezeRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
    vwap: number | null;
    darkPoolPct: number | null;
    shortVolPct: number | null;
    zeroDtePct: number | null;
    impliedMovePct: number | null;
    impliedMoveDir: 'bullish' | 'bearish' | 'neutral' | null;
    /** [2026-09-29] 예상 변동 라벨(만기·기준·시각·정의 표식) — src/lib/impliedMove.ts */
    impliedMoveExpiry?: string | null;
    impliedMoveBasis?: 'live' | 'eod' | null;
    impliedMoveSession?: string | null;
    impliedMoveAsOf?: number | null;
    impliedMoveDef?: string | null;
    gammaConcentration: number | null;
    volumePcr: number | null;
    volumePcrCallVol: number | null;
    volumePcrPutVol: number | null;
    levels: {
        callWall: number | null;
        putFloor: number | null;
        pinZone: number | null;
    } | null;
    expiration: string | null;
    options_status: string | null;
    structure?: {
        strikes: number[];
        callsOI: number[];
        putsOI: number[];
    } | null;
    error?: string;
    alpha?: {
        score: number;
        grade: string;
        action: string;
        actionKR?: string;
        whyKR?: string;
        pillars: Record<string, number>;
        gatesApplied?: string[];
        dataCompleteness?: number;
        engineVersion?: string;
    };
    whaleIndex?: number | null;
    whaleConfidence?: string | null;
    rsi14?: number | null;
    return3D?: number | null;
    relVol?: number | null;
    ivRank?: number | null;
    _rsi14?: number | null;
    _return3D?: number | null;
    _relVol?: number | null;
}

interface MarketData {
    nq: { price: number | null; change: number };
    vix: number | null;
    phase: string;
    marketStatus: 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED';
    isHoliday?: boolean;
    holidayName?: string;
}

interface Signal {
    time: string;
    ticker: string;
    type: 'SQUEEZE' | 'WHALE' | 'HOT' | 'ALERT' | 'BULLISH' | 'BEARISH';
    message: string;
    messageKey?: string;
    params?: Record<string, any>;
}

interface DashboardState {
    selectedTicker: string;
    tickers: Record<string, TickerData>;
    market: MarketData | null;
    signals: Signal[];
    isLoading: boolean;
    lastUpdated: Date | null;
    dashboardTickers: string[];

    setSelectedTicker: (ticker: string) => void;
    setTickers: (tickers: Record<string, TickerData>) => void;
    setMarket: (market: MarketData) => void;
    setSignals: (signals: Signal[]) => void;
    setLoading: (loading: boolean) => void;
    toggleDashboardTicker: (ticker: string, maxSlots?: number) => void;
    isDashboardTicker: (ticker: string) => boolean;
    loadDashboardTickers: () => Promise<void>;
    fetchDashboardData: (tickerList?: string[]) => Promise<void>;
    fetchPriceOnly: (tickerList?: string[]) => Promise<void>;
    fetchSingleTicker: (ticker: string) => Promise<void>;
    initializeStore: (dashboardTickers: string[], quotes: any) => void;
    updateRealtimePrice: (ticker: string, price: number, changePct?: number) => void;
}

// ============================================================================
// Helpers
// ============================================================================

const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'SPY'];

/** Map API session strings to store session format */
const toSession = (raw: string | undefined): 'PRE' | 'REG' | 'POST' | 'CLOSED' => {
    if (!raw) return 'CLOSED';
    const s = raw.toLowerCase();
    if (s === 'pre') return 'PRE';
    if (s === 'regular' || s === 'reg') return 'REG';
    if (s === 'post') return 'POST';
    return 'CLOSED';
};

/** Create an empty TickerData with sensible defaults */
const emptyTicker = (): TickerData => ({
    underlyingPrice: null, changePercent: null, prevClose: null,
    regularCloseToday: null, intradayChangePct: null,
    display: null, prevChangePct: null, prevRegularClose: null,
    extended: null, session: 'CLOSED',
    netGex: null, maxPain: null, pcr: null, isGammaSqueeze: false,
    gammaFlipLevel: null, atmIv: null, atmIvExpiry: null,
    squeezeScore: null, squeezeRisk: null,
    vwap: null, darkPoolPct: null, shortVolPct: null,
    zeroDtePct: null, impliedMovePct: null, impliedMoveDir: null,
    gammaConcentration: null, volumePcr: null, volumePcrCallVol: null,
    volumePcrPutVol: null, levels: null, expiration: null, options_status: null,
});

// ============================================================================
// Indicator-only fields — these are the ONLY fields fetchDashboardData writes.
// fetchPriceOnly and updateRealtimePrice NEVER write these.
// This separation makes collisions structurally impossible.
// ============================================================================
const INDICATOR_FIELDS = [
    'netGex', 'maxPain', 'pcr', 'isGammaSqueeze', 'gammaFlipLevel',
    'atmIv', 'atmIvExpiry', 'squeezeScore', 'squeezeRisk',
    'vwap', 'darkPoolPct', 'shortVolPct', 'zeroDtePct',
    'impliedMovePct', 'impliedMoveDir', 'gammaConcentration',
    'volumePcr', 'volumePcrCallVol', 'volumePcrPutVol',
    'levels', 'expiration', 'options_status', 'structure',
    'alpha', 'whaleIndex', 'whaleConfidence',
    'rsi14', 'return3D', 'relVol', 'ivRank',
    '_rsi14', '_return3D', '_relVol',
    'prevChangePct', 'intradayChangePct', // [FIX] Prevents changePercent falling back to 0 during PRE/POST
] as const;

/**
 * ★ [2026-09-29] 옵션 레벨 묶음 — API 가 «구조 한 벌»로 답했으면(levelsSource 키) null 도 그대로 덮는다.
 *   위 INDICATOR_FIELDS 병합은 null 을 건너뛰어, API 가 «없음»(구조 없음·정의 위반)이라고 답해도 옛 값이 남았다 —
 *   그리고 그 옛 값은 localStorage 에 저장돼 다음 방문에도 나왔다(수리 전 수집 Lambda 값: 9/28 MU 감마플립 530 류).
 */
const LEVEL_GROUP_FIELDS = ['maxPain', 'gammaFlipLevel', 'levels', 'expiration', 'chainDate', 'levelsSource', 'levelsDropped'] as const;
function copyLevelGroup(target: any, incoming: any): void {
    if (!incoming || typeof incoming !== 'object' || !('levelsSource' in incoming)) return;
    for (const f of LEVEL_GROUP_FIELDS) target[f] = incoming[f] ?? null;
}

/**
 * PRE 의 «본장» = 마지막으로 끝난 정규장 종가와 그날 등락률(한 쌍).
 * unified 의 구조 가격(underlyingPrice)은 종가가 아니고, 보관(localStorage) 값은 저장 세션에 따라 뜻이 달라
 * (POST 에 저장한 prevRegularClose 는 그 전날 종가) 둘 다 기준가로 쓰지 않는다.
 * 일봉이 «달력상 직전 정규장(금요일·조기 폐장 포함)» 날짜로 확인될 때만 그 종가·등락률 쌍을 쓴다.
 * 확인이 안 되면 아무것도 채우지 않고 quotes(2초 폴링 — 가격·등락률을 같은 쌍으로 준다)를 기다린다.
 */
const positiveNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
const finiteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
function unifiedPreCloseVerified(incoming: any, nowMs: number): boolean {
    const d = incoming?.regularCloseDate;
    return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d === etLastClosedSessionDate(nowMs);
}

/** PRE: 확인 안 된 일봉의 등락률이 quotes 가 맞춘 쌍을 덮지 않게 한다(INDICATOR 복사 뒤 호출). */
function guardPreChangePair(updated: TickerData, existing: TickerData, incoming: any, nowMs: number): void {
    const incomingSession = incoming?.session ? toSession(incoming.session) : null;
    // 화면이 PRE 이거나(quotes 가 정한 세션) 응답이 PRE 면 보호한다 — 캐시된 CLOSED 응답도 우회하지 못한다.
    if (existing.session !== 'PRE' && incomingSession !== 'PRE') return;
    if (unifiedPreCloseVerified(incoming, nowMs)) return;
    // 날짜 없는(옛 캐시)·다른 날 일봉의 등락률은 PRE 기준 쌍이 아니다 — quotes 가 채운다.
    updated.prevChangePct = existing.prevChangePct;
    updated.intradayChangePct = existing.intradayChangePct;
}

function seedUnifiedPrice(updated: TickerData, existing: TickerData, incoming: any, nowMs: number = Date.now()): void {
    if (existing.underlyingPrice != null && existing.underlyingPrice > 0) return;
    const session = incoming.session ? toSession(incoming.session) : existing.session;
    if (session === 'PRE') {
        if (!positiveNum(incoming.regularCloseToday) || !unifiedPreCloseVerified(incoming, nowMs)) return;
        const close = incoming.regularCloseToday;
        const pct = finiteNum(incoming.prevChangePct) ? incoming.prevChangePct : null;
        updated.underlyingPrice = close;
        updated.prevRegularClose = close;
        updated.prevClose = positiveNum(incoming.prevClose) ? incoming.prevClose : existing.prevClose;
        updated.prevChangePct = pct;
        updated.intradayChangePct = pct;
        updated.changePercent = pct;
        updated.display = { price: close, changePctPct: pct ?? 0 };
        updated.session = session;
        return;
    }
    if (incoming.underlyingPrice != null && incoming.underlyingPrice > 0) {
        updated.underlyingPrice = incoming.underlyingPrice;
        updated.changePercent = incoming.changePercent ?? null;
        updated.prevClose = incoming.prevClose ?? existing.prevClose;
        updated.display = { price: incoming.underlyingPrice, changePctPct: incoming.changePercent ?? 0 };
        updated.session = session;
    }
}

// ============================================================================
// Abort controller for fetchDashboardData race condition prevention
// ============================================================================
let _dashboardAbort: AbortController | null = null;

// ============================================================================
// Store
// ============================================================================

export const useDashboardStore = create<DashboardState>()(
    persist(
        (set, get) => ({
            selectedTicker: 'NVDA',
            tickers: {},
            market: null,
            signals: [],
            isLoading: false,
            lastUpdated: null,
            dashboardTickers: [],

            // ────────────────────────────────────────────
            // Basic setters
            // ────────────────────────────────────────────
            setSelectedTicker: (ticker) => {
                set({ selectedTicker: ticker });
                if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('t', ticker);
                    window.history.replaceState({}, '', url.toString());
                }
                // If this ticker has no data yet, fetch immediately
                const existing = get().tickers[ticker];
                if (!existing || existing.underlyingPrice == null) {
                    get().fetchSingleTicker(ticker);
                }
            },

            setTickers: (tickers) => set({ tickers }),
            setMarket: (market) => set({ market }),
            setSignals: (signals) => set({ signals }),
            setLoading: (loading) => set({ isLoading: loading }),

            // ────────────────────────────────────────────
            // Dashboard ticker management (외부 페이지 사용 — 인터페이스 유지)
            // ────────────────────────────────────────────
            toggleDashboardTicker: (ticker, maxSlots = 20) => {
                const current = get().dashboardTickers;
                const upper = ticker.toUpperCase();
                const isIn = current.includes(upper);
                const optimistic = isIn
                    ? current.filter(t => t !== upper)
                    : [...current, upper].slice(0, maxSlots);
                set({ dashboardTickers: optimistic });
                toggleDbTicker(ticker).then(serverList => {
                    set({ dashboardTickers: serverList });
                }).catch(err => {
                    console.error('[BOARD] Supabase toggle failed, reverting:', err);
                    set({ dashboardTickers: current });
                });
            },

            isDashboardTicker: (ticker) => get().dashboardTickers.includes(ticker.toUpperCase()),

            loadDashboardTickers: async () => {
                try {
                    const tickers = await fetchDbTickers();
                    if (tickers.length > 0) {
                        set({ dashboardTickers: tickers });
                    }
                } catch (err) {
                    console.error('[BOARD] Failed to load dashboard tickers:', err);
                }
            },

            // ────────────────────────────────────────────
            // initializeStore — SSR quotes → 가격만 빠르게 set
            // ────────────────────────────────────────────
            initializeStore: (dashboardTickers, quotes) => {
                const currentTickers = { ...get().tickers };

                if (quotes && typeof quotes === 'object') {
                    for (const [ticker, q] of Object.entries(quotes) as [string, any][]) {
                        if (!q) continue;
                        const existing = currentTickers[ticker] || emptyTicker();
                        const session = toSession(q.session || q.marketState);
                        const price = q.price > 0 ? q.price : (existing.underlyingPrice ?? 0);
                        const prevCl = q.previousClose || q.prevClose || existing.prevClose || 0;
                        const changePct = q.changePercent || q.changesPercentage || 0;

                        // Build extended data from SSR quotes
                        let ext = existing.extended || null;
                        if (q.extendedMissing === true) {
                            // 명시적 결측이면 이전 초기화의 시간외 값을 남기지 않는다.
                            ext = null;
                        } else if (q.extendedPrice && q.extendedPrice > 0) {
                            // PRE의 price는 직전 정규 종가(D-1), previousClose는 D-2다.
                            // API 실측 등락률(0 포함)을 우선하고 레거시 응답만 올바른 기준으로 계산한다.
                            const preBase = session === 'PRE' ? price : prevCl;
                            const measuredPct = typeof q.extendedChangePercent === 'number' && Number.isFinite(q.extendedChangePercent)
                                ? q.extendedChangePercent : null;
                            ext = {
                                ...ext,
                                postPrice: q.extendedLabel === 'POST' ? q.extendedPrice : ext?.postPrice,
                                postChangePct: q.extendedLabel === 'POST'
                                    ? measuredPct ?? (price > 0 ? ((q.extendedPrice - price) / price) * 100 : undefined) : ext?.postChangePct,
                                prePrice: q.extendedLabel === 'PRE' ? q.extendedPrice : ext?.prePrice,
                                preChangePct: q.extendedLabel === 'PRE'
                                    ? measuredPct ?? (preBase > 0 ? ((q.extendedPrice - preBase) / preBase) * 100 : undefined) : ext?.preChangePct,
                            };
                        }

                        currentTickers[ticker] = {
                            ...existing,
                            underlyingPrice: price,
                            changePercent: changePct,
                            prevClose: prevCl,
                            // 표시 계산의 PRE 기준은 D-1, 정규장 등락 계산용 prevClose(D-2)는 별도 보존.
                            prevRegularClose: session === 'PRE' ? price : prevCl,
                            display: { price, changePctPct: changePct },
                            extended: ext,
                            session,
                        };
                    }
                }

                set({ dashboardTickers, tickers: currentTickers });
            },

            // ════════════════════════════════════════════════════════════════
            // fetchDashboardData — 30초 주기. INDICATOR 필드만 write.
            // 가격 필드(underlyingPrice, changePercent, display, extended, session)는
            // 절대로 건드리지 않음.
            // ════════════════════════════════════════════════════════════════
            fetchDashboardData: async (tickerList = DEFAULT_TICKERS) => {
                // Abort previous in-flight request
                if (_dashboardAbort) _dashboardAbort.abort();
                _dashboardAbort = new AbortController();
                const signal = _dashboardAbort.signal;

                // Only show loading skeleton on initial load
                const hasExistingData = Object.keys(get().tickers).length > 0;
                if (!hasExistingData) set({ isLoading: true });

                try {
                    const tickersParam = tickerList.slice(0, 20).join(',');
                    const res = await fetch(`/api/dashboard/unified?tickers=${tickersParam}`, { signal });
                    if (signal.aborted) return;
                    if (!res.ok) throw new Error(`unified API ${res.status}`);

                    const data = await res.json();

                    // ── Signal accumulation (기존 로직 유지) ──
                    const existingSignals = get().signals;
                    const newSignals: Signal[] = data.signals || [];
                    const now = Date.now();
                    const HOURS_24 = 24 * 60 * 60 * 1000;
                    const signalKey = (s: Signal) => `${s.ticker}|${s.type}|${s.message}`;
                    const existingKeys = new Set(existingSignals.map(signalKey));
                    const uniqueNew = newSignals.filter(s => !existingKeys.has(signalKey(s)));
                    const merged = [...uniqueNew, ...existingSignals];
                    const validSignals = merged.filter(s => (now - new Date(s.time).getTime()) < HOURS_24);
                    const finalSignals = validSignals.slice(0, 20);

                    // ── Indicator merge — 가격 필드 절대 안 건드림 ──
                    const existingTickers = get().tickers;
                    const newTickers = data.tickers || {};
                    const result = { ...existingTickers };

                    for (const [key, rawValue] of Object.entries(newTickers)) {
                        if (!rawValue || typeof rawValue !== 'object' || (rawValue as any).error) continue;
                        const incoming = rawValue as any;
                        const existing = result[key] || emptyTicker();

                        // Copy ONLY indicator fields from incoming data
                        const updated = { ...existing };
                        // 예상 변동 묶음은 null 도 덮는다(아래 병합은 null 을 건너뛰어 옛 정의 값이 남았다) — 먼저 두면 아래 루프와 결과가 같다
                        copyImpliedMoveGroup(updated, incoming);
                        for (const field of INDICATOR_FIELDS) {
                            if (incoming[field] !== undefined && incoming[field] !== null) {
                                (updated as any)[field] = incoming[field];
                            }
                        }
                        // Explicit null invalidates a prior VWAP; undefined is an omitted field.
                        if (incoming.vwap !== undefined) updated.vwap = normalizeVwap(incoming.vwap);
                        copyLevelGroup(updated, incoming);

                        // SPECIAL CASE: First load — store에 가격이 없으면 unified에서 가져옴
                        guardPreChangePair(updated, existing, incoming, Date.now());
                    seedUnifiedPrice(updated, existing, incoming);

                        result[key] = updated;
                    }

                    set({
                        tickers: result,
                        market: data.market || get().market,
                        signals: finalSignals,
                        lastUpdated: new Date(),
                        isLoading: false,
                    });
                } catch (error: any) {
                    if (error?.name === 'AbortError') return;
                    console.error('[BOARD] fetchDashboardData error:', error);
                    // Emergency fallback: fetch prices if no data at all
                    if (Object.keys(get().tickers).length === 0) {
                        get().fetchPriceOnly(tickerList);
                    }
                    set({ isLoading: false });
                }
            },

            // ════════════════════════════════════════════════════════════════
            // fetchPriceOnly — 2초 주기. 가격 필드만 write.
            // 인디케이터 필드는 절대로 건드리지 않음.
            // ════════════════════════════════════════════════════════════════
            fetchPriceOnly: async (tickerList = DEFAULT_TICKERS) => {
                try {
                    const symbols = tickerList.slice(0, 20).join(',');
                    const res = await fetch(`/api/live/quotes?symbols=${symbols}`);
                    if (!res.ok) {
                        console.warn('[BOARD] fetchPriceOnly failed:', res.status);
                        return;
                    }
                    const json = await res.json();
                    const quotes = json.data;
                    if (!quotes || typeof quotes !== 'object') return;

                    const currentTickers = { ...get().tickers };

                    for (const [ticker, q] of Object.entries(quotes) as [string, any][]) {
                        if (!q) continue;

                        const existing = currentTickers[ticker] || emptyTicker();
                        const session = toSession(q.session) as MarketSession;
                        // Unified may seed a daily-bar baseline one session behind before
                        // the first quote arrives. Each quote carries its own session baseline.
                        const prevCl = q.previousClose || q.prevClose || existing.prevClose || 0;

                        // ── [ONE-PIPE] regularCloseToday: 최초 설정 후 유지 (Polygon 변동 차단) ──
                        // SSR initializeStore에서 설정됨. 이후 fetchPriceOnly에서는 없을 때만 설정.
                        // ★ [2026-09-25] «정규장 종가»는 POST·CLOSED 의 quotes.price 에만 있다. 예전엔 세션과
                        //   무관하게 처음 값을 잡아, 정규장에 연 대시보드를 애프터까지 두면 «정규장 중 가격»이
                        //   POST 의 메인 가격·기준선으로 남았다. PRE·REG 에선 비우고, 마감 세션에서 새로 잡는다.
                        const isCloseSession = session === 'POST' || session === 'CLOSED';
                        const lockedInClose = existing.session === 'POST' || existing.session === 'CLOSED';
                        const regCloseToday = !isCloseSession
                            ? null
                            : (lockedInClose && existing.regularCloseToday && existing.regularCloseToday > 0
                                ? existing.regularCloseToday
                                : (q.price > 0 ? q.price : null));

                        // ── [ONE-PIPE] computeOnePipe — 단일 가격 계산 경로 ──
                        const pipe = computeOnePipe({
                            session,
                            pollPrice: q.price,
                            pollPrevClose: prevCl,
                            pollExtPrice: q.extendedMissing === true ? 0 : (q.extendedPrice || 0),
                            pollExtLabel: q.extendedLabel || '',
                            pollChangePct: q.changePercent ?? null,
                            wsPrice: null,
                            regularCloseToday: regCloseToday,
                        });

                        // ── PRE 세션: 본장 등락률 ──
                        //   quotes 의 changePercent 는 같은 응답의 price(직전 정규장 종가)와 한 쌍이다(day.c vs prevDay.c).
                        //   값이 있으면 그것이 정답 — 보관·unified 값(다른 날 일봉일 수 있다)이 덮지 못한다.
                        //   null(day.c 결측)일 때만 기존 값을 유지한다.
                        const quotePrePct = session === 'PRE' && finiteNum(q.changePercent) ? q.changePercent : null;
                        const changePct = session === 'PRE'
                            ? (quotePrePct ?? existing.prevChangePct ?? existing.intradayChangePct ?? pipe.changePct)
                            : pipe.changePct;

                        // ── Write ONLY price fields — never touch indicator fields ──
                        currentTickers[ticker] = {
                            ...existing,              // Preserve all existing indicator data
                            underlyingPrice: pipe.price,
                            changePercent: changePct,
                            prevClose: pipe.prevClose || existing.prevClose,
                            prevRegularClose: session === 'PRE' ? pipe.price : (pipe.prevClose || existing.prevRegularClose),
                            regularCloseToday: regCloseToday,
                            display: { price: pipe.price, changePctPct: changePct ?? 0 },
                            // ★ [2026-09-25] 시간외 칸은 이번 폴링(quotes)이 «정답»이다 — 세션·날짜로 이미 골라서 온다.
                            //   예전엔 `?? existing` 으로 옛 값을 남겨, 어제 POST 가 오늘 프리마켓·정규장까지 살아
                            //   차트가 `postPrice || prePrice` 로 어제 애프터를 그렸다.
                            //   PRE: 오늘 프리 체결 · REG: 오늘 PRE CLOSE · POST·CLOSED: 그날 애프터(PRE CLOSE 는 유지)
                            extended: {
                                ...existing.extended,
                                postPrice: isCloseSession ? (pipe.extPrice ?? undefined) : undefined,
                                postChangePct: isCloseSession ? (pipe.extChangePct ?? undefined) : undefined,
                                prePrice: session === 'PRE' ? (pipe.extPrice ?? undefined)
                                    : session === 'REG' ? (pipe.extLabel === 'PRE CLOSE' ? (pipe.extPrice ?? undefined) : undefined)
                                    : existing.extended?.prePrice,
                                preChangePct: session === 'PRE' ? (pipe.extChangePct ?? undefined)
                                    : session === 'REG' ? (pipe.extLabel === 'PRE CLOSE' ? (pipe.extChangePct ?? undefined) : undefined)
                                    : existing.extended?.preChangePct,
                            },
                            session,
                        };
                    }

                    set({ tickers: currentTickers });
                } catch (e) {
                    console.error('[BOARD] fetchPriceOnly error:', e);
                }
            },

            // ────────────────────────────────────────────
            // fetchSingleTicker — 클릭 시 즉시 1종목 fetch
            // ────────────────────────────────────────────
            fetchSingleTicker: async (ticker: string) => {
                try {
                    const res = await fetch(`/api/dashboard/unified?tickers=${ticker}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    const incoming = data.tickers?.[ticker];
                    if (!incoming) return;

                    const existing = get().tickers[ticker] || emptyTicker();
                    const updated = { ...existing };
                    copyImpliedMoveGroup(updated, incoming);

                    // Copy indicator fields
                    for (const field of INDICATOR_FIELDS) {
                        if ((incoming as any)[field] !== undefined && (incoming as any)[field] !== null) {
                            (updated as any)[field] = (incoming as any)[field];
                        }
                    }
                    if (incoming.vwap !== undefined) updated.vwap = normalizeVwap(incoming.vwap);
                    copyLevelGroup(updated, incoming);

                    // Also copy price if we don't have one yet
                    guardPreChangePair(updated, existing, incoming, Date.now());
                    seedUnifiedPrice(updated, existing, incoming);

                    set({
                        tickers: { ...get().tickers, [ticker]: updated },
                        market: data.market || get().market,
                    });
                } catch (e) {
                    console.error(`[BOARD] fetchSingleTicker(${ticker}) error:`, e);
                }
            },

            // ────────────────────────────────────────────
            // updateRealtimePrice — WebSocket에서 받은 즉시 가격 업데이트
            // [ONE-PIPE] calcUnifiedPrice 경유 — fetchPriceOnly와 100% 동일 경로
            // 자체 수학 제거 → 원파이프 단일 계산 함수만 사용
            // ────────────────────────────────────────────
            updateRealtimePrice: (ticker: string, price: number, _changePct?: number) => {
                const existing = get().tickers[ticker];
                if (!existing) return;

                const session = existing.session;

                // Skip unchanged (세션별 해당 필드 비교)
                if (session === 'REG' && existing.underlyingPrice === price) return;
                if (session === 'PRE' && existing.extended?.prePrice === price) return;
                if ((session === 'POST' || session === 'CLOSED') && existing.extended?.postPrice === price) return;

                // ── [ONE-PIPE] computeOnePipe 경유 — fetchPriceOnly와 동일 경로 ──
                const pipe = computeOnePipe({
                    session: session as MarketSession,
                    // PRE에서는 이전 세션에 잠근 regularCloseToday로 직전 종가를 덮지 않는다.
                    pollPrice: (session === 'PRE' ? existing.underlyingPrice
                        : existing.regularCloseToday || existing.underlyingPrice) || 0,
                    pollPrevClose: existing.prevClose || existing.prevRegularClose || 0,
                    // ★ [2026-09-25] 폴링(서버)이 확인한 시간외 값이 있을 때만 WS 를 시간외 가격으로 쓴다
                    //   (computeOnePipe 의 게이트 — WS 엔 체결 시각이 없어 종가 인쇄·어제 애프터를 못 가른다)
                    pollExtPrice: session === 'PRE' ? (existing.extended?.prePrice || 0)
                        : (session === 'POST' || session === 'CLOSED') ? (existing.extended?.postPrice || 0) : 0,
                    pollExtLabel: session === 'PRE' ? 'PRE' : (session === 'POST' || session === 'CLOSED') ? 'POST' : '',
                    pollChangePct: null,
                    wsPrice: price,
                    regularCloseToday: existing.regularCloseToday,
                });

                // PRE 세션: 본장 등락률은 기존 값 유지
                const calcChangePct = session === 'PRE'
                    ? (existing.prevChangePct ?? existing.intradayChangePct ?? existing.changePercent ?? pipe.changePct)
                    : pipe.changePct;

                set({
                    tickers: {
                        ...get().tickers,
                        [ticker]: {
                            ...existing,
                            underlyingPrice: pipe.price,
                            changePercent: calcChangePct,
                            display: { price: pipe.price, changePctPct: calcChangePct ?? 0 },
                            extended: {
                                ...existing.extended,
                                postPrice: pipe.session === 'POST' || pipe.session === 'CLOSED' ? pipe.extPrice ?? existing.extended?.postPrice : existing.extended?.postPrice,
                                postChangePct: pipe.session === 'POST' || pipe.session === 'CLOSED' ? pipe.extChangePct ?? existing.extended?.postChangePct : existing.extended?.postChangePct,
                                prePrice: pipe.session === 'PRE' || pipe.extLabel === 'PRE CLOSE' ? pipe.extPrice ?? existing.extended?.prePrice : existing.extended?.prePrice,
                                preChangePct: pipe.session === 'PRE' || pipe.extLabel === 'PRE CLOSE' ? pipe.extChangePct ?? existing.extended?.preChangePct : existing.extended?.preChangePct,
                            },
                        }
                    }
                });
            },
        }),
        {
            name: 'dashboard-storage-v3',
            // Persist: strip volatile price fields to prevent stale data on hydration
            partialize: (state) => {
                const strippedTickers: Record<string, any> = {};
                for (const [ticker, data] of Object.entries(state.tickers)) {
                    if (!data) continue;
                    const { underlyingPrice, changePercent, display, intradayChangePct,
                        regularCloseToday, prevChangePct, extended, session, prevClose, prevRegularClose, ...structural } = data;
                    strippedTickers[ticker] = {
                        ...structural,
                        // Session VWAP has no durable provenance/freshness in localStorage.
                        vwap: null,
                        underlyingPrice: null,
                        changePercent: null,
                        display: null,
                        intradayChangePct: null,
                        regularCloseToday: null,
                        prevChangePct: null,
                        // 기준 종가는 저장한 세션에 따라 뜻이 다르다(PRE = 직전 정규장 · POST = 그 전날) —
                        // 다음 방문의 세션에선 틀린 기준이 되므로 남기지 않는다(가격 응답이 다시 채운다).
                        prevClose: null,
                        prevRegularClose: null,
                        extended: null,
                        session: 'CLOSED' as const,
                    };
                }
                return {
                    dashboardTickers: state.dashboardTickers,
                    selectedTicker: state.selectedTicker,
                    tickers: strippedTickers,
                };
            },
            // Custom merge: strip market from hydrated state
            // ★ [2026-09-29] 저장된 옵션 레벨은 «구조 한 벌» 표식(levelsSource='structure')이 있을 때만 되살린다 —
            //   표식 없는 옛 값(수리 전 수집 Lambda 값일 수 있다)은 첫 응답이 올 때까지 «—» 로 둔다.
            merge: (persisted, current) => {
                const p: any = persisted && typeof persisted === 'object' ? { ...(persisted as any) } : {};
                if (p.tickers && typeof p.tickers === 'object') {
                    const cleaned: Record<string, any> = {};
                    for (const [t, row] of Object.entries(p.tickers as Record<string, any>)) {
                        const levels = row && typeof row === 'object' && row.levelsSource !== 'structure'
                            ? { ...row, maxPain: null, gammaFlipLevel: null, levels: null, levelsSource: null, levelsDropped: null }
                            : row;
                        cleaned[t] = levels && typeof levels === 'object' ? { ...levels, vwap: null, prevClose: null, prevRegularClose: null } : levels;
                    }
                    p.tickers = cleaned;
                }
                return { ...(current as object), ...p, market: null } as DashboardState;
            },
        }
    )
);

// Hook to sync URL params with store
export function useUrlSync() {
    const setSelectedTicker = useDashboardStore((state) => state.setSelectedTicker);
    if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const ticker = params.get('t');
        if (ticker) {
            setSelectedTicker(ticker.toUpperCase());
        }
    }
}
