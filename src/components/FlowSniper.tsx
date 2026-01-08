"use client";


import { Target, TrendingUp, TrendingDown, Info } from "lucide-react";

interface FlowSniperProps {
    netPremium: number;
    callPremium: number;
    putPremium: number;
    optionsCount: number;
    onClickFlowRadar?: () => void;
}

export function FlowSniper({ netPremium, callPremium, putPremium, optionsCount, onClickFlowRadar }: FlowSniperProps) {
    const totalVol = callPremium + putPremium;
    // Prevent divide by zero
    const callPct = totalVol > 0 ? (callPremium / totalVol) * 100 : 50;
    const putPct = totalVol > 0 ? (putPremium / totalVol) * 100 : 50;

    // Net Premium String
    const netFormatted = (Math.abs(netPremium) / 1000000).toFixed(1) + "M";
    const isBullish = netPremium > 0;

    // Logic for Extreme States
    const isGammaSqueeze = callPct > 80 && isBullish;
    const isPanicSelling = putPct > 80 && !isBullish;

    return (
        <div className={`overflow-hidden transition-all duration-500 rounded-lg flex flex-col h-full text-slate-200 ${isGammaSqueeze ? "bg-indigo-950/40 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]" :
            isPanicSelling ? "bg-rose-950/40 border border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.15)]" :
                "bg-transparent border-0 shadow-none"
            }`}>
            {/* Header */}
            <div className="py-2 border-b border-white/5 flex flex-row items-center justify-between px-3 shrink-0">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Target className={`w-3 h-3 ${isGammaSqueeze ? "text-indigo-400 animate-pulse" : isPanicSelling ? "text-rose-400 animate-pulse" : "text-rose-400"}`} />
                    <div>
                        Flow Sniper
                        <div className="flex items-center gap-1 mt-0.5">
                            {isGammaSqueeze ? (
                                <span className="block text-[9px] text-indigo-300 font-black animate-pulse">🚀 GAMMA SQUEEZE DETECTED</span>
                            ) : isPanicSelling ? (
                                <span className="block text-[9px] text-rose-300 font-black animate-pulse">📉 PANIC SELLING DETECTED</span>
                            ) : (
                                <span className="block text-[8px] text-indigo-400 font-bold normal-case opacity-90">실시간 금일 옵션 자금 추적</span>
                            )}
                        </div>
                        <div
                            className={`flex items-center gap-1 mt-1.5 p-1 rounded bg-sky-500/10 border border-sky-500/20 ${onClickFlowRadar ? "cursor-pointer hover:bg-sky-500/20 transition-colors" : ""}`}
                            onClick={onClickFlowRadar}
                        >
                            <span className="text-[9px] text-sky-400 font-bold">Flow Radar 기관지표 확인</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isGammaSqueeze ? 'bg-indigo-400 shadow-[0_0_10px_#818cf8]' : isPanicSelling ? 'bg-rose-500 shadow-[0_0_10px_#f43f5e]' : isBullish ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                    <span className={`text-[9px] font-black ${isGammaSqueeze ? 'text-indigo-300' : isPanicSelling ? 'text-rose-300' : isBullish ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isGammaSqueeze ? "감마 스퀴즈 발동" :
                            isPanicSelling ? "패닉 셀링" :
                                isBullish ? "BULLISH" : "BEARISH"}
                    </span>
                </div>
            </div>

            <div className="space-y-1.5 pt-1.5 pb-2 px-3 flex-1">
                {/* 1. NET PREMIUM BIG DISPLAY */}
                <div className="text-center">
                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                        Net Premium Flow
                        <span title={`오늘 시장 참여자들의 실제 베팅 방향입니다.\n(+) 양수: 상승 베팅(Call 매수) 우위\n(-) 음수: 하락 베팅(Put 매수) 우위`}>
                            <Info size={10} className="inline ml-1 text-slate-600 hover:text-slate-400 cursor-help" />
                        </span>
                    </div>
                    <div className={`text-2xl font-black tabular-nums tracking-tighter ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isBullish ? "+" : "-"}${netFormatted}
                    </div>
                </div>

                {/* 2. CALL vs PUT BATTLE BAR */}
                <div className="space-y-0.5">
                    <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase">
                        <span className="text-emerald-500">Call Prem (${(callPremium / 1000000).toFixed(1)}M)</span>
                        <span className="text-rose-500">Put Prem (${(putPremium / 1000000).toFixed(1)}M)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex relative">
                        {/* Center Marker */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/20 z-10" />

                        {/* Call Bar */}
                        <div
                            className="h-full bg-emerald-500 shrink-0 transition-all duration-1000"
                            style={{ width: `${callPct}%` }}
                        />
                        {/* Put Bar */}
                        <div
                            className="h-full bg-rose-500 shrink-0 transition-all duration-1000"
                            style={{ width: `${putPct}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[7px] font-mono text-slate-600">
                        <span>{callPct.toFixed(0)}%</span>
                        <span>{putPct.toFixed(0)}%</span>
                    </div>
                </div>

                {/* 3. RELVOL / ACTIVITY (Placeholder for Logic) */}
                <div className="flex items-center justify-between pt-1.5 border-t border-white/5 mt-1.5">
                    <span className="text-[8px] font-bold text-slate-500 uppercase">Volume Strength</span>
                    <div className="flex items-center gap-1 text-[8px] font-black text-amber-400">
                        <TrendingUp size={9} />
                        <span>ACTIVE ({optionsCount} Contracts)</span>
                    </div>
                </div>

            </div>
        </div>
    );
}
