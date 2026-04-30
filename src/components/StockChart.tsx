
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from 'next-intl';
import { createChart, IChartApi, ISeriesApi, LineStyle, ColorType, CrosshairMode, LineType, UTCTimestamp } from "lightweight-charts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, BarChart2, TrendingUp } from "lucide-react";
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
    currentPrice?: number;
    rsi?: number;
    return3d?: number;
    alphaLevels?: AlphaLevels;
    session?: string;
    dayHigh?: number;
    dayLow?: number;
    hideHeaderExtras?: boolean;
    vwap?: number;
    gammaFlipLevel?: number;
    nbbo?: { bid: number; ask: number; bidSize: number; askSize: number } | null;
}

// ── ET time helpers ──
const formatEtMinute = (etMinute: number): string => {
    const hours = Math.floor(etMinute / 60);
    const mins = etMinute % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} ET`;
};

const SESSION_PRE_END = 570;  // 09:30
const SESSION_REG_END = 960;  // 16:00

// Convert data point to UTCTimestamp for lightweight-charts
function toTimestamp(item: any, isIntraday: boolean): UTCTimestamp {
    if (isIntraday && item.etMinute !== undefined) {
        // For intraday: use today's date + etMinute as seconds offset from midnight
        // lightweight-charts needs UTC timestamps
        const now = new Date();
        const etStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
        const baseDate = new Date(etStr + ' 00:00:00');
        return (Math.floor(baseDate.getTime() / 1000) + item.etMinute * 60) as UTCTimestamp;
    }
    if (item.date) {
        return (Math.floor(new Date(item.date).getTime() / 1000)) as UTCTimestamp;
    }
    if (item.t) {
        return (item.t / 1000) as UTCTimestamp;
    }
    return (Math.floor(Date.now() / 1000)) as UTCTimestamp;
}

export function StockChart({ data, color = "#2563eb", ticker, initialRange = "1d", prevClose, currentPrice, rsi, return3d, alphaLevels, session, dayHigh, dayLow, hideHeaderExtras, vwap, gammaFlipLevel, nbbo }: StockChartProps & { initialRange?: string }) {
    const td = useTranslations('dashboard');
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const mainSeriesRef = useRef<any>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const sma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const sma200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const priceLinesRef = useRef<any[]>([]);

    const [range, setRange] = useState(initialRange);
    const [loading, setLoading] = useState(!data || data.length === 0);
    const [chartData, setChartData] = useState(data);
    const [showSMA, setShowSMA] = useState(false);
    const [chartType, setChartType] = useState<'area' | 'candle'>('area');
    const [baseDateET, setBaseDateET] = useState<string>("");

    const isIntraday = range === "1d";
    const prevTickerRef = useRef(ticker);

    // ── Sync props data ──
    useEffect(() => {
        if (prevTickerRef.current !== ticker) {
            setChartData([]);
            setLoading(true);
            prevTickerRef.current = ticker;
        }
        if (data && data.length > 0) {
            setChartData(data);
            setLoading(false);
        }
        setRange(initialRange);
    }, [data, ticker, initialRange]);

    // ── Fetch data when needed (only when parent is NOT feeding data) ──
    useEffect(() => {
        // [FIX V75] If parent provided FULL data (>= 5 points), skip internal fetch.
        // But if SSR returned SPARSE data (< 5 points, e.g. synthetic anchor due to Polygon delay),
        // we MUST actively recover by polling our Smart Cache API until Polygon has data.
        if (data && data.length >= 5) return;

        let pollInterval: NodeJS.Timeout | null = null;

        const fetchData = async () => {
            const ssrHasCompleteData = chartData && chartData.length >= 5;
            if (range === '1d' && !ssrHasCompleteData) {
                // Only show loading UI if we have absolutely nothing.
                if (!chartData || chartData.length === 0) setLoading(true);
                try {
                    const t = Date.now();
                    const res = await fetch(`/api/chart?symbol=${ticker}&range=1d&t=${t}`, { cache: 'no-store' });
                    if (res.ok) {
                        const json = await res.json();
                        const newData = Array.isArray(json) ? json : (json.data || []);
                        if (newData.length > 0) {
                            setChartData(newData);
                            if (json.meta?.sessionMaskDebug?.baseDateET) {
                                setBaseDateET(json.meta.sessionMaskDebug.baseDateET);
                            }
                            // [RECOVERY SUCCESS] If we finally got rich data (>= 5 points), stop polling!
                            if (newData.length >= 5 && pollInterval) {
                                clearInterval(pollInterval);
                                pollInterval = null;
                            }
                        }
                    }
                } catch (e) { console.error('[StockChart] Fetch error:', e); }
                setLoading(false);
            }
        };

        // 1. Fetch immediately
        fetchData();
        
        // 2. Poll every 15s to recover from sparse/empty data
        if (range === '1d') {
            pollInterval = setInterval(fetchData, 15000);
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [ticker, range, data]);

    // ── Range change handler ──
    const handleRangeChange = useCallback(async (value: string) => {
        setRange(value);
        setLoading(true);
        try {
            const t = Date.now();
            const res = await fetch(`/api/chart?symbol=${ticker}&range=${value}&t=${t}`, { cache: 'no-store' });
            if (res.ok) {
                const json = await res.json();
                const newData = Array.isArray(json) ? json : (json.data || []);
                setChartData(newData);
                if (json.meta?.sessionMaskDebug?.baseDateET) {
                    setBaseDateET(json.meta.sessionMaskDebug.baseDateET);
                }
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    }, [ticker]);

    // ── Process chart data ──
    const processedData = (chartData || [])
        .map((item: any) => {
            if (isIntraday) {
                let minute = item.etMinute;
                if (minute === undefined && item.date) {
                    try {
                        const d = new Date(item.date);
                        const etTime = d.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: '2-digit', minute: '2-digit' });
                        const [h, m] = etTime.split(':').map(Number);
                        if (!isNaN(h) && !isNaN(m)) minute = h * 60 + m;
                    } catch { }
                }
                return { ...item, etMinute: minute };
            }
            return item;
        })
        .filter((item: any) => item.close !== null && item.close > 0 && (!isIntraday || item.etMinute !== undefined))
        .sort((a: any, b: any) => {
            if (isIntraday) return (a.etMinute || 0) - (b.etMinute || 0);
            const da = a.date || (a.t ? new Date(a.t).toISOString() : '');
            const db = b.date || (b.t ? new Date(b.t).toISOString() : '');
            return da.localeCompare(db);
        })
        .reduce((acc: any[], item: any) => {
            if (isIntraday) {
                const lastItem = acc[acc.length - 1];
                if (lastItem && lastItem.etMinute === item.etMinute) {
                    acc[acc.length - 1] = item;
                } else {
                    acc.push(item);
                }
            } else {
                acc.push(item);
            }
            return acc;
        }, []);

    // Append live price
    if (isIntraday && currentPrice && currentPrice > 0 && processedData.length > 0) {
        const now = new Date();
        const etTime = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: '2-digit', minute: '2-digit' });
        const [h, m] = etTime.split(':').map(Number);
        if (!isNaN(h) && !isNaN(m)) {
            const currentEtMinute = h * 60 + m;
            if (currentEtMinute >= 240 && currentEtMinute <= 1199) {
                const lastPoint = processedData[processedData.length - 1];
                if (currentEtMinute >= lastPoint.etMinute) {
                    if (currentEtMinute === lastPoint.etMinute) {
                        lastPoint.close = currentPrice;
                    } else {
                        processedData.push({
                            close: currentPrice,
                            open: currentPrice,
                            high: currentPrice,
                            low: currentPrice,
                            etMinute: currentEtMinute,
                            session: currentEtMinute < 570 ? 'PRE' : currentEtMinute >= 960 ? 'POST' : 'REG',
                            volume: 0,
                        });
                    }
                }
            }
        }
    }

    // ── Aggregate intraday 1-min data into 5-min OHLC bars for candle mode ──
    const CANDLE_INTERVAL = 5; // minutes
    const candleData = (isIntraday && chartType === 'candle' && processedData.length > 100)
        ? processedData.reduce((acc: any[], item: any) => {
            const bucket = Math.floor((item.etMinute || 0) / CANDLE_INTERVAL) * CANDLE_INTERVAL;
            const last = acc[acc.length - 1];
            if (last && last.etMinute === bucket) {
                last.high = Math.max(last.high, item.high ?? item.close);
                last.low = Math.min(last.low, item.low ?? item.close);
                last.close = item.close;
                last.volume = (last.volume || 0) + (item.volume || 0);
            } else {
                acc.push({
                    ...item,
                    etMinute: bucket,
                    open: item.open ?? item.close,
                    high: item.high ?? item.close,
                    low: item.low ?? item.close,
                    close: item.close,
                    volume: item.volume || 0,
                });
            }
            return acc;
        }, [])
        : processedData;

    // Use candleData for rendering (aggregated for candle mode, raw for area)
    const renderData = candleData;

    // ── SMA calculation ──
    const computeSMA = (closes: number[], period: number): (number | null)[] => {
        return closes.map((_, i) => {
            if (i < period - 1) return null;
            const slice = closes.slice(i - period + 1, i + 1);
            return slice.reduce((a, b) => a + b, 0) / period;
        });
    };

    // ── Price stats ──
    const validPrices = processedData.filter((d: any) => d.close != null).map((d: any) => d.close);
    if (currentPrice && validPrices.length > 0) validPrices.push(currentPrice);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : 0;

    // ═══════════════════════════════════════
    // CHART CREATION & DATA UPDATE
    // ═══════════════════════════════════════
    useEffect(() => {
        if (!chartContainerRef.current || processedData.length === 0) return;

        // Cleanup previous chart
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
            mainSeriesRef.current = null;
            volumeSeriesRef.current = null;
            sma50SeriesRef.current = null;
            sma200SeriesRef.current = null;
            priceLinesRef.current = [];
        }

        // Create chart
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#0b1219' },
                textColor: '#94a3b8',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: 12,
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: '#1e293b', style: LineStyle.Dashed },
                horzLines: { color: '#1e293b', style: LineStyle.Dashed },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: '#f8fafc',
                    width: 1,
                    style: LineStyle.Dashed,
                    labelBackgroundColor: '#334155',
                },
                horzLine: {
                    color: '#f8fafc',
                    width: 1,
                    style: LineStyle.Dashed,
                    labelBackgroundColor: '#334155',
                },
            },
            rightPriceScale: {
                borderColor: '#1e293b',
                scaleMargins: { top: 0.05, bottom: 0.15 },
            },
            timeScale: {
                borderColor: '#1e293b',
                timeVisible: isIntraday,
                secondsVisible: false,
                rightOffset: 5,
                barSpacing: (isIntraday && chartType === 'candle') ? 8 : isIntraday ? 3 : 6,
            },
            watermark: { visible: false },
            handleScroll: { mouseWheel: true, pressedMouseMove: true },
            handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
        });

        chartRef.current = chart;

        // ── Main series (Area or Candlestick) ──
        let mainSeries: any;
        if (chartType === 'candle' && renderData.some((d: any) => d.open !== undefined)) {
            mainSeries = chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderUpColor: '#26a69a',
                borderDownColor: '#ef5350',
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
                priceLineVisible: false,
                lastValueVisible: false,
            });
        } else {
            mainSeries = chart.addAreaSeries({
                lineColor: '#e2e8f0',
                lineWidth: 2,
                lineType: LineType.Curved,
                topColor: 'rgba(96, 165, 250, 0.25)',
                bottomColor: 'rgba(30, 58, 95, 0.02)',
                crosshairMarkerBackgroundColor: '#fff',
                crosshairMarkerBorderColor: '#0b1219',
                crosshairMarkerRadius: 4,
                priceLineVisible: false,
                lastValueVisible: false,
            });
        }
        mainSeriesRef.current = mainSeries;

        // ── Volume histogram ──
        const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });
        volumeSeriesRef.current = volumeSeries;

        // ── Prepare data for lightweight-charts ──
        const seriesData: any[] = [];
        const volumeData: any[] = [];

        renderData.forEach((item: any, idx: number) => {
            const time = toTimestamp(item, isIntraday);
            
            if (chartType === 'candle' && item.open !== undefined) {
                // Candlestick format
                seriesData.push({
                    time,
                    open: item.open,
                    high: item.high || Math.max(item.open, item.close),
                    low: item.low || Math.min(item.open, item.close),
                    close: item.close,
                });
            } else {
                // Area/Line format with session colors
                let lineColor = '#e2e8f0';
                if (isIntraday) {
                    const etMin = item.etMinute || 0;
                    if (etMin < SESSION_PRE_END) lineColor = '#fbbf24';
                    else if (etMin >= SESSION_REG_END) lineColor = '#60a5fa';
                }
                seriesData.push({
                    time,
                    value: item.close,
                    lineColor,
                    topColor: lineColor === '#fbbf24' 
                        ? 'rgba(251, 191, 36, 0.15)' 
                        : lineColor === '#60a5fa'
                            ? 'rgba(96, 165, 250, 0.15)'
                            : 'rgba(96, 165, 250, 0.25)',
                    bottomColor: 'rgba(30, 58, 95, 0.02)',
                });
            }

            // Volume
            if (item.volume && item.volume > 0) {
                const isUp = item.close >= (item.open || item.close);
                volumeData.push({
                    time,
                    value: item.volume,
                    color: isUp ? 'rgba(52, 211, 153, 0.35)' : 'rgba(251, 113, 133, 0.35)',
                });
            }
        });

        // Deduplicate timestamps (lightweight-charts requires strictly increasing)
        const seenTimes = new Set<number>();
        const uniqueSeriesData = seriesData.filter(d => {
            if (seenTimes.has(d.time)) return false;
            seenTimes.add(d.time);
            return true;
        });
        const seenVolTimes = new Set<number>();
        const uniqueVolData = volumeData.filter(d => {
            if (seenVolTimes.has(d.time)) return false;
            seenVolTimes.add(d.time);
            return true;
        });

        mainSeries.setData(uniqueSeriesData);
        if (uniqueVolData.length > 0) volumeSeries.setData(uniqueVolData);


        // [NOTE] Price lines (prevClose, VWAP, GF, alpha levels, currentPrice) are
        // handled by a separate incremental useEffect below to avoid full chart recreation.

        // ── SMA Lines ──
        if (!isIntraday && showSMA && processedData.length > 0) {
            const closes = processedData.map((d: any) => d.close);
            const sma50Values = computeSMA(closes, 50);
            const sma200Values = computeSMA(closes, 200);

            // SMA 50
            const sma50Data = uniqueSeriesData
                .map((d, i) => ({ time: d.time, value: sma50Values[i] }))
                .filter(d => d.value !== null) as { time: UTCTimestamp; value: number }[];
            
            if (sma50Data.length > 0) {
                const sma50Series = chart.addLineSeries({
                    color: '#22d3ee',
                    lineWidth: 1,
                    lineStyle: LineStyle.Dashed,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                    lastValueVisible: false,
                });
                sma50Series.setData(sma50Data);
                sma50SeriesRef.current = sma50Series;
            }

            // SMA 200
            const sma200Data = uniqueSeriesData
                .map((d, i) => ({ time: d.time, value: sma200Values[i] }))
                .filter(d => d.value !== null) as { time: UTCTimestamp; value: number }[];

            if (sma200Data.length > 0) {
                const sma200Series = chart.addLineSeries({
                    color: '#f97316',
                    lineWidth: 1,
                    lineStyle: LineStyle.Dashed,
                    priceLineVisible: false,
                    crosshairMarkerVisible: false,
                    lastValueVisible: false,
                });
                sma200Series.setData(sma200Data);
                sma200SeriesRef.current = sma200Series;
            }
        }

        // Fit content
        chart.timeScale().fitContent();

        // ── Resize observer ──
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    chart.applyOptions({ width, height });
                }
            }
        });
        resizeObserver.observe(chartContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
            chartRef.current = null;
            mainSeriesRef.current = null;
            volumeSeriesRef.current = null;
            sma50SeriesRef.current = null;
            sma200SeriesRef.current = null;
            priceLinesRef.current = [];
        };
    }, [renderData.length > 0 ? `${ticker}-${range}-${renderData.length}-${showSMA}-${chartType}` : 'empty']);

    // ═══════════════════════════════════════
    // INCREMENTAL PRICE LINE UPDATES
    // (Avoids full chart recreation when overlay values change)
    // ═══════════════════════════════════════
    useEffect(() => {
        const chart = chartRef.current;
        const mainSeries = mainSeriesRef.current;
        if (!chart || !mainSeries) return;

        // Remove old price lines
        priceLinesRef.current.forEach(pl => {
            try { mainSeries.removePriceLine(pl); } catch { /* already removed */ }
        });
        priceLinesRef.current = [];

        const addPriceLineIncr = (price: number, color: string, title: string, lineStyle: LineStyle = LineStyle.Dashed, lineWidth: 1 | 2 | 3 | 4 = 1) => {
            const pl = mainSeries.createPriceLine({
                price,
                color,
                lineWidth,
                lineStyle,
                axisLabelVisible: true,
                title,
            });
            priceLinesRef.current.push(pl);
        };

        // PrevClose
        if (isIntraday && prevClose !== undefined && prevClose > 0) {
            addPriceLineIncr(prevClose, '#3b82f6', 'PREV', LineStyle.Dashed, 1);
        }
        // VWAP
        if (isIntraday && vwap !== undefined && vwap > 0) {
            const pl = mainSeries.createPriceLine({
                price: vwap,
                color: '#22c55e',
                lineWidth: 1 as 1 | 2 | 3 | 4,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: 'VWAP',
                axisLabelColor: '#22c55e',
                axisLabelTextColor: '#fff',
            });
            priceLinesRef.current.push(pl);
        }
        // Gamma Flip
        if (isIntraday && gammaFlipLevel !== undefined && gammaFlipLevel > 0) {
            if (gammaFlipLevel >= minPrice * 0.95 && gammaFlipLevel <= maxPrice * 1.05) {
                addPriceLineIncr(gammaFlipLevel, '#f59e0b', 'GF', LineStyle.Dashed, 1);
            }
        }
        // Alpha Levels
        const priceLow = minPrice * 0.85;
        const priceHigh = maxPrice * 1.15;
        if (alphaLevels?.callWall && alphaLevels.callWall >= priceLow && alphaLevels.callWall <= priceHigh) {
            addPriceLineIncr(alphaLevels.callWall, '#22d3ee', 'CALL', LineStyle.Dashed, 1);
        }
        if (alphaLevels?.putFloor && alphaLevels.putFloor >= priceLow && alphaLevels.putFloor <= priceHigh) {
            addPriceLineIncr(alphaLevels.putFloor, '#f43f5e', 'PUT', LineStyle.Dashed, 1);
        }
        if (alphaLevels?.maxPain && alphaLevels.maxPain >= priceLow && alphaLevels.maxPain <= priceHigh) {
            addPriceLineIncr(alphaLevels.maxPain, '#a855f7', 'MAX PAIN', LineStyle.Dashed, 1);
        }
        // Current price
        if (currentPrice !== undefined && currentPrice > 0) {
            let priceColor = '#e2e8f0';
            if (isIntraday) {
                const now = new Date();
                const etTime = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false, hour: '2-digit', minute: '2-digit' });
                const [h2] = etTime.split(':').map(Number);
                const curMin = h2 * 60 + parseInt(etTime.split(':')[1]);
                if (curMin < SESSION_PRE_END) priceColor = '#fbbf24';
                else if (curMin >= SESSION_REG_END) priceColor = '#60a5fa';
            }
            addPriceLineIncr(currentPrice, priceColor, '', LineStyle.Solid, 2);
        }
    }, [prevClose, vwap, gammaFlipLevel, currentPrice,
        alphaLevels?.callWall, alphaLevels?.putFloor, alphaLevels?.maxPain]);

    // ═══════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════

    // Loading & Empty State
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
                            {[
                                { v: "1d", l: "1D" },
                                { v: "1w", l: "5D" },
                                { v: "1mo", l: "1M" },
                                { v: "6m", l: "6M" },
                                { v: "1y", l: "1Y" },
                                { v: "max", l: "All" }
                            ].map((r) => (
                                <TabsTrigger key={r.v} value={r.v} className="h-6 px-3 text-xs font-medium rounded-sm text-slate-400 data-[state=active]:bg-slate-700 data-[state=active]:text-white transition-all">
                                    {r.l}
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

    return (
        <Card className="shadow-none border border-slate-800 bg-[#0b1219] rounded-md overflow-hidden relative h-full flex flex-col !py-0 !gap-0">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 !py-1.5 !px-4 !pb-1.5 !gap-0 border-b border-slate-800/80 bg-[#0b1219]">
                <div className="flex items-center gap-2 min-w-0">
                    {/* Title pill */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/50">
                        <span className="w-1 h-3 bg-indigo-500 rounded-full" />
                        <span className="text-[12px] font-bold text-slate-200 tracking-wide uppercase">Price</span>
                    </div>
                    {/* Timezone + Date */}
                    <span className="text-[12px] text-slate-300 font-medium tracking-wider uppercase">ET</span>
                    {isIntraday && baseDateET && (
                        <span className="text-[12px] text-slate-300 font-mono">{baseDateET.split(',')[0]}</span>
                    )}
                    {/* Session Badge */}
                    {!hideHeaderExtras && session && session.length > 0 && (
                        <span className={`text-[12px] font-extrabold px-1.5 py-[1px] rounded-sm tracking-widest uppercase ${
                            session === 'REG' ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/30'
                            : session === 'PRE' ? 'text-amber-300 bg-amber-500/20 border border-amber-500/30'
                                : session === 'POST' ? 'text-blue-300 bg-blue-500/20 border border-blue-500/30'
                                    : 'text-slate-300 bg-slate-500/20 border border-slate-500/30'
                        }`}>
                            {session === 'REG' ? 'LIVE' : session}
                        </span>
                    )}
                    {/* Separator */}
                    {!hideHeaderExtras && isIntraday && <span className="w-px h-4 bg-slate-700/60" />}
                    {/* Day Range — premium compact */}
                    {!hideHeaderExtras && isIntraday && (() => {
                        const dh = dayHigh ?? maxPrice;
                        const dl = dayLow ?? minPrice;
                        if (dh <= 0 || dl <= 0) return null;
                        const spread = dh - dl;
                        const spreadPct = dl > 0 ? ((spread / dl) * 100).toFixed(1) : '0.0';
                        return (
                            <div className="hidden md:flex items-center gap-1.5 text-[13px] font-mono tabular-nums">
                                <span className="text-[12px] text-slate-300 font-sans font-bold tracking-wider uppercase">H/L</span>
                                <span className="text-emerald-400 font-semibold">{dh.toFixed(2)}</span>
                                <span className="text-slate-300">/</span>
                                <span className="text-rose-400 font-semibold">{dl.toFixed(2)}</span>
                                <span className="text-slate-300 text-[12px] ml-0.5">({spreadPct}%)</span>
                            </div>
                        );
                    })()}
                </div>

                <div className="flex items-center gap-2">
                    {/* Candle/Area Toggle */}
                    <button
                        onClick={() => setChartType(prev => prev === 'area' ? 'candle' : 'area')}
                        className={`h-8 px-2.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all border ${chartType === 'candle'
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300 hover:border-slate-600'
                            }`}
                        title={chartType === 'candle' ? 'Switch to Area Chart' : 'Switch to Candle Chart'}
                    >
                        {chartType === 'candle' ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="5" y="4" width="4" height="16" rx="1" />
                                <rect x="15" y="8" width="4" height="8" rx="1" />
                                <line x1="7" y1="2" x2="7" y2="4" />
                                <line x1="7" y1="20" x2="7" y2="22" />
                                <line x1="17" y1="6" x2="17" y2="8" />
                                <line x1="17" y1="16" x2="17" y2="18" />
                            </svg>
                        ) : (
                            <TrendingUp className="w-3.5 h-3.5" />
                        )}
                    </button>
                    {/* SMA Toggle */}
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
            <CardContent className="pt-2 flex-1 flex flex-col min-h-0 !px-0 !pb-0">
                {/* NBBO Overlay */}
                {isIntraday && nbbo && nbbo.bid > 0 && nbbo.ask > 0 && (() => {
                    const spreadPct = ((nbbo.ask - nbbo.bid) / ((nbbo.bid + nbbo.ask) / 2) * 100);
                    const spreadColor = spreadPct < 0.05 ? 'text-emerald-400' : spreadPct < 0.15 ? 'text-amber-400' : 'text-rose-400';
                    const spreadBorder = spreadPct < 0.05 ? 'border-emerald-500/30' : spreadPct < 0.15 ? 'border-amber-500/30' : 'border-rose-500/30';
                    return (
                        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900/70 backdrop-blur-sm border border-white/10">
                            <span className="text-[12px] font-bold text-slate-300 font-jakarta">
                                <CardTooltip tooltip={{ ko: 'NBBO — 미국 전 거래소 통합 최우선 매수/매도 호가. Bid(최우선 매수가)와 Ask(최우선 매도가) 간 Spread가 유동성 지표로 사용됩니다.', en: 'NBBO — Consolidated best bid/offer across all U.S. exchanges. The bid-ask spread serves as a real-time liquidity gauge.', ja: 'NBBO — 全米取引所統合ベスト・ビッド/オファー。' }}>NBBO</CardTooltip>
                            </span>
                            <span className="text-slate-600">|</span>
                            <span className="text-[12px] font-bold text-emerald-400 tabular-nums font-jakarta">${nbbo.bid.toFixed(2)}</span>
                            <span className="text-[12px] text-slate-300 tabular-nums font-jakarta">×{nbbo.bidSize}</span>
                            <span className={`text-[12px] font-bold ${spreadColor} px-1.5 py-px rounded border ${spreadBorder} bg-slate-950/50 tabular-nums font-jakarta`}>
                                Spread {spreadPct.toFixed(3)}%
                            </span>
                            <span className="text-[12px] font-bold text-rose-400 tabular-nums font-jakarta">${nbbo.ask.toFixed(2)}</span>
                            <span className="text-[12px] text-slate-300 tabular-nums font-jakarta">×{nbbo.askSize}</span>
                        </div>
                    );
                })()}
                {/* Chart Container — lightweight-charts renders here */}
                <div
                    ref={chartContainerRef}
                    className="flex-1 w-full min-h-[300px]"
                    style={{ position: 'relative' }}
                />
            </CardContent>
        </Card>
    );
}
