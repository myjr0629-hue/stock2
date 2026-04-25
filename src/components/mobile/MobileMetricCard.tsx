"use client";
import React from "react";

// Generic mobile metric card - renders store data with zero new logic
// Font sizing: iOS minimum 11pt standard, trading app optimized (Robinhood/Bloomberg)
// alertStyle: colored bg+border+glow for alert states (matches DashboardClient patterns)
export function MobileMetricCard({ title, icon, value, sub, badge, badgeColor, valueColor, barPct, barColor, barLabels, alertStyle, children }: {
    title: string; icon?: React.ReactNode; value: string; sub?: string;
    badge?: string; badgeColor?: string; valueColor?: string;
    barPct?: number; barColor?: string; barLabels?: [string, string, string];
    alertStyle?: string; // e.g. "bg-rose-500/10 border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
    children?: React.ReactNode;
}) {
    const baseStyle = alertStyle || "bg-[#0d1829]/80 border-white/[0.06]";
    return (
        <div className={`relative p-3.5 rounded-xl border overflow-hidden transition-all duration-200 ${baseStyle}`}>
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                    {icon}
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">{title}</span>
                </div>
                {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColor || 'bg-slate-700/50 text-slate-400'}`}>{badge}</span>}
            </div>
            <div className="text-xl font-mono font-bold leading-tight" style={{ color: valueColor || '#f1f5f9' }}>{value}</div>
            {sub && <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">{sub}</div>}
            {barPct != null && (
                <div className="mt-2">
                    <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(barPct, 100)}%`, backgroundColor: barColor || '#4ade80' }} />
                    </div>
                    {barLabels && <div className="flex justify-between mt-0.5"><span className="text-[9px] text-slate-400">{barLabels[0]}</span><span className="text-[9px] text-slate-400">{barLabels[1]}</span><span className="text-[9px] text-slate-400">{barLabels[2]}</span></div>}
                </div>
            )}
            {children}
        </div>
    );
}

// Centered bar (for Net GEX, VWAP Dist, etc.)
export function CenteredBar({ pct, color }: { pct: number; color: string }) {
    const abs = Math.min(Math.abs(pct), 50);
    return (
        <div className="mt-2">
            <div className="relative h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                <div className="absolute left-1/2 top-0 w-px h-full bg-slate-500" />
                {pct >= 0 ? (
                    <div className="absolute top-0 h-full rounded-r-full" style={{ left: '50%', width: `${abs}%`, backgroundColor: color }} />
                ) : (
                    <div className="absolute top-0 h-full rounded-l-full" style={{ left: `${50 - abs}%`, width: `${abs}%`, backgroundColor: color }} />
                )}
            </div>
        </div>
    );
}

// Dual value display (Call Wall / Put Floor)
export function DualValue({ left, right, leftColor, rightColor }: { left: string; right: string; leftColor: string; rightColor: string }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-mono font-bold" style={{ color: leftColor }}>{left}</span>
            <span className="text-slate-500">/</span>
            <span className="text-lg font-mono font-bold" style={{ color: rightColor }}>{right}</span>
        </div>
    );
}

// Proportion bar (Call vs Put)
export function ProportionBar({ leftPct, leftColor, rightColor, leftLabel, rightLabel }: {
    leftPct: number; leftColor: string; rightColor: string; leftLabel?: string; rightLabel?: string;
}) {
    return (
        <div className="mt-2">
            <div className="flex h-4 rounded overflow-hidden">
                <div className="flex items-center justify-center text-[9px] font-bold text-black" style={{ width: `${leftPct}%`, backgroundColor: leftColor }}>{leftLabel}</div>
                <div className="flex items-center justify-center text-[9px] font-bold text-black" style={{ width: `${100 - leftPct}%`, backgroundColor: rightColor }}>{rightLabel}</div>
            </div>
        </div>
    );
}
