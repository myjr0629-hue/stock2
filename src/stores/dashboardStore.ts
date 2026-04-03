import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    getDashboardTickers as fetchDbTickers,
    toggleDashboardTicker as toggleDbTicker,
} from '@/lib/storage/dashboardTickerStore';

interface TickerData {
    underlyingPrice: number | null;
    changePercent: number | null;
    prevClose: number | null;
    // [INTRADAY FIX] Today's regular session close for proper intraday display
    regularCloseToday: number | null;
    // [INTRADAY FIX] Intraday-only change (excludes post-market)
    intradayChangePct: number | null;
    // [FIX] Command-style price display data from /api/live/ticker
    display: { price?: number; changePctPct?: number } | null;
    prevChangePct: number | null;
    prevRegularClose: number | null;
    // [S-78] Extended session data for Command-style display
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
    atmIv: number | null;  // [S-78] ATM Implied Volatility for premium cards
    atmIvExpiry: string | null;  // [ATM IV] Actual expiry date used for IV calculation
    squeezeScore: number | null;       // [SQUEEZE FIX] 0-100 score from structureService
    squeezeRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;  // [SQUEEZE FIX] Risk label
    // [DASHBOARD V2] New intraday indicators
    vwap: number | null;               // VWAP price for intraday distance calc
    darkPoolPct: number | null;        // Dark Pool volume % (realtime)
    shortVolPct: number | null;        // Short Volume % (realtime)
    zeroDtePct: number | null;         // 0DTE Impact % (nearest expiry gamma ratio)
    impliedMovePct: number | null;     // Implied Move % (ATM straddle)
    impliedMoveDir: 'bullish' | 'bearish' | 'neutral' | null;  // Call/Put premium dominance
    gammaConcentration: number | null;  // [GEX REGIME] ATM gamma concentration (0-100%)
    // [P/C RATIO VOLUME] Volume-based P/C ratio (matches Flow page)
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
    // ── Additional card data (from unified API) ──
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
    // Selected ticker for main view
    selectedTicker: string;

    // All fetched ticker data
    tickers: Record<string, TickerData>;

    // Market overview
    market: MarketData | null;

    // Live signals
    signals: Signal[];

    // Loading state
    isLoading: boolean;
    lastUpdated: Date | null;

    // Dashboard ticker list (selected from watchlist)
    dashboardTickers: string[];

    // Actions
    setSelectedTicker: (ticker: string) => void;
    setTickers: (tickers: Record<string, TickerData>) => void;
    setMarket: (market: MarketData) => void;
    setSignals: (signals: Signal[]) => void;
    setLoading: (loading: boolean) => void;

    // Dashboard ticker management
    toggleDashboardTicker: (ticker: string, maxSlots?: number) => void;
    isDashboardTicker: (ticker: string) => boolean;
    loadDashboardTickers: () => Promise<void>;

    // Fetch all data
    fetchDashboardData: (tickerList?: string[]) => Promise<void>;
    // Fast price-only update (lightweight)
    fetchPriceOnly: (tickerList?: string[]) => Promise<void>;
    // [P0] Immediate single-ticker fetch on click
    fetchSingleTicker: (ticker: string) => Promise<void>;
    // [SSR] Initialize store with server-fetched props
    initializeStore: (dashboardTickers: string[], quotes: any) => void;
    // [WEBSOCKET] Update price from real-time WebSocket Push
    updateRealtimePrice: (ticker: string, price: number, changePct?: number) => void;
}

const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'SPY'];

