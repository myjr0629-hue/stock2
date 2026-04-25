'use client';

import React from 'react';
import { type IntelQuote } from '@/hooks/useIntelSharedData';
import { useLocale } from 'next-intl';
import { ProGate } from '@/components/gate/FeatureGate';

interface Props { ticker: string; quote: IntelQuote; unified: any; unifiedLoading: boolean; }

function ScoreBar({ label, score, maxScore = 100 }: { label: string; score: number; maxScore?: number }) {
    const pct = Math.max(0, Math.min(100, (score / maxScore) * 100));
    const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#fbbf24' : '#f87171';
    return (
        <div className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-b-0">
            <span className="text-[12px] text-slate-400 font-medium w-24 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[12px] font-bold font-mono text-white w-8 text-right">{score}</span>
        </div>
    );
}

export function MobileCmdFund({ ticker, quote, unified, unifiedLoading }: Props) {
    const locale = useLocale();
    const fund = unified?.fundamentals || {};
    const overview = unified?.overview?.overview || {};

    const score = fund.score || 0;
    const grade = fund.grade || '—';
    const breakdown = fund.breakdown || {};
    const pe = fund.pe ?? breakdown?.pe?.value;
    const roe = fund.roe ?? breakdown?.roe?.value;
    const margin = fund.netMargin ?? breakdown?.netMargin?.value;
    const revGrowth = fund.revenueGrowth ?? breakdown?.revenueGrowth?.value;
    const de = fund.de ?? breakdown?.debtEquity?.value;
    const fcf = fund.fcfYield ?? breakdown?.fcfYield?.value;

    const sector = locale === 'ko' ? overview.sector : overview.sectorEN;
    const desc = locale === 'ko' ? overview.description : locale === 'ja' ? (overview.descriptionJA || overview.descriptionEN) : overview.descriptionEN;

    const gradeColor = grade === 'A' || grade === 'A+' ? 'text-emerald-400' :
        grade === 'B' || grade === 'B+' ? 'text-blue-400' :
        grade === 'C' ? 'text-amber-400' : 'text-rose-400';
    const gradeBg = grade === 'A' || grade === 'A+' ? 'bg-emerald-500/15 border-emerald-500/30' :
        grade === 'B' || grade === 'B+' ? 'bg-blue-500/15 border-blue-500/30' :
        grade === 'C' ? 'bg-amber-500/15 border-amber-500/30' : 'bg-rose-500/15 border-rose-500/30';

    return (
        <div className="space-y-4">
            {/* Score Hero */}
            <div className={`rounded-2xl border p-5 ${gradeBg} relative overflow-hidden`}>
                <div className="flex items-center gap-4 relative z-10">
                    <div className="relative shrink-0" style={{ width: 72, height: 72 }}>
                        <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                            <circle cx="36" cy="36" r="30" fill="none"
                                stroke={score >= 70 ? '#10b981' : score >= 40 ? '#fbbf24' : '#f87171'}
                                strokeWidth="5" strokeDasharray={`${2 * Math.PI * 30}`}
                                strokeDashoffset={`${2 * Math.PI * 30 * (1 - score / 100)}`}
                                strokeLinecap="round" transform="rotate(-90 36 36)"
                                className="transition-all duration-700" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-[20px] font-bold ${gradeColor}`}>{grade}</span>
                            <span className="text-[10px] text-slate-400">{score}/100</span>
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fundamental Score</div>
                        <div className={`text-[16px] font-bold ${gradeColor}`}>
                            {score >= 70 ? 'Strong Fundamentals' : score >= 40 ? 'Moderate' : 'Weak'}
                        </div>
                        {sector && <div className="text-[11px] text-slate-400 mt-1">{sector}</div>}
                    </div>
                </div>
            </div>

            {/* Breakdown */}
            {Object.keys(breakdown).length > 0 && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Breakdown</div>
                    {Object.entries(breakdown).map(([key, val]: [string, any]) => (
                        <ScoreBar key={key} label={val.label || key} score={val.score || 0} />
                    ))}
                </div>
            )}

            {/* Key Ratios */}
            <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-4">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Key Ratios</div>
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { l: 'P/E', v: pe },
                        { l: 'ROE', v: roe, s: '%' },
                        { l: 'Net Margin', v: margin, s: '%' },
                        { l: 'Rev Growth', v: revGrowth, s: '%' },
                        { l: 'D/E', v: de },
                        { l: 'FCF Yield', v: fcf, s: '%' },
                    ].map(({ l, v, s }) => (
                        <div key={l} className="text-center">
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{l}</div>
                            <div className="text-[14px] font-bold font-mono text-white">
                                {v != null ? `${typeof v === 'number' ? v.toFixed(1) : v}${s || ''}` : '—'}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Company Overview */}
            {desc && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/50 p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Company Overview</div>
                    <p className="text-[12px] text-slate-300 leading-relaxed">{desc}</p>
                </div>
            )}
        </div>
    );
}
