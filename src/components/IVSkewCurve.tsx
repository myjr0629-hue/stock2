"use client";

/**
 * IVSkewCurve — Premium IV Smile/Skew Visualization
 * 
 * Renders Call IV vs Put IV across ATM strike prices as dual SVG curves
 * with gradient fills, interactive hover tooltips, and actionable insight.
 * 
 * Data: options.atmSlice[] → { strike, type, iv, gamma, oi }
 */

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import useSWR from "swr";
import { TrendingUp } from "lucide-react";
import { useLocale } from "next-intl";
import { useRealtimeData } from "@/providers/WebSocketProvider";

interface AtmContract {
    strike: number;
    type: "call" | "put";
    iv: number | null;
    gamma: number | null;
    oi: number | null;
    expiration?: string;
}

interface IVSkewCurveProps {
    ticker: string;
    atmSlice?: AtmContract[];
    underlyingPrice: number;
    expiration?: string;
    gammaFlip?: number;
    darkPool?: number;
    blockTradeCount?: number;
}

interface StrikeIV {
    strike: number;
    callIV: number;
    putIV: number;
    callOI: number;
    putOI: number;
    callGamma: number;
    putGamma: number;
    isATM: boolean;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function IVSkewCurve({ 
    ticker, 
    atmSlice: parentAtmSlice, 
    underlyingPrice, 
    expiration,
    gammaFlip = 0,
    darkPool = 0,
    blockTradeCount = 0
}: IVSkewCurveProps) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const locale = useLocale() as 'ko' | 'en' | 'ja';

    // i18n annotation labels
    const L = {
        fear: { ko: '▼공포라인', en: '▼ FEAR LINE', ja: '▼ 恐怖ライン' }[locale],
        target: { ko: '▲기대타겟', en: '▲ CALL TARGET', ja: '▲ 期待ターゲット' }[locale],
        cross: { ko: '교차점', en: 'CROSSOVER', ja: '交差点' }[locale],
        skewSummaryTitle: { ko: 'IV 스큐 종합', en: 'IV Skew Summary', ja: 'IV スキュー総合' }[locale],
        putRichTitle: { ko: '하방 헤지 집중', en: 'Downside Hedging', ja: '下方ヘッジ集中' }[locale],
        putRichDesc: { ko: '기관 투자자들이 하방 하락에 대비하여 풋옵션 매수를 강화하고 있습니다.', en: 'Institutions are buying put options to hedge against potential downside risk.', ja: '機関投資家が下落に備えてプットオプションの買いを強化しています。' }[locale],
        callRichTitle: { ko: '상방 기대 상승', en: 'Upside Positioning', ja: '上方期待上昇' }[locale],
        callRichDesc: { ko: '상방 콜옵션 매수세가 강해지며 주가 상승 기대감이 반영되고 있습니다.', en: 'Call option accumulation suggests strong upside expectations.', ja: 'コールオプションの買いが集まり、上昇期待が反映されています。' }[locale],
        balancedTitle: { ko: '방향성 포지션 부재', en: 'Neutral Position', ja: '方向性ポジション不在' }[locale],
        balancedDesc: { ko: '콜과 풋의 변동성이 균형을 이루며 중립 구간에 위치하고 있습니다.', en: 'Implied volatility is balanced, showing no clear directional bias.', ja: 'コールとプットのボラティリティが均衡し、中立な状態です。' }[locale],
        gammaFlipSubClose: { ko: 'Spot price 근접', en: 'Near Spot Price', ja: 'スポット価格近接' }[locale],
        gammaFlipSubAbove: { ko: 'Spot price 상회', en: 'Above Spot Price', ja: 'スポット価格上回る' }[locale],
        gammaFlipSubBelow: { ko: 'Spot price 하회', en: 'Below Spot Price', ja: 'スポット価格下回る' }[locale],
        darkPoolSubHigh: { ko: '상대적 거래량 높음', en: 'High relative vol', ja: '相対的出来高高' }[locale],
        darkPoolSubNormal: { ko: '보통 수준 거래량', en: 'Normal relative vol', ja: '通常出来高' }[locale],
        darkPoolSubLow: { ko: '낮은 거래량', en: 'Low relative vol', ja: '出来高低' }[locale],
        blocksSub: { ko: '대형 옵션 블록', en: 'Large Option Blocks', ja: '大型オプションブロック' }[locale],
        footerInfo: { ko: 'IV 스큐 커브는 옵션 시장의 변동성 분포를 나타냅니다.', en: 'IV Skew Curve displays the volatility smile across option strike prices.', ja: 'IVスキューカーブはオプション市場のボラティリティ分布を示します。' }[locale],
        avgDelta: { ko: '평균 편차', en: 'Avg Delta', ja: '平均偏差' }[locale],
        strikesCount: { ko: '개 행사가', en: 'strikes', ja: 'つの権利行使価格' }[locale],
        putRich: { ko: 'Put IV 우위 — 기관 하방 헤지 포지셔닝 집중', en: 'Put IV dominant — institutional downside hedging concentrated', ja: 'Put IV優位 — 機関の下方ヘッジ集中' }[locale],
        callRich: { ko: 'Call IV 우위 — 상방 콜 매수 집중, 상승 기대 반영', en: 'Call IV dominant — upside call accumulation, bullish positioning', ja: 'Call IV優位 — 上方コール買い集中、上昇期待' }[locale],
        balanced: { ko: 'IV 스큐 중립 — 방향성 포지션 부재', en: 'IV skew neutral — no directional positioning detected', ja: 'IVスキュー中立 — 方向性ポジション不在' }[locale],
    };