// [FIX] Field-level deep merge helper to preserve existing non-null values
// Key behavior: null/undefined values in newData will NOT overwrite existing non-null values.
// This prevents fetchDashboardData (extended:null from analysis-cache) from destroying
// the extended data that fetchPriceOnly already populated from Polygon.
const deepMergeTicker = (existing: TickerData | undefined, newData: any): TickerData => {
    if (!existing) return newData as TickerData;
    const merged = { ...existing } as any;
    for (const [field, val] of Object.entries(newData)) {
        if (val !== null && val !== undefined && val !== '') {
            if (typeof val === 'object' && !Array.isArray(val)) {
                merged[field] = { ...(existing as any)[field] };
                for (const [subField, subVal] of Object.entries(val)) {
                    if (subVal !== null && subVal !== undefined && subVal !== '') {
                        merged[field][subField] = subVal;
                    }
                }
            } else {
                merged[field] = val;
            }
        }
        // [FIX] If newData has null but existing has data, preserve existing (no overwrite)
    }
    return merged as TickerData;
};

// [P1 FIX] Abort controller for fetchDashboardData race condition prevention
let _dashboardAbort: AbortController | null = null;

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

            setSelectedTicker: (ticker) => {
                set({ selectedTicker: ticker });
                // Update URL without reload
                if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('t', ticker);
                    window.history.replaceState({}, '', url.toString());
                }
                // [P0 FIX] If this ticker's data is not in the store, fetch it immediately
                // This prevents the "click ticker → blank data → need refresh" issue
                const existing = get().tickers[ticker];
                if (!existing || existing.underlyingPrice == null) {
                    get().fetchSingleTicker(ticker);
                }
            },

            setTickers: (tickers) => set({ tickers }),
            setMarket: (market) => set({ market }),
            setSignals: (signals) => set({ signals }),
            setLoading: (loading) => set({ isLoading: loading }),

            toggleDashboardTicker: (ticker, maxSlots = 20) => {
                console.log('[BOARD] toggleDashboardTicker called:', ticker, 'maxSlots:', maxSlots);
                // Optimistic update
                const current = get().dashboardTickers;
                const isIn = current.includes(ticker.toUpperCase());
                const optimistic = isIn
                    ? current.filter(t => t !== ticker.toUpperCase())
                    : [...current, ticker.toUpperCase()].slice(0, maxSlots);
                set({ dashboardTickers: optimistic });
                // Persist to Supabase (fire-and-forget with sync-back)
                toggleDbTicker(ticker).then(serverList => {
                    set({ dashboardTickers: serverList });
                }).catch(err => {
                    console.error('[BOARD] Supabase toggle failed, reverting:', err);
                    set({ dashboardTickers: current }); // revert on error
                });
            },

            initializeStore: (dashboardTickers, quotes) => {
                const currentTickers = { ...get().tickers };

                // Map API session strings
                const sessionMap: Record<string, string> = {
                    'pre': 'PRE', 'regular': 'REG', 'post': 'POST', 'closed': 'CLOSED',
                    'PRE': 'PRE', 'REG': 'REG', 'POST': 'POST', 'CLOSED': 'CLOSED'
                };

                if (quotes && typeof quotes === 'object') {
                    for (const [ticker, q] of Object.entries(quotes) as [string, any][]) {
                        if (!q) continue;
                        if (!currentTickers[ticker]) {
                            // Build extended data from SSR quotes (extendedPrice/Label available from quotes API)
                            const ssrExtended = (() => {
                                if (!q.extendedPrice || q.extendedPrice <= 0) return null;
                                const isPost = q.extendedLabel === 'POST';
                                const isPre = q.extendedLabel === 'PRE';
                                const dayClose = q.price || 0;
                                const prevCl = q.previousClose || q.prevClose || 0;
                                return {
                                    postPrice: isPost ? q.extendedPrice : undefined,
                                    postChangePct: isPost && dayClose > 0 ? ((q.extendedPrice - dayClose) / dayClose) * 100 : undefined,
                                    prePrice: isPre ? q.extendedPrice : undefined,
                                    preChangePct: isPre && prevCl > 0 ? ((q.extendedPrice - prevCl) / prevCl) * 100 : undefined,
                                };
                            })();
                            // Session: quotes API returns 'session' field (not 'marketState')
                            const mappedSession = sessionMap[q.session] || sessionMap[q.marketState] || 'CLOSED';
                            currentTickers[ticker] = {
                                underlyingPrice: q.price || 0,
                                changePercent: q.changePercent || q.changesPercentage || 0,
                                prevClose: q.previousClose || q.prevClose || 0,
                                regularCloseToday: null,
                                intradayChangePct: null,
                                // [FIX] Populate display & prevRegularClose from SSR data
                                // so calcPriceDisplay has accurate CHG% from first render
                                display: { price: q.price || 0, changePctPct: q.changePercent || q.changesPercentage || 0 },
                                prevChangePct: q.changePercent || q.changesPercentage || null,
                                prevRegularClose: q.previousClose || q.prevClose || null,
                                extended: ssrExtended,
                                session: mappedSession as any,
                                netGex: null, maxPain: null, pcr: null, isGammaSqueeze: false,
                                gammaFlipLevel: null, atmIv: null, atmIvExpiry: null,
                                squeezeScore: null, squeezeRisk: null,
                                vwap: null, darkPoolPct: null, shortVolPct: null,
                                zeroDtePct: null, impliedMovePct: null, impliedMoveDir: null,
                                gammaConcentration: null, volumePcr: null, volumePcrCallVol: null,
                                volumePcrPutVol: null, levels: null, expiration: null, options_status: null
                            };
                        } else {
                            // Build extended from SSR quotes for existing tickers too
                            const mergeExtended = (() => {
                                if (!q.extendedPrice || q.extendedPrice <= 0) return undefined;
                                const isPost = q.extendedLabel === 'POST';
                                const isPre = q.extendedLabel === 'PRE';
                                const dayClose = q.price || 0;
                                const prevCl = q.previousClose || q.prevClose || 0;
                                return {
                                    postPrice: isPost ? q.extendedPrice : undefined,
                                    postChangePct: isPost && dayClose > 0 ? ((q.extendedPrice - dayClose) / dayClose) * 100 : undefined,
                                    prePrice: isPre ? q.extendedPrice : undefined,
                                    preChangePct: isPre && prevCl > 0 ? ((q.extendedPrice - prevCl) / prevCl) * 100 : undefined,
                                };
                            })();
                            currentTickers[ticker] = deepMergeTicker(currentTickers[ticker], {
                                underlyingPrice: q.price,
                                changePercent: q.changePercent || q.changesPercentage,
                                prevClose: q.previousClose || q.prevClose,
                                // [FIX] Also merge prevRegularClose and display for accurate CHG%
                                prevRegularClose: q.previousClose || q.prevClose,
                                display: { price: q.price, changePctPct: q.changePercent || q.changesPercentage },
                                extended: mergeExtended,
                                session: sessionMap[q.session] || sessionMap[q.marketState] || currentTickers[ticker].session
                            });
                        }
                    }
                }
                set({ dashboardTickers, tickers: currentTickers });
            },

            isDashboardTicker: (ticker) => get().dashboardTickers.includes(ticker.toUpperCase()),

            loadDashboardTickers: async () => {
                try {
                    const tickers = await fetchDbTickers();
                    if (tickers.length > 0) {
                        set({ dashboardTickers: tickers });
                    }
                } catch (err) {
                    console.error('[BOARD] Failed to load dashboard tickers from Supabase:', err);
                }
            },

            fetchDashboardData: async (tickerList = DEFAULT_TICKERS) => {
                // [P1 FIX] Abort previous in-flight request to prevent race conditions
                if (_dashboardAbort) _dashboardAbort.abort();
                _dashboardAbort = new AbortController();
                const signal = _dashboardAbort.signal;

                // Only show loading skeleton on initial load, not on refreshes
                const hasExistingData = Object.keys(get().tickers).length > 0;
                if (!hasExistingData) {
                    set({ isLoading: true });
                }

                try {
                    const tickersParam = tickerList.slice(0, 20).join(',');
                    const res = await fetch(`/api/dashboard/unified?tickers=${tickersParam}`, { signal });

                    // If aborted by a newer request, exit silently
                    if (signal.aborted) return;

                    if (!res.ok) {
                        throw new Error('Failed to fetch dashboard data');
                    }

                    const data = await res.json();

                    // [SIGNAL ACCUMULATION] Merge new signals with existing
                    const existingSignals = get().signals;
                    const newSignals: Signal[] = data.signals || [];
                    const now = Date.now();
                    const HOURS_24 = 24 * 60 * 60 * 1000;

                    // Create unique key for deduplication: ticker + type + message
                    const signalKey = (s: Signal) => `${s.ticker}|${s.type}|${s.message}`;
                    const existingKeys = new Set(existingSignals.map(signalKey));

                    // Filter new signals: only add if not duplicate
                    const uniqueNewSignals = newSignals.filter(s => !existingKeys.has(signalKey(s)));

                    // Merge: new signals first, then existing
                    const merged = [...uniqueNewSignals, ...existingSignals];

                    // Remove signals older than 24 hours
                    const validSignals = merged.filter(s => {
                        const signalTime = new Date(s.time).getTime();
                        return (now - signalTime) < HOURS_24;
                    });

                    // Keep max 20 signals (newest first, already sorted by time)
                    const finalSignals = validSignals.slice(0, 20);

                    const existingTickers = get().tickers;
                    const newTickers = data.tickers || {};
                    const mergedTickers = { ...existingTickers };

                    for (const [key, value] of Object.entries(newTickers)) {
                        if (value && typeof value === 'object' && !(value as any).error) {
                            mergedTickers[key] = deepMergeTicker(mergedTickers[key], value);
                        }
                        // If value has error, keep existing data
                    }

                    set({
                        tickers: mergedTickers,
                        market: data.market || get().market,
                        signals: finalSignals,
                        lastUpdated: new Date(),
                        isLoading: false
                    });
                } catch (error: any) {
                    // AbortError is expected when a newer request cancels this one
                    if (error?.name === 'AbortError') return;
                    console.error('Dashboard fetch error:', error);
                    // [RELIABILITY] If no data at all, trigger price-only fetch as emergency fallback
                    const hasAnyData = Object.keys(get().tickers).length > 0;
                    if (!hasAnyData) {
                        console.log('[BOARD] Emergency fallback: fetching prices only...');
                        get().fetchPriceOnly(tickerList);
                    }
                    set({ isLoading: false });
                }
            },

            // ── Fast price-only update (5s) using /api/live/quotes ──
            fetchPriceOnly: async (tickerList = DEFAULT_TICKERS) => {
                try {
                    const symbols = tickerList.slice(0, 20).join(',');
                    const res = await fetch(`/api/live/quotes?symbols=${symbols}`);
                    if (!res.ok) return;
                    const json = await res.json();
                    const quotes = json.data;
                    if (!quotes) return;

                    const currentTickers = { ...get().tickers };
                    let changed = false;

                    // Map API session strings to store session format
                    const sessionMap: Record<string, string> = {
                        'pre': 'PRE', 'regular': 'REG', 'post': 'POST', 'closed': 'CLOSED',
                        'PRE': 'PRE', 'REG': 'REG', 'POST': 'POST', 'CLOSED': 'CLOSED'
                    };

                    for (const [ticker, q] of Object.entries(quotes) as [string, any][]) {
                        if (!q) continue;
                        // [FIX] Create minimal entry for new tickers not yet in store
                        if (!currentTickers[ticker]) {
                            currentTickers[ticker] = {
                                underlyingPrice: q.price || 0,
                                display: { price: q.price || 0, changePctPct: q.changePercent || 0 },
                                session: (q.session === 'regular' ? 'REG' : q.session === 'pre' ? 'PRE' : q.session === 'post' ? 'POST' : 'CLOSED') as any,
                            } as any;
                            changed = true;
                            continue;
                        }
                        const existing = currentTickers[ticker];
                        const isAfterHours = q.session === 'post' || q.session === 'closed';
                        const mappedSession = sessionMap[q.session] || existing.session || 'CLOSED';

                        // [FIX] Always update session if it changed (critical for PRE→REG transitions)
                        const sessionChanged = mappedSession !== existing.session;

                        if (isAfterHours) {
                            // [FIX v3] POST/CLOSED: q.price = regular session close (ALWAYS)
                            // q.extendedPrice = POST/PRE price (badge display)
                            // We CAN safely set underlyingPrice to q.price since it's always the regular close
                            const regClose = q.price || q.latestPrice;
                            const refClose = existing.prevClose ?? q.previousClose ?? q.prevClose;
                            const hasNewExtended = q.extendedPrice > 0;
                            const regChangePct = (regClose && refClose && refClose > 0)
                                ? ((regClose - refClose) / refClose) * 100
                                : (existing.changePercent ?? 0);
                            currentTickers[ticker] = {
                                ...existing,
                                // [FIX] Set underlyingPrice to regular close (q.price is ALWAYS reg close)
                                underlyingPrice: regClose || existing.underlyingPrice,
                                changePercent: regChangePct,
                                prevClose: refClose ?? existing.prevClose,
                                regularCloseToday: regClose || existing.regularCloseToday,
                                session: mappedSession as any,
                                display: {
                                    ...existing.display,
                                    price: regClose || existing.display?.price,
                                    changePctPct: regChangePct,
                                },
                                extended: {
                                    ...existing.extended,
                                    postPrice: q.extendedLabel === 'POST' ? q.extendedPrice : existing.extended?.postPrice,
                                    postChangePct: q.extendedLabel === 'POST' ? q.extendedChangePercent : existing.extended?.postChangePct,
                                    prePrice: q.extendedLabel === 'PRE' ? q.extendedPrice : existing.extended?.prePrice,
                                    preChangePct: q.extendedLabel === 'PRE' ? q.extendedChangePercent : existing.extended?.preChangePct,
                                },
                            };
                            changed = true;
                        } else {
                            // REG/PRE: Update prices
                            const isPreSession = mappedSession === 'PRE' || q.session === 'pre';
                            const refClose = existing.prevClose ?? q.previousClose ?? q.prevClose;

                            if (isPreSession) {
                                // [FIX V5] PRE session: underlyingPrice = prevClose (regular close)
                                // PRE price goes ONLY to extended.prePrice — matches Command page behavior
                                const prePrice = q.extendedPrice && q.extendedPrice > 0 ? q.extendedPrice : 0;
                                const preChangePct = prePrice > 0 && refClose && refClose > 0
                                    ? ((prePrice - refClose) / refClose) * 100
                                    : (q.extendedChangePercent ?? 0);
                                currentTickers[ticker] = {
                                    ...existing,
                                    // underlyingPrice = last regular close (NOT pre-market price)
                                    underlyingPrice: existing.regularCloseToday || refClose || existing.underlyingPrice,
                                    // changePercent = previous regular session change (from Polygon Daily Bars via unified API)
                                    changePercent: existing.prevChangePct ?? existing.intradayChangePct ?? 0,
                                    prevClose: refClose ?? existing.prevClose,
                                    session: mappedSession as any,
                                    display: {
                                        ...existing.display,
                                        price: existing.regularCloseToday || refClose || existing.display?.price,
                                        // display.changePctPct = REGULAR session change (NOT pre-market!)
                                        changePctPct: existing.prevChangePct ?? existing.intradayChangePct ?? 0,
                                    },
                                    extended: {
                                        ...existing.extended,
                                        prePrice: prePrice || existing.extended?.prePrice,
                                        preChangePct: preChangePct,
                                    },
                                };
                                changed = true;
                            } else {
                                // REG: use q.price (live trade)
                                const newPrice = q.price || q.latestPrice;
                                if ((newPrice && newPrice !== existing.underlyingPrice) || sessionChanged) {
                                    const calculatedChangePct = (newPrice && refClose && refClose > 0)
                                        ? ((newPrice - refClose) / refClose) * 100
                                        : (q.changePercent ?? existing.changePercent);
                                    currentTickers[ticker] = {
                                        ...existing,
                                        underlyingPrice: newPrice || existing.underlyingPrice,
                                        changePercent: calculatedChangePct,
                                        prevClose: refClose ?? existing.prevClose,
                                        session: mappedSession as any,
                                        display: {
                                            ...existing.display,
                                            price: newPrice || existing.display?.price,
                                            changePctPct: calculatedChangePct,
                                        },
                                        extended: {
                                            ...existing.extended,
                                            prePrice: q.extendedPrice > 0 && q.extendedLabel === 'PRE' ? q.extendedPrice : existing.extended?.prePrice,
                                            preChangePct: q.extendedLabel === 'PRE' ? q.extendedChangePercent : existing.extended?.preChangePct,
                                        },
                                    };
                                    changed = true;
                                }
                            }
                        }
                        // [FIX] Even if price unchanged, correct changePct if it was 0 due to SSR field mismatch
                        const refCloseForFix = existing.prevClose || q.previousClose || q.prevClose || 0;
                        if (!changed && existing.changePercent === 0 && refCloseForFix > 0) {
                            const currentPrice = existing.underlyingPrice || 0;
                            if (currentPrice > 0) {
                                const correctedPct = ((currentPrice - refCloseForFix) / refCloseForFix) * 100;
                                if (correctedPct !== 0) {
                                    currentTickers[ticker] = {
                                        ...existing,
                                        changePercent: correctedPct,
                                        display: { ...existing.display, changePctPct: correctedPct },
                                    };
                                    changed = true;
                                }
                            }
                        }
                    }

                    if (changed) {
                        set({ tickers: currentTickers });
                    }
                } catch (e) {
                    // Silent fail — full poll will recover
                }
            },

            // ── [P0] Immediate single-ticker fetch ──
            // Called by setSelectedTicker when ticker data is missing from the store.
            // Fetches ONE ticker via unified API and merges into existing data.
            fetchSingleTicker: async (ticker: string) => {
                try {
                    const res = await fetch(`/api/dashboard/unified?tickers=${ticker}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    const newTickers = data.tickers || {};
                    if (!newTickers[ticker]) return;

                    const existing = get().tickers;
                    set({
                        tickers: { ...existing, [ticker]: deepMergeTicker(existing[ticker], newTickers[ticker]) },
                        market: data.market || get().market,
                    });
                } catch (e) {
                    console.error(`[BOARD] fetchSingleTicker(${ticker}) error:`, e);
                }
            },

            // [WEBSOCKET] Real-time price injection from WebSocket Push
            updateRealtimePrice: (ticker: string, price: number, changePct?: number) => {
                const existing = get().tickers[ticker];
                if (!existing) return; // Only update tickers already in the dashboard

                // Skip if price is same (avoid unnecessary re-renders)
                if (existing.underlyingPrice === price) return;

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
            }
        }),
        {
            name: 'dashboard-storage-v3',
            // [FIX] Strip volatile price fields before persisting to localStorage.
            // Root cause: stale prices from previous session were hydrated on page load,
            // causing wrong changePct display until fresh API data arrived.
            // Now: only ticker structure (GEX, levels, etc.) is persisted — price fields are
            // cleared so first render shows loading skeleton until live data arrives.
            partialize: (state) => {
                // Strip volatile price data from each ticker before persisting
                const strippedTickers: Record<string, any> = {};
                for (const [ticker, data] of Object.entries(state.tickers)) {
                    if (!data) continue;
                    const { underlyingPrice, changePercent, display, intradayChangePct, regularCloseToday, prevChangePct, extended, session, ...structural } = data;
                    strippedTickers[ticker] = {
                        ...structural,
                        // Keep prevClose/prevRegularClose (stable reference prices)
                        // Clear all volatile fields → forces loading state on hydration
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
                    // [FIX] market is intentionally NOT persisted — stale marketStatus (e.g. 'PRE'
                    // from a morning session) would show "LIVE PRE" badge on evening visits
                };
            },
            // Note: localStorage is now fallback only.
            // Primary persistence is via Supabase (loadDashboardTickers on mount).
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
