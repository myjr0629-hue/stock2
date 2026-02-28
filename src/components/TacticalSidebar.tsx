'use client';

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from "@/lib/utils";
import {
    Shield, Activity, ShieldAlert, Rocket, Zap, ChevronRight, Orbit, Bot, BookOpen, Cpu, CreditCard, Cloud, Eye
} from 'lucide-react';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

// ── Sector Alert Logic ──
type AlertLevel = 'surge_up' | 'surge_down' | 'gamma' | 'whale' | null;

function getSectorAlert(quotes: IntelQuote[]): AlertLevel {
    if (!quotes || quotes.length === 0) return null;
    const surgeUp = quotes.some(q => q.changePct > 5);
    const surgeDown = quotes.some(q => q.changePct < -5);
    if (surgeDown) return 'surge_down';
    if (surgeUp) return 'surge_up';
    if (quotes.some(q => q.gex < -1000000)) return 'gamma';
    if (quotes.some(q => Math.abs(q.netPremium) > 5000000)) return 'whale';
    return null;
}

function AlertDot({ alert }: { alert: AlertLevel }) {
    if (!alert) return null;
    const colors: Record<string, string> = {
        surge_up: 'bg-emerald-400 shadow-emerald-400/60',
        surge_down: 'bg-rose-400 shadow-rose-400/60',
        gamma: 'bg-fuchsia-400 shadow-fuchsia-400/60',
        whale: 'bg-amber-400 shadow-amber-400/60',
    };
    return (
        <span className={cn(
            "absolute top-1/2 -translate-y-1/2 right-4 w-2 h-2 rounded-full animate-pulse shadow-[0_0_6px]",
            colors[alert]
        )} />
    );
}

interface SidebarItemProps {
    icon: React.ReactNode;
    label: string;
    subLabel?: string;
    isActive?: boolean;
    onClick?: () => void;
    accentColor?: string;
    alert?: AlertLevel;
}

function SidebarItem({ icon, label, subLabel, isActive, onClick, accentColor = "text-emerald-400", alert }: SidebarItemProps) {
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
            {isActive && (
                <div className="absolute inset-y-0 left-0 w-1 shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
            )}
            <AlertDot alert={alert || null} />
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

export interface TacticalSidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    sectorQuotes?: {
        m7?: IntelQuote[];
        physicalAI?: IntelQuote[];
        siliconCore?: IntelQuote[];
        powerMatrix?: IntelQuote[];
        bioPulse?: IntelQuote[];
        cyberShield?: IntelQuote[];
        orbitDefense?: IntelQuote[];
        quantumEdge?: IntelQuote[];
        fintechPulse?: IntelQuote[];
        cloudFortress?: IntelQuote[];
    };
}

