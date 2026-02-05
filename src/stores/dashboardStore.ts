import { create } from 'zustand';

interface TickerData {
    underlyingPrice: number | null;
    changePercent: number | null;
    prevClose: number | null;
    // [S-78] Extended session data for Command-style display
    extended: {
        postPrice?: number;
        postChangePct?: number;
        prePrice?: number;
        preChangePct?: number;
    } | null;
    session: 'PRE' | 'REG' | 'POST' | 'CLOSED';
    netGex: number | null;
    maxPain: number | null;
    pcr: number | null;
    isGammaSqueeze: boolean;
    gammaFlipLevel: number | null;
    atmIv: number | null;  // [S-78] ATM Implied Volatility for premium cards
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
    spy: { price: number | null; change: number };
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
    hydrateDashboardTickers: () => void;

    // Fetch all data
    fetchDashboardData: (tickerList?: string[]) => Promise<void>;
}

const DEFAULT_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'SPY'];

export const useDashboardStore = create<DashboardState>((set, get) => {
    // Load dashboardTickers from localStorage
    const loadDashboardTickers = (): string[] => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = localStorage.getItem('dashboardTickers');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    };

    return {
        selectedTicker: 'NVDA',
        tickers: {},
        market: null,
        signals: [],
        isLoading: false,
        lastUpdated: null,
        dashboardTickers: loadDashboardTickers(),

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
            const current = get().dashboardTickers;
            const isIn = current.includes(ticker);
            const newList = isIn
                ? current.filter(t => t !== ticker)
                : [...current, ticker].slice(0, 10); // Max 10 tickers

            set({ dashboardTickers: newList });

            // Persist to localStorage
            if (typeof window !== 'undefined') {
                localStorage.setItem('dashboardTickers', JSON.stringify(newList));
            }
        },

        hydrateDashboardTickers: () => {
            if (typeof window !== 'undefined') {
                try {
                    const saved = localStorage.getItem('dashboardTickers');
                    if (saved) {
                        set({ dashboardTickers: JSON.parse(saved) });
                    }
                } catch {
                    // ignore
                }
            }
        },

        isDashboardTicker: (ticker) => get().dashboardTickers.includes(ticker),

        fetchDashboardData: async (tickerList = DEFAULT_TICKERS) => {
            set({ isLoading: true });

            try {
                const tickersParam = tickerList.slice(0, 5).join(','); // Max 5 for prefetch
                const res = await fetch(`/api/dashboard/unified?tickers=${tickersParam}`);

                if (!res.ok) {
                    throw new Error('Failed to fetch dashboard data');
                }

                const data = await res.json();

                set({
                    tickers: data.tickers || {},
                    market: data.market || null,
                    signals: data.signals || [],
                    lastUpdated: new Date(),
                    isLoading: false
                });
            } catch (error) {
                console.error('Dashboard fetch error:', error);
                set({ isLoading: false });
            }
        }
    };
});

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
