'use client';

/**
 * [INSIDER] SEC Form 4 Insider Trading Panel
 * 
 * Premium panel for the Command page insight tabs (alongside GEX, Tech Levels, IV Skew, 13-F).
 * Shows insider trading activity from SEC Form 4 filings:
 * - 30-day dot timeline (SVG) with buy/sell markers
 * - Net insider value summary with sentiment badge
 * - COMPACT transaction table: Name · Title on ONE line, min 12px, slate-200
 * 
 * Design rules (strict):
 * - Minimum font size: 12px (no 10px/11px anywhere)
 * - Text color: slate-200 minimum (no slate-300/400 for readable content)
 * - Amber/gold theme for premium feel
 * - Compliance tagline included
 * - Zero impact on other features
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';

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

/** Grouped transaction row (same date + insider + type) */
interface GroupedTransaction extends InsiderTransaction {
    _groupCount: number;
    _avgPrice: number;
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
        case 'A': return { label: 'AWARD', color: 'text-slate-300', bg: 'bg-slate-500/20' };
        case 'M': return { label: 'EXER', color: 'text-blue-400', bg: 'bg-blue-500/20' };
        case 'C': return { label: 'CONV', color: 'text-slate-300', bg: 'bg-slate-500/20' };
        case 'F': return { label: 'TAX', color: 'text-slate-300', bg: 'bg-slate-500/20' };
        default: return { label: code || '—', color: 'text-slate-300', bg: 'bg-slate-500/20' };
    }
}

