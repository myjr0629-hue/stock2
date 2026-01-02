// src/app/ticker/page.tsx
// S-56.4.5b: Ticker Page - Production UI + SSOT Data Binding + Diagnostics Rendering
// Uses LiveTickerDashboard for full UI, data from tickerOverview SSOT service

import { getTickerOverview, TickerOverview, TickerDiagnostics } from "@/services/tickerOverview";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Card, CardContent } from "@/components/ui/card";
import { LiveTickerDashboard } from "@/components/LiveTickerDashboard";
import { StockData, NewsItem } from "@/services/stockTypes";
import { AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { getBuildId, getEnvType } from "@/services/buildIdSSOT";

interface Props {
    searchParams: Promise<{ ticker?: string; range?: string; extended?: string }>;
}

// Convert SSOT TickerOverview to StockData format for LiveTickerDashboard
function convertToStockData(overview: TickerOverview): StockData {
    return {
        // Required fields
        symbol: overview.ticker,
        name: overview.name || overview.ticker,
        price: overview.price.last || 0,
        change: overview.price.changeAbs || 0,
        changePercent: overview.price.changePct || 0,
        currency: "USD",
        history: (overview.history || []).map(h => ({
            date: h.date,
            close: h.close
        })),
        // Optional fields
        dayHigh: overview.price.high,
        dayLow: overview.price.low,
        vwap: overview.price.vwap || undefined,
        session: overview.price.session === "REG" ? "reg" : overview.price.session === "PRE" ? "pre" : overview.price.session === "POST" ? "post" : undefined,
        // [Phase 31] Extended Hours Mapping
        extPrice: overview.price.session === "PRE" ? overview.price.preMarketLast : overview.price.session === "POST" ? overview.price.afterHoursLast : undefined,
        priceSource: overview.price.priceSource, // [Phase 25.1]
        prevClose: overview.price.prevClose, // [Phase 31] Previous close for PRE display
        // [S-56.4.7] SSOT Indicator Mapping
        rsi: overview.indicators.rsi14 || undefined,
        return3d: overview.indicators.return3D || undefined,
        // [Phase 42] Flow Data Injection for SSR
        flow: {
            rawChain: overview.options.rawChain || [],
            netPremium: overview.options.netPremium || 0,
            callPremium: overview.options.callPremium || 0,
            putPremium: overview.options.putPremium || 0,
            optionsCount: overview.options.optionsCount || 0,
            // [Phase 42.1] Structure & Levels (SSR)
            callWall: overview.options.callWall || 0,
            putFloor: overview.options.putFloor || 0,
            pinZone: overview.options.pinZone || 0,
            maxPain: overview.options.maxPain || 0 // [Phase 42.1] Real Max Pain
        }
    };
}

// Convert SSOT news to NewsItem format
function convertToNewsItems(overview: TickerOverview): NewsItem[] {
    const now = new Date();
    return overview.news.items.map(item => {
        const publishedDate = new Date(item.publishedAt);
        const ageHours = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60));
        return {
            title: item.title,
            link: item.url,
            publisher: item.source,
            time: item.publishedAt,
            publishedAtEt: publishedDate.toLocaleString("en-US", { timeZone: "America/New_York" }),
            ageHours,
            sentiment: item.sentiment || "neutral",
            type: "News" as const
        };
    });
}

