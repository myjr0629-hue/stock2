
// M7 Orbital Map - The Alpha Constellation (Fit-to-Container & Status Halo)
'use client';
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { TickerItem } from '@/app/intel/IntelClientPage';

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
    if (!isMounted) return <div className="w-full h-[500px] bg-[#050914] rounded-2xl animate-pulse border border-slate-800" />;

    if (!sun) return (
        <div className="w-full h-[500px] flex items-center justify-center bg-[#050914] rounded-2xl border border-slate-800 text-slate-500">
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

    const sunChange = sun.evidence?.price?.changePct || 0;
    const sunHalo = getHaloColor(sunChange);

    return (
        <div className="relative w-full h-[500px] bg-[#050914] rounded-2xl overflow-hidden border border-slate-800/50 shadow-2xl flex items-center justify-center">
            {/* Background Cosmos */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 pointer-events-none" />
            <div className={`absolute w-[400px] h-[400px] blur-[120px] rounded-full opacity-20 pointer-events-none ${sunChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />

            {/* Header Tag */}
            <div className="absolute top-6 left-6 z-20">
                <span className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-full text-[11px] font-bold text-slate-300 tracking-widest uppercase shadow-lg">
                    {sunChange >= 0 ? "🚀 MARKET STANCE: RISK ON" : "🛡️ MARKET STANCE: DEFENSIVE"}
                </span>
            </div>

            {/* =================================================================================
               SAFE ZONE CONTAINER: 340px Diameter 
               This ensures absolutely NO overflow on any screen.
               Sun: 120px | Radius: 140px | Planet: 56px | Padding: Safe
               ================================================================================= */}
            <div className="relative w-[340px] h-[340px]">

                {/* Orbit Rings (Decorative) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] border border-slate-800/60 rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] border border-slate-800/30 rounded-full animate-[spin_120s_linear_infinite]" />

                {/* THE SUN (Central Alpha) - 120px */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    <motion.div
                        animate={{ scale: [1, 1.03, 1] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className={`relative w-[120px] h-[120px] rounded-full bg-[#0a0f1e] flex flex-col items-center justify-center border-4 ${sunHalo}`}
                    >
                        {/* Sun Icon */}
                        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-white/5">
                            <Image
                                src={`https://logo.clearbit.com/${sun.ticker}.com`}
                                alt={sun.ticker}
                                fill
                                className="object-cover"
                                onError={(e) => {
                                    // Fallback handled by parent visual if image fails visually, 
                                    // but next/image doesn't support direct fallback src easily without state.
                                    // For now relying on clearbit reliability or blank.
                                }}
                            />
                        </div>
                        {/* Sun Ticker */}
                        <span className="absolute -bottom-8 text-xl font-black text-white drop-shadow-md tracking-tighter z-30">{sun.ticker}</span>

                        {/* Sun Score Badge */}
                        <div className={`absolute -right-2 bottom-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white border-2 border-[#050914] shadow-lg z-30 ${sunChange >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}>
                            {sun.alphaScore}
                        </div>
                    </motion.div>
                </div>

                {/* ORBITING PLANETS - 56px Nodes / 140px Radius */}
                {planets.map((item, i) => {
                    // Distribute in circle
                    const angle = (i / planets.length) * 2 * Math.PI - (Math.PI / 2); // Start from top (-90deg basic or adjust)
                    const radius = 140;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    const change = item.evidence?.price?.changePct || 0;
                    const halo = change > 0 ? "border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : change < 0 ? "border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.3)]" : "border-slate-500/60";

                    return (
                        <motion.div
                            key={item.ticker}
                            className={`absolute top-1/2 left-1/2 z-10 w-14 h-14 rounded-full bg-[#0f172a] flex items-center justify-center border-2 ${halo} cursor-pointer hover:scale-110 hover:z-30 transition-all duration-300`}
                            style={{
                                x,
                                y,
                                marginLeft: '-28px', // Center offset (half of width)
                                marginTop: '-28px'   // Center offset
                            }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            {/* Planet Icon */}
                            <div className="relative w-9 h-9 rounded-full overflow-hidden bg-white/5">
                                <Image
                                    src={`https://logo.clearbit.com/${item.ticker}.com`}
                                    alt={item.ticker}
                                    fill
                                    className="object-cover opacity-90"
                                />
                            </div>

                            {/* Planet Score Badge */}
                            <div className={`absolute -right-2 -bottom-1 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-[#050914] shadow z-20 ${change >= 0 ? "bg-emerald-600" : "bg-rose-600"}`}>
                                {item.alphaScore}
                            </div>
                        </motion.div>
                    );
                })}

            </div>
        </div>
    );
}
