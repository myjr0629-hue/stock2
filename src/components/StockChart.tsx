
"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from 'next-intl';
import {
    Line,
    LineChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    ReferenceLine,
    Label,
    Customized,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";

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
}

// [HOTFIX S-55] etMinute to HH:MM ET formatter
const formatEtMinute = (etMinute: number): string => {
    const hours = Math.floor(etMinute / 60);
    const mins = etMinute % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ET`;
};

export function StockChart({ data, color = "#2563eb", ticker, initialRange = "1d", prevClose, currentPrice, rsi, return3d, alphaLevels }: StockChartProps & { initialRange?: string }) {
    const td = useTranslations('dashboard');
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

    // [FIX V2] Real-time Chart Update: Update last data point with currentPrice
    // Added chartData.length to dependency to ensure this runs after new data loads
    useEffect(() => {
        if (range === '1d' && currentPrice && chartData && chartData.length > 0) {
            setChartData(prev => {
                if (!prev || prev.length === 0) return prev;
                const newData = [...prev];
                const lastIdx = newData.length - 1;
                // Only update if the price actually changed
                if (newData[lastIdx].close !== currentPrice) {
                    newData[lastIdx] = { ...newData[lastIdx], close: currentPrice };
                    return newData;
                }
                return prev; // No change, don't trigger re-render
            });
        }
    }, [currentPrice, range, chartData.length]); // [FIX] Added chartData.length


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
                // Non-1D: Use timestamp with safe fallback
                let timeVal = 0;
                if (item.t) timeVal = item.t; // Raw timestamp from Polygon
                else if (item.date) timeVal = new Date(item.date).getTime();
                else if (item.time) timeVal = new Date(item.time).getTime();
                else timeVal = Date.now(); // Fallback to now (will likely be an outlier but prevents crash)

                return {
                    ...item,
                    xValue: timeVal,
                    xLabel: item.date || new Date(timeVal).toLocaleDateString(),
                };
            }
        })
        .filter((item: any) => item.close !== null && item.close > 0 && (!isIntraday || item.xValue !== undefined) && !isNaN(item.xValue)) // [HOTFIX] Filter NaNs and Zeros
        .sort((a: any, b: any) => a.xValue - b.xValue)
        .reduce((acc: any[], item: any) => {
            // [S-65] Deduplication: Keep only ONE point per xValue (etMinute) to prevent vertical bands
            const lastItem = acc[acc.length - 1];
            if (lastItem && lastItem.xValue === item.xValue) {
                // Same minute - replace with latest (higher close takes precedence, or just use the newer one)
                acc[acc.length - 1] = item;
            } else {
                acc.push(item);
            }
            return acc;
        }, []);

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
    } else {
        xDomain = ["dataMin", "dataMax"];
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
    // [User Request] Range adjustment: NVDA 187-191 means approx +/- 1% padding
    // 0.04 was too wide (flat chart). 0.01 is closer to the desired "focused but not too zoomed" look.
    const padding = maxPrice * 0.01;

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
            return new Date(xValue).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
        }
    };

    return (
        <Card className="shadow-none border border-slate-800 bg-[#0b1219] rounded-md overflow-hidden relative h-full flex flex-col">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 bg-[#0b1219]/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-800 bg-[#0b1219]">
                <CardTitle className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                    Price History
                    <span className="text-[11px] text-slate-500 font-medium ml-1">
                        EST
                    </span>
                    {isIntraday && baseDateET && (
                        <span className="text-[10px] text-slate-600 font-normal ml-1">
                            • {baseDateET.split(',')[0]}
                        </span>
                    )}
                </CardTitle>

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
            </CardHeader>
            <CardContent className="pt-6 flex-1 flex flex-col min-h-0">
                {/* [P0-2] Key-based remount for stability */}
                <div ref={chartContainerRef} key={`${ticker}-${range}`} className={`flex-1 w-full flex flex-col min-w-[200px] min-h-[200px] relative transition-opacity duration-500 ${renderSettled ? 'opacity-100' : 'opacity-0'}`}>
                    {mounted && dataReady && processedData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="99%" height="100%" minWidth={200} minHeight={200}>
                                <LineChart data={processedData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="2 2" vertical={true} horizontal={true} stroke={chartConfig.gridColor} />
                                    <XAxis
                                        dataKey="xValue"
                                        domain={xDomain}
                                        type="number"
                                        scale={isIntraday ? "linear" : "time"}
                                        tickFormatter={xAxisTickFormatter}
                                        ticks={getCustomTicks()}
                                        stroke={chartConfig.textColor}
                                        fontSize={12}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={30}
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
                                    <Tooltip
                                        cursor={{ stroke: chartConfig.crosshair, strokeWidth: 1, strokeDasharray: '4 4' }}
                                        labelFormatter={(xValue) => {
                                            if (isIntraday) {
                                                return formatEtMinute(xValue as number);
                                            }
                                            return new Date(xValue).toLocaleString("en-US", {
                                                timeZone: "America/New_York",
                                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
                                            }) + " ET";
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
                                        formatter={(value: any) => [`${(Number(value) || 0).toFixed(2)}`, "Close"]}
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
                                    {/* ═══ LAYER 3: Gradient + Price Line ═══ */}
                                    <defs>
                                        {(() => {
                                            const xMin = 240;
                                            const totalRange = xDataMax - xMin || 1;
                                            const preEndOffset = Math.max(0, Math.min(1, (SESSION_PRE_END - xMin) / totalRange));
                                            const postStartOffset = xDataMax > SESSION_REG_END
                                                ? Math.max(0, Math.min(1, (SESSION_REG_END - xMin) / totalRange))
                                                : 1;
                                            return (
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
                                            );
                                        })()}
                                    </defs>
                                    <Line
                                        type="monotone"
                                        dataKey="close"
                                        stroke={isIntraday ? "url(#chartGradient)" : chartConfig.lineColor}
                                        strokeWidth={1.5}
                                        dot={false}
                                        activeDot={{ r: 4, fill: "#fff", stroke: chartConfig.background, strokeWidth: 2 }}
                                        isAnimationActive={false}
                                        connectNulls={true}
                                    />
                                    {/* ═══ prevClose label (left side) ═══ */}
                                    {isIntraday && prevClose !== undefined && (
                                        <ReferenceLine
                                            y={prevClose}
                                            stroke="transparent"
                                            strokeWidth={0}
                                            ifOverflow="extendDomain"
                                        >
                                            <Label
                                                position="left"
                                                offset={5}
                                                content={({ viewBox }: any) => {
                                                    const { x, y, width: vw } = viewBox || {};
                                                    if (x === undefined || y === undefined) return null;
                                                    const rightX = vw ? x + vw : x;
                                                    return (
                                                        <g data-price-badge="prevclose-left">
                                                            <rect x={x - 57} y={y - 10} width={54} height={20} rx={4} fill="#3b82f6" />
                                                            <text x={x - 30} y={y + 4} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
                                                                {prevClose.toFixed(2)}
                                                            </text>
                                                            <rect x={rightX + 5} y={y - 10} width={54} height={20} rx={4} fill="#3b82f6" />
                                                            <text x={rightX + 32} y={y + 4} textAnchor="middle" fill="#fff" fontSize={12} fontWeight="bold">
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
                                                        const { x, y } = viewBox || {};
                                                        if (x === undefined || y === undefined) return null;
                                                        return (
                                                            <g data-price-badge="current-right">
                                                                <rect
                                                                    x={x + 5}
                                                                    y={y - 10}
                                                                    width={54}
                                                                    height={20}
                                                                    rx={4}
                                                                    fill={bgColor}
                                                                />
                                                                <text
                                                                    x={x + 32}
                                                                    y={y + 4}
                                                                    textAnchor="middle"
                                                                    fill="#ffffff"
                                                                    fontSize={12}
                                                                    fontWeight="bold"
                                                                >
                                                                    {currentPrice.toFixed(2)}
                                                                </text>
                                                            </g>
                                                        );
                                                    }}
                                                />
                                            </ReferenceLine>
                                        );
                                    })()}
                                </LineChart>
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
