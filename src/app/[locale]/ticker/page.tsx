// src/app/ticker/page.tsx
// [PERF] CSR-first: No SSR blocking. Page renders instantly, data loads via SWR.
// LiveTickerDashboard already uses useFlowData (SWR) internally for all price data.

import { LandingHeader } from "@/components/landing/LandingHeader";
import { TickerPageClient } from "./TickerPageClient";

interface Props {
    searchParams: Promise<{ ticker?: string; range?: string; extended?: string }>;
}

export default async function TickerPage({ searchParams }: Props) {
    const params = await searchParams;
    const ticker = params.ticker?.toUpperCase();
    const range = params.range || "1d";

    if (!ticker) {
        return (
            <div className="min-h-screen font-sans bg-slate-950 text-slate-200">
                <LandingHeader />
                <main className="mx-auto max-w-5xl px-6 pb-12">
                    <div className="border border-slate-800 bg-slate-900/50 rounded-lg p-6">
                        <div className="text-lg font-bold mb-2 text-white">Ticker required</div>
                        <div className="text-sm text-slate-400">Example: /ticker?ticker=NVDA</div>
                    </div>
                </main>
            </div>
        );
    }

    // [PERF] No await — page renders instantly, LiveTickerDashboard fetches via SWR
    return (
        <div className="min-h-screen h-full selection:bg-emerald-500/30 selection:text-emerald-200 font-sans bg-[#050a14] text-slate-200">
            <LandingHeader />
            <main className="mx-auto max-w-7xl px-6 lg:px-8 pb-48 space-y-4 bg-[#050a14]">
                <TickerPageClient ticker={ticker} range={range} />
            </main>
        </div>
    );
}
