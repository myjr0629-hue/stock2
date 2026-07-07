"use client";

/**
 * IVSkewCurveWeb — (desktop-web original, pre-2026-06-19 mobile rework) — Premium IV Smile/Skew Visualization
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

interface IVSkewCurveWebProps {
    ticker: string;
    atmSlice?: AtmContract[];
    underlyingPrice: number;
    expiration?: string;
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

export default function IVSkewCurveWeb({ ticker, atmSlice: parentAtmSlice, underlyingPrice, expiration }: IVSkewCurveWebProps) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const locale = useLocale() as 'ko' | 'en' | 'ja';

    // i18n annotation labels
    const L = {
        fear: { ko: '▼ 공포 라인', en: '▼ FEAR LINE', ja: '▼ 恐怖ライン' }[locale],
        target: { ko: '▲ 기대 타겟', en: '▲ CALL TARGET', ja: '▲ 期待ターゲット' }[locale],
        cross: { ko: '교차점', en: 'CROSSOVER', ja: '交差点' }[locale],
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
        if (!atmSlice || atmSlice.length === 0) return { strikeData: [], avgCallIV: 0, avgPutIV: 0, skewDir: 'BALANCED' as const, maxIV: 0, fearStrike: null as StrikeIV | null, targetStrike: null as StrikeIV | null, crossover: null as StrikeIV | null };

        const byStrike: Record<number, { call: AtmContract | null; put: AtmContract | null }> = {};
        for (const c of atmSlice) {
            if (!byStrike[c.strike]) byStrike[c.strike] = { call: null, put: null };
            if (c.type === 'call') byStrike[c.strike].call = c;
            else byStrike[c.strike].put = c;
        }

        const strikes = Object.keys(byStrike).map(Number).sort((a, b) => a - b);
        const data: StrikeIV[] = strikes.map(s => {
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
                isATM: Math.abs(s - resolvedPrice) <= (resolvedPrice * 0.01),
            };
        }).filter(d => (d.callIV > 0 || d.putIV > 0) && d.callIV <= IV_CAP && d.putIV <= IV_CAP);

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
        // Only show if slope is significant (>3% per strike step)
        if (fearSlope < 3) fearStrike = null;

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
        if (targetSlope < 2) targetStrike = null;

        // 3. Crossover: where Put IV line crosses Call IV line
        let crossover: StrikeIV | null = null;
        for (let i = 1; i < data.length; i++) {
            if (data[i].callIV > 0 && data[i].putIV > 0 && data[i-1].callIV > 0 && data[i-1].putIV > 0) {
                const prevDiff = data[i-1].putIV - data[i-1].callIV;
                const currDiff = data[i].putIV - data[i].callIV;
                if (prevDiff * currDiff < 0) { // sign change = crossover
                    crossover = Math.abs(currDiff) < Math.abs(prevDiff) ? data[i] : data[i-1];
                    break;
                }
            }
        }

        return { strikeData: data, avgCallIV: ac, avgPutIV: ap, skewDir: dir as 'PUT RICH' | 'CALL RICH' | 'BALANCED', maxIV: mx, fearStrike, targetStrike, crossover };
    }, [atmSlice, resolvedPrice, wsIVByStrike]);

    // SVG dimensions
    const W = 700, H = 280, PAD = { top: 30, right: 20, bottom: 50, left: 55 };
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
    const { callPath, putPath, callFillPath, putFillPath, callPoints, putPoints } = useMemo(() => {
        if (strikeData.length < 2) return { callPath: '', putPath: '', callFillPath: '', putFillPath: '', callPoints: [], putPoints: [] };

        const cPts = strikeData.filter(d => d.callIV > 0).map(d => ({ x: xScale(d.strike), y: yScale(d.callIV) }));
        const pPts = strikeData.filter(d => d.putIV > 0).map(d => ({ x: xScale(d.strike), y: yScale(d.putIV) }));

        const cp = makePath(cPts);
        const pp = makePath(pPts);

        const baseY = PAD.top + plotH;
        const cFill = cPts.length > 0 ? `${cp}L${cPts[cPts.length - 1].x},${baseY}L${cPts[0].x},${baseY}Z` : '';
        const pFill = pPts.length > 0 ? `${pp}L${pPts[pPts.length - 1].x},${baseY}L${pPts[0].x},${baseY}Z` : '';

        return { callPath: cp, putPath: pp, callFillPath: cFill, putFillPath: pFill, callPoints: cPts, putPoints: pPts };
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
    }, [strikeData, xScale, plotW, W]);

    if (strikeData.length < 2) {
        return (
            <div className="min-h-[380px] rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-slate-400">
                    <TrendingUp className="w-8 h-8 opacity-30" />
                    <span className="text-[13px] font-jakarta font-bold">IV SKEW DATA PENDING</span>
                    <span className="text-[12px] text-slate-500 font-jakarta">Available during regular trading hours</span>
                </div>
            </div>
        );
    }

    const skewColor = skewDir === 'PUT RICH' ? 'text-rose-400' : skewDir === 'CALL RICH' ? 'text-emerald-400' : 'text-cyan-400';
    const skewBadgeBg = skewDir === 'PUT RICH' ? 'bg-rose-950/50 border-rose-500/30' : skewDir === 'CALL RICH' ? 'bg-emerald-950/50 border-emerald-500/30' : 'bg-cyan-950/50 border-cyan-500/30';
    const hoverData = hoverIdx !== null ? strikeData[hoverIdx] : null;

    // ATM marker
    const atmStrike = strikeData.find(d => d.isATM);

    return (
        <div className="min-h-[380px] rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg flex flex-col relative group hover:border-white/20 transition-colors overflow-hidden">
            {/* Infographic BG */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.04)_1px,transparent_1px)] bg-[size:28px_28px]" />
                <div className="absolute -top-16 -right-16 w-56 h-56 bg-[radial-gradient(circle,rgba(99,102,241,0.10)_0%,transparent_60%)] animate-pulse" style={{ animationDuration: '6s' }} />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[radial-gradient(circle,rgba(168,85,247,0.08)_0%,transparent_60%)]" />
                <div className="absolute top-0 right-0 w-12 h-12 border-r-2 border-t-2 border-indigo-500/15 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-12 h-12 border-l-2 border-b-2 border-indigo-500/15 rounded-bl-xl" />
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
            </div>

            {/* Header */}
            <div className="relative z-10 p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-2">
                    <h4 className="text-[12px] font-black text-white uppercase tracking-widest flex items-center gap-2 font-jakarta">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-sm animate-pulse" />
                        IV SKEW CURVE
                        {hasLiveIV && <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-full border border-emerald-500/30 animate-pulse">LIVE</span>}
                    </h4>
                    {resolvedExpiration && (
                        <span className="text-[12px] text-slate-400 font-mono font-jakarta">EXP: {resolvedExpiration}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* Average IVs */}
                    <span className="text-[12px] font-bold text-emerald-400 font-jakarta">C {avgCallIV.toFixed(1)}%</span>
                    <span className="text-[12px] text-slate-500">|</span>
                    <span className="text-[12px] font-bold text-rose-400 font-jakarta">P {avgPutIV.toFixed(1)}%</span>
                    <span className={`text-[12px] font-black px-1.5 py-0.5 rounded border font-jakarta ${skewBadgeBg} ${skewColor}`}>
                        {skewDir}
                    </span>
                </div>
            </div>

            {/* Chart */}
            <div className="relative z-10 flex-1 p-2">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-full"
                    preserveAspectRatio="xMidYMid meet"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverIdx(null)}
                >
                    <defs>
                        {/* Call IV gradient (emerald) */}
                        <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(16,185,129,0.25)" />
                            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                        </linearGradient>
                        {/* Put IV gradient (rose) */}
                        <linearGradient id="putGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(244,63,94,0.20)" />
                            <stop offset="100%" stopColor="rgba(244,63,94,0)" />
                        </linearGradient>
                        {/* Glow filters */}
                        <filter id="glowCall" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                        <filter id="glowPut" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>

                    {/* Y-axis gridlines + labels */}
                    {yTicks.map(v => (
                        <g key={v}>
                            <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)} stroke="rgba(148,163,184,0.08)" strokeDasharray="3,3" />
                            <text x={PAD.left - 8} y={yScale(v) + 4} textAnchor="end" fill="rgba(148,163,184,0.5)" fontSize="11" fontFamily="Plus Jakarta Sans, system-ui">{v}%</text>
                        </g>
                    ))}

                    {/* X-axis strike labels */}
                    {strikeData.map((d, i) => (
                        <text
                            key={d.strike}
                            x={xScale(d.strike)}
                            y={H - 8}
                            textAnchor="middle"
                            fill={d.isATM ? "rgba(99,102,241,0.9)" : "rgba(148,163,184,0.5)"}
                            fontSize={d.isATM ? "12" : "11"}
                            fontWeight={d.isATM ? "900" : "400"}
                            fontFamily="Plus Jakarta Sans, system-ui"
                        >
                            ${d.strike}
                        </text>
                    ))}

                    {/* ATM vertical marker */}
                    {atmStrike && (
                        <>
                            <line x1={xScale(atmStrike.strike)} y1={PAD.top} x2={xScale(atmStrike.strike)} y2={PAD.top + plotH} stroke="rgba(99,102,241,0.3)" strokeDasharray="4,4" strokeWidth="1" />
                            <text x={xScale(atmStrike.strike)} y={PAD.top - 8} textAnchor="middle" fill="rgba(99,102,241,0.7)" fontSize="10" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">ATM</text>
                        </>
                    )}

                    {/* Gradient fills */}
                    {callFillPath && <path d={callFillPath} fill="url(#callGrad)" opacity="0.6" />}
                    {putFillPath && <path d={putFillPath} fill="url(#putGrad)" opacity="0.6" />}

                    {/* === ANNOTATION: Skew Gap (filled area between curves near ATM) === */}
                    {strikeData.length > 2 && (() => {
                        const pairs = strikeData.filter(d => d.callIV > 0 && d.putIV > 0);
                        if (pairs.length < 2) return null;
                        const topPts = pairs.map(d => `${xScale(d.strike)},${yScale(Math.max(d.putIV, d.callIV))}`);
                        const bottomPts = pairs.map(d => `${xScale(d.strike)},${yScale(Math.min(d.putIV, d.callIV))}`).reverse();
                        const gapPath = `M${topPts.join('L')}L${bottomPts.join('L')}Z`;
                        const gapColor = skewDir === 'PUT RICH' ? 'rgba(244,63,94,0.08)' : skewDir === 'CALL RICH' ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.06)';
                        return <path d={gapPath} fill={gapColor} />;
                    })()}

                    {/* === LAYER 1: Annotation dashed lines (BEHIND curves) === */}
                    {fearStrike && <line x1={xScale(fearStrike.strike)} y1={PAD.top} x2={xScale(fearStrike.strike)} y2={PAD.top + plotH} stroke="rgba(244,63,94,0.4)" strokeWidth="1.5" strokeDasharray="4,3" />}
                    {targetStrike && <line x1={xScale(targetStrike.strike)} y1={PAD.top} x2={xScale(targetStrike.strike)} y2={PAD.top + plotH} stroke="rgba(16,185,129,0.4)" strokeWidth="1.5" strokeDasharray="4,3" />}

                    {/* Curves */}
                    {callPath && <path d={callPath} fill="none" stroke="#10b981" strokeWidth="2.5" filter="url(#glowCall)" strokeLinecap="round" strokeLinejoin="round" />}
                    {putPath && <path d={putPath} fill="none" stroke="#f43f5e" strokeWidth="2.5" filter="url(#glowPut)" strokeLinecap="round" strokeLinejoin="round" />}

                    {/* Data points */}
                    {strikeData.map((d, i) => {
                        const isHover = i === hoverIdx;
                        return (
                            <g key={`dots-${d.strike}`}>
                                {d.callIV > 0 && (
                                    <circle cx={xScale(d.strike)} cy={yScale(d.callIV)} r={isHover ? 5 : 3} fill="#10b981" stroke={isHover ? "#fff" : "none"} strokeWidth={isHover ? 1.5 : 0} opacity={isHover ? 1 : 0.7}>
                                        {isHover && <animate attributeName="r" values="5;7;5" dur="1s" repeatCount="indefinite" />}
                                    </circle>
                                )}
                                {d.putIV > 0 && (
                                    <circle cx={xScale(d.strike)} cy={yScale(d.putIV)} r={isHover ? 5 : 3} fill="#f43f5e" stroke={isHover ? "#fff" : "none"} strokeWidth={isHover ? 1.5 : 0} opacity={isHover ? 1 : 0.7}>
                                        {isHover && <animate attributeName="r" values="5;7;5" dur="1s" repeatCount="indefinite" />}
                                    </circle>
                                )}
                            </g>
                        );
                    })}

                    {/* === LAYER 2: Annotation labels ON TOP of curves === */}
                    {fearStrike && (() => {
                        const fx = xScale(fearStrike.strike);
                        // Position label to the right of the line
                        const lx = fx + 5;
                        const bw = 82;
                        return (
                            <g>
                                <rect x={lx} y={PAD.top + 12} width={bw} height="20" rx="4" fill="rgba(15,23,42,0.92)" stroke="rgba(244,63,94,0.5)" strokeWidth="1" />
                                <text x={lx + bw / 2} y={PAD.top + 26} textAnchor="middle" fill="#fb7185" fontSize="10" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">{L.fear}</text>
                                <rect x={lx} y={PAD.top + 35} width={bw} height="18" rx="3" fill="rgba(15,23,42,0.85)" />
                                <text x={lx + bw / 2} y={PAD.top + 48} textAnchor="middle" fill="#fda4af" fontSize="12" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">${fearStrike.strike}</text>
                            </g>
                        );
                    })()}

                    {targetStrike && (() => {
                        const tx = xScale(targetStrike.strike);
                        const bw = 88;
                        // Position label to the left of the line if near right edge
                        const lx = tx > W - PAD.right - 95 ? tx - bw - 5 : tx + 5;
                        return (
                            <g>
                                <rect x={lx} y={PAD.top + 12} width={bw} height="20" rx="4" fill="rgba(15,23,42,0.92)" stroke="rgba(16,185,129,0.5)" strokeWidth="1" />
                                <text x={lx + bw / 2} y={PAD.top + 26} textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">{L.target}</text>
                                <rect x={lx} y={PAD.top + 35} width={bw} height="18" rx="3" fill="rgba(15,23,42,0.85)" />
                                <text x={lx + bw / 2} y={PAD.top + 48} textAnchor="middle" fill="#6ee7b7" fontSize="12" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">${targetStrike.strike}</text>
                            </g>
                        );
                    })()}

                    {/* === ANNOTATION: Crossover Point (where curves intersect) === */}
                    {crossover && (
                        <g>
                            <polygon
                                points={`${xScale(crossover.strike)},${yScale(crossover.callIV) - 7} ${xScale(crossover.strike) + 6},${yScale(crossover.callIV)} ${xScale(crossover.strike)},${yScale(crossover.callIV) + 7} ${xScale(crossover.strike) - 6},${yScale(crossover.callIV)}`}
                                fill="rgba(251,191,36,0.25)"
                                stroke="#fbbf24"
                                strokeWidth="1.5"
                            />
                            <text x={xScale(crossover.strike)} y={yScale(crossover.callIV) - 12} textAnchor="middle" fill="#fbbf24" fontSize="9" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">{L.cross}</text>
                        </g>
                    )}

                    {/* Hover crosshair + tooltip */}
                    {hoverData && hoverIdx !== null && (
                        <>
                            <line x1={xScale(hoverData.strike)} y1={PAD.top} x2={xScale(hoverData.strike)} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.15)" strokeDasharray="2,2" />
                            <rect
                                x={Math.min(xScale(hoverData.strike) + 10, W - 155)}
                                y={PAD.top + 5}
                                width="145"
                                height="80"
                                rx="6"
                                fill="rgba(15,23,42,0.92)"
                                stroke="rgba(99,102,241,0.3)"
                                strokeWidth="1"
                            />
                            <text x={Math.min(xScale(hoverData.strike) + 18, W - 147)} y={PAD.top + 22} fill="#e2e8f0" fontSize="12" fontWeight="800" fontFamily="Plus Jakarta Sans, system-ui">
                                ${hoverData.strike} {hoverData.isATM ? '(ATM)' : ''}
                            </text>
                            <text x={Math.min(xScale(hoverData.strike) + 18, W - 147)} y={PAD.top + 39} fill="#10b981" fontSize="12" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">
                                Call IV: {hoverData.callIV > 0 ? `${hoverData.callIV.toFixed(1)}%` : '—'}
                            </text>
                            <text x={Math.min(xScale(hoverData.strike) + 18, W - 147)} y={PAD.top + 55} fill="#f43f5e" fontSize="12" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">
                                Put IV:  {hoverData.putIV > 0 ? `${hoverData.putIV.toFixed(1)}%` : '—'}
                            </text>
                            <text x={Math.min(xScale(hoverData.strike) + 18, W - 147)} y={PAD.top + 73} fill="#94a3b8" fontSize="11" fontFamily="Plus Jakarta Sans, system-ui">
                                Δ {(hoverData.putIV - hoverData.callIV) > 0 ? '+' : ''}{(hoverData.putIV - hoverData.callIV).toFixed(1)}% · OI {((hoverData.callOI + hoverData.putOI) / 1000).toFixed(1)}K
                            </text>
                        </>
                    )}

                    {/* Legend */}
                    <g>
                        <circle cx={PAD.left + 10} cy={PAD.top + 10} r="4" fill="#10b981" />
                        <text x={PAD.left + 18} y={PAD.top + 14} fill="#10b981" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">Call IV</text>
                        <circle cx={PAD.left + 75} cy={PAD.top + 10} r="4" fill="#f43f5e" />
                        <text x={PAD.left + 83} y={PAD.top + 14} fill="#f43f5e" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans, system-ui">Put IV</text>
                    </g>
                </svg>
            </div>

            {/* Bottom insight bar */}
            <div className="relative z-10 p-2.5 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <TrendingUp className={`w-3.5 h-3.5 ${skewColor}`} />
                    <span className={`text-[12px] font-bold font-jakarta ${skewColor}`}>
                        {skewDir === 'PUT RICH' ? L.putRich : skewDir === 'CALL RICH' ? L.callRich : L.balanced}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-slate-400 font-jakarta tabular-nums">
                    <span>Avg Δ <span className={`font-bold ${skewColor}`}>{(avgPutIV - avgCallIV) > 0 ? '+' : ''}{(avgPutIV - avgCallIV).toFixed(1)}%</span></span>
                    <span className="text-slate-600">|</span>
                    <span>{strikeData.length} strikes</span>
                </div>
            </div>
        </div>
    );
}
