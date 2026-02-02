
"use client";

import { useState, useEffect, useRef } from "react";
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
    Customized
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
    // [S-67] Fix: Use props data immediately if available
    const [chartData, setChartData] = useState(data);
    // [S-76] Fix: 1D always needs client fetch for etMinute/session fields, so start loading=true
    // Other ranges can use SSR data directly
    const [loading, setLoading] = useState(initialRange === '1d' ? true : (!data || data.length === 0));
    const [range, setRange] = useState(initialRange);
    const [baseDateET, setBaseDateET] = useState<string>("");
    // [S-67] Fix: Mark ready immediately if props data is valid (but not for 1D which needs client data)
    const [dataReady, setDataReady] = useState(initialRange !== '1d' && data && data.length > 0);

    // [S-67] Fix: Sync props data for ALL ranges (including 1D)
    useEffect(() => {
        if (data && data.length > 0) {
            setChartData(data);
            setDataReady(true);
            setLoading(false);
        }
        setRange(initialRange);
    }, [data, ticker, initialRange]);

    // [S-76] Note: SSR data (props.data) only contains {date, close} but 1D chart requires
    // etMinute and session fields for proper X-axis positioning. Client fetch is REQUIRED for 1D.
    // This is intentional design, not a bug.

    // [S-67] Fix: Only fetch if range is 1D (to get etMinute/session data from chart API)
    useEffect(() => {
        const fetchInitialData = async () => {
            // 1D always requires client fetch for session masking data
            if (range === '1d') {
                console.log('[StockChart] Fetching 1D data - required for etMinute/session fields');
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
    useEffect(() => {
        // Immediate mount - delay was causing initial render issues
        setMounted(true);
    }, []);

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

    // Loading & Empty State (Allow empty data if we have a currentPrice to show)
    if (!loading && (!processedData || processedData.length === 0) && !currentPrice) {
        return (
            <Card className="shadow-none border border-slate-200 bg-white rounded-md overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-100 bg-slate-50/30">
                    <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                        Price History
                    </CardTitle>
                    <Tabs defaultValue={range} onValueChange={handleRangeChange}>
                        {/* Tabs content same as before ... */}
                        <TabsList className="h-8 bg-slate-100 p-1 gap-1 rounded-lg">
                            {["1d", "1w", "1mo", "1y", "max"].map((r) => (
                                <TabsTrigger key={r} value={r} className="h-6 px-3 text-xs font-medium rounded-sm data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all">
                                    {r.toUpperCase().replace('MAX', 'ALL')}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent className="pt-6">
                    <div className="h-[360px] w-full flex flex-col items-center justify-center text-slate-400">
                        <div className="p-4 rounded-full bg-red-100 mb-3">
                            <AlertCircle className="h-8 w-8 text-red-500" />
                        </div>
                        <p className="font-semibold text-red-600">No Data Received from Server</p>
                        <p className="text-xs mt-1 text-slate-500">Market might be closed or API is unavailable.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Determine Min/Max for Y-Axis (Include currentPrice in range)
    const validPrices = processedData.filter((d: any) => d.close != null).map((d: any) => d.close);
    if (currentPrice) validPrices.push(currentPrice); // Ensure live price is in domain

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
        <Card className="shadow-none border border-slate-800 bg-[#0b1219] rounded-md overflow-hidden relative">
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
                {/* RSI & 3D Return Indicators */}
                <div className="flex items-center gap-3 text-[11px]">
                    {rsi !== undefined && (
                        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded border border-white/5">
                            <span className="text-slate-500 font-bold">RSI(14)</span>
                            <span className={`font-black ${rsi > 70 ? 'text-rose-400' : rsi < 30 ? 'text-emerald-400' : 'text-white'}`}>
                                {rsi.toFixed(1)}
                            </span>
                            <span className={`text-[10px] ${rsi > 70 ? 'text-rose-500' : rsi < 30 ? 'text-emerald-500' : 'text-slate-500'}`}>
                                {rsi > 70 ? '과매수' : rsi < 30 ? '과매도' : '중립'}
                            </span>
                        </div>
                    )}
                    {return3d !== undefined && (
                        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded border border-white/5">
                            <span className="text-slate-500 font-bold">3D Return</span>
                            <span className={`font-black ${return3d >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {return3d > 0 ? '+' : ''}{return3d.toFixed(2)}%
                            </span>
                        </div>
                    )}
                </div>
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
            <CardContent className="pt-6">
                {/* [P0-2] Key-based remount for stability */}
                <div key={`${ticker}-${range}`} className="h-[360px] w-full flex flex-col min-w-0 min-h-0 relative">
                    {mounted && dataReady && processedData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="99%" height="100%">
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
                                        fontSize={11}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        orientation="right"
                                        domain={[minPrice - padding, maxPrice + padding]}
                                        stroke={chartConfig.textColor}
                                        fontSize={11}
                                        fontWeight={500}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value.toFixed(2)}`}
                                        width={50}
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
                                    {isIntraday && prevClose !== undefined && (
                                        <ReferenceLine
                                            y={prevClose}
                                            stroke="#ffffff"
                                            strokeDasharray="4 2"
                                            strokeWidth={1}
                                            ifOverflow="extendDomain"
                                        >
                                            <Label
                                                value={prevClose.toFixed(2)}
                                                position="right"
                                                fill="#ffffff"
                                                fontSize={11}
                                                fontWeight="bold"
                                                offset={5}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* [Fix] Live Price Reference for Pre/Post Market visibility */}
                                    {currentPrice !== undefined && (
                                        <ReferenceLine
                                            y={currentPrice}
                                            stroke="#10b981" // Emerald for live pulse
                                            strokeDasharray="3 3"
                                            strokeWidth={1.5}
                                            ifOverflow="extendDomain"
                                        >
                                            <Label
                                                value={currentPrice.toFixed(2)}
                                                position="right"
                                                fill="#10b981"
                                                fontSize={11}
                                                fontWeight="bold"
                                                offset={5}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* [Alpha Levels] Optional overlays - scale maintained with ifOverflow="hidden" */}
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
                                                fontSize={9}
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
                                                fontSize={9}
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
                                                value={`MAX PAIN $${alphaLevels.maxPain}`}
                                                position="right"
                                                fill="#a855f7"
                                                fontSize={10}
                                                fontWeight="bold"
                                                offset={5}
                                            />
                                        </ReferenceLine>
                                    )}
                                    {/* [S-65] Gradient based on ACTUAL data extent, not full domain */}
                                    <defs>
                                        {(() => {
                                            const xMin = 240; // Fixed Pre-market start
                                            const totalRange = xDataMax - xMin || 1;

                                            // Offsets based on actual data range
                                            const preEndOffset = Math.max(0, Math.min(1, (SESSION_PRE_END - xMin) / totalRange));
                                            // Only show Post color if data extends past REG_END (16:00)
                                            const postStartOffset = xDataMax > SESSION_REG_END
                                                ? Math.max(0, Math.min(1, (SESSION_REG_END - xMin) / totalRange))
                                                : 1; // No Post color if data hasn't reached 16:00

                                            return (
                                                <linearGradient id="chartGradient" x1="0" y1="0" x2="1" y2="0">
                                                    {/* Pre Market: Yellow */}
                                                    <stop offset={0} stopColor={chartConfig.preMarketColor} />
                                                    <stop offset={preEndOffset} stopColor={chartConfig.preMarketColor} />

                                                    {/* Regular Market: White/Silver */}
                                                    <stop offset={preEndOffset} stopColor={chartConfig.lineColor} />
                                                    <stop offset={postStartOffset} stopColor={chartConfig.lineColor} />

                                                    {/* Post Market: Blue (only if data > 16:00) */}
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

                                    {/* Single Continuous Line */}
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
                                </LineChart>
                            </ResponsiveContainer>
                            {/* Previous Close Badge - DOM overlay outside Recharts */}
                            {isIntraday && prevClose !== undefined && (() => {
                                const domainMin = minPrice - padding;
                                const domainMax = maxPrice + padding;
                                // X-axis takes approximately 25px at bottom, need to scale percentage to plotting area only
                                const xAxisHeight = 25; // approximate X-axis height in pixels
                                const containerHeight = 360; // matches h-[360px]
                                const plotAreaHeight = containerHeight - xAxisHeight;
                                const badgeYRatio = (domainMax - prevClose) / (domainMax - domainMin);
                                const badgeYPixels = badgeYRatio * plotAreaHeight; // position within plot area

                                return (
                                    <div
                                        className="absolute right-0 pointer-events-none z-10 flex justify-end"
                                        style={{
                                            top: `${badgeYPixels}px`,
                                            transform: 'translateY(-50%)' // Center vertically on the line
                                        }}
                                    >
                                        <div className="bg-blue-500 text-white text-xs font-bold px-[4px] py-[1px] rounded-[2px] shadow-sm whitespace-nowrap min-w-0 leading-none">
                                            {Number(prevClose).toFixed(2)}
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* Current Price Badge - Now rendered via ReferenceLine Label instead of DOM overlay */}
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
