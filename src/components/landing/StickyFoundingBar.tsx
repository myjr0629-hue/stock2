"use client";

/**
 * StickyFoundingBar — PC 하단 고정 띠 (이름은 예전 그대로 — 레이아웃·CSS 가 이 이름을 쓴다)
 *
 * 스크롤해도 하단에 고정. 비회원/FREE 유저에게만, PC 에서만(레이아웃이 데스크톱에만 붙인다).
 * 2026-09-30: 예전 «FOUNDING MEMBER $69→$49/mo»(없어진 웹 요금제)를 지금의 PRO 한 줄로 바꿨다 —
 *   광고 없음 + 내 종목 100개 · 스토어 가격 · «앱 받기» → /app 스마트링크(PC 는 QR 넘겨주기 화면).
 *   문구·가격 정본: src/lib/marketing/proOffer.ts
 */

import React, { useState, useEffect } from 'react';
import { Zap, ArrowRight, X } from 'lucide-react';
import { useTier } from '@/contexts/TierContext';
import { useLocale } from 'next-intl';
import { PRO_COPY, PRO_MONTHLY_PRICE, offerLocale, proAppHref } from '@/lib/marketing/proOffer';

export function StickyFoundingBar() {
    const { tier, loading } = useTier();
    const loc = offerLocale(useLocale());
    const c = PRO_COPY[loc];
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

            <div className="bg-[#070e1b]/95 backdrop-blur-md border-t border-white/5 px-4 py-2 sm:py-3"
                style={{ paddingBottom: `max(8px, env(safe-area-inset-bottom, 8px))` }}>
                <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
                    {/* Left: PRO 한 줄 + 스토어 가격 */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider hidden sm:inline">
                                SIGNUM PRO
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm min-w-0">
                            <span className="text-slate-200 truncate">{c.line}</span>
                            <span className="text-white font-bold whitespace-nowrap">{PRO_MONTHLY_PRICE[loc]}<span className="text-slate-400 font-normal text-xs"> {c.per}</span></span>
                        </div>
                    </div>

                    {/* Center: CTA */}
                    <div className="flex items-center gap-2">
                        {/* 스마트링크는 locale 라우팅 밖 경로 — Link 가 아니라 a. PC 는 QR 넘겨주기 화면이 뜬다 */}
                        <a
                            href={proAppHref('pc_bar', loc)}
                            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg
                                bg-gradient-to-r from-amber-500 to-amber-600 text-black
                                text-xs font-black uppercase tracking-wider whitespace-nowrap
                                hover:brightness-110 transition-all
                                shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                        >
                            {c.barCta} <ArrowRight className="w-3.5 h-3.5" />
                        </a>

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