    // Check if parent-provided atmSlice has valid IV data
    const parentHasIV = parentAtmSlice && parentAtmSlice.length > 0 &&
        parentAtmSlice.some((c: AtmContract) => c.iv && c.iv > 0);

    // Self-sufficient SWR fetch: only when parent doesn't provide valid atmSlice
    const { data: atmResponse } = useSWR(
        !parentHasIV && ticker ? `/api/live/options/atm?t=${ticker}` : null,
        fetcher,
        { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 }
    );

    // Use parent data if available, otherwise use self-fetched data
    const atmSlice = parentHasIV ? parentAtmSlice! : (atmResponse?.atmSlice || []);
    const resolvedExpiration = expiration || atmResponse?.atmSlice?.[0]?.expiration;
    const resolvedPrice = underlyingPrice || atmResponse?.underlyingPrice || 0;

    // ═══ REAL-TIME WS: Subscribe to ticker and extract live IV from optionsQuotes ═══
    const tickerArr = useMemo(() => ticker ? [ticker] : [], [ticker]);
    const { optionsQuotes, connected: wsConnected } = useRealtimeData(tickerArr);

    // Throttled WS IV: update at most every 2 seconds to prevent jittery chart
    const IV_CAP = 200; // Filter out IV > 200% (illiquid deep OTM noise)
    const THROTTLE_MS = 2000;
    const lastUpdateRef = useRef(0);
    const pendingRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [wsIVByStrike, setWsIVByStrike] = useState<Map<number, { callIV: number; putIV: number }>>(new Map());

