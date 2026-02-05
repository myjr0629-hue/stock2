
// M7 Orbital Map - The Alpha Constellation (Fit-to-Container & Status Halo)
'use client';
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { TickerItem } from '@/types/intel';

export function M7OrbitalMap({ items }: { items: TickerItem[] }) {
    // 1. Sort by Alpha Score
    const sorted = useMemo(() => [...items].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0)), [items]);
    const sun = sorted[0]; // The Sun (Highest Alpha)
    const planets = sorted.slice(1);

    // [Fix] Hydration Mismatch: Ensure client-side only rendering for calculated positions
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Skeleton for loading
    if (!isMounted) return <div className="w-full h-[320px] bg-[#050914] rounded-xl animate-pulse border border-slate-800" />;

    if (!sun) return (
        <div className="w-full h-[320px] flex items-center justify-center bg-[#050914] rounded-xl border border-slate-800 text-slate-500">
            Waiting for Orbital Data...
        </div>
    );

    // Helper to determine Halo Color based on Price Change
    const getHaloColor = (change: number) => {
        if (change > 0) return "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]"; // Bullish
        if (change < 0) return "border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.4)]";   // Bearish
        return "border-slate-400 shadow-[0_0_20px_rgba(148,163,184,0.3)]";                 // Neutral
    };

    const getGlowColor = (change: number) => {
        if (change > 0) return "bg-emerald-500/20";
        if (change < 0) return "bg-rose-500/20";
        return "bg-slate-500/20";
    };

    // [Fix] Replaced Clearbit with Parqet for better reliability (same as TacticalCard)
    const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    const sunChange = sun.evidence?.price?.changePct || 0;
    const sunHalo = getHaloColor(sunChange);

    return (
        <div className="relative w-full h-[320px] bg-[#050914] rounded-xl overflow-hidden border border-slate-800/50 shadow-lg flex flex-col items-center justify-center">
            {/* HUD Frame */}
            <div className="absolute inset-0 pointer-events-none border-[0.5px] border-slate-800/30 rounded-xl">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-emerald-500/30 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-emerald-500/30 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-emerald-500/30 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-emerald-500/30 rounded-br-lg" />
            </div>

            {/* Background Cosmos */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 pointer-events-none" />
            <div className={`absolute w-[280px] h-[280px] blur-[100px] rounded-full opacity-15 pointer-events-none ${sunChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />

            {/* Header Tag */}
            <div className="absolute top-4 left-4 z-20">
                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-full text-[10px] font-bold text-slate-300 tracking-widest uppercase shadow-md">
                    {sunChange >= 0 ? "🚀 MARKET STANCE: RISK ON" : "🛡️ MARKET STANCE: DEFENSIVE"}
                </span>
            </div>

            {/* =================================================================================
               COMPACT ZONE: 240px Diameter 
               ================================================================================= */}
            <div className="relative w-[240px] h-[240px]">

                {/* Orbit Rings (Decorative) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] border border-slate-800/60 rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[240px] border border-slate-800/30 rounded-full animate-[spin_120s_linear_infinite]" />

                {/* THE SUN (Central Alpha) - 80px */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    <motion.div
                        animate={{ scale: [1, 1.03, 1] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className={`relative w-[80px] h-[80px] rounded-full bg-[#0a0f1e] flex flex-col items-center justify-center border-3 ${sunHalo}`}
                    >
                        {/* Sun Icon */}
                        <div className="relative w-11 h-11 rounded-full overflow-hidden bg-white/5">
                            <img
                                src={getLogoUrl(sun.ticker)}
                                alt={sun.ticker}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        {/* Sun Ticker */}
                        <span className="absolute -bottom-6 text-base font-black text-white drop-shadow-md tracking-tighter z-30">{sun.ticker}</span>

                        {/* Sun Score Badge */}
                        <div className={`absolute -right-1 bottom-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-[#050914] shadow-lg z-30 ${sunChange >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}>
                            {sun.alphaScore}
                        </div>
                    </motion.div>
                </div>

                {/* ORBITING PLANETS - 44px Nodes / 100px Radius */}
                {planets.map((item, i) => {
                    const angle = (i / planets.length) * 2 * Math.PI - (Math.PI / 2);
                    const radius = 100;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    const change = item.evidence?.price?.changePct || 0;
                    const halo = change > 0 ? "border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]" : change < 0 ? "border-rose-500/60 shadow-[0_0_12px_rgba(244,63,94,0.3)]" : "border-slate-500/60";

                    return (
                        <motion.div
                            key={item.ticker}
                            className={`absolute top-1/2 left-1/2 z-10 w-11 h-11 rounded-full bg-[#0f172a] flex items-center justify-center border-2 ${halo} cursor-pointer hover:scale-110 hover:z-30 transition-all duration-300`}
                            style={{
                                x,
                                y,
                                marginLeft: '-22px',
                                marginTop: '-22px'
                            }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.08 }}
                        >
                            {/* Planet Icon */}
                            <div className="relative w-7 h-7 rounded-full overflow-hidden bg-white/5">
                                <img
                                    src={getLogoUrl(item.ticker)}
                                    alt={item.ticker}
                                    className="w-full h-full object-cover opacity-90"
                                />
                            </div>

                            {/* Planet Score Badge */}
                            <div className={`absolute -right-1 -bottom-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-[#050914] shadow z-20 ${change >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}>
                                {item.alphaScore}
                            </div>
                        </motion.div>
                    );
                })}

            </div>
        </div>
    );
}
