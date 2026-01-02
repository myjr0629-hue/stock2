"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Crosshair, Magnet } from "lucide-react";

interface GammaLevelsVizProps {
    currentPrice: number | null;
    callWall: number | null;
    putFloor: number | null;
    pinZone: number | null;
}

export function GammaLevelsViz({ currentPrice, callWall, putFloor, pinZone }: GammaLevelsVizProps) {
    // [Fix] Explicit null check - 0 is a valid value (though unlikely for price)
    if (currentPrice === null || currentPrice === undefined ||
        callWall === null || callWall === undefined ||
        putFloor === null || putFloor === undefined) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                <p>Levels data loading...</p>
            </div>
        );
    }

    // Calculate relative percentages for positioning
    const max = Math.max(currentPrice, callWall, pinZone || 0) * 1.02;
    const min = Math.min(currentPrice, putFloor, pinZone || Infinity) * 0.98;
    const range = max - min;

    const getPos = (val: number) => {
        return Math.min(100, Math.max(0, ((max - val) / range) * 100)); // Inverted for Top-Down visualization
    };

    const pricePos = getPos(currentPrice);
    const callPos = getPos(callWall);
    const putPos = getPos(putFloor);
    const pinPos = pinZone ? getPos(pinZone) : null;

    return (
        <Card className="h-full border-slate-800 bg-slate-900/50 backdrop-blur-md overflow-hidden relative group shadow-inner">
            {/* Premium Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0f172a] to-slate-900" />

            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-20" />

            <CardHeader className="pb-2 border-b border-white/5 relative z-10 bg-slate-900/40">
                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Gamma Levels (Ladder)
                </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] relative p-0 overflow-hidden">

                {/* VISUALIZATION AREA */}
                <div className="relative h-full w-full px-12 py-4">
                    {/* Center Ruler Line */}
                    <div className="absolute left-1/2 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-slate-700 to-transparent -translate-x-1/2" />

                    {/* 1. CALL WALL (Resistance) - CEILING */}
                    <div
                        className="absolute w-full left-0 flex items-center group/wall transition-all z-10"
                        style={{ top: `${callPos}%` }}
                    >
                        {/* Left Side: Label */}
                        <div className="absolute left-4 -top-3 text-left">
                            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" /> CALL WALL
                            </div>
                        </div>

                        {/* Line & Glow */}
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_10px_rgba(99,102,241,0.5)] opacity-80 group-hover/wall:opacity-100 group-hover/wall:h-[2px] transition-all" />

                        {/* Right Side: Price */}
                        <div className="absolute right-4 -top-3 text-right">
                            <div className="text-sm font-mono font-black text-indigo-300 drop-shadow-[0_0_5px_rgba(99,102,241,0.5)]">${callWall}</div>
                        </div>
                    </div>

                    {/* 2. PUT FLOOR (Support) - FLOOR */}
                    <div
                        className="absolute w-full left-0 flex items-center group/floor transition-all z-10"
                        style={{ top: `${putPos}%` }}
                    >
                        {/* Left Side: Label */}
                        <div className="absolute left-4 top-2 text-left">
                            <div className="text-[9px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" /> PUT FLOOR
                            </div>
                        </div>

                        {/* Line & Glow */}
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_10px_rgba(244,63,94,0.5)] opacity-80 group-hover/floor:opacity-100 group-hover/floor:h-[2px] transition-all" />

                        {/* Right Side: Price */}
                        <div className="absolute right-4 top-2 text-right">
                            <div className="text-sm font-mono font-black text-rose-300 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]">${putFloor}</div>
                        </div>
                    </div>

                    {/* 3. PIN ZONE (Magnet) */}
                    {pinZone && pinPos !== null && (
                        <div
                            className="absolute w-1/2 left-1/4 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity z-0"
                            style={{ top: `${pinPos}%` }}
                        >
                            <div className="w-full h-px border-t border-dashed border-amber-500/30 absolute" />
                            <div className="bg-slate-900/90 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1 backdrop-blur-sm -mt-2.5 z-10 shadow-lg">
                                <Magnet size={10} className="text-amber-400" />
                                <span className="text-[9px] font-bold text-amber-500">${pinZone}</span>
                            </div>
                        </div>
                    )}

                    {/* 4. CURRENT PRICE (Active Gauge) */}
                    <div
                        className="absolute w-full left-0 flex items-center justify-center transition-all duration-500 ease-out z-20 group/price"
                        style={{ top: `${pricePos}%` }}
                    >
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent absolute" />

                        <div className="relative bg-slate-900 border border-emerald-500/50 px-3 py-1 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-2 transform -translate-y-1/2 transition-transform group-hover/price:scale-110">
                            <div className="relative">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping absolute opacity-75" />
                                <div className="w-2 h-2 bg-emerald-500 rounded-full relative shadow-[0_0_5px_rgba(16,185,129,1)]" />
                            </div>
                            <span className="text-xs font-black text-white tracking-tight">${currentPrice.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