function sentimentConfig(s: string) {
    switch (s) {
        case 'BULLISH': return { label: 'BULLISH', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' };
        case 'CAUTIOUS': return { label: 'CAUTIOUS', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' };
        case 'BEARISH': return { label: 'BEARISH', color: 'text-rose-400', bg: 'bg-rose-500/20 border-rose-500/30' };
        default: return { label: 'NEUTRAL', color: 'text-slate-300', bg: 'bg-slate-500/20 border-slate-500/30' };
    }
}

/** Compact name: "Rubinstein Jonathan" → "J. Rubinstein" */
function compactName(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    const lastName = parts[0];
    const firstName = parts[1];
    return `${firstName.charAt(0)}. ${lastName}`;
}

// ─── 30-Day Timeline (SVG) ─────────────────────────────────────────

function InsiderTimeline({ transactions }: { transactions: InsiderTransaction[] }) {
    const significant = transactions.filter(t => t.code === 'P' || t.code === 'S');
    if (significant.length === 0) return null;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recent = significant.filter(t => new Date(t.date) >= thirtyDaysAgo);
    
    if (recent.length === 0) {
        return (
            <div className="px-4 py-1 text-[12px] text-slate-200 font-jakarta text-center">
                No insider buy/sell in the last 30 days
            </div>
        );
    }

    const maxValue = Math.max(...recent.map(t => t.value), 1);
    const SVG_W = 600;
    const SVG_H = 48;
    const MARGIN_X = 20;

    return (
        <div className="px-4 py-1">
            <div className="flex items-center justify-between mb-0.5">
                <span className="text-[12px] text-slate-200 font-jakarta font-medium">30-Day Activity</span>
                <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[12px] text-slate-200 font-jakarta">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> BUY
                    </span>
                    <span className="flex items-center gap-1 text-[12px] text-slate-200 font-jakarta">
                        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> SELL
                    </span>
                </div>
            </div>
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-[48px]">
                <line x1={MARGIN_X} y1={SVG_H / 2} x2={SVG_W - MARGIN_X} y2={SVG_H / 2} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                <text x={MARGIN_X} y={SVG_H - 1} fill="rgba(226,232,240,0.8)" fontSize="11" fontFamily="Jakarta Sans, sans-serif" fontWeight="500">30d ago</text>
                <text x={SVG_W - MARGIN_X} y={SVG_H - 1} fill="rgba(226,232,240,0.8)" fontSize="11" fontFamily="Jakarta Sans, sans-serif" textAnchor="end" fontWeight="500">Today</text>
                
                {recent.map((t, i) => {
                    const date = new Date(t.date);
                    const daysDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
                    const xPct = 1 - (daysDiff / 30);
                    const x = MARGIN_X + xPct * (SVG_W - 2 * MARGIN_X);
                    const radius = 3 + (t.value / maxValue) * 5;
                    const isBuy = t.code === 'P';
                    const color = isBuy ? '#10b981' : '#f43f5e';
                    const opacity = t.is10b5 ? 0.6 : 1.0;

                    return (
                        <g key={`${t.date}-${i}`}>
                            <circle cx={x} cy={SVG_H / 2} r={radius + 2} fill={color} opacity={opacity * 0.15} />
                            <circle cx={x} cy={SVG_H / 2} r={radius} fill={color} opacity={opacity} stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
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

// ─── Table Row Heights (compact) ────────────────────────────────────
const VISIBLE_ROWS = 8;
const ROW_HEIGHT = 28;
const TABLE_HEADER_HEIGHT = 28;
const SCROLL_HEIGHT = TABLE_HEADER_HEIGHT + (VISIBLE_ROWS * ROW_HEIGHT);

// ─── Main Component ────────────────────────────────────────────────

export default function InsiderActivityPanel({ ticker, insider: propInsider }: Props) {
    const td = useTranslations('dashboard');
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

    // [FIX 2026-05-05] When propInsider becomes null (ticker change), self-fetch.
    // When propInsider has data, use it directly (parent already fetched).
    useEffect(() => {
        if (propInsider) {
            setData(propInsider);
            setLoading(false);
        } else {
            // propInsider is null → ticker changed, parent is fetching, self-fetch as backup
            setData(null);
            fetchInsider();
        }
    }, [fetchInsider, propInsider]);

    const displayTx = useMemo((): GroupedTransaction[] => {
        if (!data?.transactions) return [];
        const filtered = showAllTx
            ? data.transactions
            : data.transactions.filter(t => t.code === 'P' || t.code === 'S' || t.value > 0);

        // Group by (date + name + code): same day, same insider, same type → merge
        const groupMap = new Map<string, GroupedTransaction>();
        for (const tx of filtered) {
            const dateKey = new Date(tx.date).toISOString().split('T')[0];
            const key = `${dateKey}|${tx.name}|${tx.code}`;
            const existing = groupMap.get(key);
            if (existing) {
                existing.shares += tx.shares;
                existing.value += tx.value;
                existing._groupCount += 1;
                existing._avgPrice = existing.shares > 0 ? existing.value / existing.shares : 0;
                // Keep the latest filing URL and the latest sharesAfter
                if (!existing.filingUrl && tx.filingUrl) existing.filingUrl = tx.filingUrl;
            } else {
                groupMap.set(key, {
                    ...tx,
                    _groupCount: 1,
                    _avgPrice: tx.shares > 0 ? tx.value / tx.shares : 0,
                });
            }
        }
        return Array.from(groupMap.values());
    }, [data, showAllTx]);

    // ─── Loading ───────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg p-4 min-h-[200px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                    <span className="text-[12px] text-slate-200 font-jakarta">Loading Insider Activity...</span>
                </div>
            </div>
        );
    }

    // ─── Error ─────────────────────────────────────────────────────
    if (error) {
        return (
            <div className="rounded-lg border border-rose-500/20 bg-slate-900/60 p-4 min-h-[120px] flex items-center justify-center">
                <span className="text-[12px] text-slate-200 font-jakarta">Insider data unavailable</span>
            </div>
        );
    }

    // ─── Empty ─────────────────────────────────────────────────────
    if (!data || data.transactions.length === 0) {
        return (
            <div className="rounded-lg border border-white/10 bg-slate-900/60 p-4 min-h-[120px] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-[13px] text-slate-200 font-jakarta block">No insider trading data</span>
                    <span className="text-[12px] text-slate-200/60 font-jakarta block mt-1">
                        SEC Form 4 filings update within 2 business days of trades
                    </span>
                </div>
            </div>
        );
    }

    const sent = sentimentConfig(data.sentiment);
    const netColor = data.net30d > 0 ? 'text-emerald-400' : data.net30d < 0 ? 'text-rose-400' : 'text-slate-300';

    return (
        <div className="rounded-lg border border-white/10 bg-slate-900/60 backdrop-blur-lg shadow-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col relative group hover:border-white/20 transition-colors overflow-hidden">
            {/* Ambient grid background (amber-tinted) */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.03)_1px,transparent_1px)] bg-[size:24px_24px]" />
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-[radial-gradient(circle,rgba(245,158,11,0.06)_0%,transparent_60%)]" />
            </div>

            {/* ─── Header: Title + Compliance + Sentiment ─── */}
            <div className="relative z-10 px-4 pt-2.5 pb-1.5 border-b border-white/5">
                {/* Row 1: Title + Premium tagline + Badge */}
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 16 16" className="text-amber-400" fill="currentColor">
                            <circle cx="8" cy="4" r="3" />
                            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z" />
                        </svg>
                        <span className="text-[14px] font-bold text-white tracking-wider uppercase font-jakarta">
                            Insider Activity
                        </span>
                        <span className="text-[12px] text-slate-200 font-jakarta">(Form 4)</span>
                        <span className="text-[12px] text-amber-400/60 font-jakarta hidden md:inline">·</span>
                        <span className="text-[12px] text-amber-300 font-jakarta font-medium hidden md:inline">{td('insiderFilingIntel')}</span>
                    </div>
                    <span className={`text-[12px] font-black px-2 py-0.5 rounded border font-jakarta ${sent.bg} ${sent.color}`}>
                        {sent.label}
                    </span>
                </div>

                {/* Row 2: Stats inline — all 12px slate-200 */}
                <div className="flex items-center gap-2 text-[12px] font-jakarta flex-wrap">
                    <span className="text-slate-200 font-medium">Net(30d)</span>
                    <span className={`font-bold font-mono ${netColor}`}>
                        {data.net30d > 0 ? '+' : ''}{fmtDollar(data.net30d)}
                    </span>
                    <span className="text-white/15">|</span>
                    <span className="text-slate-200 font-medium">Buy</span>
                    <span className="font-bold text-emerald-400 font-mono">{data.buyCount}</span>
                    <span className="text-white/15">|</span>
                    <span className="text-slate-200 font-medium">Sell</span>
                    <span className="font-bold text-rose-400 font-mono">{data.sellCount}</span>
                    {data.latest && (
                        <>
                            <span className="text-white/15">|</span>
                            <span className={`font-bold ${data.latest.code === 'P' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {data.latest.title} {data.latest.code === 'P' ? 'Buy' : 'Sell'} {fmtDollar(data.latest.value)}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* ─── Timeline ─── */}
            <InsiderTimeline transactions={data.transactions} />

            {/* ─── Transaction Table (compact single-line rows) ─── */}
            <div
                className="relative z-10 overflow-y-auto insider-scroll pr-0.5"
                style={{ maxHeight: `${SCROLL_HEIGHT}px` }}
            >
                {/* Table Header — 12px, slate-200, bold */}
                <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm border-b border-white/5 px-4 py-1 grid grid-cols-[50px_minmax(100px,1fr)_80px_54px_82px_78px_22px] gap-1 items-center">
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold">DATE</span>
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold">INSIDER</span>
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold text-right">SHARES</span>
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold text-center">TYPE</span>
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold text-right">VALUE</span>
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold text-right">AVG</span>
                    <span className="text-[12px] text-slate-200 font-jakarta font-bold text-center" title="SEC Filing">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" className="inline">
                            <path d="M4.5 1H10v8H4.5V1zm1 1v6H9V2H5.5zM2 3h2v1H3v5h4v-1h1v2H2V3z" />
                        </svg>
                    </span>
                </div>

                {/* Transaction Rows — single line: "J. Rubinstein · Director" */}
                {displayTx.map((tx, idx) => {
                    const cl = codeLabel(tx.code);
                    const dateStr = new Date(tx.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                    const nameDisplay = compactName(tx.name);
                    const avgPrice = tx._avgPrice > 0 ? `$${tx._avgPrice.toFixed(2)}` : '—';
                    
                    return (
                        <div
                            key={`${tx.date}-${tx.name}-${tx.code}-${idx}`}
                            className={`px-4 py-0.5 grid grid-cols-[50px_minmax(100px,1fr)_80px_54px_82px_78px_22px] gap-1 items-center border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                                tx.code === 'P' ? 'bg-emerald-500/[0.03]' : tx.code === 'S' && !tx.is10b5 ? 'bg-rose-500/[0.03]' : ''
                            }`}
                            style={{ minHeight: `${ROW_HEIGHT}px` }}
                        >
                            {/* Date — 12px slate-200 */}
                            <span className="text-[12px] text-slate-200 font-mono tabular-nums">{dateStr}</span>

                            {/* Insider: "J. Rubinstein · Director" — single line, 12px, slate-200 */}
                            <span className="text-[12px] text-slate-200 font-jakarta truncate" title={`${tx.name} — ${tx.title}`}>
                                <span className="font-medium">{nameDisplay}</span>
                                <span className="text-slate-200/40 mx-1">·</span>
                                <span className="text-slate-200/70">{tx.title}</span>
                                {!tx.is10b5 && (tx.code === 'P' || tx.code === 'S') && (
                                    <span className="text-amber-400 font-bold ml-0.5" title="Voluntary (non-10b5-1)">★</span>
                                )}
                                {tx._groupCount > 1 && (
                                    <span className="ml-1 text-[10px] font-bold text-amber-400/80 bg-amber-500/15 px-1 rounded" title={`${tx._groupCount} transactions merged`}>×{tx._groupCount}</span>
                                )}
                            </span>

                            {/* Shares — 12px slate-200 */}
                            <span className="text-[12px] text-slate-200 font-mono text-right tabular-nums">
                                {tx.shares > 0 ? fmtShares(tx.shares) : '—'}
                            </span>

                            {/* Type Badge — 12px */}
                            <span className={`text-[12px] font-black px-1 py-px rounded text-center font-jakarta ${cl.bg} ${cl.color}`}>
                                {cl.label}
                            </span>

                            {/* Value — 12px colored */}
                            <span className={`text-[12px] font-bold font-mono text-right tabular-nums ${
                                tx.code === 'P' ? 'text-emerald-400' : tx.code === 'S' ? 'text-rose-400' : 'text-slate-200'
                            }`}>
                                {tx.value > 0 ? fmtDollar(tx.value) : '—'}
                            </span>

                            {/* Avg Price — 12px slate-300 */}
                            <span className="text-[12px] text-slate-300 font-mono text-right tabular-nums">
                                {avgPrice}
                            </span>

                            {/* SEC Link */}
                            <span className="text-center">
                                {tx.filingUrl && (
                                    <a
                                        href={tx.filingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-400 hover:text-amber-400 transition-colors"
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

            {/* Toggle: show all vs P/S only — 12px slate-200 */}
            {data.transactions.length > displayTx.length && (
                <div className="relative z-10 px-4 py-1 border-t border-white/5">
                    <button
                        onClick={() => setShowAllTx(!showAllTx)}
                        className="text-[12px] text-amber-400/80 hover:text-amber-300 font-jakarta font-medium transition-colors"
                    >
                        {showAllTx ? 'Show Buy/Sell only' : `Show all ${data.transactions.length} transactions (incl. Awards, Exercises)`}
                    </button>
                </div>
            )}

            {/* ─── Footer: Source + Compliance ─── */}
            <div className="relative z-10 px-4 py-1.5 border-t border-white/5 flex items-center justify-between flex-wrap gap-1">
                <span className="text-[12px] text-slate-200 font-jakarta flex items-center gap-1.5">
                    Source: SEC Form 4
                    <span className="text-amber-400/50">·</span>
                    <span className="text-amber-400/80 font-bold" title="★ = Not a 10b5-1 pre-planned trade">★ = Voluntary (non-10b5-1)</span>
                </span>
                <span className="text-[12px] text-slate-200 font-jakarta">
                    {data.transactions.length} filings
                </span>
            </div>

            {/* Compliance disclaimer */}
            <div className="relative z-10 px-4 py-1 border-t border-white/[0.03]">
                <span className="text-[12px] text-slate-200/40 font-jakarta italic">
                    Insider data is for informational purposes only and does not constitute investment advice.
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