// [S-56.4.5b] Enhanced Parity Diagnostics Component with sub-call status
function ParityDiagnostics({ overview }: { overview: TickerOverview }) {
    const d = overview.diagnostics;

    // [S-56.4.6f] Server-Side Deploy Metadata (Direct Env Access since this is a Server Component)
    const envType = getEnvType();
    // Prefer VERCEL_GIT_COMMIT_SHA for the badge, fallback to buildId
    const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "HEAD";
    const shortSha = commitSha.slice(0, 7);
    const envCode = envType === 'production' ? 'PROD' : 'DEV';

    const StatusIcon = ({ ok }: { ok: boolean }) => ok
        ? <CheckCircle className="w-3 h-3 text-emerald-400" />
        : <XCircle className="w-3 h-3 text-rose-400" />;

    const StatusBadge = ({ ok, label, code }: { ok: boolean; label: string; code?: string }) => (
        <span className="flex items-center gap-1">
            <StatusIcon ok={ok} />
            <span className={ok ? "text-emerald-400" : "text-rose-400"}>{label}</span>
            {code && !ok && <span className="text-rose-300/60 text-[8px]">({code})</span>}
        </span>
    );

    return (
        <div className="bg-slate-900 text-white py-2 px-4 flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono sticky top-[48px] z-40 border-b border-slate-800">
            <div className="flex items-center gap-3">
                {/* [S-56.4.6f] DEPLOY SSOT BADGE */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded">
                    <span className={`w-1.5 h-1.5 rounded-full ${envType === 'production' ? 'bg-indigo-500' : 'bg-slate-500'}`} />
                    <span className="text-slate-400">{envCode}:</span>
                    <span className="text-indigo-400 font-bold">{shortSha}</span>
                </div>

                <span className="text-slate-500">Build: <span className="text-slate-300">{d.buildId.slice(0, 7)}</span></span>
                <span className="text-slate-500">Source: <span className="text-indigo-400">{d.source}</span></span>
                <span className="text-slate-500">Anchor: <span className="text-cyan-400">{d.anchorDate}</span></span>
                {d.isWeekend && <span className="text-amber-400">WEEKEND</span>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge ok={d.price.ok} label="PRICE" code={d.price.code} />
                <StatusBadge ok={d.chart.ok} label={`CHART(${d.chart.points || 0})`} code={d.chart.code} />
                <StatusBadge ok={d.indicators?.ok !== false} label={`IND(${overview.indicators.dataSource})`} code={d.indicators?.code} />
                <StatusBadge ok={d.session.ok} label={d.session.badge || "SESSION"} code={d.session.code} />
                <StatusBadge ok={d.options.ok} label={`OPT(${d.options.coveragePct || 0}%)`} code={d.options.code} />
                <StatusBadge ok={d.news.ok} label={`NEWS(${d.news.items || 0})`} code={d.news.code} />
            </div>
        </div>
    );
}

// [S-56.4.5b] Diagnostics Detail Panel for failed sub-calls
function DiagnosticsPanel({ diagnostics }: { diagnostics: TickerDiagnostics }) {
    const failures = [
        { key: "price", ...diagnostics.price },
        { key: "chart", ...diagnostics.chart },
        // { key: "vwap", ...diagnostics.vwap }, // [User Request] Ignored for now
        { key: "session", ...diagnostics.session },
        { key: "options", ...diagnostics.options },
        { key: "news", ...diagnostics.news }
    ].filter(d => !d.ok);

    if (failures.length === 0) return null;

    return (
        <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Data Status Issues ({failures.length})
                </div>
                <div className="space-y-1">
                    {failures.map(f => (
                        <div key={f.key} className="flex items-start gap-2 text-xs text-amber-800 bg-amber-100/50 px-2 py-1 rounded">
                            <span className="font-bold uppercase min-w-[60px]">{f.key}:</span>
                            <span className="font-mono text-amber-600">[{f.code}]</span>
                            <span>{f.reasonKR}</span>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

export default async function TickerPage({ searchParams }: Props) {
    const params = await searchParams;
    const ticker = params.ticker?.toUpperCase();
    const range = params.range || "1d";
    const extended = params.extended === "true";

    // [S-56.4.6f] GUARD LOGIC
    const envType = getEnvType();
    const serverBuildId = getBuildId();
    const isDrifted = envType === 'production' && serverBuildId === 'local';

    if (!ticker) {
        return (
            <div className="min-h-screen font-sans bg-slate-950 text-slate-200">
                <LandingHeader />
                <main className="mx-auto max-w-5xl px-6 pt-28 pb-12">
                    <Card className="border-slate-800 bg-slate-900/50">
                        <CardContent className="pt-6">
                            <div className="text-lg font-bold mb-2 text-white">Ticker required</div>
                            <div className="text-sm text-slate-400">Example: /ticker?ticker=NVDA</div>
                        </CardContent>
                    </Card>
                </main>
            </div>
        );
    }

    let overview: TickerOverview | null = null;
    let stockData: StockData | null = null;
    let newsData: NewsItem[] = [];
    let error: string | null = null;

    try {
        // [S-56.4.5b] SSOT: Single data source via tickerOverview service
        overview = await getTickerOverview(ticker, {
            range,
            extended,
            includeHistory: true,
            includeNews: true
        });

        // Convert to formats expected by LiveTickerDashboard
        stockData = convertToStockData(overview);
        newsData = convertToNewsItems(overview);
    } catch (e: any) {
        error = e.message || "Unknown error";
        // Create minimal diagnostics for error case
        if (e.code && e.reasonKR) {
            error = `[${e.code}] ${e.reasonKR}`;
        }
    }

    return (
        <div className="min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200 font-sans bg-slate-950 text-slate-200">
            <LandingHeader />

            {/* [S-56.4.6f] PRODUCTION DRIFT GUARD BANNER */}
            {isDrifted && (
                <div className="bg-rose-900/80 text-rose-200 px-4 py-1 text-center text-[10px] font-bold tracking-widest animate-pulse sticky top-0 z-50 border-b border-rose-500/20">
                    ⚠️ CRITICAL: PRODUCTION ENVIRONMENT RUNNING LOCAL BUILD - DEPLOYMENT DRIFT DETECTED ⚠️
                </div>
            )}

            {/* [S-56.4.5b] Parity Diagnostics Strip - Always visible */}
            {overview && <ParityDiagnostics overview={overview} />}

            <main className="mx-auto max-w-7xl px-6 lg:px-8 pt-8 pb-12 space-y-4">
                {/* [S-56.4.5b] Diagnostics Panel for failures */}
                {overview && <DiagnosticsPanel diagnostics={overview.diagnostics} />}

                {error && (
                    <Card className="border-rose-900/50 bg-rose-950/30 backdrop-blur-sm">
                        <CardContent className="pt-6 text-rose-400 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            <div>
                                <div className="font-bold">Data Fetch Error</div>
                                <div className="text-sm text-rose-300/80">{error}</div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {stockData && !error && (
                    <LiveTickerDashboard
                        ticker={ticker}
                        initialStockData={stockData}
                        initialNews={newsData}
                        range={range}
                        buildId={overview?.meta.buildId || "local"}
                    />
                )}
            </main>
        </div>
    );
}