export function TacticalSidebar({ activeTab, onTabChange, sectorQuotes }: TacticalSidebarProps) {
    const td = useTranslations('dashboard');

    const alerts = useMemo(() => ({
        m7: getSectorAlert(sectorQuotes?.m7 || []),
        physicalAI: getSectorAlert(sectorQuotes?.physicalAI || []),
        siliconCore: getSectorAlert(sectorQuotes?.siliconCore || []),
        powerMatrix: getSectorAlert(sectorQuotes?.powerMatrix || []),
        bioPulse: getSectorAlert(sectorQuotes?.bioPulse || []),
        cyberShield: getSectorAlert(sectorQuotes?.cyberShield || []),
        orbitDefense: getSectorAlert(sectorQuotes?.orbitDefense || []),
        quantumEdge: getSectorAlert(sectorQuotes?.quantumEdge || []),
        fintechPulse: getSectorAlert(sectorQuotes?.fintechPulse || []),
        cloudFortress: getSectorAlert(sectorQuotes?.cloudFortress || []),
    }), [sectorQuotes]);

    return (
        <aside className="w-52 h-[calc(100vh-4rem)] border-r border-white/[0.06] flex flex-col fixed left-0 top-16 z-40 overflow-y-auto scrollbar-hide bg-[#070b14]/80 backdrop-blur-xl">
            {/* ═══ Glassmorphism Background ═══ */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute -top-16 -left-8 w-48 h-48 rounded-full bg-emerald-500/[0.06]" style={{ filter: 'blur(50px)' }} />
                <div className="absolute -bottom-12 -right-8 w-40 h-40 rounded-full bg-cyan-500/[0.04]" style={{ filter: 'blur(40px)' }} />
                <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }} />
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/[0.02] to-transparent" />
                <div className="absolute top-0 right-0 w-[1px] h-full bg-gradient-to-b from-white/[0.06] via-transparent to-white/[0.03]" />
            </div>

            {/* Navigation Items */}
            <div className="relative z-10 flex-1 py-4 space-y-1">

                <SidebarItem
                    icon={<Eye />}
                    label="SECTOR COMMAND"
                    subLabel="ALL SECTORS OVERVIEW"
                    isActive={activeTab === 'SECTOR_COMMAND'}
                    onClick={() => onTabChange('SECTOR_COMMAND')}
                    accentColor="text-cyan-400"
                />

                <SidebarItem
                    icon={<BookOpen />}
                    label="POST-MARKET"
                    subLabel="ALL SECTOR BRIEFS"
                    isActive={activeTab === 'POST_MARKET_ALL'}
                    onClick={() => onTabChange('POST_MARKET_ALL')}
                    accentColor="text-amber-400"
                />

                {/* ═══ SECTOR INTEL GROUP ═══ */}
                <div className="mt-3 mb-1 px-4 flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/[0.10]" />
                    <span className="text-[13px] font-extrabold tracking-[0.15em] text-slate-400 uppercase whitespace-nowrap">Sector Intel</span>
                    <div className="h-px flex-1 bg-white/[0.10]" />
                </div>

                <div className="relative">
                    <SidebarItem icon={<Orbit />} label="M7 REPORT" subLabel="DAILY ANALYSIS" isActive={activeTab === 'M7'} onClick={() => onTabChange('M7')} accentColor="text-indigo-400" alert={alerts.m7} />
                    <SidebarItem icon={<Bot />} label="PHYSICAL AI" subLabel="ROBOTICS & EMBODIED" isActive={activeTab === 'PHYSICAL_AI'} onClick={() => onTabChange('PHYSICAL_AI')} accentColor="text-amber-500" alert={alerts.physicalAI} />
                    <SidebarItem icon={<Zap />} label="SILICON CORE" subLabel="AI INFRA & CHIPS" isActive={activeTab === 'SILICON_CORE'} onClick={() => onTabChange('SILICON_CORE')} accentColor="text-amber-400" alert={alerts.siliconCore} />
                    <SidebarItem icon={<Activity />} label="POWER MATRIX" subLabel="ENERGY & NUCLEAR" isActive={activeTab === 'POWER_MATRIX'} onClick={() => onTabChange('POWER_MATRIX')} accentColor="text-emerald-400" alert={alerts.powerMatrix} />
                    <SidebarItem icon={<ShieldAlert />} label="BIO PULSE" subLabel="GLP-1 & BIOTECH" isActive={activeTab === 'BIO_PULSE'} onClick={() => onTabChange('BIO_PULSE')} accentColor="text-rose-400" alert={alerts.bioPulse} />
                    <SidebarItem icon={<Shield />} label="CYBER SHIELD" subLabel="AI SECURITY & ZERO TRUST" isActive={activeTab === 'CYBER_SHIELD'} onClick={() => onTabChange('CYBER_SHIELD')} accentColor="text-cyan-400" alert={alerts.cyberShield} />
                    <SidebarItem icon={<Rocket />} label="ORBIT DEFENSE" subLabel="SPACE & DEFENSE" isActive={activeTab === 'ORBIT_DEFENSE'} onClick={() => onTabChange('ORBIT_DEFENSE')} accentColor="text-sky-400" alert={alerts.orbitDefense} />
                    <SidebarItem icon={<Cpu />} label="QUANTUM EDGE" subLabel="QUANTUM & AI INFRA" isActive={activeTab === 'QUANTUM_EDGE'} onClick={() => onTabChange('QUANTUM_EDGE')} accentColor="text-fuchsia-400" alert={alerts.quantumEdge} />
                    <SidebarItem icon={<CreditCard />} label="FINTECH PULSE" subLabel="DIGITAL FINANCE" isActive={activeTab === 'FINTECH_PULSE'} onClick={() => onTabChange('FINTECH_PULSE')} accentColor="text-lime-400" alert={alerts.fintechPulse} />
                    <SidebarItem icon={<Cloud />} label="CLOUD FORTRESS" subLabel="CLOUD & SAAS" isActive={activeTab === 'CLOUD_FORTRESS'} onClick={() => onTabChange('CLOUD_FORTRESS')} accentColor="text-sky-300" alert={alerts.cloudFortress} />
                </div>

            </div>

        </aside>
    );
}
