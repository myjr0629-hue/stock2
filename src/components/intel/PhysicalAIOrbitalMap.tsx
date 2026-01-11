
// Physical AI Orbital Map - The Iron Legion
'use client';
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { TickerItem } from '@/app/intel/IntelClientPage';

export function PhysicalAIOrbitalMap({ items }: { items: TickerItem[] }) {
    // 1. Sort by Alpha Score
    const sorted = useMemo(() => [...items].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0)), [items]);
    const sun = sorted[0]; // The Alpha (Likely PLTR)
    const planets = sorted.slice(1);

    // [Fix] Hydration Mismatch
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="w-full h-[500px] bg-[#050914] rounded-2xl animate-pulse border border-slate-800" />;

    if (!sun) return (
        <div className="w-full h-[500px] flex items-center justify-center bg-[#050914] rounded-2xl border border-slate-800 text-slate-500">
            Scanning Industrial Data...
        </div>
    );

    // Amber Theme Colors
    const getHaloColor = (change: number) => {
        if (change > 0) return "border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.5)]"; // Bullish Amber
        if (change < 0) return "border-rose-600 shadow-[0_0_30px_rgba(225,29,72,0.4)]";   // Bearish
        return "border-slate-500 shadow-[0_0_20px_rgba(100,116,139,0.3)]";
    };

    // Parqet Logo Source
    const getLogoUrl = (ticker: string) => `https://assets.parqet.com/logos/symbol/${ticker}?format=png`;

    const sunChange = sun.evidence?.price?.changePct || 0;
    const sunHalo = getHaloColor(sunChange);

    return (
        <div className="relative w-full h-[500px] bg-[#050914] rounded-2xl overflow-hidden border border-amber-900/30 shadow-2xl flex flex-col items-center justify-center group">

            {/* HUD Frame (Industrial Style) */}
            <div className="absolute inset-0 pointer-events-none border-[0.5px] border-amber-800/20 rounded-2xl">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-500/50 rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-500/50 rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-500/50 rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-500/50 rounded-br-xl" />
            </div>

            {/* Background: Industrial Forge Atmosphere */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none mix-blend-color-dodge" />
            <div className={`absolute w-[400px] h-[400px] blur-[150px] rounded-full opacity-15 pointer-events-none ${sunChange >= 0 ? 'bg-amber-600' : 'bg-rose-800'}`} />

            {/* Header Tag */}
            <div className="absolute top-6 left-6 z-20">
                <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-950/40 backdrop-blur border border-amber-700/50 rounded-sm text-[11px] font-black text-amber-200 tracking-widest uppercase shadow-lg font-mono">
                    {sunChange >= 0 ? "⚡ SYSTEM STATUS: OPTIMAL" : "⚠️ SYSTEM STATUS: CRITICAL"}
                </span>
            </div>

            {/* SAFE ZONE: 340px */}
            <div className="relative w-[340px] h-[340px]">

                {/* Mechanical Rings */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] border border-dashed border-amber-800/40 rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] border border-amber-900/20 rounded-full animate-[spin_60s_linear_infinite]" />

                {/* THE CORE (Sun) - 120px */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    <motion.div
                        animate={{ scale: [1, 1.02, 1], filter: ["brightness(1)", "brightness(1.2)", "brightness(1)"] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className={`relative w-[120px] h-[120px] rounded-full bg-[#0a0f1e] flex flex-col items-center justify-center border-4 ${sunHalo}`}
                    >
                        {/* Core Icon */}
                        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-amber-500/10">
                            <Image
                                src={getLogoUrl(sun.ticker)}
                                alt={sun.ticker}
                                fill
                                className="object-cover"
                            />
                        </div>
                        {/* Ticker */}
                        <span className="absolute -bottom-8 text-xl font-black text-amber-100 drop-shadow-md tracking-tighter z-30 font-mono">{sun.ticker}</span>

                        {/* Score Badge */}
                        <div className={`absolute -right-2 bottom-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-[#050914] border-2 border-[#050914] shadow-lg z-30 ${sunChange >= 0 ? "bg-amber-400" : "bg-rose-500"}`}>
                            {sun.alphaScore}
                        </div>
                    </motion.div>
                </div>

                {/* SATELLITES */}
                {planets.map((item, i) => {
                    const angle = (i / planets.length) * 2 * Math.PI - (Math.PI / 2);
                    const radius = 140;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    const change = item.evidence?.price?.changePct || 0;
                    // Amber vs Red Schema
                    const halo = change > 0 ? "border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "border-rose-500/60 shadow-[0_0_15px_rgba(225,29,72,0.3)]";

                    return (
                        <motion.div
                            key={item.ticker}
                            className={`absolute top-1/2 left-1/2 z-10 w-14 h-14 rounded-full bg-[#0f172a] flex items-center justify-center border-2 ${halo} cursor-pointer hover:scale-110 hover:z-30 transition-all duration-300`}
                            style={{
                                x,
                                y,
                                marginLeft: '-28px',
                                marginTop: '-28px'
                            }}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.1 }}
                        >
                            <div className="relative w-9 h-9 rounded-full overflow-hidden bg-amber-500/5">
                                <Image
                                    src={getLogoUrl(item.ticker)}
                                    alt={item.ticker}
                                    fill
                                    className="object-cover opacity-90"
                                />
                            </div>

                            <div className={`absolute -right-2 -bottom-1 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-[#050914] border border-[#050914] shadow z-20 ${change >= 0 ? "bg-amber-500" : "bg-rose-500"}`}>
                                {item.alphaScore}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
