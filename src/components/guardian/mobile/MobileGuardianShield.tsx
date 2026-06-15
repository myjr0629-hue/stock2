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
import { getIsMarketActive, getEffectiveSession } from '@/services/guardian/marketSessionUtils';
import { Clock } from 'lucide-react';

const GammaShield = dynamic(() => import('@/components/guardian/mobile/MobileGammaShield'), { ssr: false });
 
interface Props {
    data: any;
    loading: boolean;
    verdict: {
        title: string;
        desc: string;
        color: string;
        sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
        realityInsight?: string;
        gammaInsight?: string;
    };
    session?: string;
}
 
export default function MobileGuardianShield({ data, loading, verdict, session }: Props) {
    const t = useTranslations('guardian');
    const gt = useTranslations('gate');
    const locale = useLocale();
    const { status: marketStatusInfo } = useMarketStatus();
    const isMarketActive = getIsMarketActive(session, marketStatusInfo.isHoliday);
    const effectiveSession = getEffectiveSession(session);
 
    return (
        <div className="space-y-3">
            {/* ── GAMMA SHIELD ── */}
            <ProGate title="Gamma Shield" fomoMessage={gt('fomoGammaShield')} description={gt('descGammaShield')} mode="blur" compact>
                <GammaShield data={data?.gammaShield} isMarketActive={isMarketActive} />
            </ProGate>
 
            {/* ── GAMMA SHIELD AI ANALYSIS ── */}
            <ProGate title="Gamma Shield AI" fomoMessage={gt('fomoGammaShield')} description={gt('descGammaShield')} mode="blur">
                <div className="border border-slate-800 rounded-lg p-3.5 relative flex flex-col shadow-2xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(135deg, rgba(6,182,212,0.08) 0%, rgba(10,14,20,1) 60%)'
                    }}
                >
                    {/* HUD Corner Tech Decorations */}
                    <div className="absolute top-2 left-2 w-1.5 h-1.5 border-t border-l border-cyan-500/30" />
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 border-t border-r border-cyan-500/30" />
                    <div className="absolute bottom-2 left-2 w-1.5 h-1.5 border-b border-l border-cyan-500/30" />
                    <div className="absolute bottom-2 right-2 w-1.5 h-1.5 border-b border-r border-cyan-500/30" />

                    {/* Header */}
                    <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                            <div className="flex-shrink-0">
                                <img
                                    src="/signum-sg-vectorized.svg"
                                    alt="AI"
                                    width={14}
                                    height={14}
                                    style={{
                                        objectFit: 'contain',
                                        filter: 'drop-shadow(0 0 3px rgba(34,211,238,0.4))',
                                    }}
                                />
                            </div>
                            <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-cyan-400 font-jakarta">
                                GAMMA SHIELD AI
                            </h3>
                            <span className="text-[11px] text-slate-500 font-mono font-jakarta">
                                · {effectiveSession === 'REG' ? 'Live' : 'Standby'}
                            </span>
                        </div>
                        <span className="text-[9px] bg-cyan-950/80 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold font-jakarta">
                            CLAUDE HAIKU
                        </span>
                    </div>

                    {verdict.gammaInsight ? (
                        <div className="text-[13px] text-white/95 leading-[1.65] whitespace-pre-wrap" style={{ fontFamily: 'Pretendard, sans-serif' }}>
                            {renderColoredText(verdict.gammaInsight)}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 py-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
                            <span className="text-[12px] text-slate-400 font-medium">
                                {locale === 'ko' ? '옵션 유동성 데이터 분석 대기 중...' : locale === 'ja' ? 'オプション流動性データ分析待機中...' : 'Waiting for option liquidity analysis...'}
                            </span>
                        </div>
                    )}
                </div>
            </ProGate>
        </div>
    );
}
