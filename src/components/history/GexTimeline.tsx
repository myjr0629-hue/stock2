"use client";

/**
 * [Phase 3] GEX Timeline Chart — 30-day GEX history from DynamoDB
 * 
 * Shows: GEX value over time, gamma regime zones, key levels.
 * This is Bloomberg-tier — historical GEX tracking is typically behind
 * expensive institutional data paywalls ($300+/mo SpotGamma level).
 * 
 * Insight: Tracks dealer hedging pressure transitions.
 * - Positive→Negative = volatility expansion, downside acceleration
 * - Negative→Positive = stabilization, pin effect
 * 
 * Uses: /api/history?type=gex&ticker=NVDA&days=30
 */

import { useEffect, useState, useMemo } from "react";
import { useLocale } from "next-intl";
import { CardTooltip, COMMAND_TOOLTIPS } from '@/components/ui/CardTooltip';

interface GexDataPoint {
    timestamp: number;
    gex: number;
    flipLevel: number | null;
    callWall: number | null;
    putFloor: number | null;
    price: number;
    gammaRegime: string;
}

interface GexTimelineProps {
    ticker: string;
    days?: number;
    compact?: boolean;
    onEmpty?: () => void;
}

export function GexTimeline({ ticker, days = 30, compact = false, onEmpty }: GexTimelineProps) {
    const [data, setData] = useState<GexDataPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const locale = useLocale() as "ko" | "en" | "ja";

    useEffect(() => {
        if (!ticker) return;
        setLoading(true);
        fetch(`/api/history?type=gex&ticker=${ticker}&days=${days}`)
            .then(r => r.json())
            .then(res => {
                setData(res.data || []);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, [ticker, days]);

    // [FIX] Filter to trading hours only + aggregate to daily representative values
    // This prevents overnight/weekend stale data from dominating the chart
    const chartData = useMemo(() => {
        if (!data.length) return [];

        // Step 1: Filter to US trading hours only (Mon-Fri, 9:30-16:00 ET)
        const tradingHoursData = data.filter(d => {
            const dt = new Date(d.timestamp);
            // Convert to ET
            const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York' });
            const et = new Date(etStr);
            const day = et.getDay();
            if (day === 0 || day === 6) return false; // Weekend
            const timeMin = et.getHours() * 60 + et.getMinutes();
            return timeMin >= 570 && timeMin <= 960; // 9:30 ET to 16:00 ET
        });

        if (tradingHoursData.length === 0) return data.length > 0 ? [data[data.length - 1]] : [];

        // Step 2: Group by trading day and pick representative snapshot per day
        // Use last snapshot of each day (closing value) for clean daily chart
        const dayMap = new Map<string, GexDataPoint[]>();
        tradingHoursData.forEach(d => {
            const dt = new Date(d.timestamp);
            const etStr = dt.toLocaleString('en-US', { timeZone: 'America/New_York' });
            const et = new Date(etStr);
            const dayKey = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,'0')}-${String(et.getDate()).padStart(2,'0')}`;
            if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
            dayMap.get(dayKey)!.push(d);
        });

        // If we have <= 2 days of intraday data, show all intraday points for that period
        if (dayMap.size <= 2) return tradingHoursData;

        // Pick close (last) snapshot per day for multi-day view
        const dailyData: GexDataPoint[] = [];
        const sortedDays = [...dayMap.keys()].sort();
        for (const day of sortedDays) {
            const dayPoints = dayMap.get(day)!;
            dailyData.push(dayPoints[dayPoints.length - 1]); // Last = closest to close
        }
        return dailyData;
    }, [data]);

    // [UX] Auto-switch to Technical Levels when GEX data unavailable
    useEffect(() => {
        if (!loading && (error || data.length === 0) && onEmpty) {
            onEmpty();
        }
    }, [loading, error, data.length, onEmpty]);

    // Format GEX value — must be defined before useMemo hooks that reference it
    const formatGex = (v: number) => {
        const abs = Math.abs(v);
        if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
        if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
        return v.toFixed(0);
    };

    const stats = useMemo(() => {
        if (!chartData.length) return null;
        const gexValues = chartData.map(d => d.gex);
        const max = Math.max(...gexValues);
        const min = Math.min(...gexValues);
        const range = max - min || 1;
        const latest = chartData[chartData.length - 1];
        const prev = chartData.length > 1 ? chartData[chartData.length - 2] : null;
        const trend = prev ? (latest.gex > prev.gex ? 'rising' : 'falling') : 'stable';

        // [FIX] Count actual unique trading days, not snapshot count
        const uniqueDays = new Set(chartData.map(d => new Date(d.timestamp).toISOString().slice(0, 10)));
        const positiveDaySet = new Set(chartData.filter(d => d.gex > 0).map(d => new Date(d.timestamp).toISOString().slice(0, 10)));
        const negativeDaySet = new Set(chartData.filter(d => d.gex < 0).map(d => new Date(d.timestamp).toISOString().slice(0, 10)));
        const positiveDays = positiveDaySet.size;
        const negativeDays = negativeDaySet.size;
        const totalDays = uniqueDays.size;

        // [PREMIUM] Gamma Flip Events — detect regime transitions
        const flipEvents: { index: number; from: string; to: string; timestamp: number; price: number; flipLevel: number | null }[] = [];
        for (let i = 1; i < chartData.length; i++) {
            const prevRegime = chartData[i - 1].gammaRegime;
            const currRegime = chartData[i].gammaRegime;
            if (prevRegime !== currRegime && prevRegime && currRegime) {
                flipEvents.push({ index: i, from: prevRegime, to: currRegime, timestamp: chartData[i].timestamp, price: chartData[i].price, flipLevel: chartData[i].flipLevel });
            }
        }

        // [PREMIUM] Anomaly Detection — current GEX vs 30-day percentile
        const sorted = [...gexValues].sort((a, b) => a - b);
        const currentIdx = sorted.findIndex(v => v >= latest.gex);
        const percentile = Math.round((currentIdx / sorted.length) * 100);
        const isAnomaly = percentile >= 90 || percentile <= 10;
        const anomalyLabel = percentile >= 90 ? 'EXTREME HIGH' : percentile <= 10 ? 'EXTREME LOW' : percentile >= 75 ? 'ELEVATED' : percentile <= 25 ? 'DEPRESSED' : 'NORMAL';

        return { max, min, range, latest, trend, positiveDays, negativeDays, totalDays, flipEvents, percentile, isAnomaly, anomalyLabel };
    }, [chartData]);

    // Dynamic insight text generation (compliance-safe, observational only)
    const insightText = useMemo(() => {
        if (!stats) return '';
        const { latest, percentile, flipEvents, positiveDays, negativeDays, totalDays, trend } = stats;
        const isPositive = latest.gex >= 0;
        const regimeText = isPositive ? 'Long Gamma' : 'Short Gamma';

        // Build multi-language insight
        const insights: Record<string, string> = {
            ko: '',
            en: '',
            ja: '',
        };

        if (percentile >= 90) {
            insights.ko = `GEX ${formatGex(latest.gex)} — ${percentile}th 퍼센타일 극단값. ${regimeText} 레짐에서 딜러 헤징이 ${isPositive ? '가격 안정화' : '변동성 확대'} 방향으로 작용 중.`;
            insights.en = `GEX ${formatGex(latest.gex)} — ${percentile}th percentile extreme. Dealer hedging in ${regimeText} regime observed ${isPositive ? 'stabilizing price action' : 'amplifying directional moves'}.`;
            insights.ja = `GEX ${formatGex(latest.gex)} — ${percentile}thパーセンタイル極端値。${regimeText}レジームでディーラーヘッジが${isPositive ? '価格安定化' : 'ボラティリティ拡大'}方向に作用中。`;
        } else if (percentile <= 10) {
            insights.ko = `GEX ${formatGex(latest.gex)} — ${percentile}th 퍼센타일 극저치. ${regimeText} 레짐에서 딜러 감마 노출이 역사적 하단 수준.`;
            insights.en = `GEX ${formatGex(latest.gex)} — ${percentile}th percentile extreme low. Dealer gamma exposure at historically depressed levels in ${regimeText} regime.`;
            insights.ja = `GEX ${formatGex(latest.gex)} — ${percentile}thパーセンタイル極低値。${regimeText}レジームでディーラーガンマエクスポージャーが歴史的低水準。`;
        } else if (flipEvents.length > 0) {
            const lastFlip = flipEvents[flipEvents.length - 1];
            const flipDate = new Date(lastFlip.timestamp);
            const flipDateStr = `${flipDate.getMonth() + 1}/${flipDate.getDate()}`;
            const daysAgo = Math.round((Date.now() - lastFlip.timestamp) / (1000 * 60 * 60 * 24));
            insights.ko = `${totalDays}일 중 ${flipEvents.length}회 레짐 전환 감지. 최근 ${flipDateStr}(${daysAgo}일 전) ${lastFlip.from === 'POSITIVE' ? 'Long→Short' : 'Short→Long'} Gamma 전환 ($${lastFlip.price?.toFixed(0)}).`;
            insights.en = `${flipEvents.length} regime transition(s) detected over ${totalDays} days. Latest flip on ${flipDateStr} (${daysAgo}d ago): ${lastFlip.from === 'POSITIVE' ? 'Long→Short' : 'Short→Long'} Gamma at $${lastFlip.price?.toFixed(0)}.`;
            insights.ja = `${totalDays}日間で${flipEvents.length}回のレジーム転換を検出。直近${flipDateStr}(${daysAgo}日前)に${lastFlip.from === 'POSITIVE' ? 'Long→Short' : 'Short→Long'} Gamma転換($${lastFlip.price?.toFixed(0)})。`;
        } else {
            insights.ko = `${totalDays}일간 ${regimeText} 레짐 유지. 딜러 포지셔닝이 ${isPositive ? '가격 핀 효과' : '방향성 가속'} 구조로 관측됨. ${trend === 'rising' ? 'GEX 상승 추세' : 'GEX 하락 추세'}.`;
            insights.en = `${regimeText} regime maintained for ${totalDays}d. Dealer positioning observed in ${isPositive ? 'price-pinning' : 'directional acceleration'} structure. GEX ${trend === 'rising' ? 'trending up' : 'trending down'}.`;
            insights.ja = `${totalDays}日間${regimeText}レジーム維持。ディーラーポジショニングが${isPositive ? '価格ピン効果' : '方向性加速'}構造で観測。GEX${trend === 'rising' ? '上昇トレンド' : '下降トレンド'}。`;
        }

        return insights[locale] || insights.en;
    }, [stats, locale]);

    if (loading) {
        return (
            <div className={`animate-pulse ${compact ? 'h-16' : 'h-32'} bg-slate-800/30 rounded-xl border border-slate-700/20`} />
        );
    }

    // [UX] Professional unavailable message with auto-shrink
    if (error || !chartData.length || !stats) {
        if (compact) return null;
        // If onEmpty callback exists, useEffect already handles the auto-switch
        // Show nothing here — the parent will switch tabs
        if (onEmpty) return null;
        const unavailableMsg: Record<string, string> = {
            ko: "이 종목은 옵션 거래량이 GEX 산출 기준에 미달하여 히스토리를 제공하지 않습니다",
            en: "Insufficient options volume for GEX history — GEX analysis requires adequate daily contract volume",
            ja: "オプション取引量がGEX算出基準に未達のためヒストリーを提供しません",
        };
        return (
            <div className="py-3 px-4 flex items-center gap-2 text-[12px] text-slate-300 border border-slate-800/40 rounded-xl bg-slate-900/30">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                <span className="font-jakarta">{unavailableMsg[locale] || unavailableMsg.en}</span>
            </div>
        );
    }

    // Single data point — show value only, no chart line
    if (chartData.length < 2) {
        const d = chartData[0];
        const isPos = d.gex >= 0;
        if (compact) return (
            <span className={`text-[12px] font-mono ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{formatGex(d.gex)}</span>
        );
        return (
            <div className="rounded-xl border border-slate-700/30 bg-slate-900/40 backdrop-blur-sm p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isPos ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`} />
                        <span className="text-[12px] font-semibold text-slate-300 tracking-wider uppercase font-jakarta">GEX Timeline</span>
                        <span className="text-[12px] text-slate-300 font-jakarta">{days}D</span>
                    </div>
                    <div className="text-right">
                        <div className={`text-[13px] font-mono font-bold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>{formatGex(d.gex)}</div>
                        <div className="text-[12px] text-slate-300 font-jakarta">
                            {d.gammaRegime === 'POSITIVE' ? '🟢 Long Gamma' : d.gammaRegime === 'NEGATIVE' ? '🔴 Short Gamma' : '⚪ Neutral'}
                        </div>
                    </div>
                </div>
                <div className="mt-2 text-[12px] text-slate-300 text-center font-jakarta">Collecting data — chart appears with 2+ data points</div>
            </div>
        );
    }

    // SVG chart dimensions — reduced height for compact placement
    const W = compact ? 200 : 600;
    const H = compact ? 40 : 80;
    const PADDING = compact ? 2 : 8;

    // Build SVG path — X-axis is INDEX-based (industry standard: Bloomberg, TradingView)
    // Index-based spacing ensures trading days are evenly distributed,
    // eliminating weekend/holiday gaps that stretch the chart unnaturally
    const lastIdx = chartData.length - 1;
    const points = chartData.map((d, i) => {
        const x = PADDING + (lastIdx > 0 ? (i / lastIdx) : 0.5) * (W - PADDING * 2);
        const y = PADDING + (1 - (d.gex - stats.min) / stats.range) * (H - PADDING * 2);
        return { x, y, gex: d.gex, regime: d.gammaRegime, timestamp: d.timestamp };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    // Fill path (area under curve to zero line)
    const zeroY = PADDING + (1 - (0 - stats.min) / stats.range) * (H - PADDING * 2);
    const fillPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${points[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    // Determine color based on latest regime
    const isPositive = stats.latest.gex >= 0;
    const lineColor = isPositive ? '#10b981' : '#ef4444';
    const fillColor = isPositive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
    const glowColor = isPositive ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';

    // Compact version (for AlphaCard or inline use)
    if (compact) {
        return (
            <div className="flex items-center gap-2">
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
                    <line x1={PADDING} y1={zeroY} x2={W - PADDING} y2={zeroY}
                        stroke="rgba(148,163,184,0.15)" strokeWidth="0.5" strokeDasharray="2 2" />
                    <path d={fillPath} fill={fillColor} />
                    <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" />
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                        r="2" fill={lineColor} />
                </svg>
                <span className={`text-[12px] font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatGex(stats.latest.gex)}
                </span>
            </div>
        );
    }

    // Full version
    return (
        <div className={`rounded-xl border backdrop-blur-sm p-3 space-y-2 relative overflow-hidden transition-all duration-500 ${
            isPositive
                ? 'border-emerald-500/30 bg-slate-900/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.2)]'
                : 'border-red-500/30 bg-slate-900/40 shadow-[0_0_20px_rgba(239,68,68,0.15)] hover:shadow-[0_0_25px_rgba(239,68,68,0.2)]'
        }`}>
            {/* Gradient mesh background + corner accents */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className={`absolute -top-10 -right-10 w-48 h-48 rounded-full ${isPositive ? 'bg-emerald-500/[0.07]' : 'bg-red-500/[0.07]'} blur-3xl`} />
                <div className={`absolute -bottom-8 -left-8 w-36 h-36 rounded-full ${isPositive ? 'bg-emerald-500/[0.04]' : 'bg-red-500/[0.04]'} blur-2xl`} />
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/[0.03] to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-500/30 to-transparent" />
                <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-slate-500/25 rounded-tl" />
                <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-slate-500/25 rounded-tr" />
                <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-slate-500/25 rounded-bl" />
                <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-slate-500/25 rounded-br" />
            </div>
            {/* Header */}
            <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isPositive ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]'}`} />
                    <span className="text-[12px] font-semibold text-slate-300 tracking-wider uppercase font-jakarta">
                        <CardTooltip tooltip={COMMAND_TOOLTIPS.GEX_TIMELINE.tooltip} badge={COMMAND_TOOLTIPS.GEX_TIMELINE.badge}>GEX Timeline</CardTooltip>
                    </span>
                    <span className="text-[12px] text-slate-300 font-jakarta">{days}D</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className={`text-[13px] font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatGex(stats.latest.gex)}
                        </div>
                        <div className="text-[12px] text-slate-300 font-jakarta flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${stats.latest.gammaRegime === 'POSITIVE' ? 'bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.5)]' : stats.latest.gammaRegime === 'NEGATIVE' ? 'bg-red-400 shadow-[0_0_4px_rgba(239,68,68,0.5)]' : 'bg-slate-400'}`} />
                            {stats.latest.gammaRegime === 'POSITIVE' ? 'Long Gamma' : stats.latest.gammaRegime === 'NEGATIVE' ? 'Short Gamma' : 'Neutral'}
                        </div>
                    </div>
                </div>
            </div>

            {/* [PREMIUM] Dynamic Insight Text */}
            {insightText && (
                <div className={`relative z-10 ${locale === 'en' ? 'text-[13px]' : 'text-[12px]'} text-slate-300 leading-[1.6] font-jakarta px-0.5`}>
                    {insightText}
                </div>
            )}

            {/* Chart */}
            <div className="relative z-10">
                <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
                    {/* Grid lines */}
                    <line x1={PADDING} y1={PADDING} x2={W - PADDING} y2={PADDING}
                        stroke="rgba(148,163,184,0.06)" strokeWidth="0.5" />
                    <line x1={PADDING} y1={H - PADDING} x2={W - PADDING} y2={H - PADDING}
                        stroke="rgba(148,163,184,0.06)" strokeWidth="0.5" />

                    {/* Zero line */}
                    <line x1={PADDING} y1={zeroY} x2={W - PADDING} y2={zeroY}
                        stroke="rgba(148,163,184,0.2)" strokeWidth="0.5" strokeDasharray="4 4" />

                    {/* Positive/Negative zones */}
                    <rect x={PADDING} y={PADDING} width={W - PADDING * 2} height={Math.max(0, zeroY - PADDING)}
                        fill="rgba(16,185,129,0.03)" />
                    <rect x={PADDING} y={zeroY} width={W - PADDING * 2} height={Math.max(0, H - PADDING - zeroY)}
                        fill="rgba(239,68,68,0.03)" />

                    {/* Area fill */}
                    <path d={fillPath} fill={fillColor} />

                    {/* Line with glow */}
                    <path d={linePath} fill="none" stroke={glowColor} strokeWidth="4" />
                    <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" />

                    {/* Latest point with glow */}
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                        r="4" fill={glowColor} />
                    <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y}
                        r="2.5" fill={lineColor} stroke="#0f172a" strokeWidth="1" />
                </svg>

                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 text-[12px] text-emerald-400/70 font-mono font-jakarta">
                    {formatGex(stats.max)}
                </div>
                <div className="absolute left-0 bottom-0 text-[12px] text-red-400/70 font-mono font-jakarta">
                    {formatGex(stats.min)}
                </div>
            </div>

            {/* Stats bar — actual trading days + realistic percentile */}
            <div className="relative z-10 flex items-center justify-between text-[12px] text-slate-300 font-jakarta">
                <span>
                    <span className="text-emerald-400">▲</span> {stats.positiveDays}/{stats.totalDays}d Long
                </span>
                <span>
                    <span className="text-red-400">▼</span> {stats.negativeDays}/{stats.totalDays}d Short
                </span>
                {stats.isAnomaly && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[12px] font-bold ${stats.percentile >= 90 ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'}`}>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1" />{stats.anomalyLabel} ({stats.percentile}th%·{stats.totalDays}d)
                    </span>
                )}
                {!stats.isAnomaly && (
                    <span className="text-slate-300 font-jakarta">{stats.percentile}th%·{stats.totalDays}d</span>
                )}
                <span className={stats.trend === 'rising' ? 'text-emerald-400' : 'text-red-400'}>
                    {stats.trend === 'rising' ? '↗ Rising' : '↘ Falling'}
                </span>
            </div>

            {/* [PREMIUM] Gamma Flip Event Timeline */}
            {stats.flipEvents.length > 0 && (
                <div className="border-t border-slate-700/30 pt-2 mt-1 space-y-1">
                    <div className="text-[12px] font-semibold text-slate-300/80 tracking-wider uppercase flex items-center gap-1.5 font-jakarta">
                        <svg width="12" height="12" viewBox="0 0 12 12" className="text-amber-400"><path d="M6 1L7.5 4.5L11 5.5L8.5 8L9 11.5L6 9.5L3 11.5L3.5 8L1 5.5L4.5 4.5Z" fill="currentColor" /></svg>
                        Gamma Flip Events ({stats.flipEvents.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {stats.flipEvents.slice(-5).map((ev, i) => {
                            const date = new Date(ev.timestamp);
                            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
                            const isPositiveFlip = ev.to === 'POSITIVE';
                            return (
                                <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] border font-jakarta ${
                                    isPositiveFlip ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
                                }`}>
                                    <span className="font-mono text-slate-300/60">{dateStr}</span>
                                    <div className={`w-2 h-2 rounded-full ${isPositiveFlip ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                    <span className="font-medium">{ev.from.slice(0,3)} → {ev.to.slice(0,3)}</span>
                                    <span className="text-slate-300/50 font-mono">${ev.price?.toFixed(0)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
