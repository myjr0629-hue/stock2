// src/app/ticker/page.tsx
// [PERF] CSR-first: No SSR blocking. Page renders instantly, data loads via SWR.
// LiveTickerDashboard already uses useFlowData (SWR) internally for all price data.

import { TickerPageClient } from "./TickerPageClient";
import { TerminalGateWrapper } from '@/components/gate/TerminalGateWrapper';
import { getFromCache } from '@/services/redisClient';
import { getStockDataLight } from '@/services/marketDataLight';

interface Props {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ ticker?: string; range?: string; extended?: string }>;
}

export default async function TickerPage({ params, searchParams }: Props) {
    const resolvedParams = await searchParams;
    const routeParams = await params;
    const ticker = resolvedParams.ticker?.toUpperCase();
    const range = resolvedParams.range || "1d";
    const locale = routeParams.locale || "en";

    if (!ticker) {
        return (
            <div className="min-h-screen font-sans bg-slate-950 text-slate-200">
                <main className="mx-auto max-w-5xl px-6 pb-12">
                    <div className="border border-slate-800 bg-slate-900/50 rounded-lg p-6">
                        <div className="text-lg font-bold mb-2 text-white">Ticker required</div>
                        <div className="text-sm text-slate-400">Example: /ticker?ticker=NVDA</div>
                    </div>
                </main>
            </div>
        );
    }

    // [SSR HYDRATION] Pre-fetch stock data and unified cache to eliminate skeleton
    const [initialStockData, initialUnifiedData] = await Promise.all([
        getStockDataLight(ticker).catch(() => null),
        getFromCache<any>(`cache:command:unified:${ticker}:${locale}`).catch(() => null)
    ]);

    // Construct a safe minimal version if stock data fails
    const safeStockData = initialStockData || {
        symbol: ticker,
        name: ticker,
        price: 0,
        change: 0,
        changePercent: 0,
        currency: "USD",
        history: [],
    };

    return (
        <TerminalGateWrapper pageName="COMMAND">
            <div className="min-h-screen h-full selection:bg-emerald-500/30 selection:text-emerald-200 font-sans bg-[#050a14] text-slate-200">
                <main className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 pb-24 md:pb-48 space-y-4 bg-[#050a14]">
                    <TickerPageClient
                        ticker={ticker}
                        range={range}
                        initialStockData={safeStockData}
                        initialUnifiedData={initialUnifiedData || undefined}
                    />
                </main>
            </div>
        </TerminalGateWrapper>
    );
}
