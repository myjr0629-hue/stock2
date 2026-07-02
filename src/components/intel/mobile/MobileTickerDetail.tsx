'use client';

import React, { useState, useEffect } from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';

interface MobileTickerDetailProps {
    quote: IntelQuote;
    sectorLabel: string;
    onBack: () => void;
}

const LOGO = (t: string) => `https://assets.parqet.com/logos/symbol/${t}?format=png`;

function fmt(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}

function gradeInfo(s: number) {
    if (s >= 70) return { l: 'A', c: '#4ade80', t: 'text-emerald-400', bg: 'bg-emerald-500/15', b: 'border-emerald-500/30', d: 'Strong multi-indicator alignment.' };
    if (s >= 55) return { l: 'B', c: '#60a5fa', t: 'text-blue-400', bg: 'bg-blue-500/15', b: 'border-blue-500/30', d: 'Moderate signal convergence.' };
    if (s >= 40) return { l: 'C', c: '#fbbf24', t: 'text-amber-400', bg: 'bg-amber-500/15', b: 'border-amber-500/30', d: 'Mixed signals. Selective positioning.' };
    return { l: 'D', c: '#f87171', t: 'text-rose-400', bg: 'bg-rose-500/15', b: 'border-rose-500/30', d: 'Weak positioning. Caution advised.' };
}

// Metric cell with colored background (matching web card style)
function MC({ label, value, color, bg, border }: { label: string; value: string; color?: string; bg?: string; border?: string }) {
    return (
        <div className={`rounded-lg px-3 py-2.5 ${bg || 'bg-[#0f172a]/60'} ${border ? `border ${border}` : 'border border-white/[0.06]'}`}>
            <div className="text-[10px] text-white/80 uppercase tracking-wider font-semibold mb-1">{label}</div>
            <div className={`text-[15px] font-bold font-mono ${color || 'text-white'}`}>{value}</div>
        </div>
    );
}

// ── AI Analysis Generator (mobile, rule-based) ──
function generateMobileAnalysis(q: IntelQuote): string {
    const { price, maxPain, callWall, putFloor, gex, pcr, gammaRegime, changePct, netPremium } = q;
    if (!price || price === 0) return 'Waiting for market data...';

    const squeeze = q.squeezeScore || 0;
    const npM = (netPremium || 0) / 1e6;
    const whaleIdx = q.whaleIndex || 0;
    const darkPool = q.darkPoolPct || 0;
    const skew = q.ivSkew || 0;
    const isSG = gammaRegime === 'SHORT';
    const isLG = gammaRegime === 'LONG';
    const maxPainDist = maxPain > 0 ? ((price - maxPain) / maxPain * 100) : 0;
    const toCallWall = (callWall > 0 && price > 0) ? ((callWall - price) / price * 100) : 999;
    const toPutFloor = (putFloor > 0 && price > 0) ? ((price - putFloor) / price * 100) : 999;

    const parts: string[] = [];

    // Priority signal
    if (isSG && pcr < 0.7 && squeeze >= 60) {
        parts.push(`Synthetic squeeze imminent — PCR ${pcr.toFixed(2)}, Squeeze ${Math.round(squeeze)}%. Call Wall $${callWall?.toFixed(0)} is the breakout target.`);
    } else if (isSG && pcr > 1.3 && toPutFloor < 2) {
        parts.push(`Crash risk elevated — PCR ${pcr.toFixed(2)}, Put Floor $${putFloor?.toFixed(0)} only ${toPutFloor.toFixed(1)}% away in SHORT gamma.`);
    } else if (toCallWall < 1.5 && toCallWall > 0) {
        parts.push(`Approaching Call Wall $${callWall?.toFixed(0)} (${toCallWall.toFixed(1)}% away). ${isSG ? 'SHORT gamma amplifies breakout potential.' : 'LONG gamma caps upside.'}`);
    } else if (toPutFloor < 1.5 && toPutFloor > 0) {
        parts.push(`Near Put Floor $${putFloor?.toFixed(0)} (${toPutFloor.toFixed(1)}% away). ${isSG ? 'Downside acceleration risk.' : 'Dealer hedging provides support.'}`);
    }

    // Structural
    if (maxPain > 0) {
        if (Math.abs(maxPainDist) < 1) {
            parts.push(`Pinned near MaxPain $${maxPain.toFixed(0)} — expect consolidation toward expiry.`);
        } else if (maxPainDist > 2.5) {
            parts.push(`Trading ${maxPainDist.toFixed(1)}% above MaxPain $${maxPain.toFixed(0)} — gravity pull possible.`);
        } else if (maxPainDist < -2.5) {
            parts.push(`${Math.abs(maxPainDist).toFixed(1)}% below MaxPain $${maxPain.toFixed(0)} — mean reversion potential.`);
        }
    }

    // Flow
    if (Math.abs(npM) >= 1) {
        parts.push(npM > 0
            ? `Net premium inflow +$${npM.toFixed(1)}M (call-dominant).`
            : `Net premium outflow -$${Math.abs(npM).toFixed(1)}M (put-heavy).`);
    }
    if (whaleIdx >= 70) parts.push(`Heavy institutional activity detected (Whale ${whaleIdx}).`);
    else if (whaleIdx >= 40 && darkPool >= 40) parts.push(`Stealth positioning — Whale ${whaleIdx}, Dark Pool ${darkPool.toFixed(0)}%.`);
    if (skew > 3) parts.push(`Elevated IV skew +${skew.toFixed(1)}% — hedging pressure visible.`);

    // Conclusion
    if (isSG && pcr < 0.8 && squeeze >= 50) {
        parts.push('📋 Upside momentum favored. Watch Call Wall for breakout confirmation.');
    } else if (isSG && pcr > 1.2) {
        parts.push('📋 Downside pressure dominant. Put Floor is critical support.');
    } else if (isLG && pcr < 0.9) {
        parts.push('📋 Stable bullish structure. Dealer positioning supports continuation.');
    } else if (isLG && pcr > 1.0) {
        parts.push('📋 Support absorption likely. LONG gamma provides floor.');
    } else {
        parts.push('📋 Mixed signals. Monitor for directional catalyst.');
    }

    return parts.join(' ') || 'Collecting data...';
}

