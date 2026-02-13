import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface MarketData {
    nq: { price: number | null; change: number };
    vix: number | null;
    phase: string;
    marketStatus: 'PRE' | 'OPEN' | 'AFTER' | 'CLOSED';
}

interface Signal {
    time: string;
    ticker: string;
    type: 'SQUEEZE' | 'WHALE' | 'HOT' | 'ALERT';
    message: string;
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
    toggleDashboardTicker: (ticker: string) => void;
    isDashboardTicker: (ticker: string) => boolean;

    // Fetch all data
    fetchDashboardData: (tickerList?: string[]) => Promise<void>;
    // Fast price-only update (lightweight)
    fetchPriceOnly: (tickerList?: string[]) => Promise<void>;
}

const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

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
            },

            setTickers: (tickers) => set({ tickers }),
            setMarket: (market) => set({ market }),
            setSignals: (signals) => set({ signals }),
            setLoading: (loading) => set({ isLoading: loading }),

            toggleDashboardTicker: (ticker) => {
                console.log('[BOARD] toggleDashboardTicker called:', ticker);
                const current = get().dashboardTickers;
                console.log('[BOARD] current dashboardTickers:', current);
                const isIn = current.includes(ticker);
                const newList = isIn
                    ? current.filter(t => t !== ticker)
                    : [...current, ticker].slice(0, 10); // Max 10 tickers
                console.log('[BOARD] newList:', newList);
                set({ dashboardTickers: newList });
            },

            isDashboardTicker: (ticker) => get().dashboardTickers.includes(ticker),

            fetchDashboardData: async (tickerList = DEFAULT_TICKERS) => {
                // Only show loading skeleton on initial load, not on refreshes
                const hasExistingData = Object.keys(get().tickers).length > 0;
                if (!hasExistingData) {
                    set({ isLoading: true });
                }

                try {
                    const tickersParam = tickerList.slice(0, 10).join(','); // Max 10 for prefetch (matches toggle limit)
                    const res = await fetch(`/api/dashboard/unified?tickers=${tickersParam}`);

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

                    set({
                        tickers: data.tickers || {},
                        market: data.market || null,
                        signals: finalSignals,
                        lastUpdated: new Date(),
                        isLoading: false
                    });
                } catch (error) {
                    console.error('Dashboard fetch error:', error);
                    set({ isLoading: false });
                }
            },

            // ── Fast price-only update (5s) using /api/live/quotes ──
            fetchPriceOnly: async (tickerList = DEFAULT_TICKERS) => {
                try {
                    const symbols = tickerList.slice(0, 10).join(',');
                    const res = await fetch(`/api/live/quotes?symbols=${symbols}`);
                    if (!res.ok) return;
                    const json = await res.json();
                    const quotes = json.data;
                    if (!quotes) return;

                    const currentTickers = { ...get().tickers };
                    let changed = false;

                    for (const [ticker, q] of Object.entries(quotes) as [string, any][]) {
                        if (!q || !currentTickers[ticker]) continue;
                        const existing = currentTickers[ticker];
                        const isAfterHours = q.session === 'post' || q.session === 'closed';

                        if (isAfterHours) {
                            // [FIX v2] POST/CLOSED: Do NOT touch underlyingPrice or display.price
                            // Full poll sets underlyingPrice from Polygon snapshot (may include post-market),
                            // and display.price from /api/live/ticker (regularClose).
                            // Overwriting either causes oscillation between the two sources.
                            // Only update extended badge fields here.
                            const hasNewExtended = q.extendedPrice > 0;
                            if (hasNewExtended) {
                                currentTickers[ticker] = {
                                    ...existing,
                                    extended: {
                                        ...existing.extended,
                                        postPrice: q.extendedLabel === 'POST' ? q.extendedPrice : existing.extended?.postPrice,
                                        postChangePct: q.extendedLabel === 'POST' ? q.extendedChangePercent : existing.extended?.postChangePct,
                                        prePrice: q.extendedLabel === 'PRE' ? q.extendedPrice : existing.extended?.prePrice,
                                        preChangePct: q.extendedLabel === 'PRE' ? q.extendedChangePercent : existing.extended?.preChangePct,
                                    },
                                };
                                changed = true;
                            }
                            // No underlyingPrice/display update → no flickering
                        } else {
                            // REG/PRE: Update everything (live price matters)
                            const newPrice = q.extendedPrice && q.extendedPrice > 0
                                ? q.extendedPrice
                                : q.price || q.latestPrice;
                            if (newPrice && newPrice !== existing.underlyingPrice) {
                                currentTickers[ticker] = {
                                    ...existing,
                                    underlyingPrice: newPrice,
                                    changePercent: q.changePercent ?? existing.changePercent,
                                    prevClose: q.previousClose ?? q.prevClose ?? existing.prevClose,
                                    display: {
                                        ...existing.display,
                                        price: newPrice,
                                        changePctPct: q.changePercent ?? existing.display?.changePctPct,
                                    },
                                    extended: {
                                        ...existing.extended,
                                        postPrice: q.extendedPrice > 0 && q.extendedLabel === 'POST' ? q.extendedPrice : existing.extended?.postPrice,
                                        postChangePct: q.extendedLabel === 'POST' ? q.extendedChangePercent : existing.extended?.postChangePct,
                                        prePrice: q.extendedPrice > 0 && q.extendedLabel === 'PRE' ? q.extendedPrice : existing.extended?.prePrice,
                                        preChangePct: q.extendedLabel === 'PRE' ? q.extendedChangePercent : existing.extended?.preChangePct,
                                    },
                                };
                                changed = true;
                            }
                        }
                    }

                    if (changed) {
                        set({ tickers: currentTickers });
                    }
                } catch (e) {
                    // Silent fail — full poll will recover
                }
            }
        }),
        {
            name: 'dashboard-storage',
            partialize: (state) => ({ dashboardTickers: state.dashboardTickers }),
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
