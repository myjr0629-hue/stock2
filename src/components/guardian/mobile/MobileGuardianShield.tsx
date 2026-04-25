'use client';

// ============================================================================
// MobileGuardianShield — Tab 3: Gamma Shield + Tactical Verdict
// Components: GammaShield (import), Tactical Verdict (inline from page.tsx L780-931)
// Data: Identical props — ZERO new logic
// ============================================================================

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslations, useLocale } from 'next-intl';
import { useTier } from '@/contexts/TierContext';
import { ProGate } from '@/components/gate/FeatureGate';
import { GuardianTooltip } from '@/components/guardian/GuardianTooltip';
import { renderColoredText } from '@/components/guardian/TypewriterText';
import { useMarketStatus } from '@/hooks/useMarketStatus';
import { Clock } from 'lucide-react';

const GammaShield = dynamic(() => import('@/components/guardian/GammaShield'), { ssr: false });

interface Props {
    data: any;
    loading: boolean;
    verdict: {
        title: string;
        desc: string;
        color: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        realityInsight?: string;
    };
    session?: string;
}

export default function MobileGuardianShield({ data, loading, verdict, session }: Props) {
    const t = useTranslations('guardian');
    const gt = useTranslations('gate');
    const locale = useLocale();
    const { status: marketStatusInfo } = useMarketStatus();
    const isMarketActive = (session === 'REG' || session === 'PRE' || session === 'POST') && !marketStatusInfo.isHoliday;

    return (
        <div className="space-y-3">
            {/* ── GAMMA SHIELD ── */}
            <ProGate title="Gamma Shield" fomoMessage={gt('fomoGammaShield')} description={gt('descGammaShield')} mode="blur" compact>
                <GammaShield data={data?.gammaShield} isMarketActive={isMarketActive} />
            </ProGate>

            {/* ── TACTICAL VERDICT ── (inline code from desktop page.tsx L780-931) */}
            <ProGate title="Tactical Verdict" fomoMessage={gt('fomoIntelStack')} description={gt('descRlsiInsight')} mode="blur">
                <div className="border border-slate-800 rounded-lg p-3.5 relative flex flex-col shadow-2xl overflow-hidden"
                    style={{
                        background: verdict.sentiment === 'BULLISH'
                            ? 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.04) 40%, rgba(10,14,20,1) 70%)'
                            : verdict.sentiment === 'BEARISH'
                                ? 'linear-gradient(135deg, rgba(244,63,94,0.15) 0%, rgba(244,63,94,0.04) 40%, rgba(10,14,20,1) 70%)'
                                : 'linear-gradient(135deg, rgba(148,163,184,0.06) 0%, rgba(10,14,20,1) 50%)'
                    }}
                >
                    {/* Infographic: Crosshair Target */}
                    <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-[100px] h-[100px] pointer-events-none" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                        <circle cx="60" cy="60" r="35" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" strokeDasharray="3 3" />
                        <circle cx="60" cy="60" r="20" fill="none" stroke="rgba(148,163,184,0.22)" strokeWidth="1" />
                        <circle cx="60" cy="60" r="4" fill="rgba(16,185,129,0.30)" />
                        <line x1="60" y1="5" x2="60" y2="115" stroke="rgba(148,163,184,0.10)" strokeWidth="0.8" strokeDasharray="2 4" />
                        <line x1="5" y1="60" x2="115" y2="60" stroke="rgba(148,163,184,0.10)" strokeWidth="0.8" strokeDasharray="2 4" />
                    </svg>

                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <div className="flex-shrink-0">
                                <img
                                    src="/signum-sg-vectorized.svg"
                                    alt="AI"
                                    width={15}
                                    height={15}
                                    style={{
                                        objectFit: 'contain' as const,
                                        filter: 'drop-shadow(0 0 3px rgba(245,158,11,0.35)) drop-shadow(0 0 1px rgba(245,158,11,0.25))',
                                        animation: 'aiLogoPulse 2.5s ease-in-out infinite',
                                    }}
                                />
                            </div>
                            <GuardianTooltip sectionId="tacticalVerdict">
                                <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-emerald-400 font-jakarta">
                                    TACTICAL VERDICT
                                </h3>
                            </GuardianTooltip>
                            <span className="text-[12px] text-amber-500 font-mono font-jakarta">· {session === 'REG' ? 'Regular Session' : session === 'PRE' ? 'Pre-Market' : session === 'POST' ? 'Post-Market' : 'Off-Hours'}</span>
                        </div>
                        <span className="text-[10px] bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
                            CLAUDE S4
                        </span>
                    </div>

                    {isMarketActive ? (
                        <>
                            <div className="overflow-hidden mb-2">
                                <h4 className={`text-sm font-bold mb-2 uppercase tracking-wide ${verdict.color}`}>{verdict.title}</h4>
                                <div className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {renderColoredText(verdict.desc)}
                                </div>
                            </div>

                            {/* COMPACT METRICS — identical to desktop page.tsx L837-905 */}
                            <div className="mt-auto pt-3 border-t border-slate-800 grid grid-cols-3 gap-3">
                                {/* ROTATION */}
                                <div>
                                    <div className="text-[12px] text-white font-bold mb-0.5 tracking-wider font-jakarta">ROTATION</div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${(data?.rotationIntensity?.score || 0) >= 60 ? 'bg-emerald-400' :
                                                    (data?.rotationIntensity?.score || 0) >= 35 ? 'bg-amber-400' : 'bg-rose-400'
                                                    }`}
                                                style={{ width: `${Math.min(100, data?.rotationIntensity?.score || 50)}%` }}
                                            />
                                        </div>
                                        <span className="text-[12px] font-mono font-bold text-slate-300">
                                            {(data?.rotationIntensity?.score || 50).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className={`text-[12px] font-bold mt-0.5 tracking-wide ${data?.rotationIntensity?.direction === 'RISK_ON' ? 'text-emerald-400' :
                                        data?.rotationIntensity?.direction === 'RISK_OFF' ? 'text-rose-400' : 'text-slate-300'
                                        }`}>
                                        {data?.rotationIntensity?.direction || 'NEUTRAL'} · {data?.rotationIntensity?.conviction || 'LOW'}
                                    </div>
                                </div>

                                {/* MOMENTUM */}
                                <div>
                                    <div className="text-[12px] text-white font-bold mb-0.5 tracking-wider font-jakarta">MOMENTUM</div>
                                    {(() => {
                                        const momVal = ((data?.rlsi?.components?.momentumRaw || 1) - 1) * 100;
                                        const momColor = momVal > 0 ? 'text-emerald-400' : momVal < 0 ? 'text-rose-400' : 'text-white';
                                        return (
                                            <div className={`text-sm font-mono font-bold ${momColor}`}>
                                                {momVal > 0 ? '▲ +' : momVal < 0 ? '▼ ' : ''}{momVal.toFixed(1)}%
                                            </div>
                                        );
                                    })()}
                                    <div className="text-[12px] text-white font-bold mt-1 tracking-wide opacity-90 font-jakarta">3-DAY VELOCITY</div>
                                </div>

                                {/* TARGET LOCK */}
                                <div>
                                    <div className="text-[12px] text-white font-bold mb-0.5 tracking-wider font-jakarta">TARGET LOCK</div>
                                    <div className={`text-sm font-mono font-bold ${data?.tripleA?.isTargetLock ? "text-amber-400 animate-pulse" : "text-white"}`}>
                                        {data?.tripleA?.isTargetLock ? "LOCKED" : "SEARCHING"}
                                    </div>
                                    {/* Triple-A Checklist Dots */}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <div className="flex items-center gap-1">
                                            <div className={`w-2 h-2 rounded-full ${data?.tripleA?.alignment ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                            <span className="text-[12px] text-slate-300 font-jakarta">A</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className={`w-2 h-2 rounded-full ${data?.tripleA?.acceleration ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                            <span className="text-[12px] text-slate-300 font-jakarta">A</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className={`w-2 h-2 rounded-full ${data?.tripleA?.accumulation ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                            <span className="text-[12px] text-slate-300 font-jakarta">A</span>
                                        </div>
                                    </div>
                                    <div className="text-[12px] text-white font-bold mt-1 tracking-wide opacity-90 font-jakarta">
                                        {data?.tripleA?.regime || "NEUTRAL"} REGIME
                                    </div>
                                    <div className={`text-[12px] font-medium mt-0.5 tracking-tight ${data?.tripleA?.regime === 'BULL' ? "text-emerald-400" :
                                        data?.tripleA?.regime === 'BEAR' ? "text-rose-400" : "text-white"
                                        }`}>
                                        {data?.tripleA?.regime === 'BULL' ? t('bullRegime') :
                                            data?.tripleA?.regime === 'BEAR' ? t('bearRegime') :
                                                t('neutralRegime')}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : verdict.title ? (
                        <>
                            <div className="overflow-hidden mb-2">
                                <h4 className={`text-sm font-bold mb-2 uppercase tracking-wide ${verdict.color}`}>{verdict.title}</h4>
                                <div className="text-[13px] text-white/80 leading-[1.6] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                                    {renderColoredText(verdict.desc)}
                                </div>
                            </div>
                            <div className="text-[12px] text-amber-500/50 font-mono mt-2 font-jakarta">Last session analysis</div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center py-4">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <Clock size={20} className="text-amber-400" />
                                </div>
                                <div>
                                    <div className="text-[13px] font-bold text-white/80">{t('insightPending')}</div>
                                    <div className="text-[12px] text-slate-400 font-mono mt-1 font-jakarta">Regular Session 09:30-16:00 ET</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </ProGate>
        </div>
    );
}
