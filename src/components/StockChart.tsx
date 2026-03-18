
"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from 'next-intl';
import {
    Line,
    Area,
    Bar,
    ComposedChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    ReferenceLine,
    ReferenceArea,
    Label,
    Customized,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertCircle, BarChart2 } from "lucide-react";
import { CardTooltip } from '@/components/ui/CardTooltip';

interface AlphaLevels {
    callWall?: number;
    putFloor?: number;
    maxPain?: number;
}

interface StockChartProps {
    data: { date: string; close: number }[];
    color?: string;
    ticker: string;
    prevClose?: number;
    currentPrice?: number; // [New] Live Price for Ref Line
    rsi?: number;
    return3d?: number;
    alphaLevels?: AlphaLevels; // [New] Optional Alpha Levels overlay
    session?: string; // PRE | REG | POST | CLOSED
    dayHigh?: number;
    dayLow?: number;
    hideHeaderExtras?: boolean; // Hide session badge + range in header
    vwap?: number; // [New] VWAP line overlay for 1D chart
    gammaFlipLevel?: number; // [New] Gamma Flip level — only visible when within chart Y-axis range
    nbbo?: { bid: number; ask: number; bidSize: number; askSize: number } | null; // [New] NBBO overlay
}

// [HOTFIX S-55] etMinute to HH:MM ET formatter
const formatEtMinute = (etMinute: number): string => {
    const hours = Math.floor(etMinute / 60);
    const mins = etMinute % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ET`;
};

export function StockChart({ data, color = "#2563eb", ticker, initialRange = "1d", prevClose, currentPrice, rsi, return3d, alphaLevels, session, dayHigh, dayLow, hideHeaderExtras, vwap, gammaFlipLevel, nbbo }: StockChartProps & { initialRange?: string }) {
    const td = useTranslations('dashboard');
    // [LIVE-FLASH] Track previous price for directional flash color
    const prevPriceRef = useRef<number | undefined>(undefined);
    const priceDirRef = useRef<'up' | 'down' | 'same'>('same');
    // Calculate direction before useEffect updates the ref
    if (currentPrice !== undefined && prevPriceRef.current !== undefined && currentPrice !== prevPriceRef.current) {
        priceDirRef.current = currentPrice > prevPriceRef.current ? 'up' : 'down';
    }
    useEffect(() => {
        if (currentPrice !== undefined) {
            prevPriceRef.current = currentPrice;
        }
    }, [currentPrice]);
    const priceDir = priceDirRef.current;
    // [S-76] Check if SSR data has complete fields (etMinute/session)
    const ssrHasCompleteData = data && data.length > 0 && (data[0] as any)?.etMinute !== undefined;

    // [S-67] Fix: Use props data immediately if available
    const [chartData, setChartData] = useState(data);
    // [S-76] Fix: Only loading if SSR data is incomplete
    // If SSR provides complete data (with etMinute), use it directly
    const [loading, setLoading] = useState(
        initialRange === '1d'
            ? !ssrHasCompleteData  // 1D: loading only if SSR lacks etMinute
            : (!data || data.length === 0)
    );
    const [range, setRange] = useState(initialRange);
    const [baseDateET, setBaseDateET] = useState<string>("");
    const [showSMA, setShowSMA] = useState(false);
    // [S-76] Mark ready immediately if SSR data is complete (including 1D with etMinute)
    const [dataReady, setDataReady] = useState(
        ssrHasCompleteData || (initialRange !== '1d' && data && data.length > 0)
    );

    // [S-76] Sync props data - now works for ALL ranges including 1D with complete data
    // [FIX] Track previous ticker to detect changes and reset stale data
    const prevTickerRef = useRef(ticker);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // [FIX] On ticker change: immediately clear stale chart data to prevent
        // Y-axis stretching (old TSLA $420 data + new NVDA $189 currentPrice = huge range)
        if (prevTickerRef.current !== ticker) {
            setChartData([]);
            setDataReady(false);
            setRenderSettled(false);
            setLoading(true);
            prevTickerRef.current = ticker;
        }

        if (data && data.length > 0) {
            const hasEtMinute = (data[0] as any)?.etMinute !== undefined;

            // Use SSR data if: non-1D range, OR 1D with complete data
            if (initialRange !== '1d' || hasEtMinute) {
                setChartData(data);
                setDataReady(true);
                setLoading(false);
            }
            // For 1D without etMinute: keep loading=true (legacy SSR fallback)
        }
        setRange(initialRange);
    }, [data, ticker, initialRange]);

    // [S-76] Note: SSR now provides complete data with etMinute/session fields.
    // Client fetch is only needed as fallback if SSR data is incomplete.

    // [S-67] Fix: Only fetch if range is 1D (to get etMinute/session data from chart API)
    useEffect(() => {
        const fetchInitialData = async () => {
            // 1D: only fetch if SSR data is incomplete (lacks etMinute/session fields)
            if (range === '1d' && !ssrHasCompleteData) {
                console.log('[StockChart] Fetching 1D data - SSR data incomplete, needs etMinute/session fields');
                setLoading(true);
                try {
                    const t = Date.now();
                    const res = await fetch(`/api/chart?symbol=${ticker}&range=1d&t=${t}`, { cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        const newData = Array.isArray(json) ? json : (json.data || []);
                        if (newData.length > 0) {
                            setChartData(newData);
                            setDataReady(true);
                            if (json.meta?.sessionMaskDebug?.baseDateET) {
                                setBaseDateET(json.meta.sessionMaskDebug.baseDateET);
                            }
                            console.log('[StockChart] 1D data loaded:', newData.length, 'points');
                        }
                    }
                } catch (e) { console.error('[StockChart] Initial fetch error:', e); }
                setLoading(false);
            } else {
                // Non-1D ranges can use SSR data directly
                if (data && data.length > 0) {
                    setChartData(data);
                    setDataReady(true);
                    setLoading(false);
                }
            }
        };
        fetchInitialData();
    }, [ticker, range]);




    const handleRangeChange = async (value: string) => {
        setRange(value);
        setLoading(true);
        try {
            // [HOTFIX] Add cache busting
            const t = Date.now();
            const res = await fetch(`/api/chart?symbol=${ticker}&range=${value}&t=${t}`, {
                cache: 'no-store'
            });
            if (res.ok) {
                const json = await res.json();
                // [S-52.2.3] Handle wrapped response format { data, meta, ... }
                const newData = Array.isArray(json) ? json : (json.data || []);
                setChartData(newData);
                // [HOTFIX] Store baseDateET from meta
                if (json.meta?.sessionMaskDebug?.baseDateET) {
                    setBaseDateET(json.meta.sessionMaskDebug.baseDateET);
                }
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const isIntraday = range === "1d";

    // [HOTFIX S-55] For 1D, use etMinute as X-axis; for others use timestamp
    const processedData = (chartData || [])
        .map((item: any) => {
            if (isIntraday) {
                // [HOTFIX] Ensure etMinute exists. If not, derive from date/timestamp
                let minute = item.etMinute;
                if (minute === undefined && item.date) {
                    try {
                        const d = new Date(item.date);
                        // Convert to ET
                        const etTime = d.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: '2-digit', minute: '2-digit' });
                        const [h, m] = etTime.split(':').map(Number);
                        if (!isNaN(h) && !isNaN(m)) {
                            minute = h * 60 + m;
                        }
                    } catch (e) {
                        // Fallback safe (will be filtered or invalid)
                    }
                }

                if (minute !== undefined) {
                    return {
                        ...item,
                        xValue: minute,
                        xLabel: item.dateET || formatEtMinute(minute),
                    };
                }
                // If still undefined, mapped later logic might fail or filter it, 
                // but at least we tried. If we can't get minute, we can't plot on minute-based axis.
                return item;
            } else {
                // Non-1D: Use sequential index to eliminate weekend/holiday gaps
                // Actual date label is stored separately for tick display
                let dateLabel = '';
                if (item.date) {
                    try {
                        dateLabel = new Date(item.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                    } catch { dateLabel = item.date; }
                } else if (item.t) {
                    dateLabel = new Date(item.t).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
                }

                return {
                    ...item,
                    xValue: 0, // Will be replaced with sequential index below
                    xLabel: dateLabel,
                    _origDate: item.date || (item.t ? new Date(item.t).toISOString() : ''),
                };
            }
        })
        .filter((item: any) => item.close !== null && item.close > 0 && (!isIntraday || item.xValue !== undefined))
        .sort((a: any, b: any) => {
            if (isIntraday) return a.xValue - b.xValue;
            // Non-1D: sort by original date string
            return (a._origDate || '').localeCompare(b._origDate || '');
        })
        .reduce((acc: any[], item: any) => {
            // [S-65] Deduplication: Keep only ONE point per xValue (etMinute) to prevent vertical bands
            if (isIntraday) {
                const lastItem = acc[acc.length - 1];
                if (lastItem && lastItem.xValue === item.xValue) {
                    acc[acc.length - 1] = item;
                } else {
                    acc.push(item);
                }
            } else {
                acc.push(item);
            }
            return acc;
        }, []);

    // [FIX] Non-1D: Assign sequential index as xValue AFTER sort+dedup
    // This eliminates weekend/holiday gaps by making data points equidistant
    if (!isIntraday) {
        processedData.forEach((item: any, idx: number) => {
            item.xValue = idx;
        });
    }

    // ═══ SMA 50/200 Calculation (non-1D only) ═══
    const hasSMAData = !isIntraday && showSMA && processedData.length > 0;
    if (hasSMAData) {
        const closes = processedData.map((d: any) => d.close);
        for (let i = 0; i < closes.length; i++) {
            // SMA 50
            if (i >= 49) {
                const slice50 = closes.slice(i - 49, i + 1);
                processedData[i].sma50 = slice50.reduce((a: number, b: number) => a + b, 0) / 50;
            }
            // SMA 200
            if (i >= 199) {
                const slice200 = closes.slice(i - 199, i + 1);
                processedData[i].sma200 = slice200.reduce((a: number, b: number) => a + b, 0) / 200;
            }
        }
    }

    // [LIVE-LINK] Append currentPrice as the last data point so chart line connects to live price
    // [FIX] Only append within visible chart domain [240, 1199] (04:00-19:59 ET)
    // During CLOSED session (20:00+), currentEtMinute can be >1199 which stretches the X axis
    if (isIntraday && currentPrice && currentPrice > 0 && processedData.length > 0) {
        const now = new Date();
        const etTime = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: '2-digit', minute: '2-digit' });
        const [h, m] = etTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
            const currentEtMinute = h * 60 + m;
            // Only append if within trading session window (04:00-19:59 ET)
            if (currentEtMinute >= 240 && currentEtMinute <= 1199) {
                const lastPoint = processedData[processedData.length - 1];
                // Only append if current minute is >= last data point (avoid going backwards)
                if (currentEtMinute >= lastPoint.xValue) {
                    if (currentEtMinute === lastPoint.xValue) {
                        // Same minute: update the close price in place
                        lastPoint.close = currentPrice;
                    } else {
                        // New minute: append a new data point
                        processedData.push({
                            close: currentPrice,
                            xValue: currentEtMinute,
                            xLabel: formatEtMinute(currentEtMinute),
                            session: currentEtMinute < 570 ? 'PRE' : currentEtMinute >= 960 ? 'POST' : 'REG',
                        });
                    }
                }
            }
        }
    }

    // [S-67] Fix: Remove unnecessary delay, mount immediately
    const [mounted, setMounted] = useState(false);
    // [FIX] Delayed render-settled state: wait for all overlays to arrive before showing
    const [renderSettled, setRenderSettled] = useState(false);
    const settledTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Reset settled on ticker change, then trigger after data is ready + 800ms buffer
    useEffect(() => {
        setRenderSettled(false);
        if (settledTimer.current) clearTimeout(settledTimer.current);
    }, [ticker]);

    useEffect(() => {
        if (dataReady && !renderSettled) {
            if (settledTimer.current) clearTimeout(settledTimer.current);
            settledTimer.current = setTimeout(() => setRenderSettled(true), 400);
        }
        return () => { if (settledTimer.current) clearTimeout(settledTimer.current); };
    }, [dataReady, renderSettled]);

    // [S-65] Domain for 1D: FIXED 04:00-20:00 (240-1199) for consistent X-axis
    // Track actual data extent separately for gradient color calculation
    let xDomain: [number | string, number | string] | undefined = undefined;
    let xDataMax = 1199; // Track where data actually ends (for gradient)

    if (isIntraday && processedData.length > 0) {
        // xDomain is FIXED for consistent X-axis display
        xDomain = [240, 1199];
        // Track actual data end for gradient calculation
        xDataMax = Math.max(...processedData.map((d: any) => d.xValue));
    } else if (processedData.length > 0) {
        // Non-1D: index-based domain [0, count-1]
        xDomain = [0, processedData.length - 1];
    } else {
        xDomain = [0, 1];
    }

    // Loading & Empty State
    // [FIX] Show loading if chart data not yet arrived (even if currentPrice exists)
    if (loading || (!processedData || processedData.length === 0)) {
        return (
            <Card className="shadow-none border border-slate-800 bg-[#0b1219] rounded-md overflow-hidden relative h-full max-h-[520px]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-800 bg-[#0b1219]">
                    <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                        Price History
                    </CardTitle>
                    <Tabs defaultValue={range} onValueChange={handleRangeChange}>
                        <TabsList className="h-8 bg-slate-800 p-1 gap-1 rounded-md">
                            {["1d", "1w", "1mo", "1y", "max"].map((r) => (
                                <TabsTrigger key={r} value={r} className="h-6 px-3 text-xs font-medium rounded-sm text-slate-400 data-[state=active]:bg-slate-700 data-[state=active]:text-white transition-all">
                                    {r.toUpperCase().replace('MAX', 'ALL')}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="h-[360px] w-full flex flex-col items-center justify-center">
                        {loading ? (
                            <>
                                <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-3" />
                                <p className="font-semibold text-slate-500">Loading Chart...</p>
                            </>
                        ) : (
                            <>
                                <div className="p-4 rounded-full bg-red-950/50 mb-3">
                                    <AlertCircle className="h-8 w-8 text-red-400" />
                                </div>
                                <p className="font-semibold text-red-400">No Data Received from Server</p>
                                <p className="text-xs mt-1 text-slate-500">Market might be closed or API is unavailable.</p>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Determine Min/Max for Y-Axis (Include currentPrice in range)
    const validPrices = processedData.filter((d: any) => d.close != null).map((d: any) => d.close);
    // [FIX] Only include currentPrice in domain when chart data exists
    // Prevents Y-axis stretch when currentPrice arrives before chart data
    if (currentPrice && validPrices.length > 0) validPrices.push(currentPrice);

    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;
    const padding = maxPrice * 0.01;

    // [PREMIUM] Volume data for bars
    const hasVolume = processedData.some((d: any) => d.volume && d.volume > 0);
    const maxVolume = hasVolume ? Math.max(...processedData.filter((d: any) => d.volume).map((d: any) => d.volume)) : 0;

    // [HOTFIX] Yahoo Style Dark Mode Colors
    const chartConfig = {
        background: "#0b1219", // Dark Navy/Black like Yahoo
        lineColor: "#e2e8f0", // White/Silver line (regular session)
        preMarketColor: "#fbbf24", // Yellow/Gold for pre-market
        postMarketColor: "#60a5fa", // Light blue for post-market
        textColor: "#94a3b8",
        gridColor: "#1e293b",
        crosshair: "#f8fafc"
    };

    // Session time boundaries (in etMinute: hour * 60 + minute)
    const SESSION_PRE_END = 570; // 09:30 = Pre-market ends
    const SESSION_REG_END = 960; // 16:00 = Regular ends

    // Helper function to get line color based on session or time
    const getSessionColor = (session: string | undefined, etMinute: number) => {
        if (session === 'PRE' || etMinute < SESSION_PRE_END) return chartConfig.preMarketColor;
        if (session === 'POST' || etMinute >= SESSION_REG_END) return chartConfig.postMarketColor;
        return chartConfig.lineColor;
    };

    // Split data into session segments for multi-colored line
    const sessionSegments = isIntraday ? (() => {
        const segments: { data: any[], color: string }[] = [];
        let currentSegment: any[] = [];
        let currentColor = '';

        processedData.forEach((point: any, idx: number) => {
            const pointColor = getSessionColor(point.session, point.xValue);

            if (currentColor !== pointColor && currentSegment.length > 0) {
                // Save current segment and start new one
                // Add last point as bridge to next segment
                segments.push({ data: [...currentSegment], color: currentColor });
                currentSegment = [currentSegment[currentSegment.length - 1]]; // Bridge point
            }

            currentSegment.push(point);
            currentColor = pointColor;
        });

        if (currentSegment.length > 0) {
            segments.push({ data: currentSegment, color: currentColor });
        }

        return segments;
    })() : [{ data: processedData, color: chartConfig.lineColor }];

    // [HOTFIX] Custom ticks for 1D (session boundaries) - Formatted like Yahoo (6:00 AM)
    const getCustomTicks = () => {
        if (isIntraday) {
            // ET session markers: 06:00, 12:00, 18:00
            return [360, 720, 1080];
        }
        return undefined;
    };

    const xAxisTickFormatter = (xValue: number) => {
        if (isIntraday) {
            // 360 -> 6:00 AM
            const h = Math.floor(xValue / 60);
            const m = xValue % 60;
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
        } else {
            // Index-based: look up the actual date label from data
            const idx = Math.round(xValue);
            if (idx >= 0 && idx < processedData.length) {
                return processedData[idx].xLabel || '';
            }
            return '';
        }
    };

    return (
        <Card className="shadow-none border border-slate-800 bg-[#0b1219] rounded-md overflow-hidden relative h-full flex flex-col !py-0 !gap-0">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 bg-[#0b1219]/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            <CardHeader className="flex flex-row items-center justify-between space-y-0 !py-2 !px-4 !pb-2 !gap-0 border-b border-slate-800 bg-[#0b1219]">
                <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                    Price History
                    <span className="text-[12px] text-slate-300 font-medium ml-1">
                        ET
                    </span>
                    {isIntraday && baseDateET && (
                        <span className="text-[12px] text-slate-300 font-normal ml-0.5">
                            • {baseDateET.split(',')[0]}
                        </span>
                    )}
                    {/* Session Badge — hidden when hideHeaderExtras */}
                    {!hideHeaderExtras && session && session.length > 0 && (
                        <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded border ml-1 ${session === 'REG' ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                            : session === 'PRE' ? 'text-amber-400 bg-amber-500/15 border-amber-500/30'
                                : session === 'POST' ? 'text-blue-400 bg-blue-500/15 border-blue-500/30'
                                    : 'text-slate-400 bg-slate-500/15 border-slate-500/30'
                            }`}>
                            {session === 'REG' ? 'OPEN' : session}
                        </span>
                    )}
                    {/* Day Range — 1D only, premium style with label + spread */}
                    {!hideHeaderExtras && isIntraday && (() => {
                        const dh = dayHigh ?? maxPrice;
                        const dl = dayLow ?? minPrice;
                        if (dh <= 0 || dl <= 0) return null;
                        const spread = dh - dl;
                        const spreadPct = dl > 0 ? ((spread / dl) * 100).toFixed(1) : '0.0';
                        return (
                            <span className="text-[13px] font-mono font-medium ml-3 hidden md:inline-flex items-center gap-1.5">
                                <span className="text-slate-300 uppercase text-[13px] font-bold tracking-wider font-sans">Range</span>
                                <span className="text-rose-400">${dl.toFixed(2)}</span>
                                <span className="text-slate-600">—</span>
                                <span className="text-emerald-400">${dh.toFixed(2)}</span>
                                <span className="text-slate-300 text-[13px]">(${spread.toFixed(2)} / {spreadPct}%)</span>
                            </span>
                        );
                    })()}
                </CardTitle>

                <div className="flex items-center gap-2">
                    {/* SMA Toggle — only for non-1D ranges */}
                    {!isIntraday && (
                        <button
                            onClick={() => setShowSMA(prev => !prev)}
                            className={`h-8 px-2.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all border ${showSMA
                                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600'
                                }`}
                            title="SMA 50/200 Overlay"
                        >
                            <BarChart2 className="w-3.5 h-3.5" />
                            SMA
                            {showSMA && (
                                <span className="flex items-center gap-1.5 ml-0.5">
                                    <span className="flex items-center gap-0.5">
                                        <span className="w-3 h-px bg-cyan-400 inline-block" style={{ borderTop: '2px dashed #22d3ee' }} />
                                        <span className="text-[10px] text-cyan-400">50</span>
                                    </span>
                                    <span className="flex items-center gap-0.5">
                                        <span className="w-3 h-px inline-block" style={{ borderTop: '2px dashed #f97316' }} />
                                        <span className="text-[10px] text-orange-400">200</span>
                                    </span>
                                </span>
                            )}
                        </button>
                    )}
                    <Tabs value={range} onValueChange={handleRangeChange}>
                        <TabsList className="h-8 bg-slate-800 p-1 gap-1 rounded-md">
                            {[
                                { v: "1d", l: "1D" },
                                { v: "1w", l: "5D" },
                                { v: "1mo", l: "1M" },
                                { v: "6m", l: "6M" },
                                { v: "1y", l: "1Y" },
                                { v: "max", l: "All" }
                            ].map((r) => (
                                <TabsTrigger
                                    key={r.v}
                                    value={r.v}
                                    className="h-6 px-3 text-xs font-medium rounded-sm text-slate-400 data-[state=active]:bg-slate-700 data-[state=active]:text-white transition-all"
                                >
                                    {r.l}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="pt-6 flex-1 flex flex-col min-h-0">
                {/* [P0-2] Key-based remount for stability */}
                <div ref={chartContainerRef} key={`${ticker}-${range}`} className={`flex-1 w-full flex flex-col min-w-[200px] min-h-[200px] overflow-hidden relative transition-opacity duration-500 ${renderSettled ? 'opacity-100' : 'opacity-0'}`}>
                    {mounted && dataReady && processedData.length > 0 ? (
                        <>
                            {/* ═══ NBBO Bid/Ask Overlay (1D only) — positioned on chart upper area ═══ */}
                            {isIntraday && nbbo && nbbo.bid > 0 && nbbo.ask > 0 && (() => {
                                const spreadPct = ((nbbo.ask - nbbo.bid) / ((nbbo.bid + nbbo.ask) / 2) * 100);
                                const spreadColor = spreadPct < 0.05 ? 'text-emerald-400' : spreadPct < 0.15 ? 'text-amber-400' : 'text-rose-400';
                                const spreadBorder = spreadPct < 0.05 ? 'border-emerald-500/30' : spreadPct < 0.15 ? 'border-amber-500/30' : 'border-rose-500/30';
                                return (
                                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900/70 backdrop-blur-sm border border-white/10">
                                        {/* NBBO Label with Tooltip */}
                                        <span className="text-[12px] font-bold text-slate-300 font-jakarta"><CardTooltip tooltip={{ ko: 'NBBO (National Best Bid & Offer) — 전국 최우선 호가. Bid는 매수 최고가, Ask는 매도 최저가이며, 그 차이(Spread)가 좁을수록 유동성이 풍부합니다. Spread < 0.05%: 매우 우수 | 0.05~0.15%: 보통 | > 0.15%: 유동성 부족 주의.', en: 'NBBO (National Best Bid & Offer) — The best available bid and ask prices across all exchanges. Spread < 0.05%: Excellent liquidity | 0.05–0.15%: Normal | > 0.15%: Low liquidity warning.', ja: 'NBBO（全米最良気配）— 全取引所で最も優れた売買気配値。スプレッド < 0.05%: 流動性良好 | 0.05〜0.15%: 普通 | > 0.15%: 流動性注意。' }}>NBBO</CardTooltip></span>
                                        <span className="text-slate-600">|</span>
                                        {/* Bid */}
                                        <span className="text-[12px] font-bold text-emerald-400 tabular-nums font-jakarta">${nbbo.bid.toFixed(2)}</span>
                                        <span className="text-[12px] text-slate-300 tabular-nums font-jakarta">×{nbbo.bidSize}</span>
                                        {/* Spread */}
                                        <span className={`text-[12px] font-bold ${spreadColor} px-1.5 py-px rounded border ${spreadBorder} bg-slate-950/50 tabular-nums font-jakarta`}>
                                            Spread {spreadPct.toFixed(3)}%
                                        </span>
                                        {/* Ask */}
                                        <span className="text-[12px] font-bold text-rose-400 tabular-nums font-jakarta">${nbbo.ask.toFixed(2)}</span>
                                        <span className="text-[12px] text-slate-300 tabular-nums font-jakarta">×{nbbo.askSize}</span>
                                    </div>
                                );
                            })()}
                            <ResponsiveContainer width="99%" height="100%" minWidth={200} minHeight={200}>
                                <ComposedChart data={processedData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="2 2" vertical={true} horizontal={true} stroke={chartConfig.gridColor} />
                                    {/* ═══ Session Background Shading (1D only) ═══ */}
                                    {isIntraday && (
                                        <>
                                            {/* PRE-MARKET zone: 04:00 (240) to 09:30 (570) */}
                                            <ReferenceArea
                                                x1={240}
                                                x2={570}
                                                fill="#fbbf24"
                                                fillOpacity={0.04}
                                                ifOverflow="hidden"
                                            />
                                            {/* POST-MARKET zone: 16:00 (960) to 20:00 (1199) */}
                                            <ReferenceArea
                                                x1={960}
                                                x2={1199}
                                                fill="#60a5fa"
                                                fillOpacity={0.04}
                                                ifOverflow="hidden"
                                            />
                                        </>
                                    )}
                                    <XAxis
                                        dataKey="xValue"
                                        domain={xDomain}
                                        type="number"
                                        scale="linear"
                                        tickFormatter={xAxisTickFormatter}
                                        ticks={isIntraday ? getCustomTicks() : undefined}
                                        stroke={chartConfig.textColor}
                                        fontSize={12}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={isIntraday ? 30 : 50}
                                        allowDecimals={false}
                                    />
                                    <YAxis
                                        orientation="right"
                                        domain={[minPrice - padding, maxPrice + padding]}
                                        stroke={chartConfig.textColor}
                                        fontSize={12}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => {
                                            const threshold = (maxPrice - minPrice) * 0.04 || 1.5;
                                            if (currentPrice !== undefined && Math.abs(value - currentPrice) < threshold) return '';
                                            if (isIntraday && prevClose !== undefined && Math.abs(value - prevClose) < threshold) return '';
                                            return `${value.toFixed(2)}`;
                                        }}
                                        width={65}
                                        dx={0}
                                    />
                                    {/* [PREMIUM] Hidden volume Y-axis — bottom 15% of chart */}
                                    {hasVolume && (
                                        <YAxis
                                            yAxisId="volume"
                                            orientation="right"
                                            domain={[0, maxVolume * 7]}
                                            hide={true}
                                        />
                                    )}
                                    <Tooltip
                                        cursor={{ stroke: chartConfig.crosshair, strokeWidth: 1, strokeDasharray: '4 4' }}
                                        labelFormatter={(xValue) => {
                                            if (isIntraday) {
                                                return formatEtMinute(xValue as number);
                                            }
                                            // Index-based: look up date from data
                                            const idx = Math.round(xValue as number);
                                            if (idx >= 0 && idx < processedData.length && processedData[idx]._origDate) {
                                                return new Date(processedData[idx]._origDate).toLocaleString('en-US', {
                                                    timeZone: 'America/New_York',
                                                    month: 'short', day: 'numeric', year: 'numeric'
                                                });
                                            }
                                            return '';
                                        }}
                                        contentStyle={{
                                            backgroundColor: "rgba(11, 18, 25, 0.95)",
                                            border: "1px solid #334155",
                                            color: "#f8fafc",
                                            borderRadius: "6px",
                                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.5)",
                                            fontSize: "12px"
                                        }}
                                        itemStyle={{ color: '#f8fafc' }}
                                        formatter={(value: any, name?: string) => {
                                            if (name === 'areaFill') return ['', ''];
                                            if (name === 'volume') {
                                                const v = Number(value) || 0;
                                                if (v >= 1000000) return [`${(v / 1000000).toFixed(1)}M`, 'Vol'];
                                                if (v >= 1000) return [`${(v / 1000).toFixed(0)}K`, 'Vol'];
                                                return [v.toString(), 'Vol'];
                                            }
                                            if (name === 'SMA 50') return [`$${(Number(value) || 0).toFixed(2)}`, 'SMA 50'];
                                            if (name === 'SMA 200') return [`$${(Number(value) || 0).toFixed(2)}`, 'SMA 200'];
                                            return [`$${(Number(value) || 0).toFixed(2)}`, 'Price'];
                                        }}
                                    />
                                    {/* ═══ LAYER 1 (BACK): prevClose dashed line only — no label here ═══ */}
                                    {isIntraday && prevClose !== undefined && (
                                        <ReferenceLine
                                            y={prevClose}
                                            stroke="#94a3b8"
                                            strokeDasharray="8 4"
                                            strokeWidth={1.5}
                                            ifOverflow="extendDomain"
                                        />
                                    )}
                                    {/* ═══ VWAP line (1D only) — institutional reference ═══ */}
                                    {isIntraday && vwap !== undefined && vwap > 0 && (
                                        <ReferenceLine
                                            y={vwap}
                                            stroke="#22c55e"
                                            strokeDasharray="4 4"
                                            strokeWidth={1.2}
                                            strokeOpacity={0.7}
                                            ifOverflow="extendDomain"
                                        >
                                            <Label
                                                position="insideTopLeft"
                                                content={({ viewBox }: any) => {
                                                    const { x, y } = viewBox || {};
                                                    if (x === undefined || y === undefined) return null;
                                                    // [FIX] Dynamic offset to avoid overlap with prevClose and GF
                                                    let yOff = -18; // default: above line
                                                    const priceRange = maxPrice - minPrice || 1;
                                                    const chartH = 360; // approximate chart height
                                                    const pxPerDollar = chartH / priceRange;
                                                    // Check proximity to prevClose (within ~20px)
                                                    if (prevClose !== undefined && Math.abs(vwap - prevClose) * pxPerDollar < 22) {
                                                        yOff = vwap > prevClose ? -36 : 4; // push further away
                                                    }
                                                    // Check proximity to gammaFlipLevel
                                                    if (gammaFlipLevel && gammaFlipLevel > 0 && Math.abs(vwap - gammaFlipLevel) * pxPerDollar < 22) {
                                                        yOff = vwap > gammaFlipLevel ? -36 : 4;
                                                    }
                                                    return (
                                                        <g>
                                                            <rect x={x + 4} y={y + yOff} width={72} height={18} rx={3} fill="#052e16" fillOpacity={0.9} stroke="#22c55e" strokeWidth={0.5} />
                                                            <text x={x + 40} y={y + yOff + 13} textAnchor="middle" fill="#4ade80" fontSize={12} fontWeight="bold">
                                                                VWAP {vwap.toFixed(0)}
                                                            </text>
                                                        </g>
                                                    );
                                                }}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* ═══ Gamma Flip Level line (1D only) — visible only when in Y-axis range ═══ */}
                                    {isIntraday && gammaFlipLevel !== undefined && gammaFlipLevel > 0 && (
                                        <ReferenceLine
                                            y={gammaFlipLevel}
                                            stroke="#f59e0b"
                                            strokeDasharray="6 4"
                                            strokeWidth={1.2}
                                            strokeOpacity={0.6}
                                            ifOverflow="hidden"
                                        >
                                            <Label
                                                position="insideBottomLeft"
                                                content={({ viewBox }: any) => {
                                                    const { x, y } = viewBox || {};
                                                    if (x === undefined || y === undefined) return null;
                                                    // [FIX] Dynamic offset to avoid overlap with prevClose and VWAP
                                                    let yOff = 2; // default: below line
                                                    const priceRange = maxPrice - minPrice || 1;
                                                    const chartH = 360;
                                                    const pxPerDollar = chartH / priceRange;
                                                    // Check proximity to prevClose
                                                    if (prevClose !== undefined && Math.abs(gammaFlipLevel - prevClose) * pxPerDollar < 22) {
                                                        yOff = gammaFlipLevel > prevClose ? -18 : 22; // push away
                                                    }
                                                    // Check proximity to VWAP
                                                    if (vwap !== undefined && vwap > 0 && Math.abs(gammaFlipLevel - vwap) * pxPerDollar < 22) {
                                                        yOff = gammaFlipLevel > vwap ? -18 : 22;
                                                    }
                                                    return (
                                                        <g>
                                                            <rect x={x + 4} y={y + yOff} width={52} height={18} rx={3} fill="#451a03" fillOpacity={0.9} stroke="#f59e0b" strokeWidth={0.5} />
                                                            <text x={x + 30} y={y + yOff + 13} textAnchor="middle" fill="#fbbf24" fontSize={12} fontWeight="bold">
                                                                GF {gammaFlipLevel.toFixed(0)}
                                                            </text>
                                                        </g>
                                                    );
                                                }}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* ═══ LAYER 2: Alpha level lines + labels ═══ */}
                                    {alphaLevels?.callWall && (
                                        <ReferenceLine
                                            y={alphaLevels.callWall}
                                            stroke="#22d3ee"
                                            strokeDasharray="6 3"
                                            strokeWidth={1}
                                            strokeOpacity={0.7}
                                            ifOverflow="hidden"
                                        >
                                            <Label
                                                value={`CALL $${alphaLevels.callWall}`}
                                                position="insideTopRight"
                                                fill="#22d3ee"
                                                fontSize={12}
                                                fontWeight="bold"
                                            />
                                        </ReferenceLine>
                                    )}
                                    {alphaLevels?.putFloor && (
                                        <ReferenceLine
                                            y={alphaLevels.putFloor}
                                            stroke="#f43f5e"
                                            strokeDasharray="6 3"
                                            strokeWidth={1}
                                            strokeOpacity={0.7}
                                            ifOverflow="hidden"
                                        >
                                            <Label
                                                value={`PUT $${alphaLevels.putFloor}`}
                                                position="insideBottomRight"
                                                fill="#f43f5e"
                                                fontSize={12}
                                                fontWeight="bold"
                                            />
                                        </ReferenceLine>
                                    )}
                                    {alphaLevels?.maxPain && (
                                        <ReferenceLine
                                            y={alphaLevels.maxPain}
                                            stroke="#a855f7"
                                            strokeDasharray="6 3"
                                            strokeWidth={1.5}
                                            strokeOpacity={0.8}
                                            ifOverflow="hidden"
                                        >
                                            <Label
                                                position="insideBottomRight"
                                                content={({ viewBox }: any) => {
                                                    const { x, y, width } = viewBox || {};
                                                    if (x === undefined || y === undefined) return null;
                                                    const labelX = (width ? x + width : x) - 10;
                                                    const text = `MAX PAIN $${alphaLevels.maxPain}`;
                                                    return (
                                                        <g>
                                                            <rect
                                                                x={labelX - 112}
                                                                y={y + 3}
                                                                width={112}
                                                                height={18}
                                                                rx={3}
                                                                fill="#0b1219"
                                                                fillOpacity={0.9}
                                                            />
                                                            <text
                                                                x={labelX - 56}
                                                                y={y + 16}
                                                                textAnchor="middle"
                                                                fill="#a855f7"
                                                                fontSize={12}
                                                                fontWeight="bold"
                                                            >
                                                                {text}
                                                            </text>
                                                        </g>
                                                    );
                                                }}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* ═══ LAYER 3: Gradient + Price Line + Area Fill ═══ */}
                                    <defs>
                                        {(() => {
                                            const xMin = 240;
                                            const totalRange = xDataMax - xMin || 1;
                                            const preEndOffset = Math.max(0, Math.min(1, (SESSION_PRE_END - xMin) / totalRange));
                                            const postStartOffset = xDataMax > SESSION_REG_END
                                                ? Math.max(0, Math.min(1, (SESSION_REG_END - xMin) / totalRange))
                                                : 1;
                                            return (
                                                <>
                                                    {/* Horizontal gradient for line stroke color (session-aware) */}
                                                    <linearGradient id="chartGradient" x1="0" y1="0" x2="1" y2="0">
                                                        <stop offset={0} stopColor={chartConfig.preMarketColor} />
                                                        <stop offset={preEndOffset} stopColor={chartConfig.preMarketColor} />
                                                        <stop offset={preEndOffset} stopColor={chartConfig.lineColor} />
                                                        <stop offset={postStartOffset} stopColor={chartConfig.lineColor} />
                                                        {xDataMax > SESSION_REG_END && (
                                                            <>
                                                                <stop offset={postStartOffset} stopColor={chartConfig.postMarketColor} />
                                                                <stop offset={1} stopColor={chartConfig.postMarketColor} />
                                                            </>
                                                        )}
                                                    </linearGradient>
                                                    {/* Vertical gradient for area fill (transparent fade) */}
                                                    <linearGradient id="areaFillGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.25} />
                                                        <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.08} />
                                                        <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0} />
                                                    </linearGradient>
                                                </>
                                            );
                                        })()}
                                    </defs>
                                    {/* [PREMIUM] Volume bars — rendered FIRST so they appear behind the line */}
                                    {hasVolume && (
                                        <Bar
                                            dataKey="volume"
                                            yAxisId="volume"
                                            fill="#334155"
                                            fillOpacity={0.4}
                                            isAnimationActive={false}
                                            barSize={isIntraday ? 1 : 3}
                                            shape={(props: any) => {
                                                const { x, y, width, height, payload } = props;
                                                if (!height || height <= 0) return <rect x={0} y={0} width={0} height={0} fill="none" />;
                                                // Color based on price direction
                                                const isUp = payload.close >= (payload.open || payload.close);
                                                const fill = isUp ? 'rgba(52, 211, 153, 0.35)' : 'rgba(251, 113, 133, 0.35)';
                                                return <rect x={x} y={y} width={Math.max(width, 1)} height={height} fill={fill} rx={0} />;
                                            }}
                                        />
                                    )}
                                    {/* Area fill below line — semi-transparent gradient */}
                                    <Area
                                        type="monotone"
                                        dataKey="close"
                                        name="areaFill"
                                        stroke="none"
                                        fill="url(#areaFillGradient)"
                                        fillOpacity={1}
                                        isAnimationActive={false}
                                        connectNulls={false}
                                        dot={false}
                                        activeDot={false}
                                        tooltipType="none"
                                    />
                                    {/* ═══ SMA Lines Overlay ═══ */}
                                    {hasSMAData && processedData.some((d: any) => d.sma50) && (
                                        <Line
                                            type="monotone"
                                            dataKey="sma50"
                                            name="SMA 50"
                                            stroke="#22d3ee"
                                            strokeWidth={1.2}
                                            strokeDasharray="6 3"
                                            dot={false}
                                            activeDot={false}
                                            isAnimationActive={false}
                                            connectNulls={true}
                                        />
                                    )}
                                    {hasSMAData && processedData.some((d: any) => d.sma200) && (
                                        <Line
                                            type="monotone"
                                            dataKey="sma200"
                                            name="SMA 200"
                                            stroke="#f97316"
                                            strokeWidth={1.2}
                                            strokeDasharray="6 3"
                                            dot={false}
                                            activeDot={false}
                                            isAnimationActive={false}
                                            connectNulls={true}
                                        />
                                    )}
                                    <Line
                                        type="monotone"
                                        dataKey="close"
                                        stroke={isIntraday ? "url(#chartGradient)" : chartConfig.lineColor}
                                        strokeWidth={1.5}
                                        dot={false}
                                        activeDot={{ r: 4, fill: "#fff", stroke: chartConfig.background, strokeWidth: 2 }}
                                        isAnimationActive={false}
                                        connectNulls={false}
                                    />
                                    {/* ═══ prevClose label (right side, Y-axis) ═══ */}
                                    {isIntraday && prevClose !== undefined && (
                                        <ReferenceLine
                                            y={prevClose}
                                            stroke="transparent"
                                            strokeWidth={0}
                                            ifOverflow="extendDomain"
                                        >
                                            <Label
                                                position="right"
                                                offset={5}
                                                content={({ viewBox }: any) => {
                                                    const { x, y } = viewBox || {};
                                                    if (x === undefined || y === undefined) return null;
                                                    return (
                                                        <g data-price-badge="prevclose-right">
                                                            <rect x={x + 5} y={y - 10} width={54} height={20} rx={4} fill="#3b82f6" />
                                                            <text x={x + 32} y={y + 4} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
                                                                {prevClose.toFixed(2)}
                                                            </text>
                                                        </g>
                                                    );
                                                }}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* ═══ currentPrice line + label (right side) ═══ */}
                                    {currentPrice !== undefined && (() => {
                                        const lastPoint = processedData[processedData.length - 1];
                                        const lastSession = lastPoint?.session || 'REG';
                                        const lastEtMinute = lastPoint?.xValue || 0;
                                        let sessionColor = '#e2e8f0';
                                        let bgColor = '#334155';
                                        if (lastSession === 'POST' || lastEtMinute >= 960) {
                                            sessionColor = '#60a5fa';
                                            bgColor = '#1e40af';
                                        } else if (lastSession === 'PRE' || lastEtMinute < 570) {
                                            sessionColor = '#fbbf24';
                                            bgColor = '#3f3f00';
                                        }
                                        return (
                                            <ReferenceLine
                                                y={currentPrice}
                                                stroke={sessionColor}
                                                strokeWidth={2}
                                                ifOverflow="extendDomain"
                                            >
                                                <Label
                                                    position="right"
                                                    offset={5}
                                                    content={({ viewBox }: any) => {
                                                        const { x, y, width: vw } = viewBox || {};
                                                        if (x === undefined || y === undefined) return null;
                                                        const rightX = vw ? x + vw : x;
                                                        return (
                                                            <foreignObject
                                                                x={rightX + 3}
                                                                y={y - 12}
                                                                width={62}
                                                                height={24}
                                                                key={currentPrice}
                                                            >
                                                                <div
                                                                    style={{
                                                                        background: bgColor,
                                                                        borderRadius: '4px',
                                                                        padding: '2px 4px',
                                                                        textAlign: 'center',
                                                                        fontSize: '13px',
                                                                        fontWeight: 'bold',
                                                                        color: priceDir === 'up' ? '#34d399'
                                                                            : priceDir === 'down' ? '#fb7185'
                                                                                : '#fff',
                                                                        fontFamily: 'monospace',
                                                                        animation: 'priceFlash 0.5s ease-out',
                                                                    }}
                                                                >
                                                                    {currentPrice.toFixed(2)}
                                                                </div>
                                                            </foreignObject>
                                                        );
                                                    }}
                                                />
                                            </ReferenceLine>
                                        );
                                    })()}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#0b1219]">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-600" />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card >
    );
}
