'use client';

/**
 * [13-F] Institutional Holdings Panel
 * 
 * Premium compact panel for the Command page insight tabs.
 * Shows top institutional holders from SEC Form 13-F with:
 * - Institution logo (Clearbit) or colored initials
 * - Shares held & market value
 * - QoQ changes with infographic indicators
 * - Summary header with totals
 * 
 * Design constraints:
 * - Fits within GEX Timeline 30D card size
 * - Min font 12px, slate-300 text
 * - No emoji — infographic-style only
 * - Guardian TACTICAL INSIGHT-style scrollbar
 * - Zero impact on other features
 */

import React, { useEffect, useState, useCallback } from 'react';
import { CardTooltip, COMMAND_TOOLTIPS } from '@/components/ui/CardTooltip';

interface Holder {
    rank: number;
    cik: string;
    name: string;
    domain: string | null;
    shares: number;
    marketValue: number;
    period: string;
    filingDate: string;
    prevShares: number | null;
    sharesChange: number | null;
    sharesChangePct: number | null;
    prevMarketValue: number | null;
    marketValueChange: number | null;
}

interface Summary {
    totalHolders: number;
    totalShares: number;
    totalValue: number;
    period: string | null;
    prevPeriod: string | null;
    newEntrants: number;
    exits: number;
}

interface Props {
    ticker: string;
}

// --- Utility: Format large numbers compactly ---
function fmtNum(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toLocaleString();
}

function fmtDollar(n: number): string {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
}

