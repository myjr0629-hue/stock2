"use client";

// [PERF] Thin CSR wrapper — renders LiveTickerDashboard immediately
// LiveTickerDashboard internally uses useFlowData (SWR) for all price/quote data
// No SSR blocking = instant page load (same as Flow page)

import dynamic from "next/dynamic";

// Dynamic import with loading skeleton
const LiveTickerDashboard = dynamic(
    () => import("@/components/LiveTickerDashboard").then(mod => mod.LiveTickerDashboard),
    {
        ssr: false,
        loading: () => (
            <div className="animate-pulse space-y-4">
                {/* Header skeleton */}
                <div className="flex items-center gap-4 py-4">
                    <div className="w-14 h-14 rounded-xl bg-slate-800/60" />
                    <div className="space-y-2">
                        <div className="h-8 w-32 bg-slate-800/60 rounded" />
                        <div className="h-4 w-48 bg-slate-800/40 rounded" />
                    </div>
                    <div className="ml-auto space-y-1 text-right">
                        <div className="h-8 w-28 bg-slate-800/60 rounded" />
                        <div className="h-4 w-20 bg-slate-800/40 rounded" />
                    </div>
                </div>
                {/* Indicator cards skeleton */}
                <div className="grid grid-cols-5 gap-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-24 bg-slate-800/40 rounded-xl border border-slate-700/30" />
                    ))}
                </div>
                {/* Chart skeleton */}
                <div className="h-[520px] bg-slate-800/30 rounded-2xl border border-slate-700/20" />
            </div>
        )
    }
);

interface TickerPageClientProps {
    ticker: string;
    range: string;
}

export function TickerPageClient({ ticker, range }: TickerPageClientProps) {
    // Minimal initialStockData — LiveTickerDashboard will hydrate everything via SWR
    const minimalStockData = {
        symbol: ticker,
        name: ticker,
        price: 0,
        change: 0,
        changePercent: 0,
        currency: "USD",
        history: [],
    };

    return (
        <LiveTickerDashboard
            ticker={ticker}
            initialStockData={minimalStockData}
            initialNews={[]}
            range={range}
            buildId="csr"
        />
    );
}
