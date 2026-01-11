'use client';

import React from 'react';
import { cn } from "@/lib/utils";
import {
    Archive,
    Crosshair,
    Zap,
    ShieldAlert,
    Activity,
    ChevronRight,
    Orbit
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
                    ? `bg-[#0f1623] border-${accentColor.split('-')[1]}-500/80`
                    : "bg-transparent border-transparent hover:bg-[#0f1623] hover:border-slate-700"
            )}
        >
            <div className="flex items-start gap-4">
                <div className={cn(
                    "mt-0.5 p-1.5 rounded bg-[#1e293b]/50 transition-colors",
                    isActive ? accentColor : "text-slate-500 group-hover:text-slate-300"
                )}>
                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-5 h-5" })}
                </div>
                <div className="flex flex-col">
                    <span className={cn(
                        "text-xs font-black tracking-wider uppercase",
                        isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                    )}>
                        {label}
                    </span>
                    {subLabel && (
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                            {subLabel}
                        </span>
                    )}
                </div>
            </div>

            {/* Active Glow */}
            {isActive && (
                <div className={cn(
                    "absolute inset-y-0 left-0 w-1 shadow-[0_0_15px_rgba(16,185,129,0.5)]",
                    // Dynamic Shadow color hack if needed, defaulting to emerald
                )} />
            )}

            {/* Hover Arrow */}
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

export interface TacticalSidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export function TacticalSidebar({ activeTab, onTabChange }: TacticalSidebarProps) {
    return (
        <aside className="w-52 h-[calc(100vh-4rem)] bg-[#05090f] border-r border-slate-800 flex flex-col fixed left-0 top-16 z-40 overflow-y-auto scrollbar-hide">


            {/* Navigation Items */}
            <div className="flex-1 py-4 space-y-1">

                <SidebarItem
                    icon={<Archive />}
                    label="ARCHIVE"
                    subLabel="HISTORY & WIN RATE"
                    isActive={activeTab === 'ARCHIVE'}
                    onClick={() => onTabChange('ARCHIVE')}
                    accentColor="text-slate-400"
                />

                <div className="my-2 px-4"><div className="h-px bg-slate-800/50" /></div>

                <SidebarItem
                    icon={<Crosshair />}
                    label="FINAL BATTLE"
                    subLabel="TODAY'S 12 ELITES"
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
                    icon={<Zap />}
                    label="HYPER-DISCOVERY"
                    subLabel="MARKET-WIDE SCAN"
                    isActive={activeTab === 'DISCOVERY'}
                    onClick={() => onTabChange('DISCOVERY')}
                    accentColor="text-amber-400"
                />

                <div className="my-2 px-4"><div className="h-px bg-slate-800/50" /></div>

                <SidebarItem
                    icon={<Activity />}
                    label="POST-MORTEM"
                    subLabel="RESULT ANALYTICS"
                    isActive={activeTab === 'POST'}
                    onClick={() => onTabChange('POST')}
                    accentColor="text-rose-400"
                />

            </div>

            {/* Footer Status */}
            <div className="p-6 border-t border-slate-800/50 bg-[#080d15]">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-2">
                    <span>DOMINANCE</span>
                    <span className="text-emerald-500">76.4%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: '76.4%' }} />
                </div>
                <div className="mt-4 flex gap-2">
                    <span className="px-2 py-1 bg-slate-800 rounded text-[9px] text-slate-400 border border-slate-700">GUARDIAN ACTIVE</span>
                    <span className="px-2 py-1 bg-slate-800 rounded text-[9px] text-slate-400 border border-slate-700">CMD: ONLINE</span>
                </div>
            </div>
        </aside>
    );
}
