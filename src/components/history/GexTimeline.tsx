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
    currentCallWall?: number | null;
    currentFlipLevel?: number | null;
}

export function GexTimeline({ ticker, days = 30, compact = false, onEmpty, currentCallWall, currentFlipLevel }: GexTimelineProps) {
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

        // [PREMIUM] Regime streak — consecutive days in current regime
        let currentStreak = 0;
        const latestRegime = latest.gammaRegime;
        for (let i = chartData.length - 1; i >= 0; i--) {
            if (chartData[i].gammaRegime === latestRegime) currentStreak++;
            else break;
        }
        // Deduplicate to unique days for streak
        const streakDays = new Set(
            chartData.slice(chartData.length - currentStreak).map(d => new Date(d.timestamp).toISOString().slice(0, 10))
        ).size;

        // [PREMIUM] Regime durations for average calculation
        const regimeDurations: { regime: string; days: number }[] = [];
        let rStart = 0;
        for (let i = 1; i < chartData.length; i++) {
            if (chartData[i].gammaRegime !== chartData[rStart].gammaRegime) {
                const dSet = new Set(chartData.slice(rStart, i).map(d => new Date(d.timestamp).toISOString().slice(0, 10)));
                regimeDurations.push({ regime: chartData[rStart].gammaRegime, days: dSet.size });
                rStart = i;
            }
        }
        const dSetLast = new Set(chartData.slice(rStart).map(d => new Date(d.timestamp).toISOString().slice(0, 10)));
        regimeDurations.push({ regime: chartData[rStart].gammaRegime, days: dSetLast.size });

        const sameRegimeDurations = regimeDurations.filter(r => r.regime === latestRegime).map(r => r.days);
        const avgRegimeDuration = sameRegimeDurations.length > 0
            ? parseFloat((sameRegimeDurations.reduce((a, b) => a + b, 0) / sameRegimeDurations.length).toFixed(1))
            : 0;
        const streakMultiple = avgRegimeDuration > 0 ? parseFloat((streakDays / avgRegimeDuration).toFixed(1)) : 0;

        // [PREMIUM] Call Wall accuracy — how often price stayed below call wall
        let cwRespected = 0, cwTotal = 0;
        chartData.forEach(d => {
            if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) {
                cwTotal++;
                if (d.price < d.callWall) cwRespected++;
            }
        });
        const callWallAccuracy = cwTotal > 0 ? Math.round((cwRespected / cwTotal) * 100) : null;

        // Regime-filtered call wall accuracy (current streak only)
        let cwStreakRespected = 0, cwStreakTotal = 0;
        for (let i = chartData.length - 1; i >= Math.max(0, chartData.length - currentStreak); i--) {
            const d = chartData[i];
            if (d.callWall && d.price && d.callWall > 0 && d.callWall < d.price * 5) {
                cwStreakTotal++;
                if (d.price < d.callWall) cwStreakRespected++;
            }
        }
        const cwStreakAccuracy = cwStreakTotal > 0 ? Math.round((cwStreakRespected / cwStreakTotal) * 100) : null;

        // Regime timeline for visual bar
        const regimeTimeline = chartData.map(d => ({
            date: new Date(d.timestamp).toISOString().slice(0, 10),
            regime: d.gammaRegime,
        }));
        // Deduplicate to one per day
        const dailyRegime: { date: string; regime: string }[] = [];
        const seenDates = new Set<string>();
        for (const r of regimeTimeline) {
            if (!seenDates.has(r.date)) { seenDates.add(r.date); dailyRegime.push(r); }
        }

        return { max, min, range, latest, trend, positiveDays, negativeDays, totalDays, flipEvents, percentile, isAnomaly, anomalyLabel, streakDays, avgRegimeDuration, streakMultiple, callWallAccuracy, cwRespected, cwTotal, cwStreakAccuracy, cwStreakRespected, cwStreakTotal, dailyRegime };
    }, [chartData]);

    // Dynamic insight — accumulated data, compliance-safe, multi-line
    const insightLines = useMemo(() => {
        if (!stats) return [];
        const { latest, percentile, streakDays, avgRegimeDuration, streakMultiple, callWallAccuracy, cwRespected, cwTotal, totalDays } = stats;
        const isPositive = latest.gex >= 0;
        const regimeLabel = isPositive ? 'Long Gamma' : 'Short Gamma';
        const regimeKey = isPositive ? 'POSITIVE' : 'NEGATIVE';
        const lines: { icon: 'regime' | 'wall' | 'flip'; text: Record<string, string> }[] = [];

        // Line 1: GEX value + regime streak
        const streakSuffix = avgRegimeDuration > 0 && streakMultiple > 1.5
            ? { ko: ` 평균 ${avgRegimeDuration}일 대비 ${streakMultiple}배에 해당합니다.`, en: ` Historical average is ${avgRegimeDuration} days — current streak is ${streakMultiple}× above average.`, ja: ` 過去平均${avgRegimeDuration}日に対し、現在${streakMultiple}倍に相当します。` }
            : { ko: '', en: '', ja: '' };
        lines.push({
            icon: 'regime',
            text: {
                ko: `GEX ${formatGex(latest.gex)} — ${percentile}th 퍼센타일. ${regimeKey} 레짐이 ${streakDays}세션 연속 관찰되고 있습니다.${streakSuffix.ko}`,
                en: `GEX ${formatGex(latest.gex)} — ${percentile}th percentile. ${regimeKey} regime observed for ${streakDays} consecutive sessions.${streakSuffix.en}`,
                ja: `GEX ${formatGex(latest.gex)} — ${percentile}thパーセンタイル。${regimeKey}レジームが${streakDays}セッション連続で観測されています。${streakSuffix.ja}`,
            },
        });

        // Line 2: Call Wall accuracy (only if data exists)
        if (callWallAccuracy !== null && cwTotal >= 5) {
            const cwPrice = latest.callWall ? `$${latest.callWall}` : '';
            lines.push({
                icon: 'wall',
                text: {
                    ko: `Call Wall ${cwPrice}. 관측된 ${cwTotal}세션 중 ${callWallAccuracy}%에서 가격이 이 수준 아래에 위치했습니다.`,
                    en: `Call Wall ${cwPrice}. Price positioned below this level in ${callWallAccuracy}% of ${cwTotal} observed sessions (${cwRespected}/${cwTotal}).`,
                    ja: `Call Wall ${cwPrice}。観測された${cwTotal}セッション中${callWallAccuracy}%で価格がこの水準を下回りました。`,
                },
            });
        }

        // Line 3: Flip Level
        if (latest.flipLevel) {
            lines.push({
                icon: 'flip',
                text: {
                    ko: `Gamma Flip Level $${latest.flipLevel}. 이 수준은 역사적으로 딜러 헤징 레짐 전환과 동시에 관측된 가격대입니다.`,
                    en: `Gamma Flip Level $${latest.flipLevel}. This level has historically coincided with dealer hedging regime transitions.`,
                    ja: `Gamma Flip Level $${latest.flipLevel}。この水準はヒストリカルデータにおいてレジーム転換と同時に観測された価格帯です。`,
                },
            });
        }

        return lines;
    }, [stats, locale]);

    const disclaimerText: Record<string, string> = {
        ko: '구조적 데이터 분석 참고 자료이며, 방향성 예측이 아닙니다.',
        en: 'Structural data analysis reference. Not a directional forecast.',
        ja: '構造的データ分析の参考資料です。方向性予測ではありません。',
    };

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

    // SVG chart dimensions
    const W = compact ? 200 : 600;
    const H = compact ? 40 : 120;
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

    // Full version — Mockup: 2-col institutional layout
    // Chart date labels
    const firstDate = chartData[0] ? new Date(chartData[0].timestamp) : null;
    const midIdx = Math.floor(chartData.length / 2);
    const midDate = chartData[midIdx] ? new Date(chartData[midIdx].timestamp) : null;
    const fmtD = (d: Date | null) => d ? `${d.toLocaleString('en-US',{month:'short',timeZone:'America/New_York'})} ${d.getDate()}` : '';
    const isNeg = stats.latest.gammaRegime === 'NEGATIVE';
    const regimeLabel = isNeg ? 'Short Gamma' : 'Long Gamma';
    const pctLabel = stats.percentile <= 10 ? 'extreme low' : stats.percentile >= 90 ? 'extreme high' : stats.percentile <= 25 ? 'low' : stats.percentile >= 75 ? 'high' : 'normal';
    const takeaway: Record<string, string> = (() => {
        const pct = stats.percentile;
        const streak = stats.streakDays;
        const mult = stats.streakMultiple;
        const cwAcc = stats.cwStreakAccuracy ?? stats.callWallAccuracy;
        if (isNeg) {
            // SHORT GAMMA — compliance-safe structural observations
            const intensity = pct <= 5 ? 
                { ko: `GEX ${pct}퍼센타일 극저치 — 역사적 하단 수준의 딜러 감마 노출`, en: `GEX at ${pct}th percentile — dealer gamma exposure at historical lows`, ja: `GEX${pct}パーセンタイル極低値 — ディーラーガンマが歴史的低水準` } :
                pct <= 25 ?
                { ko: `GEX ${pct}퍼센타일 저위 — 딜러 헤징이 가격 변동을 증폭시키는 구조`, en: `GEX at ${pct}th percentile — dealer hedging structurally amplifying moves`, ja: `GEX${pct}パーセンタイル低位 — ディーラーヘッジが変動増幅構造` } :
                { ko: '딜러 헤징이 가격 변동을 증폭시키는 구간입니다.', en: 'Dealer hedging is amplifying price moves in this regime.', ja: 'ディーラーヘッジが価格変動を増幅する局面です。' };
            const persistence = mult >= 2.0 ?
                { ko: ` NEGATIVE 레짐 ${streak}세션 연속 (평균의 ${mult}배)`, en: ` NEGATIVE regime persisting ${streak} sessions (${mult}× average)`, ja: ` NEGATIVEレジーム${streak}セッション継続（平均の${mult}倍）` } :
                streak >= 3 ?
                { ko: ` NEGATIVE 레짐 ${streak}세션 연속 관측`, en: ` NEGATIVE regime observed for ${streak} consecutive sessions`, ja: ` NEGATIVEレジーム${streak}セッション連続観測` } :
                { ko: '', en: '', ja: '' };
            return {
                ko: intensity.ko + (persistence.ko ? '.' + persistence.ko : '') + '.',
                en: intensity.en + (persistence.en ? '.' + persistence.en : '') + '.',
                ja: intensity.ja + (persistence.ja ? '。' + persistence.ja : '') + '。',
            };
        } else {
            // LONG GAMMA — compliance-safe structural observations
            const intensity = pct >= 90 ?
                { ko: `GEX ${pct}퍼센타일 극고치 — 딜러 헤징이 가격 안정화를 강화하는 구조`, en: `GEX at ${pct}th percentile — dealer hedging strongly stabilizing price action`, ja: `GEX${pct}パーセンタイル極高値 — ディーラーヘッジが価格安定化を強化` } :
                pct >= 60 ?
                { ko: `GEX ${pct}퍼센타일 — 딜러 헤징이 변동성 흡수 방향으로 작용 중`, en: `GEX at ${pct}th percentile — dealer hedging absorbing volatility`, ja: `GEX${pct}パーセンタイル — ディーラーヘッジがボラティリティ吸収方向に作用中` } :
                { ko: '딜러 헤징이 가격 안정화 방향으로 작용 중입니다.', en: 'Dealer hedging is currently stabilizing price action.', ja: 'ディーラーヘッジが価格安定化方向に作用中です。' };
            const persistence = streak >= 3 ?
                { ko: ` POSITIVE 레짐 ${streak}세션 유지`, en: ` POSITIVE regime held for ${streak} sessions`, ja: ` POSITIVEレジーム${streak}セッション維持` } :
                { ko: '', en: '', ja: '' };
            return {
                ko: intensity.ko + (persistence.ko ? '.' + persistence.ko : '') + '.',
                en: intensity.en + (persistence.en ? '.' + persistence.en : '') + '.',
                ja: intensity.ja + (persistence.ja ? '。' + persistence.ja : '') + '。',
            };
        }
    })();
    // Percentile gauge position (0-100 mapped to bar width)
    const gaugePos = Math.max(0, Math.min(100, stats.percentile));
    // Persistence bar widths
    const maxBarW = 100;
    const avgBarW = stats.avgRegimeDuration > 0 ? Math.min(maxBarW, (stats.avgRegimeDuration / Math.max(stats.streakDays, stats.avgRegimeDuration)) * maxBarW) : 30;
    const curBarW = stats.streakDays > 0 ? Math.min(maxBarW, (stats.streakDays / Math.max(stats.streakDays, stats.avgRegimeDuration)) * maxBarW) : 30;

    return (
        <div className={`rounded-xl border backdrop-blur-sm p-3 relative overflow-hidden transition-all duration-500 ${isPositive ? 'border-emerald-500/30 bg-slate-900/40 shadow-[0_0_20px_rgba(16,185,129,0.12)]' : 'border-red-500/30 bg-slate-900/40 shadow-[0_0_20px_rgba(239,68,68,0.12)]'}`}>
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className={`absolute -top-10 -right-10 w-48 h-48 rounded-full ${isPositive ? 'bg-emerald-500/[0.06]' : 'bg-red-500/[0.06]'} blur-3xl`} />
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white/[0.02] to-transparent" />
            </div>

            {/* ═══ HEADER ═══ */}
            <div className="relative z-10 flex items-start justify-between mb-2">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <div className={`w-0.5 h-8 rounded-full ${isPositive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-bold text-slate-200 tracking-wide uppercase font-jakarta">
                                    <CardTooltip tooltip={COMMAND_TOOLTIPS.GEX_TIMELINE.tooltip} badge={COMMAND_TOOLTIPS.GEX_TIMELINE.badge}>GEX Timeline</CardTooltip>
                                </span>
                                <span className="text-[12px] text-slate-400 font-jakarta">· {days}D</span>
                            </div>
                            <div className="text-[12px] text-slate-300 font-jakarta mt-0.5">{takeaway[locale] || takeaway.en}</div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[20px] font-mono font-bold leading-tight ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{formatGex(stats.latest.gex)}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-[12px] text-slate-300 font-jakarta">{stats.percentile}th percentile</span>
                    <span className="text-slate-500">·</span>
                    <span className={`text-[12px] font-semibold font-jakarta ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{regimeLabel}</span>
                </div>
            </div>

            {/* ═══ MAIN 2-COLUMN ═══ */}
            <div className="relative z-10 grid grid-cols-[1fr_220px] gap-3">
                {/* LEFT: Chart + Key Levels */}
                <div className="space-y-2">
                    {/* Chart */}
                    <div className="relative">
                        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
                            <line x1={PADDING} y1={zeroY} x2={W-PADDING} y2={zeroY} stroke="rgba(148,163,184,0.15)" strokeWidth="0.5" strokeDasharray="4 3" />
                            <rect x={PADDING} y={PADDING} width={W-PADDING*2} height={Math.max(0,zeroY-PADDING)} fill="rgba(16,185,129,0.02)" />
                            <rect x={PADDING} y={zeroY} width={W-PADDING*2} height={Math.max(0,H-PADDING-zeroY)} fill="rgba(239,68,68,0.02)" />
                            <path d={fillPath} fill={fillColor} />
                            <path d={linePath} fill="none" stroke={glowColor} strokeWidth="3" />
                            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" />
                            <circle cx={points[points.length-1].x} cy={points[points.length-1].y} r="4" fill={glowColor} />
                            <circle cx={points[points.length-1].x} cy={points[points.length-1].y} r="2.5" fill={lineColor} stroke="#0f172a" strokeWidth="1" />
                        </svg>
                        {/* Current label — positioned above last point */}
                        <div className="absolute right-0 text-[12px] font-mono font-bold font-jakarta" style={{ color: lineColor, top: `${Math.max(0, (points[points.length-1].y / H) * 100 - 14)}%` }}>
                            Current: {formatGex(stats.latest.gex)}
                        </div>
                        {/* Zero label */}
                        <div className="absolute left-1 text-[12px] text-slate-300 font-mono font-jakarta" style={{ top: `${(zeroY/H)*100}%`, transform: 'translateY(-50%)' }}>0</div>
                        {/* Date labels */}
                        <div className="flex justify-between mt-0.5 text-[12px] text-slate-300 font-mono font-jakarta">
                            <span>{fmtD(firstDate)}</span>
                            <span>{fmtD(midDate)}</span>
                            <span>TODAY</span>
                        </div>
                    </div>
                    {/* Key Levels Cards — mockup horizontal style */}
                    <div className="grid grid-cols-2 gap-1.5">
                        {(currentCallWall || stats.latest.callWall) && (
                            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-2 flex items-center gap-2.5">
                                <div className="w-11 h-11 rounded-lg bg-red-500/15 border border-red-500/25 flex items-center justify-center shrink-0">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-red-400">
                                        <rect x="3" y="10" width="18" height="11" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                                        <rect x="5" y="4" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                                        <rect x="10" y="4" width="4" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                                        <rect x="16" y="4" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
                                        <line x1="3" y1="14" x2="21" y2="14" stroke="currentColor" strokeWidth="0.8" opacity="0.4"/>
                                        <rect x="7" y="16" width="4" height="5" rx="0.5" fill="currentColor" opacity="0.2"/>
                                        <rect x="13" y="16" width="4" height="5" rx="0.5" fill="currentColor" opacity="0.2"/>
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[12px] font-bold text-red-400 font-jakarta uppercase">Call Wall</span>
                                        <span className="text-[16px] font-mono font-bold text-slate-200">${currentCallWall ?? stats.latest.callWall}</span>
                                    </div>
                                    {stats.cwStreakAccuracy !== null && stats.cwStreakTotal >= 3 ? (
                                        <div className="text-[12px] text-slate-300 font-jakarta leading-tight">{locale==='ko'?`현재 ${isNeg?'NEGATIVE':'POSITIVE'} 구간 ${stats.cwStreakAccuracy}% 하회`:locale==='ja'?`現在${isNeg?'NEGATIVE':'POSITIVE'}区間の${stats.cwStreakAccuracy}%で下回り`:`${stats.cwStreakAccuracy}% of current ${isNeg?'NEG':'POS'} sessions below`}</div>
                                    ) : stats.callWallAccuracy !== null ? (
                                        <div className="text-[12px] text-slate-300 font-jakarta leading-tight">{locale==='ko'?`관측 ${stats.cwTotal}세션 중 ${stats.callWallAccuracy}% 하회`:locale==='ja'?`観測${stats.cwTotal}セッション中${stats.callWallAccuracy}%で下回り`:`${stats.callWallAccuracy}% of ${stats.cwTotal} sessions below`}</div>
                                    ) : null}
                                    <div className="text-[12px] text-red-300/70 font-jakarta uppercase tracking-wider">{locale==='ko'?'상단 저항 구간':locale==='ja'?'上方抵抗ゾーン':'Overhead Resistance Zone'}</div>
                                </div>
                            </div>
                        )}
                        {(currentFlipLevel || stats.latest.flipLevel) && (
                            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] p-2 flex items-center gap-2.5">
                                <div className="w-11 h-11 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0">
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-cyan-400">
                                        <path d="M4 9h13l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M20 15H7l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-[12px] font-bold text-cyan-400 font-jakarta uppercase">Gamma Flip</span>
                                        <span className="text-[16px] font-mono font-bold text-slate-200">${currentFlipLevel ?? stats.latest.flipLevel}</span>
                                    </div>
                                    <div className="text-[12px] text-slate-300 font-jakarta leading-tight">{locale==='ko'?'역사적 레짐 전환 관측 수준':locale==='ja'?'ヒストリカルレジーム転換水準':'Historical regime transition level'}</div>
                                    <div className="text-[12px] text-cyan-300/70 font-jakarta uppercase tracking-wider">{locale==='ko'?'피봇 / 레짐 전환 레벨':locale==='ja'?'ピボット / レジーム転換':'Pivot / Regime Switch Level'}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: Percentile + Persistence + Takeaway */}
                <div className="space-y-2.5 border-l border-slate-700/30 pl-3">
                    {/* A. Percentile / Regime */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-semibold text-white uppercase tracking-wider font-jakarta">A. Percentile / Regime</span>
                            <span className="text-[12px] text-slate-300 font-jakarta">{stats.percentile}th · {pctLabel}</span>
                        </div>
                        <div className="relative h-2.5 rounded-full bg-gradient-to-r from-red-500/40 via-slate-600/30 to-emerald-500/40">
                            <div className="absolute top-1/2 w-3 h-3 rounded-full bg-white border-2 border-slate-900 shadow-[0_0_8px_rgba(255,255,255,0.6)]" style={{ left: `${gaugePos}%`, transform: 'translate(-50%, -50%)' }} />
                        </div>
                        <div className="flex justify-between mt-0.5 text-[12px] text-slate-300 font-jakarta">
                            <span>Negative GEX</span><span>Neutral</span><span>Positive GEX</span>
                        </div>
                    </div>
                    {/* B. Regime Persistence */}
                    <div>
                        <div className="text-[12px] font-semibold text-white uppercase tracking-wider font-jakarta mb-1">B. Regime Persistence</div>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-[22px] font-mono font-bold leading-none ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{stats.streakDays}</span>
                            <div>
                                <div className="text-[12px] text-slate-300 font-jakarta">sessions</div>
                                <div className={`text-[12px] font-bold font-jakarta ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{isNeg ? 'NEGATIVE' : 'POSITIVE'}</div>
                            </div>
                            <div className="ml-auto text-right">
                                <div className="text-[12px] text-slate-300 font-jakarta">Average duration</div>
                                <div className="text-[12px] text-slate-300 font-mono font-bold">{stats.avgRegimeDuration}d</div>
                            </div>
                        </div>
                        <div className="space-y-1 mt-1.5">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[12px] text-slate-300 font-jakarta w-12 shrink-0">Average</span>
                                <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden"><div className="h-full rounded-full bg-slate-400/60" style={{ width: `${avgBarW}%` }} /></div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[12px] text-slate-300 font-jakarta w-12 shrink-0">Current</span>
                                <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden"><div className={`h-full rounded-full ${isPositive ? 'bg-emerald-400/70' : 'bg-red-400/70'}`} style={{ width: `${curBarW}%` }} /></div>
                                <span className={`text-[12px] font-mono font-bold shrink-0 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{stats.streakMultiple}×</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ═══ BOTTOM: Flip Events + Disclaimer ═══ */}
            <div className="relative z-10 flex items-center justify-between mt-2.5 pt-2 border-t border-slate-700/30">
                {stats.flipEvents.length > 0 ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider font-jakarta flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 12 12" className="text-amber-400"><path d="M6 1L7.5 4.5L11 5.5L8.5 8L9 11.5L6 9.5L3 11.5L3.5 8L1 5.5L4.5 4.5Z" fill="currentColor"/></svg>
                            Flip Events ({stats.flipEvents.length})
                        </span>
                        {stats.flipEvents.slice(-3).map((ev, i) => {
                            const d = new Date(ev.timestamp);
                            const ds = `${d.getMonth()+1}/${d.getDate()}`;
                            const pos = ev.to === 'POSITIVE';
                            return <span key={i} className={`px-1.5 py-0.5 rounded text-[12px] font-mono font-jakarta ${pos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{ds} {ev.from.slice(0,3)}→{ev.to.slice(0,3)} ${ev.price?.toFixed(0)}</span>;
                        })}
                    </div>
                ) : <div />}
                <span className="text-[12px] text-slate-500 italic font-jakarta shrink-0">{disclaimerText[locale] || disclaimerText.en}</span>
            </div>
        </div>
    );
}