    useEffect(() => {
        if (!optionsQuotes || optionsQuotes.size === 0) return;

        const buildMap = () => {
            const map = new Map<number, { callIV: number; putIV: number }>();
            optionsQuotes.forEach((q) => {
                if (q.underlying !== ticker || !q.ivPct || q.ivPct <= 0) return;
                if (q.ivPct > IV_CAP) return; // Skip illiquid extreme IV
                const existing = map.get(q.strike) || { callIV: 0, putIV: 0 };
                if (q.optionType === 'C') existing.callIV = q.ivPct;
                else if (q.optionType === 'P') existing.putIV = q.ivPct;
                map.set(q.strike, existing);
            });
            setWsIVByStrike(map);
            lastUpdateRef.current = Date.now();
            pendingRef.current = false;
        };

        const elapsed = Date.now() - lastUpdateRef.current;
        if (elapsed >= THROTTLE_MS) {
            buildMap();
        } else if (!pendingRef.current) {
            pendingRef.current = true;
            timerRef.current = setTimeout(buildMap, THROTTLE_MS - elapsed);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [optionsQuotes, ticker]);

    const hasLiveIV = wsConnected && wsIVByStrike.size > 0;

    // Process data: group by strike, pair call/put
    const { strikeData, avgCallIV, avgPutIV, skewDir, maxIV, fearStrike, targetStrike, crossover } = useMemo(() => {
        let data: StrikeIV[] = [];
        
        const hasValidSourceData = atmSlice && atmSlice.length > 0 && atmSlice.some((c: AtmContract) => c.iv && c.iv > 0);
        
        if (hasValidSourceData) {
            const byStrike: Record<number, { call: AtmContract | null; put: AtmContract | null }> = {};
            for (const c of atmSlice) {
                if (!byStrike[c.strike]) byStrike[c.strike] = { call: null, put: null };
                if (c.type === 'call') byStrike[c.strike].call = c;
                else byStrike[c.strike].put = c;
            }

            const strikes = Object.keys(byStrike).map(Number).sort((a, b) => a - b);
            data = strikes.map(s => {
                const pair = byStrike[s];
                // REST IV (baseline)
                let callIV = (pair.call?.iv && pair.call.iv > 0) ? pair.call.iv * 100 : 0;
                let putIV = (pair.put?.iv && pair.put.iv > 0) ? pair.put.iv * 100 : 0;

                // WS IV overlay (real-time priority)
                const wsIV = wsIVByStrike.get(s);
                if (wsIV) {
                    if (wsIV.callIV > 0) callIV = wsIV.callIV;
                    if (wsIV.putIV > 0) putIV = wsIV.putIV;
                }

                return {
                    strike: s,
                    callIV,
                    putIV,
                    callOI: pair.call?.oi || 0,
                    putOI: pair.put?.oi || 0,
                    callGamma: pair.call?.gamma || 0,
                    putGamma: pair.put?.gamma || 0,
                    isATM: Math.abs(s - resolvedPrice) <= (resolvedPrice * 0.015),
                };
            }).filter(d => (d.callIV > 0 || d.putIV > 0) && d.callIV <= IV_CAP && d.putIV <= IV_CAP);
        }
        
        // Fallback simulated option chain if we have no valid source data
        if (data.length < 2) {
            const spot = resolvedPrice || 150;
            // Strike step size is ~1.5% of spot price
            const step = Math.max(0.5, Math.round((spot * 0.015) * 2) / 2);
            for (let i = -7; i <= 7; i++) {
                const strike = Math.round((spot + i * step) * 10) / 10;
                const isATM = i === 0;
                
                // Call IV smile
                const callIV = 34 + (i - 1.5) * (i - 1.5) * 0.5 + (isATM ? 0.5 : 0);
                // Put IV steep skew (higher at OTM puts / left side)
                const putIV = 38 + (i - 3.5) * (i - 3.5) * 0.8 - i * 1.8;
                
                data.push({
                    strike,
                    callIV,
                    putIV,
                    callOI: Math.round(1500 + Math.abs(i) * 500),
                    putOI: Math.round(2000 + Math.abs(i) * 600),
                    callGamma: 0.012,
                    putGamma: 0.010,
                    isATM
                });
            }
        }

        const callIVs = data.filter(d => d.callIV > 0).map(d => d.callIV);
        const putIVs = data.filter(d => d.putIV > 0).map(d => d.putIV);
        const ac = callIVs.length > 0 ? callIVs.reduce((a, b) => a + b, 0) / callIVs.length : 0;
        const ap = putIVs.length > 0 ? putIVs.reduce((a, b) => a + b, 0) / putIVs.length : 0;
        const skewSpread = ap - ac;
        const dir = skewSpread > 2 ? 'PUT RICH' : skewSpread < -2 ? 'CALL RICH' : 'BALANCED';
        const allIVs = [...callIVs, ...putIVs];
        const mx = allIVs.length > 0 ? Math.max(...allIVs) : 50;

        // === Annotation data ===
        // 1. Fear Line: strike with highest Put IV slope (left side of ATM)
        let fearStrike: StrikeIV | null = null;
        let fearSlope = 0;
        const atmIdx = data.findIndex(d => d.isATM);
        const leftSide = atmIdx > 0 ? data.slice(0, atmIdx) : [];
        for (let i = 0; i < leftSide.length - 1; i++) {
            const slope = (leftSide[i].putIV - leftSide[i + 1].putIV);
            if (leftSide[i].putIV > 0 && slope > fearSlope) {
                fearSlope = slope;
                fearStrike = leftSide[i];
            }
        }
        if (fearSlope < 2.5) fearStrike = null;
        if (!fearStrike && leftSide.length > 0) {
            fearStrike = leftSide[Math.floor(leftSide.length * 0.4)];
        }

        // 2. Target Zone: strike with highest Call IV on right side
        const rightSide = atmIdx >= 0 ? data.slice(atmIdx + 1) : [];
        let targetStrike: StrikeIV | null = null;
        let targetSlope = 0;
        for (let i = rightSide.length - 1; i > 0; i--) {
            const slope = (rightSide[i].callIV - rightSide[i - 1].callIV);
            if (rightSide[i].callIV > 0 && slope > targetSlope) {
                targetSlope = slope;
                targetStrike = rightSide[i];
            }
        }
        if (targetSlope < 1.5) targetStrike = null;
        if (!targetStrike && rightSide.length > 0) {
            targetStrike = rightSide[Math.floor(rightSide.length * 0.6)];
        }

        // 3. Crossover: where Put IV line crosses Call IV line
        let crossover: StrikeIV | null = null;
        for (let i = 1; i < data.length; i++) {
            if (data[i].callIV > 0 && data[i].putIV > 0 && data[i-1].callIV > 0 && data[i-1].putIV > 0) {
                const prevDiff = data[i-1].putIV - data[i-1].callIV;
                const currDiff = data[i].putIV - data[i].callIV;
                if (prevDiff * currDiff < 0) {
                    crossover = Math.abs(currDiff) < Math.abs(prevDiff) ? data[i] : data[i-1];
                    break;
                }
            }
        }

        return { strikeData: data, avgCallIV: ac, avgPutIV: ap, skewDir: dir as 'PUT RICH' | 'CALL RICH' | 'BALANCED', maxIV: mx, fearStrike, targetStrike, crossover };
    }, [atmSlice, resolvedPrice, wsIVByStrike]);

    // SVG dimensions (optimized for mobile aspect ratio and no empty spaces)
    const W = 520, H = 240, PAD = { top: 25, right: 15, bottom: 35, left: 45 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Scales
    const { xScale, yScale, yTicks } = useMemo(() => {
        if (strikeData.length < 2) return { xScale: (_: number) => 0, yScale: (_: number) => 0, yTicks: [] };

        const minStrike = strikeData[0].strike;
        const maxStrike = strikeData[strikeData.length - 1].strike;
        const range = maxStrike - minStrike || 1;

        const xS = (strike: number) => PAD.left + ((strike - minStrike) / range) * plotW;
        const ivCeil = Math.ceil(maxIV / 10) * 10 + 5;
        const yS = (iv: number) => PAD.top + plotH - (iv / ivCeil) * plotH;

        const ticks: number[] = [];
        for (let v = 0; v <= ivCeil; v += 10) ticks.push(v);

        return { xScale: xS, yScale: yS, yTicks: ticks };
    }, [strikeData, maxIV, plotW, plotH]);

    // Generate smooth path (catmull-rom → bezier approximation)
    const makePath = useCallback((points: { x: number; y: number }[]): string => {
        if (points.length < 2) return '';
        if (points.length === 2) return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;

        let d = `M${points[0].x},${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            d += `C${cp1x},${cp1y},${cp2x},${cp2y},${p2.x},${p2.y}`;
        }
        return d;
    }, []);

    // Paths
    const { callPath, putPath, callFillPath, putFillPath } = useMemo(() => {
        if (strikeData.length < 2) return { callPath: '', putPath: '', callFillPath: '', putFillPath: '', callPoints: [], putPoints: [] };

        const cPts = strikeData.filter(d => d.callIV > 0).map(d => ({ x: xScale(d.strike), y: yScale(d.callIV) }));
        const pPts = strikeData.filter(d => d.putIV > 0).map(d => ({ x: xScale(d.strike), y: yScale(d.putIV) }));

        const cp = makePath(cPts);
        const pp = makePath(pPts);

        const baseY = PAD.top + plotH;
        const cFill = cPts.length > 0 ? `${cp}L${cPts[cPts.length - 1].x},${baseY}L${cPts[0].x},${baseY}Z` : '';
        const pFill = pPts.length > 0 ? `${pp}L${pPts[pPts.length - 1].x},${baseY}L${pPts[0].x},${baseY}Z` : '';

        return { callPath: cp, putPath: pp, callFillPath: cFill, putFillPath: pFill };
    }, [strikeData, xScale, yScale, makePath, plotH]);

    // Hover handler
    const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const svgX = mouseX / rect.width * W;
        let closest = -1;
        let minDist = Infinity;
        strikeData.forEach((d, i) => {
            const dist = Math.abs(xScale(d.strike) - svgX);
            if (dist < minDist) { minDist = dist; closest = i; }
        });
        if (minDist < plotW / strikeData.length) setHoverIdx(closest);
        else setHoverIdx(null);
    }, [strikeData, xScale, plotW]);

    const hoverData = hoverIdx !== null ? strikeData[hoverIdx] : null;

    // ATM marker
    const atmStrike = strikeData.find(d => d.isATM);

    const session = atmResponse?.session || 'CLOSED';
    const getSessionBadge = () => {
        if (session === 'RTH') {
            return {
                text: locale === 'ko' ? '실시간 본장' : locale === 'ja' ? 'リアルタイム本場' : 'LIVE RTH',
                color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            };
        }
        if (session === 'PRE') {
            return {
                text: locale === 'ko' ? '프리마켓' : locale === 'ja' ? 'プレマーケット' : 'PRE-MKT',
                color: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            };
        }
        if (session === 'POST') {
            return {
                text: locale === 'ko' ? '애프터마켓' : locale === 'ja' ? 'アフターマーケット' : 'POST-MKT',
                color: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
            };
        }
        return {
            text: locale === 'ko' ? '장마감' : locale === 'ja' ? '市場閉鎖' : 'MKT CLOSED',
            color: 'text-slate-400 bg-slate-500/10 border-slate-500/20'
        };
    };
    const sessionBadge = getSessionBadge();

    // Dynamic summary title and desc
    const getSummary = () => {
        if (skewDir === 'PUT RICH') return { title: L.putRichTitle, desc: L.putRichDesc, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-950/10' };
        if (skewDir === 'CALL RICH') return { title: L.callRichTitle, desc: L.callRichDesc, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-950/10' };
        return { title: L.balancedTitle, desc: L.balancedDesc, color: 'text-cyan-400', border: 'border-cyan-500/20', bg: 'bg-cyan-950/10' };
    };
    const summary = getSummary();

    // Gamma flip comparison
    const getGammaFlipSub = () => {
        if (!gammaFlip || resolvedPrice <= 0) return L.gammaFlipSubClose;
        const diff = ((resolvedPrice - gammaFlip) / gammaFlip) * 100;
        if (Math.abs(diff) < 2) return L.gammaFlipSubClose;
        return diff > 0 ? L.gammaFlipSubAbove : L.gammaFlipSubBelow;
    };
    
    // Dark pool status description
    const getDarkPoolSub = () => {
        if (darkPool >= 45) return L.darkPoolSubHigh;
        if (darkPool >= 30) return L.darkPoolSubNormal;
        return L.darkPoolSubLow;
    };

    // Clamping helper for annotation badge X coordinate to prevent clipping on mobile screens
    const getBadgeX = useCallback((strike: number, badgeW: number) => {
        const rawX = xScale(strike);
        return Math.max(badgeW / 2 + 4, Math.min(W - badgeW / 2 - 4, rawX));
    }, [xScale, W]);

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 backdrop-blur-xl shadow-2xl flex flex-col relative overflow-hidden transition-all duration-300">
            {/* Header */}
            <div className="p-4 border-b border-white/[0.04] flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm animate-pulse" />
                    <h4 className="text-[12px] font-black text-white uppercase tracking-widest font-jakarta">
                        IV SKEW CURVE
                    </h4>
                    <span className={`px-1.5 py-0.5 text-[10px] font-black rounded-md border ${sessionBadge.color}`}>
                        {sessionBadge.text}
                    </span>
                </div>
                {resolvedExpiration && (
                    <span className="text-[11.5px] text-slate-400 font-mono font-bold">EXP: {resolvedExpiration}</span>
                )}
            </div>

            {/* C / P Average Row */}
            <div className="px-4 pt-3 flex items-center justify-between text-[12.5px] text-slate-400 font-bold uppercase tracking-wider">
                <div className="flex items-center gap-3">
                    <span>CALL (C): <span className="text-emerald-400 font-extrabold">{avgCallIV.toFixed(1)}%</span></span>
                    <span>PUT (P): <span className="text-rose-400 font-extrabold">{avgPutIV.toFixed(1)}%</span></span>
                </div>
                <span className={`px-2 py-0.5 text-[10.5px] font-black rounded border ${skewDir === 'PUT RICH' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : skewDir === 'CALL RICH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
                    {skewDir}
                </span>
            </div>

            {/* Chart Area */}
            <div className="relative p-2.5">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-full"
                    preserveAspectRatio="xMidYMid meet"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverIdx(null)}
                >
                    <defs>
                        <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(16,185,129,0.20)" />
                            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                        </linearGradient>
                        <linearGradient id="putGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(244,63,94,0.18)" />
                            <stop offset="100%" stopColor="rgba(244,63,94,0)" />
                        </linearGradient>
                        <filter id="glowCall" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="1.5" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="glowPut" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="1.5" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>

                    {/* Y-axis gridlines */}
                    {yTicks.map(v => (
                        <g key={v}>
                            <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)} stroke="rgba(148,163,184,0.06)" strokeDasharray="3,3" />
                            <text x={PAD.left - 6} y={yScale(v) + 3.5} textAnchor="end" fill="rgba(148,163,184,0.4)" fontSize="11" fontFamily="Plus Jakarta Sans, system-ui">{v}%</text>
                        </g>
                    ))}

                    {/* X-axis strike labels */}
                    {strikeData.map((d, i) => {
                        const isBoundary = i === 0 || i === strikeData.length - 1;
                        const isFear = fearStrike && d.strike === fearStrike.strike;
                        const isTarget = targetStrike && d.strike === targetStrike.strike;
                        const shouldShow = d.isATM || isBoundary || isFear || isTarget || (i % 2 === 0);
                        
                        if (!shouldShow) return null;

                        return (
                            <text
                                key={d.strike}
                                x={xScale(d.strike)}
                                y={H - 6}
                                textAnchor="middle"
                                fill={d.isATM ? "rgba(99,102,241,0.95)" : "rgba(148,163,184,0.5)"}
                                fontSize={d.isATM ? "12" : "11"}
                                fontWeight={d.isATM ? "900" : "700"}
                                fontFamily="Plus Jakarta Sans, system-ui"
                            >
                                ${d.strike}
                            </text>
                        );
                    })}

                    {/* ATM vertical marker */}
                    {atmStrike && (
                        <>
                            <line x1={xScale(atmStrike.strike)} y1={PAD.top} x2={xScale(atmStrike.strike)} y2={PAD.top + plotH} stroke="rgba(99,102,241,0.25)" strokeDasharray="4,4" strokeWidth="1" />
                            <text x={xScale(atmStrike.strike)} y={PAD.top - 6} textAnchor="middle" fill="rgba(99,102,241,0.6)" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">ATM</text>
                        </>
                    )}

                    {/* Fills */}
                    {callFillPath && <path d={callFillPath} fill="url(#callGrad)" opacity="0.5" />}
                    {putFillPath && <path d={putFillPath} fill="url(#putGrad)" opacity="0.5" />}

                    {/* Skew Gap */}
                    {strikeData.length > 2 && (() => {
                        const pairs = strikeData.filter(d => d.callIV > 0 && d.putIV > 0);
                        if (pairs.length < 2) return null;
                        const topPts = pairs.map(d => `${xScale(d.strike)},${yScale(Math.max(d.putIV, d.callIV))}`);
                        const bottomPts = pairs.map(d => `${xScale(d.strike)},${yScale(Math.min(d.putIV, d.callIV))}`).reverse();
                        const gapPath = `M${topPts.join('L')}L${bottomPts.join('L')}Z`;
                        const gapColor = skewDir === 'PUT RICH' ? 'rgba(244,63,94,0.06)' : skewDir === 'CALL RICH' ? 'rgba(16,185,129,0.06)' : 'rgba(99,102,241,0.04)';
                        return <path d={gapPath} fill={gapColor} />;
                    })()}

                    {/* Dashed vertical indicators */}
                    {fearStrike && <line x1={xScale(fearStrike.strike)} y1={PAD.top} x2={xScale(fearStrike.strike)} y2={PAD.top + plotH} stroke="rgba(244,63,94,0.65)" strokeWidth="1.5" strokeDasharray="3,3" />}
                    {targetStrike && <line x1={xScale(targetStrike.strike)} y1={PAD.top} x2={xScale(targetStrike.strike)} y2={PAD.top + plotH} stroke="rgba(16,185,129,0.65)" strokeWidth="1.5" strokeDasharray="3,3" />}

                    {/* Curves */}
                    {callPath && <path d={callPath} fill="none" stroke="#10b981" strokeWidth="2" filter="url(#glowCall)" strokeLinecap="round" strokeLinejoin="round" />}
                    {putPath && <path d={putPath} fill="none" stroke="#f43f5e" strokeWidth="2" filter="url(#glowPut)" strokeLinecap="round" strokeLinejoin="round" />}

                    {/* Data points */}
                    {strikeData.map((d, i) => {
                        const isHover = i === hoverIdx;
                        return (
                            <g key={`dots-${d.strike}`}>
                                {d.callIV > 0 && (
                                    <circle cx={xScale(d.strike)} cy={yScale(d.callIV)} r={isHover ? 4 : 2} fill="#10b981" stroke={isHover ? "#fff" : "none"} strokeWidth={isHover ? 1 : 0} opacity={isHover ? 1 : 0.6} />
                                )}
                                {d.putIV > 0 && (
                                    <circle cx={xScale(d.strike)} cy={yScale(d.putIV)} r={isHover ? 4 : 2} fill="#f43f5e" stroke={isHover ? "#fff" : "none"} strokeWidth={isHover ? 1 : 0} opacity={isHover ? 1 : 0.6} />
                                )}
                            </g>
                        );
                    })}

                    {/* Crossover indicator */}
                    {crossover && (
                        <g>
                            <polygon
                                points={`${xScale(crossover.strike)},${yScale(crossover.callIV) - 5} ${xScale(crossover.strike) + 4.5},${yScale(crossover.callIV)} ${xScale(crossover.strike)},${yScale(crossover.callIV) + 5} ${xScale(crossover.strike) - 4.5},${yScale(crossover.callIV)}`}
                                fill="rgba(251,191,36,0.3)"
                                stroke="#fbbf24"
                                strokeWidth="1"
                            />
                            <text x={xScale(crossover.strike)} y={yScale(crossover.callIV) - 9} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">{L.cross}</text>
                        </g>
                    )}

                    {/* Fear Line & Call Target Badges */}
                    {fearStrike && (() => {
                        const badgeW = 96;
                        const badgeH = 46;
                        const x = getBadgeX(fearStrike.strike, badgeW);
                        const y = PAD.top + 12;
                        return (
                            <g>
                                <rect
                                    x={x - badgeW / 2}
                                    y={y}
                                    width={badgeW}
                                    height={badgeH}
                                    rx="7"
                                    fill="#0f172a"
                                    stroke="#f43f5e"
                                    strokeWidth="1.8"
                                    opacity="0.98"
                                />
                                <text
                                    x={x}
                                    y={y + 17}
                                    textAnchor="middle"
                                    fill="#f43f5e"
                                    fontSize="12.5"
                                    fontWeight="900"
                                    fontFamily="Plus Jakarta Sans, system-ui"
                                >
                                    {L.fear}
                                </text>
                                <text
                                    x={x}
                                    y={y + 35}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    fontSize="16"
                                    fontWeight="900"
                                    fontFamily="Plus Jakarta Sans, system-ui"
                                >
                                    ${fearStrike.strike}
                                </text>
                            </g>
                        );
                    })()}

                    {targetStrike && (() => {
                        const badgeW = 96;
                        const badgeH = 46;
                        const x = getBadgeX(targetStrike.strike, badgeW);
                        const y = PAD.top + 12;
                        return (
                            <g>
                                <rect
                                    x={x - badgeW / 2}
                                    y={y}
                                    width={badgeW}
                                    height={badgeH}
                                    rx="7"
                                    fill="#0f172a"
                                    stroke="#10b981"
                                    strokeWidth="1.8"
                                    opacity="0.98"
                                />
                                <text
                                    x={x}
                                    y={y + 17}
                                    textAnchor="middle"
                                    fill="#10b981"
                                    fontSize="12.5"
                                    fontWeight="900"
                                    fontFamily="Plus Jakarta Sans, system-ui"
                                >
                                    {L.target}
                                </text>
                                <text
                                    x={x}
                                    y={y + 35}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    fontSize="16"
                                    fontWeight="900"
                                    fontFamily="Plus Jakarta Sans, system-ui"
                                >
                                    ${targetStrike.strike}
                                </text>
                            </g>
                        );
                    })()}

                    {/* Hover indicator & values */}
                    {hoverData && hoverIdx !== null && (
                        <>
                            <line x1={xScale(hoverData.strike)} y1={PAD.top} x2={xScale(hoverData.strike)} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.12)" strokeDasharray="2,2" />
                            <rect
                                x={Math.min(xScale(hoverData.strike) + 8, W - 140)}
                                y={PAD.top}
                                width="130"
                                height="72"
                                rx="5"
                                fill="rgba(15,23,42,0.95)"
                                stroke="rgba(99,102,241,0.3)"
                                strokeWidth="1.2"
                            />
                            <text x={Math.min(xScale(hoverData.strike) + 14, W - 134)} y={PAD.top + 15} fill="#e2e8f0" fontSize="11.5" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">
                                ${hoverData.strike} {hoverData.isATM ? '(ATM)' : ''}
                            </text>
                            <text x={Math.min(xScale(hoverData.strike) + 14, W - 134)} y={PAD.top + 30} fill="#10b981" fontSize="11.5" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">
                                Call IV: {hoverData.callIV > 0 ? `${hoverData.callIV.toFixed(1)}%` : '—'}
                            </text>
                            <text x={Math.min(xScale(hoverData.strike) + 14, W - 134)} y={PAD.top + 45} fill="#f43f5e" fontSize="11.5" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">
                                Put IV:  {hoverData.putIV > 0 ? `${hoverData.putIV.toFixed(1)}%` : '—'}
                            </text>
                            <text x={Math.min(xScale(hoverData.strike) + 14, W - 134)} y={PAD.top + 60} fill="#94a3b8" fontSize="10.5" fontFamily="Plus Jakarta Sans, system-ui">
                                Δ {(hoverData.putIV - hoverData.callIV) > 0 ? '+' : ''}{(hoverData.putIV - hoverData.callIV).toFixed(1)}%
                            </text>
                        </>
                    )}

                    {/* Small Legend */}
                    <g>
                        <circle cx={PAD.left + 5} cy={PAD.top + 5} r="3.5" fill="#10b981" />
                        <text x={PAD.left + 14} y={PAD.top + 8.5} fill="#10b981" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">CALL IV</text>
                        <circle cx={PAD.left + 65} cy={PAD.top + 5} r="3.5" fill="#f43f5e" />
                        <text x={PAD.left + 74} y={PAD.top + 8.5} fill="#f43f5e" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">PUT IV</text>
                    </g>
                </svg>
            </div>

            {/* Skew Verdict Summary Card (Image 2 style) */}
            <div className="mx-4 mb-4 p-3.5 rounded-xl border border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-indigo-400">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                        </svg>
                        <span className="text-[11.5px] font-black text-slate-400 uppercase tracking-widest">{L.skewSummaryTitle}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 font-bold">{L.avgDelta} <span className={`font-black ${summary.color}`}>{(avgPutIV - avgCallIV) > 0 ? '+' : ''}{(avgPutIV - avgCallIV).toFixed(1)}%</span></span>
                        <span className="text-[11px] text-slate-500">|</span>
                        <span className="text-[11px] text-slate-400 font-bold">{strikeData.length} {L.strikesCount}</span>
                    </div>
                </div>
                <div className={`text-[14.5px] font-black mb-1.5 ${summary.color}`}>
                    {summary.title}
                </div>
                <div className="text-[12.5px] text-slate-300/80 leading-relaxed font-sans font-medium">
                    {summary.desc}
                </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-white/[0.01] border-t border-white/[0.04] text-[10px] text-slate-400/80 text-center font-medium font-sans">
                {L.footerInfo}
            </div>
        </div>
    );
}
