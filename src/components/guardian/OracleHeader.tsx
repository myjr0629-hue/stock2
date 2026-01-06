
"use client";

import React, { useState, useEffect } from 'react';
import { TypewriterText } from './TypewriterText';

interface OracleHeaderProps {
    nasdaq: number;
    rlsi: number;
    verdictTitle: string;
    isDivergent: boolean;
    timestamp: string;
}

export function OracleHeader({ nasdaq, rlsi, verdictTitle, isDivergent }: OracleHeaderProps) {
    const [latency, setLatency] = useState(12);
    const [messageIndex, setMessageIndex] = useState(0);

    // Latency Simulation (jitter 8-24ms)
    useEffect(() => {
        const interval = setInterval(() => {
            setLatency(Math.floor(Math.random() * 16) + 8);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Message Cycle Timer
    useEffect(() => {
        const timer = setInterval(() => {
            setMessageIndex(prev => (prev + 1) % 3);
        }, 8000); // Rotate every 8 seconds
        return () => clearInterval(timer);
    }, []);

    // Construct the "Prophecy" String
    const getProphecy = () => {
        const nqStr = `나스닥 ${nasdaq > 0 ? "+" : ""}${nasdaq.toFixed(2)}%`;
        // const rlsiStr = `RLSI ${rlsi.toFixed(1)}`; // This line was removed as it's not used in the final string

        let insight = "";
        if (isDivergent) {
            if (nasdaq > 0 && rlsi < 40) insight = "그러나 유동성은 이탈 중 (시장 기만 감지)";
            else if (nasdaq < 0 && rlsi > 60) insight = "그러나 스마트 머니 강력 유입 (침묵의 매집)";
            else insight = "지수와 자금의 괴리 발생";
        } else {
            if (rlsi > 60) insight = "기관 자금의 강력한 지지 확인";
            else if (rlsi < 30) insight = "유동성 지지 기반 붕괴";
            else insight = "방향성 탐색 중 (관망)";
        }

        return `[시스템 감시] ${nqStr} 기록 ... ${insight} ... 판독결과: ${verdictTitle}`;
    };

    const messages = [
        "SOVEREIGN GUARDIAN V3.0 :: 시장의 노이즈를 제거하고 오직 자금의 진실만을 추적합니다.",
        "SYSTEM CAPABILITY :: 실시간 유동성 파동 추적 / 세력 의도 암호 해독 / 다이버전스 조기 경보 가동 라인",
        getProphecy()
    ];

    return (
        <div className="w-full h-12 bg-[#0a0e14] border-b border-slate-800 flex items-center justify-between px-6 relative overflow-hidden select-none z-50">
            {/* BACKGROUND HEX CASCADE (Subtle) */}
            <div className="absolute inset-0 opacity-[0.03] font-mono text-[8px] leading-tight overflow-hidden pointer-events-none whitespace-pre wrap text-emerald-500">
                {Array(20).fill("0F 2A 4C 8B 9D 1E 3F 5A 7B 9C 2D 4E 6F 8A 0B 1C 2D 3E 4F 5A 6B 7C 8D 9E 0F 1A 2B 3C").join("\n")}
            </div>

            {/* LEFT: STATUS */}
            <div className="flex items-center gap-4 relative z-10 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]"></div>
                    <span className="text-[10px] font-black tracking-[0.2em] text-emerald-400">
                        GUARDIAN EYE : ONLINE
                    </span>
                </div>
                <div className="hidden md:block w-px h-3 bg-slate-800"></div>
                <div className="hidden md:flex items-center gap-1 text-[9px] font-mono text-slate-500">
                    <span>LATENCY:</span>
                    <span className="text-emerald-500 font-bold">{latency}ms</span>
                </div>
            </div>

            {/* CENTER: PROPHECY TICKER */}
            <div className="flex-1 flex justify-center items-center relative z-10 mx-4 overflow-hidden">
                <div className={`${messageIndex === 1 ? "text-[10px]" : "text-xs"} font-mono font-bold text-slate-300 transition-all duration-300`}>
                    <TypewriterText text={messages[messageIndex]} speed={20} />
                </div>
            </div>

            {/* RIGHT: DECRYPTION / WATERMARK */}
            <div className="flex items-center gap-2 relative z-10 shrink-0">
                <div className="text-[9px] text-slate-600 font-black tracking-widest uppercase opacity-50">
                    V3.0 CORE ACTIVE
                </div>
                <div className="w-1 h-3 bg-emerald-500/20 animate-pulse"></div>
            </div>

            {/* SCANLINE */}
            <div className="absolute inset-0 bg-[url('/scanline.png')] opacity-5 pointer-events-none"></div>
        </div>
    );
}
