'use client';
// MobileCmd13F — Mobile-optimized 13-F + Insider toggle panel
// ZERO desktop impact — mobile-only component

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';

// ── Utilities ──
function fmtNum(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toLocaleString();
}
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
function getInitials(name: string | null | undefined): string {
    if (!name) return '—';
    const words = name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}
const INIT_COLORS = ['from-blue-500 to-blue-600','from-violet-500 to-violet-600','from-emerald-500 to-emerald-600','from-amber-500 to-amber-600','from-rose-500 to-rose-600','from-cyan-500 to-cyan-600','from-indigo-500 to-indigo-600','from-teal-500 to-teal-600'];
function getInitialColor(name: string | null | undefined): string {
    const s = name || '';
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return INIT_COLORS[Math.abs(hash) % INIT_COLORS.length];
}
function compactName(name: string | null | undefined): string {
    if (!name) return '—';
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    return `${parts[1].charAt(0)}. ${parts[0]}`;
}
function codeLabel(code: string) {
    switch (code) {
        case 'P': return { label: 'BUY', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
        case 'S': return { label: 'SELL', color: 'text-rose-400', bg: 'bg-rose-500/20' };
        case 'A': return { label: 'AWARD', color: 'text-slate-300', bg: 'bg-slate-500/20' };
        case 'M': return { label: 'EXER', color: 'text-blue-400', bg: 'bg-blue-500/20' };
        default: return { label: code || '—', color: 'text-slate-300', bg: 'bg-slate-500/20' };
    }
}
function sentimentConfig(s: string) {
    switch (s) {
        case 'BULLISH': return { label: 'BULLISH', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
        case 'CAUTIOUS': return { label: 'CAUTIOUS', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' };
        case 'BEARISH': return { label: 'BEARISH', color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' };
        default: return { label: 'NEUTRAL', color: 'text-slate-400', bg: 'bg-slate-500/15 border-slate-500/30' };
    }
}

// ── Logo ──
function InstLogo({ name, domain }: { name: string; domain: string | null }) {
    const [err, setErr] = useState(false);
    if (domain && !err) {
        return (
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center shrink-0 border border-white/10">
                <img src={`https://logo.clearbit.com/${domain}`} alt={name} width={32} height={32}
                    className="w-full h-full object-cover" onError={() => setErr(true)} loading="lazy" />
            </div>
        );
    }
    return (
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getInitialColor(name)} flex items-center justify-center shrink-0`}>
            <span className="text-[11px] font-bold text-white/90">{getInitials(name)}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// 13-F Holdings — Card Layout for Mobile
// ═══════════════════════════════════════════════════
function Mobile13FContent({ ticker }: { ticker: string }) {
    const [holders, setHolders] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        (async () => {
            try {
                const r = await fetch(`/api/command/13f?ticker=${encodeURIComponent(ticker)}`);
                if (r.ok) { const d = await r.json(); setHolders(d.holders || []); setSummary(d.summary || null); }
            } catch {} finally { setLoading(false); }
        })();
    }, [ticker]);

    if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>;
    if (holders.length === 0) return <div className="text-center py-12 text-slate-400 text-sm">No institutional 13-F data available</div>;

    const getQ = (d: string) => { const dt = new Date(d); return `Q${Math.ceil((dt.getMonth() + 1) / 3)} ${dt.getFullYear()}`; };
    const needsScroll = holders.length > 5;

    return (
        <div className="space-y-3">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                    <div className="text-[11px] text-slate-400 font-semibold mb-1">Holders</div>
                    <div className="text-[17px] font-bold text-white font-mono">{summary?.totalHolders || 0}</div>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                    <div className="text-[11px] text-slate-400 font-semibold mb-1">Total Value</div>
                    <div className="text-[17px] font-bold text-emerald-400 font-mono">{fmtDollar(summary?.totalValue || 0)}</div>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 border border-white/[0.06]">
                    <div className="text-[11px] text-slate-400 font-semibold mb-1">Period</div>
                    <div className="text-[15px] font-bold text-indigo-400 font-mono">{summary?.period ? getQ(summary.period) : '—'}</div>
                </div>
            </div>

            {/* Holder List — Card style */}
            <div
                className="space-y-3 pr-1"
                style={needsScroll ? { maxHeight: 548, overflowY: 'auto', WebkitOverflowScrolling: 'touch' } : undefined}
            >
            {holders.map((h: any, idx: number) => {
                const weight = summary?.totalValue ? ((h.marketValue / summary.totalValue) * 100) : 0;
                return (
                    <div key={h.cik || idx}
                        className={`rounded-xl border p-3 ${idx < 3 ? 'border-indigo-500/20 bg-indigo-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                        <div className="flex items-center gap-3 mb-2">
                            <span className={`text-[13px] font-bold w-5 text-center ${idx < 3 ? 'text-indigo-400' : 'text-slate-400'}`}>{h.rank}</span>
                            <InstLogo name={h.name} domain={h.domain} />
                            <span className="text-[13px] font-semibold text-white truncate flex-1">{h.name}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pl-8">
                            <div>
                                <div className="text-[10px] text-slate-500 font-semibold">SHARES</div>
                                <div className="text-[13px] text-slate-200 font-mono font-semibold">{fmtNum(h.shares)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-semibold">VALUE</div>
                                <div className="text-[13px] text-slate-200 font-mono font-semibold">{fmtDollar(h.marketValue)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-semibold">WEIGHT</div>
                                <div className={`text-[13px] font-mono font-bold ${weight >= 30 ? 'text-indigo-300' : 'text-slate-200'}`}>{weight.toFixed(1)}%</div>
                            </div>
                        </div>
                    </div>
                );
            })}
            </div>
            {needsScroll && (
                <div className="text-center text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Scroll for {holders.length - 5} more holders
                </div>
            )}
            <div className="text-center text-[11px] text-slate-500 py-2">
                Source: SEC Form 13-F · Top {Math.min(holders.length, 20)} of {summary?.totalHolders || holders.length}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// Insider Activity — Card Layout for Mobile
// ═══════════════════════════════════════════════════
function MobileInsiderContent({ ticker }: { ticker: string }) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        (async () => {
            try {
                const r = await fetch(`/api/command/insider?ticker=${encodeURIComponent(ticker)}`);
                if (r.ok) { const j = await r.json(); setData(j.insider || null); }
            } catch {} finally { setLoading(false); }
        })();
    }, [ticker]);

    // Group transactions — must be before early returns (React hooks rule)
    const grouped = useMemo(() => {
        if (!data?.transactions) return [];
        const txs = (data.transactions || []).filter((t: any) => t.code === 'P' || t.code === 'S' || t.value > 0);
        const map = new Map<string, any>();
        for (const tx of txs) {
            const dk = new Date(tx.date).toISOString().split('T')[0];
            const key = `${dk}|${tx.name}|${tx.code}`;
            const ex = map.get(key);
            if (ex) { ex.shares += tx.shares; ex.value += tx.value; ex._count++; ex._avgPrice = ex.shares > 0 ? ex.value / ex.shares : 0; }
            else map.set(key, { ...tx, _count: 1, _avgPrice: tx.shares > 0 ? tx.value / tx.shares : 0 });
        }
        return Array.from(map.values());
    }, [data]);

    if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-400 animate-spin" /></div>;
    if (!data || !data.transactions?.length) return <div className="text-center py-12 text-slate-400 text-sm">No insider trading data available</div>;

    const sent = sentimentConfig(data.sentiment);
    const netColor = data.net30d > 0 ? 'text-emerald-400' : data.net30d < 0 ? 'text-rose-400' : 'text-slate-300';

    return (
        <div className="space-y-3">
            {/* Summary Row */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[12px] font-black px-2.5 py-1 rounded-lg border ${sent.bg} ${sent.color}`}>{sent.label}</span>
                <div className="flex items-center gap-1.5 text-[13px]">
                    <span className="text-slate-300 font-medium">Net 30d</span>
                    <span className={`font-bold font-mono ${netColor}`}>{data.net30d > 0 ? '+' : ''}{fmtDollar(data.net30d)}</span>
                </div>
                <div className="flex items-center gap-3 ml-auto">
                    <span className="text-[13px]"><span className="text-slate-400">Buy </span><span className="font-bold text-emerald-400 font-mono">{data.buyCount}</span></span>
                    <span className="text-[13px]"><span className="text-slate-400">Sell </span><span className="font-bold text-rose-400 font-mono">{data.sellCount}</span></span>
                </div>
            </div>

            {/* Transaction Cards */}
            {grouped.map((tx: any, idx: number) => {
                const cl = codeLabel(tx.code);
                const dateStr = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                    <div key={`${tx.date}-${tx.name}-${idx}`}
                        className={`rounded-xl border p-3 ${tx.code === 'P' ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : tx.code === 'S' ? 'border-rose-500/20 bg-rose-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <span className={`text-[11px] font-black px-1.5 py-0.5 rounded ${cl.bg} ${cl.color}`}>{cl.label}</span>
                                <span className="text-[13px] font-semibold text-white">{compactName(tx.name)}</span>
                                <span className="text-[11px] text-slate-400">{tx.title}</span>
                            </div>
                            <span className="text-[12px] text-slate-400 font-mono">{dateStr}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <div className="text-[10px] text-slate-500 font-semibold">SHARES</div>
                                <div className="text-[13px] text-slate-200 font-mono font-semibold">{fmtShares(tx.shares)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-semibold">VALUE</div>
                                <div className={`text-[13px] font-mono font-bold ${tx.code === 'P' ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtDollar(tx.value)}</div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-500 font-semibold">AVG PRICE</div>
                                <div className="text-[13px] text-slate-200 font-mono font-semibold">{tx._avgPrice > 0 ? `$${tx._avgPrice.toFixed(2)}` : '—'}</div>
                            </div>
                        </div>
                        {!tx.is10b5 && (tx.code === 'P' || tx.code === 'S') && (
                            <div className="mt-1.5 text-[10px] text-amber-400/70 font-semibold">★ Voluntary (non-10b5-1 plan)</div>
                        )}
                    </div>
                );
            })}
            <div className="text-center text-[11px] text-slate-500 py-2">
                Source: SEC Form 4 · {data.transactions.length} filings
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════
// MAIN EXPORT — Toggle between 13-F and Insider
// ═══════════════════════════════════════════════════
type SubTab = '13f' | 'insider';

export function MobileCmd13F({ ticker }: { ticker: string }) {
    const [sub, setSub] = useState<SubTab>('13f');

    return (
        <div className="space-y-3">
            {/* Toggle Bar */}
            <div className="flex rounded-xl bg-white/[0.04] border border-white/[0.06] p-1 gap-1">
                <button
                    onClick={() => setSub('13f')}
                    className={`flex-1 py-2.5 rounded-lg text-[13px] font-bold transition-all ${sub === '13f' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 active:bg-white/[0.06]'}`}
                >
                    <span className="flex items-center justify-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={sub === '13f' ? 'text-white' : 'text-indigo-400'}>
                            <path d="M8 1L1 5V6H15V5L8 1Z" /><rect x="2" y="7" width="2" height="5" /><rect x="5" y="7" width="2" height="5" /><rect x="9" y="7" width="2" height="5" /><rect x="12" y="7" width="2" height="5" /><rect x="1" y="13" width="14" height="1.5" rx="0.5" />
                        </svg>
                        13-F Holdings
                    </span>
                </button>
                <button
                    onClick={() => setSub('insider')}
                    className={`flex-1 py-2.5 rounded-lg text-[13px] font-bold transition-all ${sub === 'insider' ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30' : 'text-slate-400 active:bg-white/[0.06]'}`}
                >
                    <span className="flex items-center justify-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className={sub === 'insider' ? 'text-white' : 'text-amber-400'}>
                            <circle cx="8" cy="4" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z" />
                        </svg>
                        Insider
                    </span>
                </button>
            </div>

            {/* Content */}
            {sub === '13f' ? <Mobile13FContent ticker={ticker} /> : <MobileInsiderContent ticker={ticker} />}
        </div>
    );
}

// ═══ Individual exports — for separate tabs ═══
export function MobileCmd13FOnly({ ticker }: { ticker: string }) {
    return <Mobile13FContent ticker={ticker} />;
}

export function MobileCmdInsiderOnly({ ticker }: { ticker: string }) {
    return <MobileInsiderContent ticker={ticker} />;
}
