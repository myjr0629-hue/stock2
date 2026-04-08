import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    getDashboardTickers as fetchDbTickers,
    toggleDashboardTicker as toggleDbTicker,
} from '@/lib/storage/dashboardTickerStore';

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
                        if (q.extendedPrice && q.extendedPrice > 0) {
                            const dayClose = price || 0;
                            ext = {
                                ...ext,
                                postPrice: q.extendedLabel === 'POST' ? q.extendedPrice : ext?.postPrice,
                                postChangePct: q.extendedLabel === 'POST' && dayClose > 0
                                    ? ((q.extendedPrice - dayClose) / dayClose) * 100 : ext?.postChangePct,
                                prePrice: q.extendedLabel === 'PRE' ? q.extendedPrice : ext?.prePrice,
                                preChangePct: q.extendedLabel === 'PRE' && prevCl > 0
                                    ? ((q.extendedPrice - prevCl) / prevCl) * 100 : ext?.preChangePct,
                            };
                        }

                        currentTickers[ticker] = {
                            ...existing,
                            underlyingPrice: price,
                            changePercent: changePct,
                            prevClose: prevCl,
                            prevRegularClose: prevCl,
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
                        for (const field of INDICATOR_FIELDS) {
                            if (incoming[field] !== undefined && incoming[field] !== null) {
                                (updated as any)[field] = incoming[field];
                            }
                        }

                        // SPECIAL CASE: First load — store에 가격이 없으면 unified에서 가져옴
                        if (existing.underlyingPrice == null || existing.underlyingPrice <= 0) {
                            if (incoming.underlyingPrice != null && incoming.underlyingPrice > 0) {
                                updated.underlyingPrice = incoming.underlyingPrice;
                                updated.changePercent = incoming.changePercent ?? null;
                                updated.prevClose = incoming.prevClose ?? existing.prevClose;
                                updated.display = {
                                    price: incoming.underlyingPrice,
                                    changePctPct: incoming.changePercent ?? 0,
                                };
                                updated.session = incoming.session ? toSession(incoming.session) : existing.session;
                            }
                        }

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
                        const session = toSession(q.session);
                        const prevCl = existing.prevClose || q.previousClose || q.prevClose || 0;

                        // ── Extract price based on session ──
                        let price = existing.underlyingPrice;
                        let changePct = existing.changePercent;

                        if (session === 'REG' || session === 'PRE') {
                            // REG: q.price = live trade price
                            // PRE: q.price = previous regular close (Polygon behavior)
                            const livePrice = q.price > 0 ? q.price : (q.latestPrice > 0 ? q.latestPrice : null);
                            if (livePrice && livePrice > 0) {
                                if (session === 'REG') {
                                    price = livePrice;
                                    changePct = prevCl > 0 ? ((livePrice - prevCl) / prevCl) * 100 : (q.changePercent ?? 0);
                                } else {
                                    // PRE: underlyingPrice = previous regular close, NOT pre-market price
                                    price = existing.regularCloseToday || prevCl || livePrice;
                                    changePct = existing.prevChangePct ?? existing.intradayChangePct ?? 0;
                                }
                            }
                        } else {
                            // POST/CLOSED: q.price = regular session close
                            const regClose = q.price > 0 ? q.price : (q.latestPrice > 0 ? q.latestPrice : null);
                            if (regClose && regClose > 0) {
                                price = regClose;
                                changePct = prevCl > 0 ? ((regClose - prevCl) / prevCl) * 100 : (q.changePercent ?? 0);
                            }
                        }

                        // ── Extended price (PRE/POST badge) ──
                        let ext = existing.extended || null;
                        if (q.extendedPrice > 0) {
                            const dayClose = (session === 'REG') ? (price || 0) : (q.price > 0 ? q.price : (price || 0));
                            ext = {
                                ...ext,
                                postPrice: q.extendedLabel === 'POST' ? q.extendedPrice : ext?.postPrice,
                                postChangePct: q.extendedLabel === 'POST' ? (q.extendedChangePercent ?? ext?.postChangePct) : ext?.postChangePct,
                                prePrice: q.extendedLabel === 'PRE' ? q.extendedPrice : ext?.prePrice,
                                preChangePct: q.extendedLabel === 'PRE' ? (q.extendedChangePercent ??
                                    (prevCl > 0 ? ((q.extendedPrice - prevCl) / prevCl) * 100 : 0)
                                ) : ext?.preChangePct,
                            };
                        }

                        // ── Write ONLY price fields — never touch indicator fields ──
                        currentTickers[ticker] = {
                            ...existing,              // Preserve all existing indicator data
                            underlyingPrice: price,
                            changePercent: changePct,
                            prevClose: prevCl || existing.prevClose,
                            prevRegularClose: prevCl || existing.prevRegularClose,
                            regularCloseToday: (session === 'POST' || session === 'CLOSED')
                                ? (q.price > 0 ? q.price : existing.regularCloseToday)
                                : existing.regularCloseToday,
                            display: { price: price ?? 0, changePctPct: changePct ?? 0 },
                            extended: ext,
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

                    // Copy indicator fields
                    for (const field of INDICATOR_FIELDS) {
                        if ((incoming as any)[field] !== undefined && (incoming as any)[field] !== null) {
                            (updated as any)[field] = (incoming as any)[field];
                        }
                    }

                    // Also copy price if we don't have one yet
                    if ((existing.underlyingPrice == null || existing.underlyingPrice <= 0) &&
                        incoming.underlyingPrice != null && incoming.underlyingPrice > 0) {
                        updated.underlyingPrice = incoming.underlyingPrice;
                        updated.changePercent = incoming.changePercent ?? null;
                        updated.prevClose = incoming.prevClose ?? existing.prevClose;
                        updated.display = {
                            price: incoming.underlyingPrice,
                            changePctPct: incoming.changePercent ?? 0,
                        };
                        updated.session = incoming.session ? toSession(incoming.session) : existing.session;
                    }

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
            // ────────────────────────────────────────────
            updateRealtimePrice: (ticker: string, price: number, changePct?: number) => {
                const existing = get().tickers[ticker];
                if (!existing) return;

                const session = existing.session;

                if (session === 'REG') {
                    if (existing.underlyingPrice === price) return; // Skip unchanged
                    const refClose = existing.prevClose || existing.underlyingPrice || price;
                    const calculatedChangePct = changePct ?? (refClose > 0 ? ((price - refClose) / refClose) * 100 : 0);

                    set({
                        tickers: {
                            ...get().tickers,
                            [ticker]: {
                                ...existing,
                                underlyingPrice: price,
                                changePercent: calculatedChangePct,
                                display: {
                                    ...existing.display,
                                    price,
                                    changePctPct: calculatedChangePct,
                                },
                            }
                        }
                    });
                } else if (session === 'PRE') {
                    // During PRE, realtime writes to extended.prePrice
                    if (existing.extended?.prePrice === price) return;
                    const prevCl = existing.prevClose || existing.underlyingPrice || 1;
                    const calculatedChangePct = changePct ?? ((price - prevCl) / prevCl) * 100;
                    
                    set({
                        tickers: {
                            ...get().tickers,
                            [ticker]: {
                                ...existing,
                                extended: {
                                    ...existing.extended,
                                    prePrice: price,
                                    preChangePct: calculatedChangePct,
                                }
                            }
                        }
                    });
                } else if (session === 'POST' || session === 'CLOSED') {
                    // During POST/CLOSED, realtime writes to extended.postPrice
                    if (existing.extended?.postPrice === price) return;
                    // POST change is relative to today's regular close
                    const dayCl = existing.regularCloseToday || existing.underlyingPrice || existing.prevClose || 1;
                    const calculatedChangePct = changePct ?? ((price - dayCl) / dayCl) * 100;
                    
                    set({
                        tickers: {
                            ...get().tickers,
                            [ticker]: {
                                ...existing,
                                extended: {
                                    ...existing.extended,
                                    postPrice: price,
                                    postChangePct: calculatedChangePct,
                                }
                            }
                        }
                    });
                }
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
                        regularCloseToday, prevChangePct, extended, session, ...structural } = data;
                    strippedTickers[ticker] = {
                        ...structural,
                        underlyingPrice: null,
                        changePercent: null,
                        display: null,
                        intradayChangePct: null,
                        regularCloseToday: null,
                        prevChangePct: null,
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
            merge: (persisted, current) => ({
                ...(current as object),
                ...(persisted as object),
                market: null,
            } as DashboardState),
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
