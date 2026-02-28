"use client";

/**
 * UpgradeModal — 업그레이드 유도 모달 (FOMO 극대화)
 * 
 * FeatureGate 블러 영역 클릭 시 또는 직접 호출 가능.
 * 현재 등급 → 다음 등급 비교표 + Founding Member FOMO.
 */

import React from 'react';
import { X, Zap, Crown, Shield, ArrowRight, Check, Lock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTier, type UserTier } from '@/contexts/TierContext';
import { useTranslations } from 'next-intl';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** 어떤 기능 때문에 트리거됐는지 (FOMO 메시지용) */
    triggerFeature?: string;
    /** 어떤 등급이 필요한지 */
    requiredTier?: 'pro' | 'elite';
}

export function UpgradeModal({ isOpen, onClose, triggerFeature, requiredTier = 'pro' }: UpgradeModalProps) {
    const { tier } = useTier();
    const t = useTranslations('gate');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* 배경 오버레이 */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* 모달 */}
            <div className="relative w-full max-w-md bg-[#0a1628] rounded-2xl border border-white/10
                shadow-[0_25px_80px_rgba(0,0,0,0.5),0_0_40px_rgba(34,211,238,0.08)]
                overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* 상단 글로우 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px]
                    bg-gradient-radial from-cyan-500/15 to-transparent blur-[80px] pointer-events-none" />

                {/* 닫기 버튼 */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                >
                    <X className="w-4 h-4 text-slate-400" />
                </button>

                <div className="relative z-10 p-6 pt-8">
                    {/* 아이콘 */}
                    <div className="flex justify-center mb-4">
                        <div className={`rounded-2xl p-4 ${requiredTier === 'elite'
                            ? 'bg-cyan-500/10 border border-cyan-500/30 shadow-[0_0_25px_rgba(34,211,238,0.15)]'
                            : 'bg-amber-500/10 border border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.15)]'
                            }`}>
                            {requiredTier === 'elite'
                                ? <Crown className="w-8 h-8 text-cyan-400" />
                                : <Zap className="w-8 h-8 text-amber-400" />
                            }
                        </div>
                    </div>

                    {/* 헤더 */}
                    <h2 className="text-xl font-black text-white text-center mb-2">
                        {t('upgradeTitle', { tier: requiredTier === 'elite' ? 'ELITE' : 'PRO' })}
                    </h2>

                    {/* FOMO 트리거 메시지 */}
                    {triggerFeature && (
                        <p className="text-sm text-slate-400 text-center mb-6">
                            <Lock className="w-3.5 h-3.5 inline mr-1 text-amber-400" />
                            {triggerFeature}
                        </p>
                    )}

                    {/* 기능 비교 */}
                    <div className="space-y-3 mb-6">
                        {requiredTier === 'pro' ? (
                            // PRO features
                            <>
                                <FeatureRow icon={<Check className="w-4 h-4 text-emerald-400" />} text={t('proFeature1')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-emerald-400" />} text={t('proFeature2')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-emerald-400" />} text={t('proFeature3')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-emerald-400" />} text={t('proFeature4')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-emerald-400" />} text={t('proFeature5')} />
                            </>
                        ) : (
                            // ELITE features
                            <>
                                <FeatureRow icon={<Check className="w-4 h-4 text-cyan-400" />} text={t('eliteFeature1')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-cyan-400" />} text={t('eliteFeature2')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-cyan-400" />} text={t('eliteFeature3')} />
                                <FeatureRow icon={<Check className="w-4 h-4 text-cyan-400" />} text={t('eliteFeature4')} />
                            </>
                        )}
                    </div>

                    {/* Founding Member FOMO */}
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 mb-5">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                                {t('foundingBadge')}
                            </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            {t('foundingDesc')}
                        </p>
                    </div>

                    {/* CTA 버튼 */}
                    <Link
                        href="/pricing"
                        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                            text-sm font-black uppercase tracking-wider transition-all hover:brightness-110
                            ${requiredTier === 'elite'
                                ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black shadow-[0_0_30px_rgba(34,211,238,0.25)]'
                                : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-[0_0_30px_rgba(245,158,11,0.25)]'
                            }`}
                        onClick={onClose}
                    >
                        {t('viewPricing')} <ArrowRight className="w-4 h-4" />
                    </Link>

                    {/* 하단 보장 */}
                    <p className="text-center text-xs text-slate-500 mt-3">
                        {t('guarantee')}
                    </p>
                </div>
            </div>
        </div>
    );
}

// Feature row helper
function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
            {icon}
            <span className="text-sm text-slate-300">{text}</span>
        </div>
    );
}
