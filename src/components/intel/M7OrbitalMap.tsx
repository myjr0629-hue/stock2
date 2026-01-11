
// M7 Orbital Map - The Alpha Constellation
'use client';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TickerItem } from '@/app/intel/IntelClientPage';

export function M7OrbitalMap({ items }: { items: TickerItem[] }) {
    // 1. Sort by Alpha Score
    const sorted = useMemo(() => [...items].sort((a, b) => (b.alphaScore || 0) - (a.alphaScore || 0)), [items]);
    const sun = sorted[0]; // The Sun (Highest Alpha)
    const planets = sorted.slice(1);

    if (!sun) return null;

    return (
        <div className="relative w-full h-[500px] bg-[#050914] rounded-2xl overflow-hidden border border-slate-800/50 shadow-2xl">
            {/* Background Cosmos */}
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 blur-[100px] rounded-full" />

            {/* Header Tag */}
            <div className="absolute top-6 left-6 z-20">
                <span className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/80 backdrop-blur border border-emerald-500/30 rounded-full text-[11px] font-bold text-emerald-400 tracking-widest shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    🚀 TODAY'S MARKET STANCE: RISK ON
                </span>
            </div>

            {/* THE SUN (Central Alpha) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center">
                {/* Orbit Rings (Decorative) */}
                <div className="absolute w-[300px] h-[300px] border border-slate-700/30 rounded-full animate-[spin_60s_linear_infinite]" />
                <div className="absolute w-[450px] h-[450px] border border-slate-800/20 rounded-full animate-[spin_40s_linear_infinite_reverse]" />

                {/* Sun Core */}
                <motion.div
                    animate={{ scale: [1, 1.05, 1], boxShadow: ["0 0 20px rgba(255,50,50,0.3)", "0 0 50px rgba(255,50,50,0.6)", "0 0 20px rgba(255,50,50,0.3)"] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="relative w-40 h-40 rounded-full bg-gradient-to-br from-red-600 to-amber-600 flex flex-col items-center justify-center shadow-[0_0_60px_rgba(239,68,68,0.4)] border-4 border-white/10"
                >
                    <span className="text-4xl font-black text-white drop-shadow-lg tracking-tighter">{sun.ticker}</span>
                    <span className="text-xl font-bold text-white/90 mt-1 bg-black/20 px-3 py-0.5 rounded-full backdrop-blur-sm">
                        {sun.alphaScore}
                    </span>
                    <div className="absolute -bottom-12 text-center w-60">
                        <span className="text-amber-500 text-xs font-bold tracking-widest uppercase glow-text">Dominant Alpha</span>
                    </div>
                </motion.div>
            </div>

            {/* ORBITING PLANETS */}
            {planets.map((item, i) => {
                // Simple orbit math (distribute in circle)
                const angle = (i / planets.length) * 2 * Math.PI;
                const radius = 180; // Distance from sun
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                const score = item.alphaScore || 0;
                const isHot = score >= 80;
                const isCold = score <= 50;
                const colorClass = isHot ? "from-red-500 to-orange-500" : isCold ? "from-slate-600 to-slate-800" : "from-indigo-500 to-blue-500";
                const shadowClass = isHot ? "shadow-[0_0_20px_rgba(239,68,68,0.3)]" : "shadow-[0_0_10px_rgba(99,102,241,0.3)]";

                return (
                    <motion.div
                        key={item.ticker}
                        className={`absolute top-1/2 left-1/2 z-10 w-20 h-20 rounded-full bg-gradient-to-br ${colorClass} ${shadowClass} flex flex-col items-center justify-center border-2 border-white/5 cursor-pointer hover:scale-110 transition-transform`}
                        initial={{ x: x * 0.1, y: y * 0.1, opacity: 0 }}
                        animate={{ x, y, opacity: 1 }}
                        transition={{ delay: i * 0.1, duration: 0.8, type: "spring" }}
                        title={`${item.ticker} - Score: ${score}`}
                    >
                        <span className="text-sm font-bold text-white drop-shadow-md">{item.ticker}</span>
                        <span className="text-[10px] font-medium text-white/80">{score}</span>
                    </motion.div>
                );
            })}
        </div>
    );
}

