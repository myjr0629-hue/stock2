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
    if (!currentPrice || !callWall || !putFloor) return null;

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
        <Card className="h-full border-slate-800 bg-slate-900/50 backdrop-blur-md overflow-hidden relative group">
            {/* Glass Accent */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-800/10 to-slate-900/50 pointer-events-none" />

            <CardHeader className="pb-2 border-b border-white/5 relative z-10">
                <CardTitle className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Gamma Levels
                </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] relative p-0">
                {/* Background Grid Lines */}
                <div className="absolute inset-0 flex flex-col justify-between py-4 opacity-10 pointer-events-none px-4">
                    {[0, 1, 2, 3, 4].map(i => <div key={i} className="w-full h-px bg-slate-400 dashed" />)}
                </div>

                {/* VISUALIZATION AREA */}
                <div className="relative h-full w-full px-12 py-4">

                    {/* 1. CALL WALL (Resistance) */}
                    <div
                        className="absolute w-full left-0 border-t-2 border-indigo-500/50 flex items-center group/wall transition-all hover:bg-indigo-500/5"
                        style={{ top: `${callPos}%` }}
                    >
                        <div className="absolute right-2 -top-6 text-right">
                            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Call Wall</div>
                            <div className="text-sm font-mono font-black text-indigo-300 shadow-sm">${callWall}</div>
                        </div>
                        <div className="absolute left-2 w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                    </div>

                    {/* 2. PUT FLOOR (Support) */}
                    <div
                        className="absolute w-full left-0 border-t-2 border-rose-500/50 flex items-center group/floor transition-all hover:bg-rose-500/5"
                        style={{ top: `${putPos}%` }}
                    >
                        <div className="absolute right-2 top-2 text-right">
                            <div className="text-[9px] font-bold text-rose-400 uppercase tracking-widest">Put Floor</div>
                            <div className="text-sm font-mono font-black text-rose-300 shadow-sm">${putFloor}</div>
                        </div>
                        <div className="absolute left-2 w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                    </div>

                    {/* 3. PIN ZONE (Magnet) */}
                    {pinZone && pinPos !== null && (
                        <div
                            className="absolute w-3/4 left-[12.5%] border-t border-dashed border-amber-400/40 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                            style={{ top: `${pinPos}%` }}
                        >
                            <div className="bg-slate-900/80 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1 backdrop-blur-sm -mt-3">
                                <Magnet size={10} className="text-amber-400" />
                                <span className="text-[9px] font-bold text-amber-500">${pinZone}</span>
                            </div>
                        </div>
                    )}

                    {/* 4. CURRENT PRICE (Active) */}
                    <div
                        className="absolute w-full left-0 flex items-center transition-all duration-500 ease-out z-20"
                        style={{ top: `${pricePos}%` }}
                    >
                        {/* Price Line */}
                        <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

                        {/* Label Badge */}
                        <div className="absolute left-1/2 -translate-x-1/2 -top-3.5 bg-emerald-500 text-slate-900 px-2 py-0.5 rounded text-[10px] font-black tracking-widest shadow-lg flex items-center gap-1">
                            <Crosshair size={10} />
                            ${currentPrice.toFixed(2)}
                        </div>
                    </div>

                </div>
            </CardContent>
        </Card>
    );
}
