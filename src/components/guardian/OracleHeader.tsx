"use client";

import React from 'react';

interface OracleHeaderProps {
    nasdaq: number;
    rlsi: number;
    verdictTitle: string;
    isDivergent: boolean;
    timestamp: string;
}

export function OracleHeader({ }: OracleHeaderProps) {
    return (
        <div className="w-full h-10 bg-[#0a0e14] border-b border-slate-800 flex items-center justify-between px-6 select-none z-50">
            {/* LEFT: STATUS */}
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
                <span className="text-[10px] font-black tracking-[0.2em] text-emerald-400">
                    GUARDIAN EYE : ONLINE
                </span>
            </div>

            {/* RIGHT: VERSION */}
            <div className="text-[9px] text-slate-600 font-black tracking-widest uppercase opacity-50">
                V6.0 CORE ACTIVE
            </div>
        </div>
    );
}
