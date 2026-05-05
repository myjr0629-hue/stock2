'use client';

/**
 * [INSIDER] SEC Form 4 Insider Trading Panel
 * 
 * Premium panel for the Command page insight tabs (alongside GEX, Tech Levels, IV Skew, 13-F).
 * Shows insider trading activity from SEC Form 4 filings:
 * - 30-day dot timeline (SVG) with buy/sell markers
 * - Net insider value summary with sentiment badge
 * - Transaction table with SEC filing links
 * 
 * Design constraints:
 * - Fits within GEX Timeline card size
 * - Min font 12px, slate-300 text
 * - No emoji — infographic-style only (amber/gold theme)
 * - Guardian TACTICAL INSIGHT-style scrollbar
 * - Zero impact on other features
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';

// ─── Types (client-side mirror of insiderService) ──────────────────

interface InsiderTransaction {
    date: string;
    transactionDate: string;
    name: string;
    title: string;
    isDirector: boolean;
    isOfficer: boolean;
    isTenPctOwner: boolean;
    code: string;
    shares: number;
    pricePerShare: number;
    value: number;
    acquired: 'A' | 'D';
    is10b5: boolean;
    sharesAfter: number;
    filingUrl: string;
}

interface InsiderSummary {
    net30d: number;
    buyCount: number;
    sellCount: number;
    totalTxCount: number;
    sentiment: 'BULLISH' | 'CAUTIOUS' | 'BEARISH' | 'NEUTRAL';
    latest: {
        name: string;
        title: string;
        code: 'P' | 'S';
        value: number;
        date: string;
        is10b5: boolean;
    } | null;
    transactions: InsiderTransaction[];
    _ts: number;
}

interface Props {
    ticker: string;
    insider?: InsiderSummary | null;
}

// ─── Utilities ─────────────────────────────────────────────────────

function fmtDollar(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
}

function fmtShares(n: number): string {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString();
}

function codeLabel(code: string): { label: string; color: string; bg: string } {
    switch (code) {
        case 'P': return { label: 'BUY', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
        case 'S': return { label: 'SELL', color: 'text-rose-400', bg: 'bg-rose-500/20' };
        case 'A': return { label: 'AWARD', color: 'text-slate-400', bg: 'bg-slate-500/20' };
        case 'M': return { label: 'EXER', color: 'text-blue-400', bg: 'bg-blue-500/20' };
        case 'C': return { label: 'CONV', color: 'text-slate-400', bg: 'bg-slate-500/20' };
        case 'F': return { label: 'TAX', color: 'text-slate-400', bg: 'bg-slate-500/20' };
        default: return { label: code || '—', color: 'text-slate-400', bg: 'bg-slate-500/20' };
    }
}

function sentimentConfig(s: string) {
    switch (s) {
        case 'BULLISH': return { label: 'BULLISH', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' };
        case 'CAUTIOUS': return { label: 'CAUTIOUS', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' };
        case 'BEARISH': return { label: 'BEARISH', color: 'text-rose-400', bg: 'bg-rose-500/20 border-rose-500/30' };
        default: return { label: 'NEUTRAL', color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/30' };
    }
}

// ─── 30-Day Timeline (SVG) ─────────────────────────────────────────

function InsiderTimeline({ transactions }: { transactions: InsiderTransaction[] }) {
    const significant = transactions.filter(t => t.code === 'P' || t.code === 'S');
    if (significant.length === 0) return null;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recent = significant.filter(t => new Date(t.date) >= thirtyDaysAgo);
    
    if (recent.length === 0) {
        // Show all-time timeline if no 30d activity
        return (
            <div className="px-4 py-2 text-[12px] text-slate-400 font-jakarta text-center">
                No insider buy/sell activity in the last 30 days
            </div>
        );
    }

    const maxValue = Math.max(...recent.map(t => t.value), 1);
    const SVG_W = 600;
    const SVG_H = 50;
    const MARGIN_X = 20;

    return (
        <div className="px-4 py-2">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-400 font-jakarta">30-Day Activity</span>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 font-jakarta">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> BUY
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 font-jakarta">
                        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> SELL
                    </span>
                </div>
            </div>
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-[50px]">
                {/* Baseline */}
                <line x1={MARGIN_X} y1={SVG_H / 2} x2={SVG_W - MARGIN_X} y2={SVG_H / 2} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                {/* Date labels */}
                <text x={MARGIN_X} y={SVG_H - 2} fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="Jakarta Sans, sans-serif">30d ago</text>
                <text x={SVG_W - MARGIN_X} y={SVG_H - 2} fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="Jakarta Sans, sans-serif" textAnchor="end">Today</text>
                
                {recent.map((t, i) => {
                    const date = new Date(t.date);
                    const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
                    const xPct = 1 - (daysDiff / 30);
                    const x = MARGIN_X + xPct * (SVG_W - 2 * MARGIN_X);
                    const radius = 3 + (t.value / maxValue) * 5; // 3-8px radius
                    const isBuy = t.code === 'P';
                    const color = isBuy ? '#10b981' : '#f43f5e';
                    const opacity = t.is10b5 ? 0.6 : 1.0; // Voluntary trades more opaque

                    return (
                        <g key={`${t.date}-${i}`}>
                            {/* Glow */}
                            <circle cx={x} cy={SVG_H / 2} r={radius + 2} fill={color} opacity={opacity * 0.15} />
                            {/* Dot */}
                            <circle cx={x} cy={SVG_H / 2} r={radius} fill={color} opacity={opacity} stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
                            {/* Star for non-10b5-1 */}
                            {!t.is10b5 && (
                                <text x={x} y={SVG_H / 2 - radius - 3} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="bold">★</text>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ─── Table Row Heights ─────────────────────────────────────────────
const VISIBLE_ROWS = 6;
const ROW_HEIGHT = 40;
const TABLE_HEADER_HEIGHT = 30;
const SCROLL_HEIGHT = TABLE_HEADER_HEIGHT + (VISIBLE_ROWS * ROW_HEIGHT);

// ─── Main Component ────────────────────────────────────────────────

export default function InsiderActivityPanel({ ticker, insider: propInsider }: Props) {
    const [data, setData] = useState<InsiderSummary | null>(propInsider || null);
    const [loading, setLoading] = useState(!propInsider);
    const [error, setError] = useState<string | null>(null);
    const [showAllTx, setShowAllTx] = useState(false);

    const fetchInsider = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/command/insider?ticker=${encodeURIComponent(ticker)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.insider) {
                setData(json.insider);
            } else {
                setData(null);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [ticker]);

    useEffect(() => {
        if (!propInsider) {
            fetchInsider();
        } else {
            setData(propInsider);
            setLoading(false);
        }
    }, [fetchInsider, propInsider]);

    // Filter: only show P/S by default, or all if toggled
    const displayTx = useMemo(() => {
        if (!data?.transactions) return [];
        if (showAllTx) return data.transactions;
        return data.transactions.filter(t => t.code === 'P' || t.code === 'S' || t.value > 0);
    }, [data, showAllTx]);

    // ─── Loading ───────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg p-4 min-h-[300px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                    <span className="text-[12px] text-slate-300 font-jakarta">Loading Insider Activity...</span>
                </div>
            </div>
        );
    }

    // ─── Error ─────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="rounded-lg border border-rose-500/20 bg-slate-900/60 p-4 min-h-[200px] flex items-center justify-center">
                <span className="text-[12px] text-slate-300 font-jakarta">Insider data unavailable</span>
            </div>
        );
    }

    // ─── Empty ─────────────────────────────────────────────────────
    if (!data || data.transactions.length === 0) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4 min-h-[200px] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-[13px] text-slate-300 font-jakarta block">No insider trading data</span>
                    <span className="text-[12px] text-slate-400 font-jakarta block mt-1">
                        SEC Form 4 filings update within 2 business days of trades
                    </span>
                </div>
            </div>
        );
    }

    const sent = sentimentConfig(data.sentiment);
    const netColor = data.net30d > 0 ? 'text-emerald-400' : data.net30d < 0 ? 'text-rose-400' : 'text-slate-400';

    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col relative group hover:border-white/20 transition-colors overflow-hidden">
            {/* Ambient grid background (amber-tinted) */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.03)_1px,transparent_1px)] bg-[size:24px_24px]" />
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-[radial-gradient(circle,rgba(245,158,11,0.06)_0%,transparent_60%)]" />
            </div>

            {/* ─── Summary Header ─── */}
            <div className="relative z-10 px-4 pt-3 pb-2 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        {/* Insider icon (SVG person silhouette) */}
                        <svg width="14" height="14" viewBox="0 0 16 16" className="text-amber-400" fill="currentColor">
                            <circle cx="8" cy="4" r="3" />
                            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z" />
                        </svg>
                        <span className="text-[12px] font-bold text-slate-200 tracking-wider uppercase font-jakarta">
                            Insider Activity
                        </span>
                        <span className="text-[11px] text-slate-400 font-jakarta">(Form 4)</span>
                    </div>
                    {/* Sentiment badge */}
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded border font-jakarta ${sent.bg} ${sent.color}`}>
                        {sent.label}
                    </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex flex-col">
                        <span className="text-[11px] text-slate-400 font-jakarta">Net (30d)</span>
                        <span className={`text-[14px] font-bold font-mono ${netColor}`}>
                            {data.net30d > 0 ? '+' : ''}{fmtDollar(data.net30d)}
                        </span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col">
                        <span className="text-[11px] text-slate-400 font-jakarta">Buy</span>
                        <span className="text-[14px] font-bold text-emerald-400 font-mono">{data.buyCount}</span>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="flex flex-col">
                        <span className="text-[11px] text-slate-400 font-jakarta">Sell</span>
                        <span className="text-[14px] font-bold text-rose-400 font-mono">{data.sellCount}</span>
                    </div>
                    {data.latest && (
                        <>
                            <div className="w-px h-6 bg-white/10" />
                            <div className="flex flex-col">
                                <span className="text-[11px] text-slate-400 font-jakarta">Latest</span>
                                <span className={`text-[12px] font-bold font-jakarta ${data.latest.code === 'P' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {data.latest.title} {data.latest.code === 'P' ? 'Buy' : 'Sell'} {fmtDollar(data.latest.value)}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ─── Timeline ─── */}
            <InsiderTimeline transactions={data.transactions} />

            {/* ─── Transaction Table ─── */}
            <div
                className="relative z-10 overflow-y-auto insider-scroll pr-0.5"
                style={{ maxHeight: `${SCROLL_HEIGHT}px` }}
            >
                {/* Table Header */}
                <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-white/5 px-4 py-1.5 grid grid-cols-[70px_1fr_60px_55px_80px_24px] md:grid-cols-[70px_1fr_70px_55px_90px_24px] gap-2 items-center">
                    <span className="text-[11px] text-slate-400 font-jakarta font-bold">DATE</span>
                    <span className="text-[11px] text-slate-400 font-jakarta font-bold">INSIDER</span>
                    <span className="text-[11px] text-slate-400 font-jakarta font-bold text-right">SHARES</span>
                    <span className="text-[11px] text-slate-400 font-jakarta font-bold text-center">TYPE</span>
                    <span className="text-[11px] text-slate-400 font-jakarta font-bold text-right">VALUE</span>
                    <span className="text-[11px] text-slate-400 font-jakarta font-bold text-center" title="SEC Filing">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" className="inline">
                            <path d="M4.5 1H10v8H4.5V1zm1 1v6H9V2H5.5zM2 3h2v1H3v5h4v-1h1v2H2V3z" />
                        </svg>
                    </span>
                </div>

                {/* Transaction Rows */}
                {displayTx.map((tx, idx) => {
                    const cl = codeLabel(tx.code);
                    const dateStr = new Date(tx.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                    
                    return (
                        <div
                            key={`${tx.date}-${tx.name}-${idx}`}
                            className={`px-4 py-1.5 grid grid-cols-[70px_1fr_60px_55px_80px_24px] md:grid-cols-[70px_1fr_70px_55px_90px_24px] gap-2 items-center border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                                tx.code === 'P' ? 'bg-emerald-500/[0.03]' : tx.code === 'S' && !tx.is10b5 ? 'bg-rose-500/[0.03]' : ''
                            }`}
                        >
                            {/* Date */}
                            <span className="text-[12px] text-slate-300 font-mono tabular-nums">{dateStr}</span>

                            {/* Insider Name + Title */}
                            <div className="flex flex-col min-w-0">
                                <span className="text-[12px] text-slate-200 font-jakarta truncate" title={tx.name}>
                                    {tx.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}
                                </span>
                                <span className="text-[10px] text-slate-400 font-jakarta flex items-center gap-1">
                                    {tx.title}
                                    {!tx.is10b5 && (tx.code === 'P' || tx.code === 'S') && (
                                        <span className="text-amber-400 font-bold" title="Not a pre-planned 10b5-1 trade (voluntary)">★</span>
                                    )}
                                </span>
                            </div>

                            {/* Shares */}
                            <span className="text-[12px] text-slate-300 font-mono text-right tabular-nums">
                                {tx.shares > 0 ? fmtShares(tx.shares) : '—'}
                            </span>

                            {/* Type Badge */}
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded text-center font-jakarta ${cl.bg} ${cl.color}`}>
                                {cl.label}
                            </span>

                            {/* Value */}
                            <span className={`text-[12px] font-bold font-mono text-right tabular-nums ${
                                tx.code === 'P' ? 'text-emerald-400' : tx.code === 'S' ? 'text-rose-400' : 'text-slate-400'
                            }`}>
                                {tx.value > 0 ? fmtDollar(tx.value) : '—'}
                            </span>

                            {/* SEC Link */}
                            <span className="text-center">
                                {tx.filingUrl && (
                                    <a
                                        href={tx.filingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-500 hover:text-amber-400 transition-colors"
                                        title="View SEC Filing"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline">
                                            <path d="M4 8L8 4M8 4H5M8 4V7" />
                                            <path d="M3 2H2v8h8v-1" />
                                        </svg>
                                    </a>
                                )}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Toggle: show all vs P/S only */}
            {data.transactions.length > displayTx.length && (
                <div className="relative z-10 px-4 py-1.5 border-t border-white/5">
                    <button
                        onClick={() => setShowAllTx(!showAllTx)}
                        className="text-[11px] text-amber-400/80 hover:text-amber-300 font-jakarta transition-colors"
                    >
                        {showAllTx ? 'Show Buy/Sell only' : `Show all ${data.transactions.length} transactions (incl. Awards, Exercises)`}
                    </button>
                </div>
            )}

            {/* ─── Footer ─── */}
            <div className="relative z-10 px-4 py-2 border-t border-white/5 flex items-center justify-between flex-wrap gap-1">
                <span className="text-[11px] text-slate-400 font-jakarta flex items-center gap-1.5">
                    Source: SEC Form 4
                    <span className="text-amber-400/60">·</span>
                    <span className="text-amber-400/80 font-bold" title="★ = Not a 10b5-1 pre-planned trade">★ = Voluntary (non-10b5-1)</span>
                </span>
                <span className="text-[11px] text-slate-400 font-jakarta">
                    {data.transactions.length} filings
                </span>
            </div>

            {/* Scrollbar CSS (amber theme) */}
            <style dangerouslySetInnerHTML={{__html: `
                .insider-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(245, 158, 11, 0.3) transparent;
                    transition: scrollbar-color 0.3s ease;
                }
                .insider-scroll:hover {
                    scrollbar-color: rgba(245, 158, 11, 0.5) transparent;
                }
                .insider-scroll::-webkit-scrollbar {
                    width: 4px;
                }
                .insider-scroll::-webkit-scrollbar-track {
                    background: transparent;
                }
                .insider-scroll::-webkit-scrollbar-thumb {
                    background-color: rgba(245, 158, 11, 0.3);
                    border-radius: 4px;
                    transition: background-color 0.3s ease;
                }
                .insider-scroll:hover::-webkit-scrollbar-thumb {
                    background-color: rgba(245, 158, 11, 0.5);
                }
            `}} />
        </div>
    );
}
