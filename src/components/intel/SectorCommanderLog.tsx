// ============================================================================
// SectorCommanderLog — AI Daily Briefing
// Auto-generated structured analysis from available indicators
// 3-Part per ticker: [Options] [Structure] [Verdict]
// ============================================================================
'use client';

import { useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { FileText, Shield, BarChart3, Brain, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { SectorConfig } from '@/types/sector';
import type { IntelQuote } from '@/hooks/useIntelSharedData';

interface SectorCommanderLogProps {
    config: SectorConfig;
    quotes: IntelQuote[];
}

// ── Analysis generation ──
interface TickerBriefing {
    ticker: string;
    price: number;
    changePct: number;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
    options: string;      // [Options] section
    structure: string;    // [Structure] section
    verdict: string;      // [Verdict] section
    verdictAction: string; // HOLD | BUY_DIP | HEDGE | TRIM
    bullish: boolean;
}

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

function generateBriefing(q: IntelQuote, ss: TranslationFn): TickerBriefing {
    const gex = q.gex || 0;
    const pcr = q.pcr || 1;
    const regime = q.gammaRegime || 'NEUTRAL';
    const maxPain = q.maxPain || 0;
    const callWall = q.callWall || 0;
    const putFloor = q.putFloor || 0;
    const price = q.price || 0;
    const changePct = q.changePct || 0;
    const alpha = q.alphaScore || 0;

    // Regime description
    const regimeDesc = regime === 'LONG' ? ss('cmdLongGamma')
        : regime === 'SHORT' ? ss('cmdShortGamma')
            : ss('cmdNeutralGamma');

    // PCR analysis
    const pcrLevel = pcr < 0.7 ? ss('cmdPcrVBullish') : pcr < 0.9 ? ss('cmdPcrBullish') : pcr > 1.3 ? ss('cmdPcrVBearish') : pcr > 1.1 ? ss('cmdPcrBearish') : ss('cmdPcrBalanced');

    // MaxPain distance
    const maxPainDist = maxPain > 0 && price > 0 ? ((price - maxPain) / maxPain * 100) : 0;
    const maxPainDir = maxPainDist >= 0 ? ss('cmdAbove') : ss('cmdBelow');

    // GEX format
    const gexFmt = Math.abs(gex) >= 1e9 ? `${(gex / 1e9).toFixed(1)}B` :
        Math.abs(gex) >= 1e6 ? `${(gex / 1e6).toFixed(0)}M` : `${(gex / 1e3).toFixed(0)}K`;

    // Call Wall / Put Floor proximity
    let levelProximity = '';
    if (callWall > 0 && price > 0) {
        const distWall = ((callWall - price) / price * 100);
        if (distWall > 0 && distWall < 3) {
            levelProximity = ss('cmdCallWallNear', { cw: `$${callWall}`, dist: distWall.toFixed(1) });
        } else if (distWall <= 0) {
            levelProximity = ss('cmdCallWallBreak', { cw: `$${callWall}` });
        }
    }
    if (!levelProximity && putFloor > 0 && price > 0) {
        const distFloor = ((price - putFloor) / price * 100);
        if (distFloor > 0 && distFloor < 3) {
            levelProximity = ss('cmdPutFloorNear', { pf: `$${putFloor}`, dist: distFloor.toFixed(1) });
        } else if (distFloor <= 0) {
            levelProximity = ss('cmdPutFloorBreak', { pf: `$${putFloor}` });
        }
    }
    if (!levelProximity) {
        levelProximity = callWall > 0
            ? ss('cmdKeyLevels', { cw: `$${callWall}`, pf: putFloor ? `$${putFloor}` : '-' })
            : ss('cmdKeyLevelsWait');
    }

    // [Options] section
    const optionsText = ss('cmdOptionsText', {
        regime: regimeDesc,
        gex: gexFmt,
        pcr: pcr.toFixed(2),
        pcrLevel,
        mp: maxPain ? `$${maxPain}` : '-',
        dir: maxPainDir,
        dist: Math.abs(maxPainDist).toFixed(1),
        proximity: levelProximity,
    });

    // [Structure] section
    const alphaGrade = alpha >= 70 ? ss('cmdAlphaA') : alpha >= 50 ? ss('cmdAlphaB') : alpha >= 30 ? ss('cmdAlphaC') : ss('cmdAlphaD');
    const momentumDir = changePct > 1 ? ss('cmdStrongUp') :
        changePct > 0 ? ss('cmdSlightUp') :
            changePct > -1 ? ss('cmdSlightDown') : ss('cmdStrongDown');

    const structureText = ss('cmdStructureText', {
        alpha: alpha.toFixed(1),
        grade: alphaGrade,
        momentum: momentumDir,
        change: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}`,
    });

    // [Verdict] section
    let verdictAction = 'HOLD';
    let verdictText = '';

    if (alpha >= 60 && pcr < 0.8 && changePct > 0) {
        verdictAction = 'BUY_DIP';
        verdictText = ss('cmdVerdictBuyDip', {
            support: `$${putFloor || Math.round(price * 0.97)}`,
            target: `$${callWall || Math.round(price * 1.03)}`,
        });
    } else if (alpha < 35 && pcr > 1.2) {
        verdictAction = 'HEDGE';
        verdictText = ss('cmdVerdictHedge', {
            floor: `$${putFloor || Math.round(price * 0.95)}`,
        });
    } else if (changePct > 2 && pcr < 0.6) {
        verdictAction = 'TRIM';
        verdictText = ss('cmdVerdictTrim', {
            resist: `$${callWall || Math.round(price * 1.02)}`,
        });
    } else if (changePct < -2 && alpha >= 45) {
        verdictAction = 'BUY_DIP';
        verdictText = ss('cmdVerdictDipBuy', {
            support: `$${putFloor || Math.round(price * 0.97)}`,
        });
    } else if (regime === 'SHORT' && gex < 0) {
        verdictAction = 'HOLD';
        verdictText = ss('cmdVerdictShortGamma', {
            mp: maxPain ? `$${maxPain}` : '-',
        });
    } else {
        verdictAction = 'HOLD';
        verdictText = ss('cmdVerdictHold');
    }

    return {
        ticker: q.ticker,
        price: q.price,
        changePct: q.changePct,
        extendedPrice: q.extendedPrice,
        extendedChangePct: q.extendedChangePct,
        extendedLabel: q.extendedLabel,
        options: optionsText,
        structure: structureText,
        verdict: verdictText,
        verdictAction,
        bullish: changePct >= 0 && alpha >= 45,
    };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SectorCommanderLog({ config, quotes }: SectorCommanderLogProps) {
    const ss = useTranslations('sectorSession');
    const locale = useLocale();
    const accentColor = config.theme.accentHex;
    const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

    const briefings = useMemo(() => {
        if (quotes.length === 0) return [];
        return [...quotes]
            .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
            .map(q => generateBriefing(q, ss));
    }, [quotes, ss]);

    const now = new Date();
    const timeStr = now.toLocaleTimeString(locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString(locale === 'ko' ? 'ko-KR' : locale === 'ja' ? 'ja-JP' : 'en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

    const verdictStyle: Record<string, { bg: string; text: string; label: string }> = {
        BUY_DIP: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-400', label: ss('cmdBuyDip') },
        HOLD: { bg: 'bg-slate-700/30 border-slate-600/30', text: 'text-slate-300', label: ss('cmdHold') },
        HEDGE: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', label: ss('cmdHedge') },
        TRIM: { bg: 'bg-rose-500/10 border-rose-500/30', text: 'text-rose-400', label: ss('cmdTrim') },
    };

    if (briefings.length === 0) {
        return (
            <div className="bg-[#0a0f18] border border-slate-800/50 rounded-lg p-4">
                <div className="text-xs text-white/40">{ss('cmdLoading')}</div>
            </div>
        );
    }

    return (
        <div className="bg-[#0a0f18]/80 backdrop-blur-lg border border-slate-800/50 rounded-xl p-5 shadow-lg">
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" style={{ color: accentColor }} />
                    <span className="text-[11px] font-bold text-white tracking-wider uppercase">
                        {config.shortName} DAILY BRIEFING
                    </span>
                </div>
                <span className="text-[10px] text-white/40 font-mono">
                    {dateStr} {timeStr}
                </span>
            </div>

            {/* ── Ticker Briefings ── */}
            <div className="space-y-1">
                {briefings.map((b) => {
                    const isExpanded = expandedTicker === b.ticker;
                    const vs = verdictStyle[b.verdictAction] || verdictStyle.HOLD;
                    const isUp = b.changePct >= 0;

                    return (
                        <div key={b.ticker} className="border border-slate-700/30 rounded-lg overflow-hidden transition-all duration-300 hover:border-slate-600/50">
                            {/* Ticker Header Row (always visible) */}
                            <button
                                onClick={() => setExpandedTicker(isExpanded ? null : b.ticker)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-black text-white">{b.ticker}</span>
                                    <span className={`text-xs font-mono ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ${b.price.toFixed(2)} ({isUp ? '+' : ''}{b.changePct.toFixed(2)}%)
                                    </span>
                                    {b.extendedPrice > 0 && (
                                        <span className="text-[10px] text-white/30">
                                            {b.extendedLabel} ${b.extendedPrice.toFixed(2)}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${vs.bg} ${vs.text}`}>
                                        {vs.label}
                                    </span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                            </button>

                            {/* Expanded Analysis (3-part) */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-slate-700/20 pt-3 animate-in slide-in-from-top-2 duration-300">
                                    {/* [Options] */}
                                    <div className="flex gap-2">
                                        <div className="flex items-start gap-1.5 flex-shrink-0 pt-0.5">
                                            <Shield className="w-3 h-3 text-purple-400" />
                                            <span className="text-[9px] font-bold text-purple-400 uppercase whitespace-nowrap">[{ss('cmdOptions')}]</span>
                                        </div>
                                        <p className="text-[11px] text-white/70 leading-relaxed">{b.options}</p>
                                    </div>
                                    {/* [Structure] */}
                                    <div className="flex gap-2">
                                        <div className="flex items-start gap-1.5 flex-shrink-0 pt-0.5">
                                            <BarChart3 className="w-3 h-3 text-cyan-400" />
                                            <span className="text-[9px] font-bold text-cyan-400 uppercase whitespace-nowrap">[{ss('cmdStructure')}]</span>
                                        </div>
                                        <p className="text-[11px] text-white/70 leading-relaxed">{b.structure}</p>
                                    </div>
                                    {/* [Verdict] */}
                                    <div className="flex gap-2">
                                        <div className="flex items-start gap-1.5 flex-shrink-0 pt-0.5">
                                            <Brain className="w-3 h-3 text-amber-400" />
                                            <span className="text-[9px] font-bold text-amber-400 uppercase whitespace-nowrap">[{ss('cmdVerdict')}]</span>
                                        </div>
                                        <p className={`text-[11px] leading-relaxed font-medium ${vs.text}`}>{b.verdict}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
