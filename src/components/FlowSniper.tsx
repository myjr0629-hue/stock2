"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp, TrendingDown } from "lucide-react";

interface FlowSniperProps {
    netPremium: number;
    callPremium: number;
    putPremium: number;
    optionsCount: number;
}

export function FlowSniper({ netPremium, callPremium, putPremium, optionsCount }: FlowSniperProps) {
    const totalVol = callPremium + putPremium;
    // Prevent divide by zero
    const callPct = totalVol > 0 ? (callPremium / totalVol) * 100 : 50;
    const putPct = totalVol > 0 ? (putPremium / totalVol) * 100 : 50;

    // Net Premium String
    const netFormatted = (Math.abs(netPremium) / 1000000).toFixed(1) + "M";
    const isBullish = netPremium > 0;

    return (
        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md overflow-hidden">
            {/* Header */}
            <CardHeader className="pb-2 pt-3 border-b border-white/5 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Target className="w-3 h-3 text-rose-400" />
                    <div>
                        Flow Sniper
                        <span className="block text-[8px] text-indigo-400 font-bold normal-case opacity-90">실시간 금일 옵션 자금 추적</span>
                        <div className="flex items-center gap-1 mt-1.5 p-1 rounded bg-sky-500/10 border border-sky-500/20">
                            <span className="text-[9px] text-sky-400 font-bold">👉 상세 세력 분석: Flow Radar 기관지표 확인</span>
                        </div>
                    </div>
                </CardTitle>
                <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isBullish ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                    <span className={`text-[9px] font-black ${isBullish ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isBullish ? "BULLISH (공격수 기세 우위)" : "BEARISH (공격수 기세 약화)"}
                    </span>
                </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
                {/* 1. NET PREMIUM BIG DISPLAY */}
                <div className="text-center">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                        Net Premium Flow
                        {/* <span className="block text-[8px] opacity-70">오늘의 순수 공격 자금</span> */}
                    </div>
                    <div className={`text-3xl font-black tabular-nums tracking-tighter ${isBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isBullish ? "+" : "-"}${netFormatted}
                    </div>
                </div>

                {/* 2. CALL vs PUT BATTLE BAR */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                        <span className="text-emerald-500">Call Prem (${(callPremium / 1000000).toFixed(1)}M)</span>
                        <span className="text-rose-500">Put Prem (${(putPremium / 1000000).toFixed(1)}M)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex relative">
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
                    <div className="flex justify-between text-[8px] font-mono text-slate-600">
                        <span>{callPct.toFixed(0)}%</span>
                        <span>{putPct.toFixed(0)}%</span>
                    </div>
                </div>

                {/* 3. RELVOL / ACTIVITY (Placeholder for Logic) */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Volume Strength</span>
                    <div className="flex items-center gap-1 text-[9px] font-black text-amber-400">
                        <TrendingUp size={10} />
                        <span>ACTIVE ({optionsCount} Contracts)</span>
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}
