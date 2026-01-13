"use client";

import React, { useState } from 'react';
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
            if (nasdaq > 0 && rlsi < 40) return "가격↑ 유동성↓ 괴리 감지";
            if (nasdaq < 0 && rlsi > 60) return "가격↓ 유동성↑ 매집 신호";
            return "지수-자금 괴리 발생";
        }
        if (rlsi >= 60) return "기관 매수세 유입 확인";
        if (rlsi <= 35) return "유동성 이탈 경고";
        return "방향성 탐색 중";
    };

    // RLSI 상태 색상
    const getRlsiColor = () => {
        if (rlsi >= 60) return "text-emerald-400";
        if (rlsi <= 35) return "text-rose-400";
        return "text-slate-300";
    };

    // 마지막 갱신 시간 계산
    const getTimeSince = () => {
        if (!timestamp) return "";
        const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
        if (diff < 60) return `${diff}초 전`;
        return `${Math.floor(diff / 60)}분 전`;
    };

    return (
        <div className="w-full h-10 bg-[#0a0e14] border-b border-slate-800 flex items-center justify-between px-4 md:px-6 select-none z-50">
            {/* LEFT: LIVE STATUS */}
            <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-bold tracking-wider text-emerald-400">LIVE</span>
                </div>
                <div className="w-px h-3 bg-slate-700"></div>
                <span className={`text-[11px] font-mono font-bold ${nasdaq >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    NQ {nasdaq > 0 ? "+" : ""}{nasdaq.toFixed(2)}%
                </span>
            </div>

            {/* CENTER: RLSI with Tooltip */}
            <div className="flex items-center gap-3 relative">
                <div
                    className="flex items-center gap-1.5 cursor-help"
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                >
                    <span className="text-[10px] text-slate-500 font-medium">RLSI</span>
                    <span className={`text-sm font-mono font-bold ${getRlsiColor()}`}>
                        {rlsi.toFixed(0)}
                    </span>
                    <HelpCircle className="w-3 h-3 text-slate-600 hover:text-slate-400 transition-colors" />
                </div>

                {/* RLSI Tooltip */}
                {showTooltip && (
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl z-50">
                        <div className="text-[10px] font-bold text-emerald-400 mb-1">
                            RLSI (Relative Liquid Strength Index)
                        </div>
                        <div className="text-[10px] text-slate-300 leading-relaxed">
                            뉴스 센티먼트, 가격 모멘텀, 섹터 자금흐름, 금리를 종합한 <span className="text-white font-medium">시장 건강도 지수</span>입니다.
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-700 grid grid-cols-3 gap-1 text-[9px]">
                            <div className="text-center">
                                <div className="text-emerald-400 font-bold">60+</div>
                                <div className="text-slate-500">강세</div>
                            </div>
                            <div className="text-center">
                                <div className="text-slate-300 font-bold">40-60</div>
                                <div className="text-slate-500">중립</div>
                            </div>
                            <div className="text-center">
                                <div className="text-rose-400 font-bold">40-</div>
                                <div className="text-slate-500">약세</div>
                            </div>
                        </div>
                        {/* Tooltip Arrow */}
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-t border-l border-slate-700 rotate-45"></div>
                    </div>
                )}

                <div className="w-px h-3 bg-slate-700 hidden md:block"></div>
                <span className="text-[10px] text-slate-400 hidden md:block">{getInsight()}</span>
            </div>

            {/* RIGHT: Timestamp */}
            <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] text-slate-600 hidden md:block">
                    {getTimeSince() && `갱신: ${getTimeSince()}`}
                </span>
            </div>
        </div>
    );
}