// Highlight numbers in analysis text
function highlightText(text: string): React.ReactNode[] {
    const pattern = /(\$[\d,.]+[BMK]?|[+-]?\d+\.?\d*%|SHORT gamma|LONG gamma|Whale \d+)/gi;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        nodes.push(<span key={m.index} className="text-white font-semibold">{m[0]}</span>);
        last = pattern.lastIndex;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
}

export function MobileTickerDetail({ quote: q, sectorLabel, onBack }: MobileTickerDetailProps) {
    const router = useRouter();
    const locale = useLocale();
    const up = q.changePct >= 0;
    const g = gradeInfo(q.alphaScore);

    // ── Bedrock AI Analysis fetch ──
    const [aiText, setAiText] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        setAiLoading(true);
        setAiText(null);

        fetch('/api/intel/perplexity-analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stocks: [{
                ticker: q.ticker, price: q.price || 0, changePct: q.changePct || 0,
                gex: q.gex || 0, pcr: q.pcr || 0, gammaRegime: q.gammaRegime || 'NEUTRAL',
                netPremium: q.netPremium || 0, callWall: q.callWall || 0, putFloor: q.putFloor || 0,
                maxPain: q.maxPain || 0, whaleIndex: q.whaleIndex || 0, darkPoolPct: q.darkPoolPct || 0,
                ivSkew: q.ivSkew || 0, impliedMovePct: q.impliedMovePct || 0,
                squeezeScore: q.squeezeScore || 0, contextScore: q.alphaScore || 0,
            }] }),
            signal: controller.signal,
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.analyses?.[q.ticker]) {
                    const a = data.analyses[q.ticker];
                    setAiText(a[locale as 'ko' | 'en' | 'ja'] || a.en || null);
                }
            })
            .catch(() => {})
            .finally(() => setAiLoading(false));

        return () => controller.abort();
    }, [q.ticker]);  // eslint-disable-line react-hooks/exhaustive-deps

    // Gamma tunnel
    const hasTunnel = q.putFloor > 0 && q.callWall > 0 && q.putFloor < q.callWall;
    const tunnelRange = hasTunnel ? q.callWall - q.putFloor : 1;
    const tunnelPct = hasTunnel ? Math.max(0, Math.min(100, ((q.price - q.putFloor) / tunnelRange) * 100)) : 50;
    const tunnelDotColor = tunnelPct < 20 ? '#f87171' : tunnelPct > 80 ? '#34d399' : '#fbbf24';

    // MaxPain position
    const hasMP = q.maxPain > 0 && q.price > 0;
    const mpLow = q.putFloor || q.maxPain * 0.95;
    const mpHigh = q.callWall || q.maxPain * 1.05;
    const mpRange = mpHigh - mpLow || 1;
    const mpPricePct = Math.max(0, Math.min(100, ((q.price - mpLow) / mpRange) * 100));
    const mpPainPct = hasMP ? Math.max(0, Math.min(100, ((q.maxPain - mpLow) / mpRange) * 100)) : 50;

    // Sparkline
    const spark = q.sparkline && q.sparkline.length >= 2;
    const sparkColor = up ? '#10b981' : '#f43f5e';
    let sparkPoints = '';
    let sparkFill = '';
    if (spark) {
        const mn = Math.min(...q.sparkline);
        const mx = Math.max(...q.sparkline);
        const r = mx - mn || 1;
        const h = 40;
        const pts = q.sparkline.map((v, i) => {
            const x = (i / (q.sparkline.length - 1)) * 300;
            const y = h - ((v - mn) / r) * (h - 4) - 2;
            return `${x},${y}`;
        }).join(' ');
        sparkPoints = pts;
        sparkFill = `0,${h} ${pts} 300,${h}`;
    }

    // Regime
    const regimeColor = q.gammaRegime === 'LONG' ? '#06b6d4' : q.gammaRegime === 'SHORT' ? '#f59e0b' : '#64748b';
    const regimeLabel = q.gammaRegime === 'LONG' ? 'Long Gamma · Stable' : q.gammaRegime === 'SHORT' ? 'Short Gamma · Volatile' : 'Neutral';

    // Extended session
    const hasExt = q.extendedPrice > 0 && q.extendedLabel;

    return (
        <div className="w-full flex flex-col min-h-screen bg-[#050a14] pb-24 relative z-10">

            {/* ═══ FIXED HEADER ═══ */}
            <div className="fixed top-14 left-0 right-0 z-30 bg-[#050a14]/95 border-b border-white/[0.06]"
                style={{ WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)' }}>
                <div className="px-4 py-2 flex items-center">
                    <button onClick={onBack} className="flex items-center gap-1 text-blue-400 active:text-blue-300 touch-manipulation"
                        style={{ WebkitTapHighlightColor: 'transparent' }}>
                        <ChevronLeft className="w-5 h-5" />
                        <span className="text-[13px] font-semibold">{sectorLabel}</span>
                    </button>
                    <span className="ml-auto text-[13px] font-bold text-white">{q.ticker}</span>
                </div>
            </div>

            {/* Spacer */}
            <div className="h-[100px] shrink-0" />

            <div className="px-4 space-y-4">

                {/* ═══ HERO ═══ */}
                <div className="text-center pt-2">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-black border border-white/10 overflow-hidden relative flex items-center justify-center shrink-0">
                            <span className="text-[14px] font-bold text-white/50 absolute">{q.ticker.slice(0, 2)}</span>
                            <img src={LOGO(q.ticker)} alt="" className="w-full h-full object-cover absolute inset-0 rounded-2xl"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <div>
                            <div className="text-[20px] font-bold text-white tracking-tight">{q.ticker}</div>
                        </div>
                        <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${g.bg} ${g.b} border`}>
                            <span className={g.t}>Ctx {q.alphaScore > 0 ? q.alphaScore.toFixed(1) : '-'}</span>
                        </div>
                    </div>
                    <div className="text-[36px] font-bold text-white tracking-tighter leading-none">${q.price.toFixed(2)}</div>
                    {hasExt && (
                        <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg" style={{ background: 'rgba(139,92,246,0.15)' }}>
                            <span className="text-[10px] font-bold text-violet-300 tracking-wider">{q.extendedLabel}</span>
                            <span className="text-[11px] font-semibold text-white">${q.extendedPrice.toFixed(2)}</span>
                            <span className={`text-[11px] font-semibold ${q.extendedChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {q.extendedChangePct >= 0 ? '+' : ''}{q.extendedChangePct.toFixed(2)}%
                            </span>
                        </div>
                    )}
                    <div className={`text-[15px] font-bold mt-2 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {up ? '↗' : '↘'} {up ? '+' : ''}{q.changePct.toFixed(2)}%
                    </div>
                </div>

                {/* ═══ CONTEXT SCORE ═══ */}
                <div className={`rounded-2xl border p-4 flex items-center gap-4 ${g.bg} ${g.b}`}>
                    <div className="shrink-0 relative" style={{ width: 56, height: 56 }}>
                        <svg width="56" height="56" viewBox="0 0 56 56">
                            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                            <circle cx="28" cy="28" r="24" fill="none" stroke={g.c} strokeWidth="3"
                                strokeDasharray={`${2 * Math.PI * 24}`}
                                strokeDashoffset={`${2 * Math.PI * 24 * (1 - q.alphaScore / 100)}`}
                                strokeLinecap="round" transform="rotate(-90 28 28)" className="transition-all duration-700" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-[18px] font-bold ${g.t}`}>{Math.round(q.alphaScore)}</span>
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${g.t}`}>CONTEXT SCORE {g.l}</div>
                        <div className="text-[12px] text-slate-300 leading-relaxed">{g.d}</div>
                    </div>
                </div>

                {/* ═══ 10-METRIC GRID (2×5) — web-matching colored cards ═══ */}
                <div className="grid grid-cols-2 gap-2">
                    <MC label="GEX" value={q.gex !== 0 ? `${q.gex > 0 ? '+' : ''}${fmt(q.gex)}` : '-'}
                        color={q.gex > 0 ? 'text-emerald-400' : q.gex < 0 ? 'text-rose-400' : 'text-slate-400'}
                        bg={q.gex > 0 ? 'bg-emerald-500/[0.07]' : q.gex < 0 ? 'bg-rose-500/[0.07]' : undefined}
                        border={q.gex > 0 ? 'border-emerald-500/25' : q.gex < 0 ? 'border-rose-500/25' : undefined} />
                    <MC label="PCR" value={q.pcr > 0 ? q.pcr.toFixed(2) : '-'}
                        color={q.pcr < 0.8 ? 'text-emerald-400' : q.pcr > 1.1 ? 'text-rose-400' : 'text-white'}
                        bg={q.pcr < 0.8 ? 'bg-emerald-500/[0.07]' : q.pcr > 1.1 ? 'bg-rose-500/[0.07]' : undefined}
                        border={q.pcr < 0.8 ? 'border-emerald-500/25' : q.pcr > 1.1 ? 'border-rose-500/25' : undefined} />
                    <MC label="SQUEEZE" value={q.squeezeScore > 0 ? `${Math.round(q.squeezeScore)}%` : '-'}
                        color={q.squeezeScore >= 70 ? 'text-orange-400' : q.squeezeScore >= 40 ? 'text-amber-400' : 'text-white/70'}
                        bg={q.squeezeScore >= 70 ? 'bg-orange-500/[0.07]' : q.squeezeScore >= 40 ? 'bg-amber-500/[0.07]' : undefined}
                        border={q.squeezeScore >= 70 ? 'border-orange-500/25' : q.squeezeScore >= 40 ? 'border-amber-500/25' : undefined} />
                    <MC label="NET PREM" value={q.netPremium ? `${q.netPremium > 0 ? '+' : ''}$${fmt(q.netPremium)}` : '-'}
                        color={q.netPremium > 0 ? 'text-emerald-400' : q.netPremium < 0 ? 'text-rose-400' : 'text-slate-400'}
                        bg={q.netPremium > 0 ? 'bg-emerald-500/[0.07]' : q.netPremium < 0 ? 'bg-rose-500/[0.07]' : undefined}
                        border={q.netPremium > 0 ? 'border-emerald-500/25' : q.netPremium < 0 ? 'border-rose-500/25' : undefined} />
                    <MC label="PUT FLOOR" value={q.putFloor > 0 ? `$${q.putFloor.toFixed(0)}` : '-'} color="text-rose-300"
                        bg="bg-white/[0.03]" border="border-white/[0.15]" />
                    <MC label="CALL WALL" value={q.callWall > 0 ? `$${q.callWall.toFixed(0)}` : '-'} color="text-emerald-300"
                        bg="bg-white/[0.03]" border="border-white/[0.15]" />
                    <MC label="🐋 WHALE" value={q.whaleIndex > 0 ? String(q.whaleIndex) : '-'}
                        color={q.whaleIndex >= 60 ? 'text-violet-300' : q.whaleIndex >= 30 ? 'text-white/70' : 'text-white/40'}
                        bg={q.whaleIndex >= 60 ? 'bg-violet-500/[0.07]' : undefined}
                        border={q.whaleIndex >= 60 ? 'border-violet-500/25' : undefined} />
                    <MC label="DARK POOL" value={q.darkPoolPct > 0 ? `${q.darkPoolPct.toFixed(0)}%` : '-'}
                        color={q.darkPoolPct >= 40 ? 'text-slate-200' : 'text-white/40'}
                        bg={q.darkPoolPct >= 40 ? 'bg-slate-500/[0.1]' : undefined}
                        border={q.darkPoolPct >= 40 ? 'border-slate-400/30' : undefined} />
                    <MC label="IV SKEW" value={q.ivSkew !== 0 ? `${q.ivSkew > 0 ? '+' : ''}${q.ivSkew.toFixed(1)}%` : '-'}
                        color={q.ivSkew > 3 ? 'text-rose-400' : q.ivSkew < -3 ? 'text-emerald-400' : 'text-white/70'}
                        bg={Math.abs(q.ivSkew) >= 3 ? 'bg-violet-500/[0.07]' : undefined}
                        border={Math.abs(q.ivSkew) >= 3 ? 'border-violet-500/25' : undefined} />
                    <MC label="IMP MOVE" value={q.impliedMovePct > 0 ? `±${q.impliedMovePct.toFixed(1)}%` : '-'}
                        color={q.impliedMovePct >= 5 ? 'text-orange-400' : q.impliedMovePct >= 3 ? 'text-amber-300' : 'text-white/70'}
                        bg={q.impliedMovePct >= 5 ? 'bg-amber-500/[0.07]' : q.impliedMovePct >= 3 ? 'bg-yellow-500/[0.05]' : undefined}
                        border={q.impliedMovePct >= 5 ? 'border-amber-500/25' : q.impliedMovePct >= 3 ? 'border-yellow-500/20' : undefined} />
                </div>

                {/* ═══ GAMMA TUNNEL ═══ */}
                {hasTunnel && (
                    <div className="bg-[#0f172a]/50 border border-white/[0.06] rounded-xl p-4">
                        <div className="flex justify-between items-center mb-2.5">
                            <span className="text-[12px] font-bold text-rose-400">${q.putFloor.toFixed(0)}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gamma Tunnel</span>
                            <span className="text-[12px] font-bold text-emerald-400">${q.callWall.toFixed(0)}</span>
                        </div>
                        <div className="relative h-2 rounded-full overflow-hidden bg-white/[0.06] border border-white/[0.1]">
                            <div className="absolute inset-0 rounded-full"
                                style={{ background: 'linear-gradient(90deg, rgba(248,113,113,0.25) 0%, rgba(100,116,139,0.15) 30%, rgba(100,116,139,0.15) 70%, rgba(52,211,153,0.25) 100%)' }} />
                            <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-[3px] border-white/50 transition-all duration-500"
                                style={{ left: `calc(${tunnelPct}% - 8px)`, backgroundColor: tunnelDotColor, boxShadow: `0 0 8px ${tunnelDotColor}80` }} />
                        </div>
                        <div className="text-center mt-2">
                            <span className="text-[12px] font-bold" style={{ color: tunnelDotColor }}>
                                ${q.price.toFixed(0)} ({tunnelPct < 50 ? `↓${(50 - tunnelPct).toFixed(0)}%` : tunnelPct > 50 ? `↑${(tunnelPct - 50).toFixed(0)}%` : 'CENTER'})
                            </span>
                        </div>
                    </div>
                )}

                {/* ═══ MAXPAIN BAR ═══ */}
                {hasMP && (
                    <div className="bg-[#0f172a]/50 border border-white/[0.06] rounded-xl p-4">
                        <div className="flex justify-between items-center mb-2.5">
                            <span className="text-[11px] font-bold text-rose-400">Put</span>
                            <span className="text-[11px] font-bold text-amber-300">◆ Pain ${q.maxPain.toFixed(0)}</span>
                            <span className="text-[11px] font-bold text-emerald-400">Call</span>
                        </div>
                        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'linear-gradient(90deg, #ef4444 0%, #fbbf24 45%, #fbbf24 55%, #22c55e 100%)' }}>
                            <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-[3px] border-amber-400"
                                style={{ left: `calc(${mpPainPct}% - 7px)` }} />
                            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg"
                                style={{ left: `calc(${mpPricePct}% - 6px)`, backgroundColor: mpPricePct > mpPainPct ? '#10b981' : '#f43f5e' }} />
                        </div>
                    </div>
                )}

                {/* ═══ SPARKLINE ═══ */}
                {spark && (
                    <div className="bg-[#0f172a]/50 border border-white/[0.06] rounded-xl p-4">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intraday</span>
                            <span className={`text-[12px] font-bold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {up ? '+' : ''}{q.changePct.toFixed(2)}%
                            </span>
                        </div>
                        <svg width="100%" height="44" viewBox="0 0 300 40" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id="spkGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={sparkColor} stopOpacity="0.3" />
                                    <stop offset="100%" stopColor={sparkColor} stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <polygon points={sparkFill} fill="url(#spkGrad)" />
                            <polyline points={sparkPoints} stroke={sparkColor} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                )}

                {/* ═══ AI ANALYSIS (Bedrock primary, rule-engine fallback) ═══ */}
                <div className="rounded-xl border border-blue-500/25 p-4" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(59,130,246,0.02))' }}>
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <img src="/signum-sg-vectorized.svg" alt="AI" width={13} height={13}
                                style={{ filter: 'drop-shadow(0 0 3px rgba(59,130,246,0.4))' }} />
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">AI News Context</span>
                        </div>
                        <span className="text-[9px] font-bold text-blue-400/50 bg-blue-500/15 px-1.5 py-0.5 rounded">
                            {aiText ? 'BEDROCK' : 'RULE ENGINE'}
                        </span>
                    </div>
                    {aiLoading ? (
                        <div className="flex items-center gap-2.5 py-2">
                            <div className="relative shrink-0">
                                <div className="w-6 h-6 rounded-full border border-blue-500/30 flex items-center justify-center">
                                    <img src="/signum-sg-vectorized.svg" alt="" width={14} height={14}
                                        style={{ filter: 'drop-shadow(0 0 3px rgba(6,182,212,0.4))' }} />
                                </div>
                                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" style={{ animationDuration: '2s' }} />
                            </div>
                            <span className="text-[12px] text-blue-300/80 font-bold tracking-wider">
                                {locale === 'ko' ? 'AI 분석 중...' : locale === 'ja' ? 'AI分析中...' : 'AI analyzing...'}
                            </span>
                        </div>
                    ) : (
                        <p className="text-[12px] text-slate-300 leading-relaxed">
                            {highlightText(aiText || generateMobileAnalysis(q))}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/[0.06]">
                        {q.gammaRegime === 'SHORT' && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-rose-500/15 text-rose-400">● Volatility expansion</span>
                        )}
                        {q.darkPoolPct >= 40 && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-violet-500/15 text-violet-300">◇ D.Pool</span>
                        )}
                        {q.netPremium > 0 && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400">▲ Call flow</span>
                        )}
                        {q.netPremium < 0 && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-rose-500/15 text-rose-400">▼ Put heavy</span>
                        )}
                        {q.whaleIndex >= 50 && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-violet-500/15 text-violet-300">🐋 Whale active</span>
                        )}
                    </div>
                </div>

                {/* ═══ REGIME + BADGES ═══ */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border" style={{ backgroundColor: `${regimeColor}10`, borderColor: `${regimeColor}30` }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: regimeColor }} />
                        <span className="text-[11px] font-semibold" style={{ color: regimeColor }}>{regimeLabel}</span>
                    </div>
                    {Math.abs(q.gex) > 50e6 && (
                        <span className="text-[10px] font-semibold px-2 py-1 bg-purple-500/15 text-purple-300 rounded-lg border border-purple-500/25">High GEX</span>
                    )}
                    {(q.pcr < 0.5 || q.pcr > 1.5) && (
                        <span className="text-[10px] font-semibold px-2 py-1 bg-amber-500/15 text-amber-300 rounded-lg border border-amber-500/25">PCR ⚠</span>
                    )}
                    {q.whaleIndex >= 60 && (
                        <span className="text-[10px] font-semibold px-2 py-1 bg-violet-500/15 text-violet-300 rounded-lg border border-violet-500/25">🐋 Whale</span>
                    )}
                    {q.darkPoolPct >= 40 && (
                        <span className="text-[10px] font-semibold px-2 py-1 bg-slate-500/15 text-slate-300 rounded-lg border border-slate-400/25">🕶️ D.Pool</span>
                    )}
                </div>

                {/* ═══ CTA ═══ */}
                <button
                    onClick={() => { router.push(`/ticker?ticker=${q.ticker}`); }}
                    className="w-full py-3.5 bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 touch-manipulation text-[14px]"
                    style={{ WebkitTapHighlightColor: 'transparent' }}>
                    Open Full Terminal →
                </button>

            </div>
        </div>
    );
}
