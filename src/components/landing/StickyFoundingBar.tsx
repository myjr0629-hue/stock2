"use client";

/**
 * StickyFoundingBar — Founding Member 가격 하단 고정 바
 *
 * 스크롤해도 하단에 고정.
 * 비회원/FREE 유저에게만 표시.
 * Founding 가격의 시급성을 강조하여 FOMO 극대화.
 *
 * ★2026-10-06 폰에서는 «앱으로 무료 시작» 띠 — 대표 10/6 09시대 «폰에서만 «앱으로 무료 시작» 바꾸는 것이 좋을 듯».
 *   · 왜: 홈은 앱 설치 클릭 1위 채널인데, 폰 방문자에게 웹 구독 $49/월 띠가 App Store·Google Play 버튼·PRO 쿠폰 칩과
 *     경쟁하고 가격이 두 개로 보인다. 회사 목표는 «앱 설치»(웹 구독은 주력이 아니다).
 *   · 폰 판정은 마운트 뒤 navigator.userAgent — [locale]/layout 의 서버 판정(isMobileDevice)과 같은 정규식.
 *     서버 렌더·첫 그리기는 그대로(tier 로딩 중엔 어차피 null 이라 PC 띠가 번쩍이지 않는다).
 *   · 폰 띠는 홈(/)에서만 — 폰 레이아웃(모바일 가지)엔 띠가 없던 자리라 다른 화면은 그대로 둔다(PC 는 모든 화면 그대로).
 *   · 링크 `/app?from=home_sticky` — 스마트링크가 기기별로 App Store·Play 로 보낸다(새 태그라 클릭이 따로 집계된다).
 *     로케일 접두 없는 일반 <a>(next-intl Link 는 /ko/app 으로 만든다).
 *   · 가격·«무료 체험» 약속은 쓰지 않는다(앱은 무료 설치 · PRO 는 앱 안 결제).
 *   · 우리 앱(네이티브 셸) 안에서는 그리지 않는다 — PromoCodeChip 과 같은 판정(Capacitor 우선, 쿠키 sig_native=1 폴백).
 *   · 폰 레이아웃엔 MobileBottomNav(fixed bottom-0 · z-100)가 있다 → 그 높이(실측)만큼 위에 띄운다. 없으면 바닥(안전 영역 패딩).
 *   · PC(폰이 아닌 UA)는 모습·동작 그대로.
 */

import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { Zap, ArrowRight, X } from 'lucide-react';
import { Link, usePathname } from '@/i18n/routing';
import { useTier } from '@/contexts/TierContext';
import { useTranslations, useLocale } from 'next-intl';

/** 폰(아이폰·아이패드·안드로이드)인가 — [locale]/layout 의 서버 판정(isMobileDevice)과 같은 정규식(순수 함수). */
export function isPhoneUa(ua: string): boolean {
    return /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
}

/** 우리 앱(네이티브 셸) 안인가 — PromoCodeChip·PhLaunchBanner 와 같은 판정(Capacitor 우선, 쿠키·html 클래스 폴백). */
function detectNative(): boolean {
    try { if (require("@capacitor/core").Capacitor.isNativePlatform()) return true; } catch { /* 웹 */ }
    try {
        if (typeof document === "undefined") return false;
        const cl = document.documentElement.classList;
        return document.cookie.includes("sig_native=1")
            || cl.contains("native-app") || cl.contains("native-android") || cl.contains("native-ios");
    } catch { return false; }
}

// 클라이언트에서만 아는 값(UA·쿠키)을 하이드레이션 불일치 없이 읽는다 — 서버·하이드레이션 스냅샷은 false(PC 모습), 그 뒤 실제 값.
const noSubscribe = () => () => {};
const getFalse = () => false;
const getPhone = () => isPhoneUa(navigator.userAgent);

/** 폰 띠 스마트링크 — 새 from 태그(클릭 집계 mkt:attr:hit:home_sticky:*). */
export const APP_STICKY_HREF = '/app?from=home_sticky';

/** 폰 띠 문구 — 가격·«무료 체험» 약속 없음. 375px 에서 영문·일문이 한 줄에 들어가도록 버튼 하나만(보조 문구 없음). */
const APP_CTA: Record<'ko' | 'en' | 'ja', string> = {
    ko: '앱으로 무료 시작',
    en: 'Start free in the app',
    ja: 'アプリで無料で始める',
};

export function StickyFoundingBar() {
    const { tier, loading } = useTier();
    const t = useTranslations('gate');
    const locale = useLocale();
    const pathname = usePathname();
    const isKo = locale === 'ko';
    const [dismissed, setDismissed] = useState(false);
    const [visible, setVisible] = useState(false);
    // 폰·앱 판정 — 서버·첫 그리기(하이드레이션)는 false = PC 모습 그대로, 그 뒤 실제 UA·쿠키 값(불일치 없음)
    const phone = useSyncExternalStore(noSubscribe, getPhone, getFalse);
    const native = useSyncExternalStore(noSubscribe, detectNative, getFalse);
    const [navOffset, setNavOffset] = useState(0);

    useEffect(() => {
        // 2초 후에 슬라이드 업 (페이지 로드 후 자연스럽게)
        const timer = setTimeout(() => {
            // 폰 레이아웃의 하단 탭바(MobileBottomNav) 위에 띄운다 — 높이는 실측(안전 영역 패딩 포함). 없으면(PC) 0.
            try {
                const nav = document.querySelector('.native-bottom-nav');
                setNavOffset(nav ? Math.round(nav.getBoundingClientRect().height) : 0);
            } catch { /* 0 = 바닥 */ }
            setVisible(true);
        }, 2000);
        return () => clearTimeout(timer);
    }, []);

    // PRO/ELITE 유저에게는 표시하지 않음 · 우리 앱 안에서도 표시하지 않음
    if (loading || tier === 'pro' || tier === 'elite' || dismissed || native) {
        return null;
    }

    // ★ 폰 — 홈에서만 «앱으로 무료 시작» 띠(가격 없음). 다른 화면은 폰 레이아웃에 띠가 없던 그대로.
    if (phone) {
        const isHome = pathname === '/' || /^\/(?:ko|en|ja)\/?$/.test(pathname || '');
        if (!isHome) return null;
        const cta = APP_CTA[locale === 'ko' || locale === 'ja' ? locale : 'en'];
        return (
            <div
                className={`fixed left-0 right-0 z-50 transition-all duration-500 ease-out
                    ${visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                style={{ bottom: navOffset }}
                data-sticky-bar="app"
            >
                {/* 상단 그라데이션 경계 */}
                <div className="h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />

                <div className="bg-[#070e1b]/95 backdrop-blur-md border-t border-white/5 px-4 py-2"
                    style={{ paddingBottom: navOffset ? 8 : `max(8px, env(safe-area-inset-bottom, 8px))` }}>
                    <div className="flex items-center gap-2">
                        <a
                            href={APP_STICKY_HREF}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg
                                bg-gradient-to-r from-amber-500 to-amber-600 text-black
                                text-xs font-black uppercase tracking-wider whitespace-nowrap
                                hover:brightness-110 transition-all
                                shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                        >
                            {cta} <ArrowRight className="w-3.5 h-3.5" />
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
        );
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
                    {/* Left: Founding badge + pricing */}
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <span className="text-xs font-black text-amber-400 uppercase tracking-wider hidden sm:inline">
                                FOUNDING MEMBER
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-slate-300 line-through text-xs">$69/mo</span>
                            <span className="text-white font-bold">$49/mo</span>
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
