"use client";

/**
 * StickyFoundingBar — Founding Member 가격 하단 고정 바
 * 
 * 스크롤해도 하단에 고정.
 * 비회원/FREE 유저에게만 표시.
 * Founding 가격의 시급성을 강조하여 FOMO 극대화.
 */

import React, { useState, useEffect } from 'react';
import { Zap, ArrowRight, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTier } from '@/contexts/TierContext';
import { useTranslations, useLocale } from 'next-intl';

export function StickyFoundingBar() {
    const { tier, loading } = useTier();
    const t = useTranslations('gate');
    const locale = useLocale();
    const isKo = locale === 'ko';
    const [dismissed, setDismissed] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // 2초 후에 슬라이드 업 (페이지 로드 후 자연스럽게)
        const timer = setTimeout(() => setVisible(true), 2000);
        return () => clearTimeout(timer);
    }, []);

    // PRO/ELITE 유저에게는 표시하지 않음
    if (loading || tier === 'pro' || tier === 'elite' || dismissed) {
        return null;
    }

    return (
        <div
            className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-out
                ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        >
            {/* 상단 그라데이션 경계 */}
            <div className="h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

            <div className="bg-[#070e1b]/95 backdrop-blur-md border-t border-white/5 px-4 py-3">
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                    {/* Left: Founding badge + pricing */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider hidden sm:inline">
                                FOUNDING MEMBER
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-300 line-through text-xs">{isKo ? '₩99,000/월' : '$69/mo'}</span>
                            <span className="text-white font-bold">{isKo ? '₩69,000/월' : '$49/mo'}</span>
                            <span className="text-amber-400 text-xs font-bold">
                                -29%
                            </span>
                            <span className="hidden md:inline text-slate-300 text-xs">
                                · {t('foundingBarLock')}
                            </span>
                        </div>
                    </div>

                    {/* Center: CTA */}
                    <div className="flex items-center gap-2">
                        <Link
                            href="/pricing"
                            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg
                                bg-gradient-to-r from-amber-500 to-amber-600 text-black
                                text-xs font-black uppercase tracking-wider
                                hover:brightness-110 transition-all
                                shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                        >
                            {t('foundingBarCta')} <ArrowRight className="w-3.5 h-3.5" />
                        </Link>

                        {/* 닫기 */}
                        <button
                            onClick={() => setDismissed(true)}
                            className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-slate-500"
                            aria-label="Close"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
