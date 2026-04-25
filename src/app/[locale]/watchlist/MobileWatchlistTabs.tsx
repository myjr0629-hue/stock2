'use client';
import React, { memo, useMemo } from 'react';
import { Link } from '@/i18n/routing';
import { usePriceFlash, getFlashStyle, tickerDelay } from '@/components/ui/PriceDisplay';
import { TrendingUp, ArrowDownRight, Activity, Fish, Shield, Zap, Crosshair, RefreshCcw, ChevronRight } from 'lucide-react';
import type { EnrichedWatchlistItem } from '@/hooks/useWatchlist';

// ── Sparkline (inline SVG) ──
export const MiniSparkline = memo(function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
    if (!data || data.length < 2) return <div className="w-[56px] h-[18px] rounded bg-slate-800/30" />;
    const w = 56, h = 20, p = 1;
    const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => `${p + (i / (data.length - 1)) * (w - 2 * p)},${h - p - ((v - mn) / rng) * (h - 2 * p)}`).join(' ');
    const c = positive ? '#34d399' : '#f87171';
    return (
        <svg width={w} height={h} className="flex-shrink-0">
            <defs><linearGradient id={`mg-${positive ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.25" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
            <polygon points={`${p},${h} ${pts} ${w - p},${h}`} fill={`url(#mg-${positive ? 'u' : 'd'})`} />
            <polyline points={pts} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
});

// ── Single ticker row for Overview tab ──
export const OverviewRow = memo(function OverviewRow({ item, i }: { item: EnrichedWatchlistItem; i: number }) {
    const pos = item.changePct >= 0;
    const pf = getFlashStyle(usePriceFlash(item.currentPrice, tickerDelay(item.ticker)));
    return (
        <Link href={`/ticker?ticker=${item.ticker}`} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] active:bg-white/[0.04] transition-colors" style={{ animation: `fadeSlideIn 0.3s ease-out ${i * 40}ms both` }}>
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/80 border border-white/[0.08] flex items-center justify-center overflow-hidden flex-shrink-0 shadow-lg shadow-black/20">
                <img loading="lazy" src={`/api/logo/${item.ticker}`} alt="" className="w-7 h-7 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-black text-[16px] text-white tracking-wide">{item.ticker}</span>
                    {item.alphaGrade && <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-md ${item.alphaGrade === 'A' ? 'bg-emerald-500/15 text-emerald-400' : item.alphaGrade === 'B' ? 'bg-cyan-500/15 text-cyan-400' : item.alphaGrade === 'C' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>{item.alphaGrade}</span>}
                    {item.action && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-wide ${item.action === 'ADD' || item.action === 'HOLD' || item.action === 'BULLISH' || item.action === 'STRONG_BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : item.action === 'TRIM' || item.action === 'AVOID' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>{item.action}</span>}
                </div>
                <div className="flex items-center gap-2.5 mt-1">
                    <MiniSparkline data={item.sparkline || []} positive={pos} />
                    {item.return3d != null && <span className={`text-[11px] font-bold tabular-nums ${item.return3d >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>3D {item.return3d >= 0 ? '+' : ''}{item.return3d.toFixed(1)}%</span>}
                </div>
            </div>
            <div className="text-right flex-shrink-0">
                <div className={`font-black tabular-nums text-[18px] tracking-tight ${pf.color}`} style={pf.style}>${item.currentPrice.toFixed(2)}</div>
                <div className={`text-[13px] font-bold tabular-nums flex items-center justify-end gap-0.5 ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pos ? <TrendingUp className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {pos ? '+' : ''}{item.changePct.toFixed(2)}%
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
        </Link>
    );
});

// ── Premium Card view item ──
export const CardItem = memo(function CardItem({ item, i }: { item: EnrichedWatchlistItem; i: number }) {
    const pos = item.changePct >= 0;
    const pf = getFlashStyle(usePriceFlash(item.currentPrice, tickerDelay(item.ticker)));
    const gradeColor = item.alphaGrade === 'A' ? { stroke: '#34d399', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
        : item.alphaGrade === 'B' ? { stroke: '#22d3ee', text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' }
        : item.alphaGrade === 'C' ? { stroke: '#fbbf24', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
        : { stroke: '#f87171', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
    const signalColor = (a: string | undefined) => !a ? null
        : (a === 'ADD' || a === 'HOLD' || a === 'BULLISH' || a === 'STRONG_BULLISH') ? { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', bar: 'bg-emerald-400' }
        : (a === 'TRIM' || a === 'AVOID') ? { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', bar: 'bg-rose-400' }
        : { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', bar: 'bg-amber-400' };
    const sc = signalColor(item.action);
    const circ = 2 * Math.PI * 14;
    const offset = item.alphaScore != null ? circ - (Math.min(item.alphaScore, 100) / 100) * circ : circ;
    const isAboveFlip = item.gammaFlipLevel && item.currentPrice > item.gammaFlipLevel;

    return (
        <Link href={`/ticker?ticker=${item.ticker}`}
            className="block rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.05] via-white/[0.03] to-white/[0.01] backdrop-blur-xl overflow-hidden active:scale-[0.98] transition-transform"
            style={{ animation: `fadeSlideIn 0.35s ease-out ${i * 50}ms both`, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>

            {/* ── Row 1: Header — Logo + Ticker + Price ── */}
            <div className="flex items-center gap-3 p-4 pb-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/80 border border-white/[0.08] flex items-center justify-center overflow-hidden shadow-lg shadow-black/30">
                    <img loading="lazy" src={`/api/logo/${item.ticker}`} alt="" className="w-7 h-7 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-black text-[18px] text-white tracking-wide">{item.ticker}</div>
                    {item.vwapDist != null && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] font-semibold text-slate-300">VWAP</span>
                            <span className={`text-[12px] font-bold tabular-nums ${item.vwapDist > 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                                {item.vwapDist > 0 ? '+' : ''}{item.vwapDist.toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div className={`font-black tabular-nums text-[20px] tracking-tight ${pf.color}`} style={pf.style}>${item.currentPrice.toFixed(2)}</div>
                    <div className={`text-[14px] font-bold tabular-nums flex items-center justify-end gap-0.5 ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pos ? <TrendingUp className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {pos ? '+' : ''}{item.changePct.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* ── Row 2: Score Gauge + Signal Badge ── */}
            <div className="flex items-center gap-3 px-4 pb-3">
                {/* Alpha Score — circular gauge */}
                {item.alphaScore != null ? (
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="relative w-10 h-10 flex-shrink-0">
                            <svg className="w-10 h-10 -rotate-90">
                                <circle cx="20" cy="20" r="14" fill="none" stroke="#1e293b" strokeWidth="3" />
                                <circle cx="20" cy="20" r="14" fill="none" stroke={gradeColor.stroke} strokeWidth="3"
                                    strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
                                    style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
                            </svg>
                            <div className={`absolute inset-0 flex items-center justify-center text-[12px] font-black ${gradeColor.text}`}>{item.alphaGrade}</div>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-1">
                                <span className="text-[16px] font-black text-white tabular-nums">{item.alphaScore}</span>
                                <span className="text-[10px] font-bold text-slate-400">/ 100</span>
                            </div>
                            <div className="text-[9px] font-bold text-slate-300 tracking-wider">CONTEXT SCORE</div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1" />
                )}

                {/* Signal Badge — with confidence bar */}
                {item.action && sc ? (
                    <div className={`flex flex-col items-end gap-1 px-3 py-1.5 rounded-xl border ${sc.bg} ${sc.border}`}>
                        <div className="flex items-center gap-1.5">
                            <span className={`text-[13px] font-black ${sc.text}`}>{item.action}</span>
                            {item.confidence != null && <span className="text-[11px] font-bold tabular-nums text-white/70">{item.confidence}%</span>}
                        </div>
                        {item.confidence != null && (
                            <div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full ${sc.bar} transition-all duration-700`} style={{ width: `${item.confidence}%` }} />
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* ── Row 3: Full-width Sparkline ── */}
            <div className="px-4 pb-3">
                {item.sparkline && item.sparkline.length > 2 ? (
                    <CardSparkline data={item.sparkline} positive={pos} />
                ) : (
                    <div className="w-full h-[28px] rounded bg-slate-800/20" />
                )}
            </div>

            {/* ── Row 4: 6-Metric Grid ── */}
            <div className="grid grid-cols-3 gap-px bg-white/[0.04]">
                {/* IV with progress bar */}
                <div className="bg-[#080e1a] p-2.5 text-center">
                    <div className="text-[10px] font-bold text-slate-300 tracking-wider mb-1">IV</div>
                    <div className={`text-[14px] font-black tabular-nums ${item.iv != null ? (item.iv >= 50 ? 'text-rose-400' : item.iv <= 20 ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-600'}`}>
                        {item.iv != null ? `${item.iv.toFixed(0)}%` : '—'}
                    </div>
                    {item.iv != null && (
                        <div className="w-full h-1 rounded-full bg-slate-800 mt-1 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${item.iv >= 50 ? 'bg-rose-400' : item.iv <= 20 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                style={{ width: `${Math.min(item.iv, 100)}%` }} />
                        </div>
                    )}
                </div>

                {/* Whale */}
                <div className="bg-[#080e1a] p-2.5 text-center">
                    <div className="text-[10px] font-bold text-slate-300 tracking-wider mb-1">WHALE</div>
                    <div className="flex items-center justify-center gap-1">
                        {item.whaleIndex != null && item.whaleIndex >= 70 && <span className="text-[10px]">🐋</span>}
                        <span className={`text-[14px] font-black tabular-nums ${item.whaleIndex != null && item.whaleIndex >= 70 ? 'text-amber-400' : item.whaleIndex != null && item.whaleIndex >= 40 ? 'text-slate-300' : 'text-slate-500'}`}>
                            {item.whaleIndex != null ? item.whaleIndex : '—'}
                        </span>
                    </div>
                </div>

                {/* GEX Regime */}
                <div className="bg-[#080e1a] p-2.5 text-center">
                    <div className="text-[10px] font-bold text-slate-300 tracking-wider mb-1">GEX</div>
                    {item.gexM != null ? (
                        <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px]">{item.gexM > 0 ? '🛡️' : '⚡'}</span>
                            <span className={`text-[12px] font-black ${item.gexM > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {item.gexM > 0 ? 'LONG' : 'SHORT'}
                            </span>
                        </div>
                    ) : <span className="text-[14px] text-slate-600 font-black">—</span>}
                </div>

                {/* Gamma Flip */}
                <div className="bg-[#080e1a] p-2.5 text-center">
                    <div className="text-[10px] font-bold text-slate-300 tracking-wider mb-1">Γ FLIP</div>
                    {item.gammaFlipLevel != null && item.gammaFlipLevel > 0 ? (
                        <div>
                            <span className={`text-[13px] font-black tabular-nums ${isAboveFlip ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${item.gammaFlipLevel.toFixed(0)}
                            </span>
                        </div>
                    ) : <span className="text-[14px] text-slate-600 font-black">—</span>}
                </div>

                {/* Max Pain */}
                <div className="bg-[#080e1a] p-2.5 text-center">
                    <div className="text-[10px] font-bold text-slate-300 tracking-wider mb-1">MAX PAIN</div>
                    {item.maxPain != null ? (
                        <div>
                            <span className="text-[13px] font-black tabular-nums text-white/90">${item.maxPain.toFixed(0)}</span>
                            {item.maxPainDist != null && (
                                <span className={`text-[10px] font-bold ml-0.5 ${item.maxPainDist > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {item.maxPainDist > 0 ? '↑' : '↓'}{Math.abs(item.maxPainDist).toFixed(1)}%
                                </span>
                            )}
                        </div>
                    ) : <span className="text-[14px] text-slate-600 font-black">—</span>}
                </div>

                {/* 3D Return */}
                <div className="bg-[#080e1a] p-2.5 text-center">
                    <div className="text-[10px] font-bold text-slate-300 tracking-wider mb-1">3D RETURN</div>
                    <span className={`text-[14px] font-black tabular-nums ${item.return3d != null ? (item.return3d >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-600'}`}>
                        {item.return3d != null ? `${item.return3d >= 0 ? '+' : ''}${item.return3d.toFixed(1)}%` : '—'}
                    </span>
                </div>
            </div>
        </Link>
    );
});

// ── Full-width card sparkline (wider than mini) ──
const CardSparkline = memo(function CardSparkline({ data, positive }: { data: number[]; positive: boolean }) {
    if (!data || data.length < 2) return null;
    const w = 320, h = 28, p = 2;
    const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
    const pts = data.map((v, i) => `${p + (i / (data.length - 1)) * (w - 2 * p)},${h - p - ((v - mn) / rng) * (h - 2 * p)}`).join(' ');
    const c = positive ? '#34d399' : '#f87171';
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 28 }} preserveAspectRatio="none">
            <defs>
                <linearGradient id={`csg-${positive ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity="0.2" /><stop offset="100%" stopColor={c} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={`${p},${h} ${pts} ${w - p},${h}`} fill={`url(#csg-${positive ? 'u' : 'd'})`} />
            <polyline points={pts} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
});

function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
    return (<div className="text-center"><div className="text-[9px] font-bold text-slate-400 tracking-wider">{label}</div><div className={`text-[13px] font-black tabular-nums ${color}`}>{value}</div></div>);
}

// ── Compact row ──
export const CompactRow = memo(function CompactRow({ item }: { item: EnrichedWatchlistItem }) {
    const pos = item.changePct >= 0;
    return (
        <Link href={`/ticker?ticker=${item.ticker}`} className="grid grid-cols-[70px_1fr_1fr_50px] items-center px-3 py-2.5 border-b border-white/[0.04] active:bg-white/[0.04]">
            <span className="font-black text-[14px] text-white tracking-wide">{item.ticker}</span>
            <span className={`text-[14px] font-bold tabular-nums text-right ${pos ? 'text-emerald-400' : 'text-rose-400'}`}>{pos ? '+' : ''}{item.changePct.toFixed(2)}%</span>
            <span className="text-[14px] font-bold tabular-nums text-right text-white/90">${item.currentPrice.toFixed(2)}</span>
            <MiniSparkline data={item.sparkline || []} positive={pos} />
        </Link>
    );
});

// ── Signals tab content ──
export function SignalsContent({ items }: { items: EnrichedWatchlistItem[] }) {
    const signals = useMemo(() => {
        const list: { ticker: string; type: string; msg: string; color: string }[] = [];
        items.forEach(item => {
            if (item.whaleIndex != null && item.whaleIndex >= 70) list.push({ ticker: item.ticker, type: 'WHALE', msg: `Whale Index ${item.whaleIndex} — Strong Accumulation`, color: 'amber' });
            if (item.gexM != null && item.gexM < 0) list.push({ ticker: item.ticker, type: 'ALERT', msg: `Short Gamma (GEX ${item.gexM.toFixed(1)}M) — Volatility Zone`, color: 'rose' });
            if (item.iv != null && item.iv >= 50) list.push({ ticker: item.ticker, type: 'IV', msg: `Elevated IV ${item.iv.toFixed(0)}% — High Volatility`, color: 'purple' });
            if (item.return3d != null && Math.abs(item.return3d) > 5) list.push({ ticker: item.ticker, type: item.return3d > 0 ? 'BULLISH' : 'BEARISH', msg: `3D Return ${item.return3d > 0 ? '+' : ''}${item.return3d.toFixed(1)}% — Strong Move`, color: item.return3d > 0 ? 'emerald' : 'rose' });
            if (item.maxPainDist != null && Math.abs(item.maxPainDist) < 1.5) list.push({ ticker: item.ticker, type: 'MAGNET', msg: `Near Max Pain ($${item.maxPain?.toFixed(0)}) — ${item.maxPainDist.toFixed(1)}% away`, color: 'cyan' });
            if (item.action === 'TRIM' || item.action === 'AVOID') list.push({ ticker: item.ticker, type: 'CAUTION', msg: `Signal: ${item.action}${item.confidence ? ` (${item.confidence}%)` : ''}`, color: 'rose' });
            if (item.action === 'ADD' || item.action === 'STRONG_BULLISH') list.push({ ticker: item.ticker, type: 'BULLISH', msg: `Signal: ${item.action}${item.confidence ? ` (${item.confidence}%)` : ''}`, color: 'emerald' });
        });
        return list;
    }, [items]);

    const cs: Record<string, { card: string; bar: string; text: string }> = {
        amber: { card: 'bg-amber-500/10 border-amber-500/25', bar: 'bg-amber-400', text: 'text-amber-400' },
        rose: { card: 'bg-rose-500/10 border-rose-500/25', bar: 'bg-rose-400', text: 'text-rose-400' },
        emerald: { card: 'bg-emerald-500/10 border-emerald-500/25', bar: 'bg-emerald-400', text: 'text-emerald-400' },
        cyan: { card: 'bg-cyan-500/10 border-cyan-500/25', bar: 'bg-cyan-400', text: 'text-cyan-400' },
        purple: { card: 'bg-purple-500/10 border-purple-500/25', bar: 'bg-purple-400', text: 'text-purple-400' },
    };

    if (signals.length === 0) return (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Activity className="w-6 h-6 text-slate-500" />
            <p className="text-slate-400 text-sm font-medium">No active signals</p>
            <p className="text-[11px] text-slate-600">Signals are generated from your watchlist data</p>
        </div>
    );

    return (
        <div className="px-3 py-3 space-y-1.5">
            <div className="flex items-center gap-2 px-1 mb-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Watchlist Signals</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">{signals.length}</span>
            </div>
            {signals.map((sig, i) => {
                const s = cs[sig.color] || cs.cyan;
                return (
                    <div key={i} className={`relative p-2.5 rounded-lg border backdrop-blur-sm ${s.card}`}>
                        <div className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${s.bar}`} />
                        <div className="flex items-center gap-2 pl-2 mb-1">
                            <div className="w-5 h-5 rounded bg-slate-800/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                                <img loading="lazy" src={`/api/logo/${sig.ticker}`} alt="" className="w-3.5 h-3.5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                            <span className="font-semibold text-xs text-white">{sig.ticker}</span>
                            <span className={`text-[11px] font-bold ${s.text}`}>{sig.type}</span>
                        </div>
                        <p className="text-xs text-white/90 leading-snug pl-2">{sig.msg}</p>
                    </div>
                );
            })}
        </div>
    );
}

// ── Stats summary bar ──
export function MobileStatsBar({ items }: { items: EnrichedWatchlistItem[] }) {
    const stats = useMemo(() => {
        const g = items.filter(i => i.changePct > 0).length;
        const l = items.filter(i => i.changePct < 0).length;
        const avg = items.length > 0 ? items.reduce((s, i) => s + i.changePct, 0) / items.length : 0;
        const alphaItems = items.filter(i => i.alphaScore != null && i.alphaScore > 0);
        const avgA = alphaItems.length > 0 ? Math.round(alphaItems.reduce((s, i) => s + (i.alphaScore || 0), 0) / alphaItems.length) : 0;
        return { total: items.length, gainers: g, losers: l, avg, avgAlpha: avgA };
    }, [items]);
    return (
        <div className="grid grid-cols-4 gap-2.5 px-4 py-3">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5 text-center">
                <div className="text-[20px] font-black text-white tabular-nums">{stats.total}</div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider">TOTAL</div>
            </div>
            <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/[0.12] p-2.5 text-center">
                <div className="text-[20px] font-black text-emerald-400 tabular-nums">{stats.gainers}</div>
                <div className="text-[10px] font-bold text-emerald-400/60 tracking-wider">UP</div>
            </div>
            <div className="rounded-xl bg-rose-500/[0.06] border border-rose-500/[0.12] p-2.5 text-center">
                <div className="text-[20px] font-black text-rose-400 tabular-nums">{stats.losers}</div>
                <div className="text-[10px] font-bold text-rose-400/60 tracking-wider">DOWN</div>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5 text-center">
                <div className={`text-[20px] font-black tabular-nums ${stats.avg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.avg >= 0 ? '+' : ''}{stats.avg.toFixed(1)}%</div>
                <div className="text-[10px] font-bold text-slate-400 tracking-wider">AVG</div>
            </div>
        </div>
    );
}
