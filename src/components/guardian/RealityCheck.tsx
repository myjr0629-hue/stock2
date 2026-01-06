"use client";

import React from 'react';
import { Activity, MessageSquare } from "lucide-react";
import { TypewriterText } from "./TypewriterText";

interface RealityCheckProps {
    nasdaqChange: number; // e.g. +0.80
    guardianScore: number; // e.g. 88.0
    divergenceCase?: 'A' | 'B' | 'C' | 'D' | 'N';
    rvolNdx?: number; // NASDAQ 20d Avg Vol (1.2 = 120%)
    rvolDow?: number; // DOW 20d Avg Vol
    verdict?: {
        title: string;
        desc: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    };
}

export function RealityCheck({
    nasdaqChange,
    guardianScore,
    divergenceCase = 'N',
    rvolNdx = 1.0,
    rvolDow = 1.0,
    verdict
}: RealityCheckProps) {
    // 1. Determine Alignment Status
    const isDivergent = divergenceCase === 'A' || divergenceCase === 'B';
    const statusText = isDivergent ? "DIVERGENCE" : "ALIGNMENT OK";
    const statusColor = isDivergent ? "text-rose-400" : "text-emerald-400";

    return (
        <div className="h-full flex flex-col p-1">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2 flex-none">
                <div className="flex items-center gap-2">
                    <Activity className="w-3 h-3 text-cyan-400" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">
                        REALITY CHECK
                    </h3>
                </div>
                <span className="text-[9px] font-mono text-white opacity-60">MKT_SYNC::ACTIVE</span>
            </div>

            {/* SPLIT CONTENT AREA */}
            <div className="flex-1 flex gap-4 min-h-0">
                {/* LEFT: VISUALS (50%) */}
                <div className="w-1/2 flex flex-col gap-4">
                    {/* 1. Price vs Flow */}
                    <div className="bg-slate-900/50 rounded p-2 border border-slate-800 relative flex flex-col justify-center gap-3 h-[45%]">
                        <div className="flex justify-between text-[11px] font-bold text-white uppercase tracking-wide z-10">
                            <span>Price (Ext)</span>
                            <span>Flow (Int)</span>
                        </div>

                        {/* Center Axis Line */}
                        <div className="absolute left-1/2 top-8 bottom-2 w-px bg-slate-700/50 z-0"></div>

                        <div className="space-y-3 relative z-10">
                            {/* Price Bar */}
                            <div className="flex items-center gap-2">
                                <div className="w-10 text-[12px] font-mono text-right text-slate-200">PRICE</div>
                                <div className="flex-1 h-1.5 bg-slate-800 rounded-full relative overflow-hidden">
                                    <div
                                        className={`absolute h-full rounded-full transition-all duration-1000 ${nasdaqChange >= 0 ? "bg-emerald-400 right-1/2 origin-left" : "bg-rose-400 left-1/2 origin-right"}`}
                                        style={{ width: `${Math.min(Math.abs(nasdaqChange) * 20, 50)}%`, left: nasdaqChange >= 0 ? '50%' : undefined, right: nasdaqChange < 0 ? '50%' : undefined }}
                                    ></div>
                                </div>
                                <div className={`w-12 text-[12px] font-mono text-right ${nasdaqChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {nasdaqChange > 0 ? "+" : ""}{nasdaqChange.toFixed(2)}%
                                </div>
                            </div>
                            {/* Flow Bar */}
                            <div className="flex items-center gap-2">
                                <div className="w-10 text-[12px] font-mono text-right text-slate-200">FLOW</div>
                                <div className="flex-1 h-1.5 bg-slate-800 rounded-full relative overflow-hidden">
                                    <div
                                        className={`absolute h-full rounded-full transition-all duration-1000 ${guardianScore >= 50 ? "bg-cyan-400 right-1/2 origin-left" : "bg-orange-400 left-1/2 origin-right"}`}
                                        style={{ width: `${Math.min(Math.abs(guardianScore - 50), 50)}%`, left: guardianScore >= 50 ? '50%' : undefined, right: guardianScore < 50 ? '50%' : undefined }}
                                    ></div>
                                </div>
                                <div className="w-12 text-[12px] font-mono text-cyan-400 text-right">
                                    {guardianScore.toFixed(0)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Volume Analysis */}
                    <div className="bg-slate-900/50 rounded p-2 border border-slate-800 relative flex flex-col justify-center gap-3">
                        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-slate-700 animate-pulse"></div>
                        {/* NDX */}
                        <div>
                            <div className="flex justify-between items-end mb-1">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-[11px] font-bold text-white uppercase tracking-tighter">NASDAQ 20d</span>
                                    <span className="text-[9px] text-slate-400 font-medium tracking-tight">(RVOL)</span>
                                </div>
                                <span className={`text-[12px] font-mono font-bold ${rvolNdx > 1.0 ? "text-cyan-300" : "text-slate-400"}`}>
                                    {Math.round(rvolNdx * 100)}%
                                </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full relative overflow-hidden">
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-10 opacity-50"></div>
                                <div className={`h-full relative z-0 transition-all duration-1000 ${rvolNdx > 1.0 ? "bg-cyan-500" : "bg-slate-600"}`} style={{ width: `${Math.min(rvolNdx * 50, 100)}%` }}></div>
                            </div>
                        </div>
                        {/* DOW */}
                        <div>
                            <div className="flex justify-between items-end mb-1">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-[11px] font-bold text-white uppercase tracking-tighter">DOW 20d</span>
                                    <span className="text-[9px] text-slate-400 font-medium tracking-tight">(RVOL)</span>
                                </div>
                                <span className={`text-[12px] font-mono font-bold ${rvolDow > 1.0 ? "text-cyan-300" : "text-slate-400"}`}>
                                    {Math.round(rvolDow * 100)}%
                                </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full relative overflow-hidden">
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500 z-10 opacity-50"></div>
                                <div className={`h-full relative z-0 transition-all duration-1000 ${rvolDow > 1.0 ? "bg-orange-500" : "bg-slate-600"}`} style={{ width: `${Math.min(rvolDow * 50, 100)}%` }}></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: ANALYSIS PANEL (50%) */}
                <div className="w-1/2 flex flex-col bg-[#0f141c] border border-slate-800 rounded relative overflow-hidden">
                    {/* Analysis Header */}
                    <div className="flex justify-between items-center px-3 py-2 border-b border-slate-800/50 bg-slate-900/30">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-emerald-500" />
                            <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest leading-none">RLSI (시장의 본질 분석)</span>
                        </div>
                        <div className={`text-[9px] font-black uppercase ${statusColor} border border-current px-1.5 py-0.5 rounded`}>
                            {statusText}
                        </div>
                    </div>

                    {/* Analysis Body */}
                    <div className="flex-1 p-3 overflow-y-auto custom-scrollbar relative">
                        {/* Scan Line Decoration */}
                        <div className="absolute top-0 left-0 w-full h-px bg-emerald-500/20 animate-scanline pointer-events-none"></div>

                        {verdict ? (
                            <>
                                <div className={`text-xs font-bold mb-2 uppercase tracking-wide leading-tight ${verdict.sentiment === 'BULLISH' ? 'text-emerald-300' :
                                    verdict.sentiment === 'BEARISH' ? 'text-rose-300' :
                                        'text-slate-200'
                                    }`}>
                                    {verdict.title}
                                </div>
                                <div className="text-[11px] text-slate-300 font-mono leading-relaxed opacity-90 font-medium">
                                    <TypewriterText text={verdict.desc} speed={2} />
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <span className="text-[9px] text-slate-600 font-mono animate-pulse">ESTABLISHING UPLINK...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
