'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from "@/lib/utils";
import {
    Archive,
    BarChart3,
    Zap,
    ShieldAlert,
    Activity,
    ChevronRight,
    Orbit,
    Bot
} from "lucide-react";

interface SidebarItemProps {
    icon: React.ReactNode;
    label: string;
    subLabel?: string;
    isActive?: boolean;
    onClick?: () => void;
    accentColor?: string;
}

function SidebarItem({ icon, label, subLabel, isActive, onClick, accentColor = "text-emerald-400" }: SidebarItemProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left group relative px-4 py-4 transition-all duration-300 border-l-2",
                isActive
                    ? `bg-white/[0.06] border-${accentColor.split('-')[1]}-500/80`
                    : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-slate-600"
            )}
        >
            <div className="flex items-start gap-3">
                <div className={cn(
                    "mt-0.5 p-1.5 rounded-lg transition-colors",
                    isActive
                        ? `${accentColor} bg-white/[0.08]`
                        : "text-slate-400 group-hover:text-slate-200 bg-white/[0.04] group-hover:bg-white/[0.06]"
                )}>
                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5" })}
                </div>
                <div className="flex flex-col">
                    <span className={cn(
                        "text-xs font-black tracking-wider uppercase font-jakarta",
                        isActive ? "text-white" : "text-slate-300 group-hover:text-white"
                    )}>
                        {label}
                    </span>
                    {subLabel && (
                        <span className={cn(
                            "text-xs font-semibold uppercase tracking-wide mt-0.5 font-jakarta",
                            isActive ? "text-slate-400" : "text-slate-500 group-hover:text-slate-400"
                        )}>
                            {subLabel}
                        </span>
                    )}
                </div>
            </div>

            {/* Active Glow */}
            {isActive && (
                <div className="absolute inset-y-0 left-0 w-1 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
            )}

            {/* Hover Arrow */}
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

export interface TacticalSidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export function TacticalSidebar({ activeTab, onTabChange }: TacticalSidebarProps) {
    const td = useTranslations('dashboard');
    const [winRate, setWinRate] = useState<number | null>(null);
    const [totalTrades, setTotalTrades] = useState(0);

    useEffect(() => {
        async function fetchWinRate() {
            try {
                const res = await fetch('/api/backtest', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (data.summary?.checkedRecords > 0) {
                    setWinRate(data.summary.winRate);
                    setTotalTrades(data.summary.checkedRecords);
                }
            } catch { }
        }
        fetchWinRate();
    }, []);

    const getWinRateColor = () => {
        if (winRate === null) return 'text-slate-500';
        if (winRate >= 70) return 'text-emerald-400';
        if (winRate >= 50) return 'text-amber-400';
        return 'text-rose-400';
    };

    const getBarColor = () => {
        if (winRate === null) return 'bg-slate-700';
        if (winRate >= 70) return 'bg-emerald-500';
        if (winRate >= 50) return 'bg-amber-400';
        return 'bg-rose-400';
    };

    return (
        <aside className="w-52 h-[calc(100vh-4rem)] border-r border-white/[0.06] flex flex-col fixed left-0 top-16 z-40 overflow-y-auto scrollbar-hide bg-[#070b14]/80 backdrop-blur-xl">

            {/* ═══ Glassmorphism Background ═══ */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                {/* Radial glow — top */}
                <div className="absolute -top-16 -left-8 w-48 h-48 rounded-full bg-emerald-500/[0.06]" style={{ filter: 'blur(50px)' }} />
                {/* Radial glow — bottom */}
                <div className="absolute -bottom-12 -right-8 w-40 h-40 rounded-full bg-cyan-500/[0.04]" style={{ filter: 'blur(40px)' }} />
                {/* Subtle dot pattern */}
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }} />
                {/* Top frost */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/[0.02] to-transparent" />
                {/* Inner right edge highlight */}
                <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-white/[0.06] via-transparent to-white/[0.03]" />
            </div>


            {/* Navigation Items */}
            <div className="relative z-10 flex-1 py-4 space-y-1">

                <SidebarItem
                    icon={<Archive />}
                    label="TRACK RECORD"
                    subLabel="PERFORMANCE & HISTORY"
                    isActive={activeTab === 'TRACK_RECORD'}
                    onClick={() => onTabChange('TRACK_RECORD')}
                    accentColor="text-emerald-400"
                />

                <div className="my-2 px-4"><div className="h-px bg-white/[0.06]" /></div>

                <SidebarItem
                    icon={<BarChart3 />}
                    label="ALPHA REPORT"
                    subLabel={td('todayPicks')}
                    isActive={activeTab === 'FINAL'}
                    onClick={() => onTabChange('FINAL')}
                    accentColor="text-emerald-400"
                />

                <SidebarItem
                    icon={<Orbit />}
                    label="M7 REPORT"
                    subLabel="DAILY ANALYSIS"
                    isActive={activeTab === 'M7'}
                    onClick={() => onTabChange('M7')}
                    accentColor="text-indigo-400"
                />

                <SidebarItem
                    icon={<Bot />}
                    label="PHYSICAL AI"
                    subLabel="ROBOTICS & EMBODIED"
                    isActive={activeTab === 'PHYSICAL_AI'}
                    onClick={() => onTabChange('PHYSICAL_AI')}
                    accentColor="text-amber-500"
                />

                <SidebarItem
                    icon={<Zap />}
                    label="SILICON CORE"
                    subLabel="AI INFRA & CHIPS"
                    isActive={activeTab === 'SILICON_CORE'}
                    onClick={() => onTabChange('SILICON_CORE')}
                    accentColor="text-amber-400"
                />

                <SidebarItem
                    icon={<Activity />}
                    label="POWER MATRIX"
                    subLabel="ENERGY & NUCLEAR"
                    isActive={activeTab === 'POWER_MATRIX'}
                    onClick={() => onTabChange('POWER_MATRIX')}
                    accentColor="text-emerald-400"
                />

                <SidebarItem
                    icon={<ShieldAlert />}
                    label="BIO PULSE"
                    subLabel="GLP-1 & BIOTECH"
                    isActive={activeTab === 'BIO_PULSE'}
                    onClick={() => onTabChange('BIO_PULSE')}
                    accentColor="text-rose-400"
                />


            </div>

            {/* Footer — Real Win Rate */}
            <div className="relative z-10 p-5 border-t border-white/[0.06]">
                <div className="flex items-center justify-between text-xs font-bold mb-2 font-jakarta">
                    <span className="text-slate-400 tracking-wider">WIN RATE</span>
                    <span className={cn("font-mono font-black", getWinRateColor())}>
                        {winRate !== null ? `${winRate.toFixed(1)}%` : '—'}
                    </span>
                </div>
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                        className={`h-full ${getBarColor()} transition-all duration-700 rounded-full`}
                        style={{ width: winRate !== null ? `${winRate}%` : '0%' }}
                    />
                </div>
                {winRate !== null ? (
                    <p className="mt-2 text-xs text-slate-400 font-mono font-jakarta">
                        {totalTrades} verified trades
                    </p>
                ) : (
                    <p className="mt-2 text-xs text-slate-400 font-mono font-jakarta">
                        COLLECTING DATA...
                    </p>
                )}
            </div>
        </aside>
    );
}
