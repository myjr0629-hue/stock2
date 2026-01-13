"use client";

import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

interface OracleHeaderProps {
    nasdaq: number;
    rlsi: number;
    verdictTitle: string;
    isDivergent: boolean;
    timestamp: string;
}

export function OracleHeader({ nasdaq, rlsi, verdictTitle, isDivergent, timestamp }: OracleHeaderProps) {
    const [showTooltip, setShowTooltip] = useState(false);

    // 인사이트 메시지 생성
    const getInsight = () => {
        if (isDivergent) {
            if (nasdaq > 0 && rlsi < 40) return "가격↑ 유동성↓ 괴리";
            if (nasdaq < 0 && rlsi > 60) return "가격↓ 유동성↑ 매집";
            return "지수-자금 괴리";
        }
        if (rlsi >= 60) return "기관 매수세 확인";
        if (rlsi <= 35) return "유동성 이탈 경고";
        return "방향성 탐색 중";
    };

    // RLSI 상태 색상
    const getRlsiColor = () => {
        if (rlsi >= 60) return "text-emerald-400";
        if (rlsi <= 35) return "text-rose-400";
        return "text-slate-300";
    };

    return (
        <div className="w-full h-12 bg-[#0a0e14] border-b border-slate-800 flex items-center justify-between px-6 relative overflow-hidden select-none z-50">
            {/* LEFT: STATUS */}
            <div className="flex items-center gap-4 relative z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
                    <span className="text-[10px] font-black tracking-[0.2em] text-emerald-400">
                        GUARDIAN EYE : ONLINE
                    </span>
                </div>
            </div>

            {/* CENTER: CORE INFO (Original Layout Style) */}
            <div className="flex-1 flex justify-center items-center relative z-10 mx-4">
                <div className="flex items-center gap-4 text-[11px] font-mono">
                    {/* NASDAQ */}
                    <span className={`font-bold ${nasdaq >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        NQ {nasdaq > 0 ? "+" : ""}{nasdaq.toFixed(2)}%
                    </span>

                    <span className="text-slate-700">│</span>

                    {/* RLSI with Tooltip */}
                    <div
                        className="flex items-center gap-1 cursor-help relative"
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                    >
                        <span className="text-slate-500">RLSI</span>
                        <span className={`font-bold ${getRlsiColor()}`}>{rlsi.toFixed(0)}</span>
                        <HelpCircle className="w-3 h-3 text-slate-600 hover:text-slate-400" />

                        {/* Tooltip */}
                        {showTooltip && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl z-50">
                                <div className="text-[10px] font-bold text-emerald-400 mb-1">
                                    RLSI (시장 건강도 지수)
                                </div>
                                <div className="text-[9px] text-slate-300 leading-relaxed">
                                    뉴스·모멘텀·자금흐름·금리를 종합한 지표
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-700 grid grid-cols-3 gap-1 text-[9px] text-center">
                                    <div><span className="text-emerald-400">60+</span> 강세</div>
                                    <div><span className="text-slate-300">40-60</span> 중립</div>
                                    <div><span className="text-rose-400">40-</span> 약세</div>
                                </div>
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-t border-l border-slate-700 rotate-45"></div>
                            </div>
                        )}
                    </div>

                    <span className="text-slate-700">│</span>

                    {/* Insight */}
                    <span className="text-slate-400">{getInsight()}</span>
                </div>
            </div>

            {/* RIGHT: VERSION */}
            <div className="flex items-center gap-2 relative z-10 shrink-0">
                <div className="text-[9px] text-slate-600 font-black tracking-widest uppercase opacity-50">
                    V6.0 CORE
                </div>
            </div>
        </div>
    );
}
