
"use client";

import { useState, useEffect } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";

interface StockChartProps {
    data: { date: string; close: number }[];
    color?: string;
    ticker: string;
}

// [HOTFIX S-55] etMinute to HH:MM ET formatter
const formatEtMinute = (etMinute: number): string => {
    const hours = Math.floor(etMinute / 60);
    const mins = etMinute % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ET`;
};

export function StockChart({ data, color = "#2563eb", ticker, initialRange = "1d" }: StockChartProps & { initialRange?: string }) {
    const [chartData, setChartData] = useState(data);
    const [loading, setLoading] = useState(false);
    const [range, setRange] = useState(initialRange);
    const [baseDateET, setBaseDateET] = useState<string>("");
    // [P0-2] Simplified: track data readiness instead of mount state
    const [dataReady, setDataReady] = useState(data && data.length > 0);

    // [P0-2] Sync data and mark ready when valid data arrives
    useEffect(() => {
        if (data && data.length > 0) {
            setChartData(data);
            setDataReady(true);
        }
        setRange(initialRange);
    }, [data, ticker, initialRange]);

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
        .filter((item: any) => item.close !== null && (!isIntraday || item.xValue !== undefined) && !isNaN(item.xValue)) // [HOTFIX] Filter NaNs
        .sort((a: any, b: any) => a.xValue - b.xValue);

    // [HOTFIX S-55] Domain for 1D: etMinute range (240-1200 = 04:00-20:00)
    let xDomain: [number | string, number | string] | undefined = undefined;
    if (isIntraday && processedData.length > 0) {
        // Fixed 04:00-20:00 ET range (etMinute 240-1199)
        xDomain = [240, 1199];
    } else {
        xDomain = ["dataMin", "dataMax"];
    }

    // Loading & Empty State
    if (!loading && (!processedData || processedData.length === 0)) {
        return (
            <Card className="shadow-none border border-slate-200 bg-white rounded-xl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-100 bg-slate-50/30">
                    <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                        Price History
                    </CardTitle>
                    <Tabs defaultValue={range} onValueChange={handleRangeChange}>
                        <TabsList className="h-8 bg-slate-100 p-1 gap-1 rounded-lg">
                            {["1d", "1w", "1mo", "1y", "max"].map((r) => (
                                <TabsTrigger key={r} value={r} className="h-6 px-3 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all">
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

    const validPrices = processedData.filter((d: any) => d.close != null).map((d: any) => d.close);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;
    const padding = (maxPrice - minPrice) * 0.1;

    // [HOTFIX S-55] X-axis tick formatter based on range
    const xAxisTickFormatter = (xValue: number) => {
        if (isIntraday) {
            // xValue is etMinute, format as HH:MM ET
            return formatEtMinute(xValue);
        } else {
            // xValue is timestamp
            const date = new Date(xValue);
            return date.toLocaleDateString("en-US", {
                timeZone: "America/New_York",
                month: "numeric",
                day: "numeric"
            });
        }
    };

    // [HOTFIX S-55] Custom ticks for 1D (session boundaries)
    const getCustomTicks = () => {
        if (isIntraday) {
            // ET session markers: 04:00, 09:30, 12:00, 16:00, 20:00
            return [240, 570, 720, 960, 1140]; // 04:00, 09:30, 12:00, 16:00, 19:00
        }
        return undefined;
    };

    return (
        <Card className="shadow-none border border-slate-200 bg-white rounded-xl overflow-hidden relative">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            )}

            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-100 bg-slate-50/30">
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-primary rounded-full"></span>
                    Price History
                    {/* [HOTFIX] Show baseDateET for 1D */}
                    {isIntraday && baseDateET && (
                        <span className="text-[10px] text-slate-400 font-normal ml-2">
                            ({baseDateET} ET)
                        </span>
                    )}
                </CardTitle>
                <Tabs value={range} onValueChange={handleRangeChange}>
                    <TabsList className="h-8 bg-slate-100 p-1 gap-1 rounded-lg">
                        {["1d", "1w", "1mo", "1y", "max"].map((r) => (
                            <TabsTrigger key={r} value={r} className="h-6 px-3 text-xs font-medium rounded-md data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all">
                                {r.toUpperCase().replace('MAX', 'ALL')}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </CardHeader>
            <CardContent className="pt-6">
                {/* [P0-2] Key-based remount for stability */}
                <div key={`${ticker}-${range}`} className="h-[360px] w-full flex flex-col min-w-0 min-h-0">
                    {dataReady && processedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={processedData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="xValue"
                                    domain={xDomain}
                                    type="number"
                                    scale={isIntraday ? "linear" : "time"}
                                    tickFormatter={xAxisTickFormatter}
                                    ticks={getCustomTicks()}
                                    stroke="#94a3b8"
                                    fontSize={11}
                                    fontWeight={500}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    domain={[minPrice - padding, maxPrice + padding]}
                                    stroke="#94a3b8"
                                    fontSize={11}
                                    fontWeight={500}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                                    width={45}
                                    dx={-10}
                                />
                                <Tooltip
                                    cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
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
                                        backgroundColor: "rgba(255, 255, 255, 0.9)",
                                        backdropFilter: "blur(8px)",
                                        borderColor: "#e2e8f0",
                                        color: "#1e293b",
                                        borderRadius: "12px",
                                        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                                        padding: "12px",
                                        fontSize: "13px"
                                    }}
                                    formatter={(value: any) => [`$${(Number(value) || 0).toFixed(2)}`, "Close"]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="close"
                                    stroke={color}
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#colorPrice)"
                                    animationDuration={500}
                                    connectNulls={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-50/50">
                            <Loader2 className="h-8 w-8 animate-spin text-slate-200" />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
