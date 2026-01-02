"use client";

import React, { useMemo, useState } from 'react';
import { Radar, Target, Crosshair, Zap, Layers, Info, TrendingUp, TrendingDown, Activity, Lightbulb, Percent, Lock, Shield } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "./ui/progress";

interface FlowRadarProps {
    rawChain: any[];
    currentPrice: number;
}

export function FlowRadar({ rawChain, currentPrice }: FlowRadarProps) {
    const [userViewMode, setUserViewMode] = useState<'VOLUME' | 'OI' | null>(null);

    // Process Data: Group by Strike
    const { flowMap, totalVolume } = useMemo(() => {
        if (!rawChain || rawChain.length === 0) return { flowMap: [], totalVolume: 0 };

        const strikeMap = new Map<number, { callVol: number; putVol: number; callOI: number; putOI: number }>();
        let totalVol = 0;

        rawChain.forEach(opt => {
            const strike = opt.details?.strike_price;
            const type = opt.details?.contract_type;
            const vol = opt.day?.volume || 0;
            const oi = opt.open_interest || 0;

            totalVol += vol;

            if (!strike) return;

            if (!strikeMap.has(strike)) {
                strikeMap.set(strike, { callVol: 0, putVol: 0, callOI: 0, putOI: 0 });
            }

            const entry = strikeMap.get(strike)!;
            if (type === 'call') {
                entry.callVol += vol;
                entry.callOI += oi;
            } else if (type === 'put') {
                entry.putVol += vol;
                entry.putOI += oi;
            }
        });

        // Filter for Near-the-Money (±15%)
        const range = currentPrice * 0.15;
        const relevantStrikes = Array.from(strikeMap.keys())
            .filter(s => s >= currentPrice - range && s <= currentPrice + range)
            .sort((a, b) => b - a); // Descending order

        return {
            flowMap: relevantStrikes.map(s => ({
                strike: s,
                ...strikeMap.get(s)!
            })),
            totalVolume: totalVol
        };
    }, [rawChain, currentPrice]);

    // Intelligent Default Mode
    const effectiveViewMode = userViewMode || (totalVolume > 0 ? 'VOLUME' : 'OI');
    const isMarketClosed = totalVolume === 0 && rawChain.length > 0;

    // Calculate Max for Scaling
    const maxVal = useMemo(() => {
        if (flowMap.length === 0) return 1;
        return Math.max(...flowMap.map(d => effectiveViewMode === 'VOLUME'
            ? Math.max(d.callVol, d.putVol)
            : Math.max(d.callOI, d.putOI)
        ));
    }, [flowMap, effectiveViewMode]);

    // Calculate Walls (Dominant Strikes)
    const { callWall, putWall } = useMemo(() => {
        let maxCall = -1, maxPut = -1;
        let cStrike = 0, pStrike = 0;

        flowMap.forEach(d => {
            const cVal = effectiveViewMode === 'VOLUME' ? d.callVol : d.callOI;
            const pVal = effectiveViewMode === 'VOLUME' ? d.putVol : d.putOI;

            if (cVal > maxCall) { maxCall = cVal; cStrike = d.strike; }
            if (pVal > maxPut) { maxPut = pVal; pStrike = d.strike; }
        });

        return { callWall: cStrike, putWall: pStrike };
    }, [flowMap, effectiveViewMode]);

    // Dynamic Analysis & Probability Logic
    const analysis = useMemo(() => {
        if (callWall === 0 || putWall === 0) return null;

        const distToCall = ((callWall - currentPrice) / currentPrice) * 100;
        const distToPut = ((currentPrice - putWall) / currentPrice) * 100;

        // Probability Calculation (Heuristic)
        const proximityScore = 100 - Math.min(Math.abs(distToCall), Math.abs(distToPut)) * 20;

        const callWallData = flowMap.find(f => f.strike === callWall);
        const putWallData = flowMap.find(f => f.strike === putWall);

        const cVol = callWallData?.callVol || 1;
        const pVol = putWallData?.putVol || 1;

        let probability = 50;
        let probLabel = "중립 (Neutral)";
        let probColor = "text-slate-400";

        if (distToCall < 2.0) { // Approaching Resistance
            const pressure = (cVol / (cVol + pVol)) * 100; // % of volume that is Call
            probability = Math.min(95, Math.max(5, (proximityScore * 0.4) + (pressure * 0.6)));

            if (probability > 70) { probLabel = "돌파 유력 (High Prob)"; probColor = "text-emerald-400"; }
            else if (probability > 40) { probLabel = "공방 치열 (Contested)"; probColor = "text-amber-400"; }
            else { probLabel = "저항 강력 (Rejection)"; probColor = "text-rose-400"; }

        } else if (distToPut < 2.0) { // Approaching Support
            const pressure = (pVol / (cVol + pVol)) * 100;
            probability = Math.min(95, Math.max(5, (proximityScore * 0.4) + (pressure * 0.6)));

            if (probability > 70) { probLabel = "이탈 위험 (High Danger)"; probColor = "text-rose-400"; }
            else { probLabel = "지지 유력 (Bounce Prob)"; probColor = "text-emerald-400"; }
        } else {
            probability = 50;
        }

        let status = "판단 보류 (NEUTRAL)";
        let message = "";
        let color = "text-slate-400";

        if (currentPrice > callWall) {
            status = "🚀 상승 돌파 (BREAKOUT)";
            message = `현재가($${currentPrice})가 저항벽($${callWall})을 뚫었습니다! 이는 강한 매수 신호이며, 추가 상승(감마 스퀴즈) 가능성이 높습니다.`;
            color = "text-emerald-400";
        } else if (currentPrice < putWall) {
            status = "📉 하락 이탈 (BREAKDOWN)";
            message = `주가($${currentPrice})가 지지벽($${putWall}) 아래로 떨어졌습니다. 하락 추세가 강하지만, 과매도 구간이므로 급반등에도 유의해야 합니다.`;
            color = "text-rose-400";
        } else {
            // Inside the Range
            if (distToCall < 1.0) {
                status = "⚔️ 저항선 공방 (Testing Resistance)";
                message = `주가가 거대한 저항벽($${callWall})에 도전 중입니다. 현재 돌파 확률은 ${probability.toFixed(0)}%로 분석됩니다.`;
                color = "text-amber-400";
            } else if (distToPut < 1.0) {
                status = "🛡️ 지지선 방어 (Testing Support)";
                message = `주가가 지지벽($${putWall})을 테스트 중입니다. 현재 지지 성공 확률은 ${(100 - probability).toFixed(0)}% 입니다.`;
                color = "text-indigo-400";
            } else {
                status = "⚖️ 박스권 (Range Bound)";
                message = `현재는 '바닥($${putWall})'과 '천장($${callWall})' 사이에서 움직이는 박스권입니다. 벽에 가까워질 때 매매하는 것이 유리합니다.`;
                color = "text-blue-400";
            }
        }

        return { status, message, color, probability, probLabel, probColor };
    }, [currentPrice, callWall, putWall, flowMap]);

    if (!rawChain || rawChain.length === 0) {
        return (
            <div className="h-[400px] flex flex-col items-center justify-center text-slate-500 bg-slate-900/50 rounded-lg border border-white/5">
                <Radar size={48} className="mb-4 opacity-20" />
                <p>No Flow Data Available</p>
                <p className="text-xs opacity-50">Waiting for live options stream...</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in zoom-in duration-500">
            {/* Header / Control Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50 p-2 px-4 rounded-md border border-white/5 backdrop-blur-md">
                {/* 1. Left: Branding with Prestige */}
                <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="h-9 w-9 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                        <Crosshair size={18} className="text-emerald-400 animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-white tracking-wide flex items-center gap-2">
                            FLOW RADAR <span className="text-amber-400 text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 flex items-center gap-1"><Shield size={8} /> GEMS INSTITUTIONAL</span>
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                            {isMarketClosed ?
                                <span className="text-amber-500 flex items-center gap-1"><Zap size={9} /> PRE-MARKET • PREVIOUS CLOSE DATA (OI)</span>
                                : <span className="text-emerald-400 flex items-center gap-1"><Zap size={9} /> Live Action • MM Tracking</span>
                            }
                        </p>
                    </div>
                </div>

                {/* 2. Center: Strategy Tip */}
                <div className="hidden md:flex flex-1 justify-center">
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                        <Lightbulb size={12} className="text-indigo-300" />
                        <span className="text-[10px] text-indigo-200 font-bold tracking-wide">
                            {effectiveViewMode === 'VOLUME'
                                ? (isMarketClosed ? "⚡ Volume(거래량): 장전(Pre) 대기중 - 본장 시작 시 활성화" : "⚡ Volume(거래량): '단타/모멘텀' - 오늘 고래들이 싸우는 현장")
                                : "🏰 OI(누적매물): '스윙/추세' - MM이 설계한 진짜 지지/저항 성벽"}
                        </span>
                    </div>
                </div>

                {/* 3. Right: Toggles */}
                <div className="flex bg-slate-950 rounded-md p-1 border border-white/10 shrink-0">
                    <button
                        onClick={() => setUserViewMode('VOLUME')}
                        className={`px-4 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-wider ${effectiveViewMode === 'VOLUME' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Volume
                    </button>
                    <button
                        onClick={() => setUserViewMode('OI')}
                        className={`px-4 py-1.5 text-[10px] font-black rounded transition-all uppercase tracking-wider ${effectiveViewMode === 'OI' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        OI
                    </button>
                </div>
            </div>

            {/* Tactical Intel Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

                {/* 1. Main Radar Chart */}
                <Card className="bg-slate-900/80 border-white/10 shadow-2xl relative overflow-hidden order-2 lg:order-1 rounded-lg h-full flex flex-col">
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                    <CardContent className="p-6 relative z-10 flex-1 flex flex-col">
                        <div className="grid grid-cols-[1fr_80px_1fr] gap-4 mb-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 text-center shrink-0">
                            <div className="text-rose-500/50 flex items-center justify-end gap-2">
                                <span className="hidden md:inline">Put Flow (하락)</span> <div className="w-2 h-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                            </div>
                            <div className="text-slate-300">Strike (행사가)</div>
                            <div className="text-emerald-500/50 flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> <span className="hidden md:inline">Call Flow (상승)</span>
                            </div>
                        </div>

                        <div className="space-y-1.5 overflow-y-auto pr-2 scrollbar-hide relative flex-1 min-h-0">
                            {flowMap.map((row, index) => {
                                const isAtMoney = Math.abs(row.strike - currentPrice) / currentPrice < 0.005;
                                const callVal = effectiveViewMode === 'VOLUME' ? row.callVol : row.callOI;
                                const putVal = effectiveViewMode === 'VOLUME' ? row.putVol : row.putOI;
                                const callPct = Math.min((callVal / maxVal) * 100, 100);
                                const putPct = Math.min((putVal / maxVal) * 100, 100);

                                const isCallWallStrike = row.strike === callWall;
                                const isPutWallStrike = row.strike === putWall;
                                const isCallWhale = callPct > 30 || isCallWallStrike;
                                const isPutWhale = putPct > 30 || isPutWallStrike;

                                const nextRow = flowMap[index + 1];
                                const showCurrentLineHere = nextRow && row.strike >= currentPrice && nextRow.strike < currentPrice;

                                return (
                                    <React.Fragment key={row.strike}>
                                        <div className={`grid grid-cols-[1fr_80px_1fr] gap-4 items-center group hover:bg-white/5 rounded-lg py-1 transition-colors ${isAtMoney ? "bg-indigo-500/10 border border-indigo-500/20" : ""}`}>
                                            <div className="flex justify-end items-center h-6 relative">
                                                <span className={`text-[9px] font-mono mr-2 ${putVal > 0 ? "text-rose-400" : "text-slate-700"}`}>
                                                    {putVal > 0 ? putVal.toLocaleString() : ""}
                                                </span>
                                                <div
                                                    className={`h-4 rounded-l-sm transition-all duration-700 relative overflow-hidden ${isPutWallStrike ? "shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse" : ""}`}
                                                    style={{ width: `${putPct}%` }}
                                                >
                                                    <div className={`absolute inset-0 ${isPutWallStrike ? "bg-gradient-to-l from-rose-500 to-rose-700" : "bg-gradient-to-l from-rose-500/80 to-rose-900/50"}`} />
                                                    {/* Glass Sheen */}
                                                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                                                </div>
                                            </div>

                                            <div className="flex justify-center relative">
                                                {isAtMoney && <div className="absolute inset-0 bg-indigo-500/20 blur-md rounded-full animate-pulse" />}
                                                <span className={`text-xs font-mono font-bold z-10 ${isAtMoney ? "text-white scale-110 drop-shadow-[0_0_5px_rgba(99,102,241,0.8)]" : isCallWallStrike || isPutWallStrike ? "text-amber-200" : "text-slate-500 group-hover:text-slate-300"}`}>
                                                    {row.strike}
                                                </span>
                                                {isCallWallStrike && <div className="absolute -right-3 top-1 text-[8px] text-emerald-500 font-black animate-bounce drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]">R</div>}
                                                {isPutWallStrike && <div className="absolute -left-3 top-1 text-[8px] text-rose-500 font-black animate-bounce drop-shadow-[0_0_5px_rgba(244,63,94,0.8)]">S</div>}
                                            </div>

                                            <div className="flex justify-start items-center h-6 relative">
                                                <div
                                                    className={`h-4 rounded-r-sm transition-all duration-700 relative overflow-hidden ${isCallWallStrike ? "shadow-[0_0_15px_rgba(16,185,129,0.6)] animate-pulse" : ""}`}
                                                    style={{ width: `${callPct}%` }}
                                                >
                                                    <div className={`absolute inset-0 ${isCallWallStrike ? "bg-gradient-to-r from-emerald-500 to-emerald-700" : "bg-gradient-to-r from-emerald-500/80 to-emerald-900/50"}`} />
                                                    {/* Glass Sheen */}
                                                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                                                </div>
                                                <span className={`text-[9px] font-mono ml-2 ${callVal > 0 ? "text-emerald-400" : "text-slate-700"}`}>
                                                    {callVal > 0 ? callVal.toLocaleString() : ""}
                                                </span>
                                            </div>
                                        </div>

                                        {showCurrentLineHere && (
                                            <div className="col-span-3 py-1 relative">
                                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-sky-500/30 border-t border-dashed border-sky-400/50 shadow-[0_0_5px_rgba(14,165,233,0.3)]" />
                                                <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 bg-slate-900 border border-sky-500/50 px-3 py-0.5 rounded-full z-20 shadow-[0_0_15px_rgba(14,165,233,0.4)] flex items-center gap-2 animate-pulse backdrop-blur-sm">
                                                    <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-ping" />
                                                    <span className="text-[10px] font-black text-sky-400 tracking-wide">
                                                        ${currentPrice.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Tactical Briefing Console (Korean Mode) */}
                <div className="space-y-4 order-1 lg:order-2 h-full">
                    <Card className="bg-slate-900/60 border-white/10 h-full flex flex-col rounded-lg">
                        <CardContent className="p-5 space-y-4 flex-1 flex flex-col">

                            {/* NEW: Level 3 Header */}
                            <div className="flex items-center gap-2 mb-2 select-none shrink-0">
                                <Lock size={12} className="text-amber-500" />
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">
                                    LEVEL 3 INSTITUTIONAL
                                </span>
                            </div>

                            {/* 1. Current Position Status (Hero Block) */}
                            <div className="bg-[#0f172a] rounded-xl border border-slate-800 p-5 text-center shadow-inner relative overflow-hidden group shrink-0">
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">현재 포지션 제안</span>
                                <div className={`text-xl font-black tracking-tight flex items-center justify-center gap-2 ${analysis?.color || "text-slate-300"}`}>
                                    {analysis?.status === 'RANGE BOUND' && <Activity size={20} />}
                                    {analysis?.status === 'BULLISH' && <TrendingUp size={20} />}
                                    {analysis?.status === 'BEARISH' && <TrendingDown size={20} />}
                                    {analysis?.status}
                                </div>
                            </div>

                            {/* 2. Probability Meter */}
                            {analysis?.probability && analysis.probability !== 50 && (
                                <div className="space-y-2 shrink-0">
                                    <div className="flex justify-between items-end px-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">% 확률 분석 (Beta)</span>
                                        <span className={`text-[10px] font-bold ${analysis.probColor}`}>{analysis.probLabel}</span>
                                    </div>
                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                                        <div
                                            className={`h-full rounded-full shadow-[0_0_10px_currentColor] transition-all duration-1000 ${analysis.probColor.replace('text', 'bg')}`}
                                            style={{ width: `${analysis.probability}%` }}
                                        />
                                        {/* Gloss effect */}
                                        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                                    </div>
                                    <div className="text-[9px] text-right text-slate-500">{analysis.probability.toFixed(0)}%</div>
                                </div>
                            )}

                            {/* 3. Analysis Message Box */}
                            <div className="bg-[#0f172a] rounded-lg border border-slate-800 p-4 relative shrink-0">
                                <div className="absolute left-0 top-4 bottom-4 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                                <div className="flex gap-3 pl-2">
                                    <div className="mt-0.5">
                                        {analysis?.status === 'BULLISH' ? <TrendingUp size={14} className="text-emerald-400" /> :
                                            analysis?.status === 'BEARISH' ? <TrendingDown size={14} className="text-rose-400" /> :
                                                <Activity size={14} className="text-indigo-400" />}
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-line">
                                        {analysis?.message}
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 min-h-[20px]" /> {/* Spacer */}

                            <hr className="border-slate-800/50 my-2" />

                            {/* 5. Key Levels (Dynamic Ladder) - Redesigned */}
                            <div className="mt-auto pt-2 grid grid-cols-1 gap-1">
                                {/* Top: Call Wall */}
                                <div className="bg-gradient-to-b from-emerald-950/30 to-[#0f172a] border border-emerald-900/30 p-2.5 rounded-t-lg flex items-center justify-between group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-50" />
                                    <div>
                                        <div className="text-[9px] text-emerald-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" /> CALL WALL (저항)
                                        </div>
                                    </div>
                                    <div className="text-base font-black text-emerald-400 font-mono tracking-tight">${callWall}</div>
                                </div>

                                {/* Middle: Ladder Visual */}
                                <div className="relative h-12 bg-[#0f172a] border-x border-slate-800/50 mx-2 flex flex-col justify-center items-center">
                                    {/* Vertical Line */}
                                    <div className="absolute top-0 bottom-0 w-[1px] bg-slate-800" />

                                    {/* Current Price Indicator (Relative Position) */}
                                    {(() => {
                                        // Calculate relative position percentage (clamped 10%~90%)
                                        const totalRange = callWall - putWall;
                                        const currentPos = currentPrice - putWall;
                                        let pct = (currentPos / totalRange) * 100;
                                        pct = Math.max(10, Math.min(90, pct)); // Clamp inside visual area

                                        // Inverse for CSS 'top' (100% is bottom, but we want 100% to be call wall at top... actually HTML layout is top-down)
                                        // So 100% pct (closer to call) means 0% top.
                                        const topPct = 100 - pct;

                                        return (
                                            <div
                                                className="absolute w-full flex items-center justify-center transition-all duration-1000 ease-out"
                                                style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
                                            >
                                                <div className="bg-slate-900 border border-indigo-500 text-[9px] font-bold text-indigo-300 px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.3)] z-10 flex items-center gap-1">
                                                    <span className="w-1 h-1 bg-indigo-400 rounded-full animate-ping" /> ${currentPrice.toFixed(2)}
                                                </div>
                                                <div className="absolute w-[calc(100%+8px)] h-[1px] bg-indigo-500/30 border-t border-dotted border-indigo-500/50" />
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Bottom: Put Floor */}
                                <div className="bg-gradient-to-t from-rose-950/30 to-[#0f172a] border border-rose-900/30 p-2.5 rounded-b-lg flex items-center justify-between group relative overflow-hidden">
                                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent opacity-50" />
                                    <div>
                                        <div className="text-[9px] text-rose-500 font-black uppercase tracking-wider flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full shadow-[0_0_5px_rgba(244,63,94,0.8)] animate-pulse" /> PUT FLOOR (지지)
                                        </div>
                                    </div>
                                    <div className="text-base font-black text-rose-400 font-mono tracking-tight">${putWall}</div>
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