// --- Utility: Generate colored initials for institutions without logos ---
function getInitials(name: string): string {
    const words = name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function getInitialColor(name: string): string {
    const colors = [
        'from-blue-500 to-blue-600',
        'from-violet-500 to-violet-600',
        'from-emerald-500 to-emerald-600',
        'from-amber-500 to-amber-600',
        'from-rose-500 to-rose-600',
        'from-cyan-500 to-cyan-600',
        'from-indigo-500 to-indigo-600',
        'from-teal-500 to-teal-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

// --- Weight percentage (simple text, color-coded by concentration) ---
function WeightPct({ weight }: { weight: number }) {
    const color = weight >= 30 ? 'text-indigo-300 font-bold' : weight >= 10 ? 'text-slate-200' : 'text-slate-300';
    return <span className={`text-[13px] font-jakarta ${color}`}>{weight.toFixed(1)}%</span>;
}

// --- Institution Logo with fallback ---
function InstitutionLogo({ name, domain }: { name: string; domain: string | null }) {
    const [imgError, setImgError] = useState(false);

    if (domain && !imgError) {
        return (
            <div className="w-7 h-7 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center shrink-0 border border-white/10">
                <img
                    src={`https://logo.clearbit.com/${domain}`}
                    alt={name}
                    width={28}
                    height={28}
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                    loading="lazy"
                />
            </div>
        );
    }

    // Colored initials fallback
    const initials = getInitials(name);
    const gradient = getInitialColor(name);
    return (
        <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
            <span className="text-[10px] font-bold text-white/90 leading-none">{initials}</span>
        </div>
    );
}

// Row height: py-2 (8px*2) + content ~28px = ~44px. 5 rows ≈ 220px + header 32px = 252px
const VISIBLE_ROWS = 5;
const ROW_HEIGHT = 44; // px approx
const TABLE_HEADER_HEIGHT = 32;
const SCROLL_HEIGHT = TABLE_HEADER_HEIGHT + (VISIBLE_ROWS * ROW_HEIGHT); // ~252px

export default function Institutional13FPanel({ ticker }: Props) {
    const [holders, setHolders] = useState<Holder[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/command/13f?ticker=${encodeURIComponent(ticker)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setHolders(data.holders || []);
            setSummary(data.summary || null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [ticker]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // --- Loading state ---
    if (loading) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg p-4 min-h-[300px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
                    <span className="text-[12px] text-slate-300 font-jakarta">Loading 13-F Filings...</span>
                </div>
            </div>
        );
    }

    // --- Error state ---
    if (error) {
        return (
            <div className="rounded-lg border border-rose-500/20 bg-slate-900/60 p-4 min-h-[200px] flex items-center justify-center">
                <span className="text-[12px] text-slate-300 font-jakarta">13-F data unavailable</span>
            </div>
        );
    }

    // --- Empty state ---
    if (holders.length === 0) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4 min-h-[200px] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-[13px] text-slate-300 font-jakarta block">No institutional 13-F data</span>
                    <span className="text-[12px] text-slate-400 font-jakarta block mt-1">
                        Filings update quarterly — data may not yet be available
                    </span>
                </div>
            </div>
        );
    }

    // Quarter label helper
    const getQuarterLabel = (dateStr: string) => {
        const d = new Date(dateStr);
        const q = Math.ceil((d.getMonth() + 1) / 3);
        return `Q${q} ${d.getFullYear()}`;
    };

    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col relative group hover:border-white/20 transition-colors overflow-hidden">
            {/* Subtle grid background */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.04)_1px,transparent_1px)] bg-[size:24px_24px]" />
            </div>

            {/* --- Summary Header --- */}
            <div className="relative z-10 px-4 pt-3 pb-2 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {/* Institution icon (SVG, not emoji) */}
                        <svg width="14" height="14" viewBox="0 0 16 16" className="text-indigo-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M8 1L1 5V6H15V5L8 1Z" />
                            <rect x="2" y="7" width="2" height="5" />
                            <rect x="5" y="7" width="2" height="5" />
                            <rect x="9" y="7" width="2" height="5" />
                            <rect x="12" y="7" width="2" height="5" />
                            <rect x="1" y="13" width="14" height="1.5" rx="0.5" />
                        </svg>
                        <span className="text-[12px] font-bold text-slate-200 tracking-wider uppercase font-jakarta">
                            <CardTooltip tooltip={COMMAND_TOOLTIPS.INST_13F.tooltip} badge={COMMAND_TOOLTIPS.INST_13F.badge}>13-F Institutional Holdings</CardTooltip>
                        </span>
                    </div>
                    {summary?.period && (
                        <span className="text-[12px] text-slate-400 font-mono">
                            {getQuarterLabel(summary.period)}
                        </span>
                    )}
                </div>

                {/* Summary stats row */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex flex-col">
                        <span className="text-[12px] text-slate-400 font-jakarta">Holders</span>
                        <span className="text-[14px] font-bold text-white font-mono">{summary?.totalHolders || 0}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col">
                        <span className="text-[12px] text-slate-400 font-jakarta">Total Shares</span>
                        <span className="text-[14px] font-bold text-white font-mono">{fmtNum(summary?.totalShares || 0)}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col">
                        <span className="text-[12px] text-slate-400 font-jakarta">Total Value</span>
                        <span className="text-[14px] font-bold text-emerald-400 font-mono">{fmtDollar(summary?.totalValue || 0)}</span>
                    </div>
                    {summary && holders.length > 0 && (
                        <>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[12px] text-slate-400 font-jakarta">Top Weight</span>
                                <span className="text-[14px] font-bold text-indigo-400 font-mono">
                                    {((holders[0].marketValue / (summary.totalValue || 1)) * 100).toFixed(1)}%
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* --- Holders Table --- */}
            <div
                className="relative z-10 overflow-y-auto inst-13f-scroll pr-0.5"
                style={{ maxHeight: `${SCROLL_HEIGHT}px` }}
            >
                {/* Table Header */}
                <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-white/5 px-4 py-1.5 grid grid-cols-[28px_1fr_100px_100px_100px] gap-3 items-center">
                    <span className="text-[12px] text-white font-jakarta">#</span>
                    <span className="text-[12px] text-white font-jakarta">Institution</span>
                    <span className="text-[12px] text-white font-jakarta text-right">Shares</span>
                    <span className="text-[12px] text-white font-jakarta text-right">Value</span>
                    <span className="text-[12px] text-white font-jakarta text-right">Weight</span>
                </div>

                {/* Holder Rows */}
                {holders.map((h, idx) => (
                    <div
                        key={h.cik}
                        className={`px-4 py-2 grid grid-cols-[28px_1fr_100px_100px_100px] gap-3 items-center border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${idx < 3 ? 'bg-indigo-500/[0.03]' : ''}`}
                    >
                        {/* Rank */}
                        <span className={`text-[13px] font-jakarta ${idx < 3 ? 'text-indigo-400 font-bold' : 'text-slate-300'}`}>
                            {h.rank}
                        </span>

                        {/* Institution Name + Logo */}
                        <div className="flex items-center gap-2 min-w-0">
                            <InstitutionLogo name={h.name} domain={h.domain} />
                            <span className="text-[13px] text-slate-200 font-jakarta truncate" title={h.name}>
                                {h.name}
                            </span>
                        </div>

                        {/* Shares */}
                        <span className="text-[13px] text-slate-200 font-jakarta text-right">
                            {fmtNum(h.shares)}
                        </span>

                        {/* Market Value */}
                        <span className="text-[13px] text-slate-200 font-jakarta text-right">
                            {fmtDollar(h.marketValue)}
                        </span>

                        {/* Weight % of total */}
                        <span className="text-right">
                            <WeightPct weight={summary?.totalValue ? (h.marketValue / summary.totalValue) * 100 : 0} />
                        </span>
                    </div>
                ))}
            </div>

            {/* --- Footer --- */}
            <div className="relative z-10 px-4 py-2 border-t border-white/5 flex items-center justify-between">
                <span className="text-[12px] text-slate-400 font-jakarta">
                    Source: SEC Form 13-F · {summary?.period ? getQuarterLabel(summary.period) : ''}
                </span>
                <span className="text-[12px] text-slate-400 font-jakarta">
                    Top {Math.min(holders.length, 20)} of {summary?.totalHolders || holders.length}
                </span>
            </div>

            {/* --- Guardian TACTICAL INSIGHT-style scrollbar CSS --- */}
            <style dangerouslySetInnerHTML={{__html: `
                .inst-13f-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(99, 102, 241, 0.3) transparent;
                    transition: scrollbar-color 0.3s ease;
                }
                .inst-13f-scroll:hover {
                    scrollbar-color: rgba(99, 102, 241, 0.5) transparent;
                }
                .inst-13f-scroll::-webkit-scrollbar {
                    width: 4px;
                }
                .inst-13f-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .inst-13f-scroll::-webkit-scrollbar-thumb {
                    background-color: rgba(99, 102, 241, 0.3);
                    border-radius: 4px;
                    transition: background-color 0.3s ease;
                }
                .inst-13f-scroll:hover::-webkit-scrollbar-thumb {
                    background-color: rgba(99, 102, 241, 0.5);
                }
            `}} />
        </div>
    );
}
