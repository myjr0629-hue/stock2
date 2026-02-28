"use client";

/**
 * GuestWall — 비회원 5회 방문 제한 + FOMO 오버레이
 * 
 * 쿠키 기반으로 페이지 방문 횟수를 추적하고,
 * 5회 초과 시 전체 화면 블러 + 가입 CTA를 표시합니다.
 * 
 * 심리학 원리: Endowment Effect (소유 효과)
 * - 처음 5회는 전체 데이터를 "소유"하게 만들고
 * - 6회차에 빼앗으면 → Loss Aversion이 발동하여 가입 전환
 * 
 * 사용법: 각 터미널 페이지 최상단에 배치
 * <GuestWall>
 *   <TerminalContent />
 * </GuestWall>
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, ArrowRight, Eye, Lock, Zap, Users } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTier } from '@/contexts/TierContext';
import { useTranslations } from 'next-intl';

// ============================================================
// CONSTANTS
// ============================================================
const GUEST_VISIT_COOKIE = 'shq_gv'; // signum hq guest visits
const MAX_FREE_VISITS = 5;

// ============================================================
// COOKIE HELPERS
// ============================================================
function getGuestVisits(): number {
    if (typeof document === 'undefined') return 0;
    const match = document.cookie.match(new RegExp(`${GUEST_VISIT_COOKIE}=(\\d+)`));
    return match ? parseInt(match[1], 10) : 0;
}

function setGuestVisits(count: number): void {
    if (typeof document === 'undefined') return;
    // 7일 만료 (재방문 시 리셋)
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    document.cookie = `${GUEST_VISIT_COOKIE}=${count};path=/;expires=${expires.toUTCString()};SameSite=Lax`;
}

// ============================================================
// COMPONENT
// ============================================================
interface GuestWallProps {
    children: React.ReactNode;
    /** 현재 페이지명 (FOMO 메시지용) */
    pageName?: string;
}

export function GuestWall({ children, pageName }: GuestWallProps) {
    const { isLoggedIn, loading } = useTier();
    const t = useTranslations('gate');
    const [visits, setVisits] = useState(0);
    const [isBlocked, setIsBlocked] = useState(false);

    useEffect(() => {
        if (loading) return;

        // 로그인 유저는 GuestWall 적용 안 함
        if (isLoggedIn) return;

        const currentVisits = getGuestVisits() + 1;
        setGuestVisits(currentVisits);
        setVisits(currentVisits);

        if (currentVisits > MAX_FREE_VISITS) {
            setIsBlocked(true);
        }
    }, [isLoggedIn, loading]);

    // 로딩 중이거나 로그인 유저 → 그대로 렌더링
    if (loading || isLoggedIn) {
        return <>{children}</>;
    }

    // 아직 제한 이내 → 카운터 배지만 표시
    if (!isBlocked) {
        const remaining = MAX_FREE_VISITS - visits;
        return (
            <div className="relative">
                {/* 남은 횟수 배지 */}
                {remaining <= 3 && remaining > 0 && (
                    <div className="fixed top-20 right-4 z-40 flex items-center gap-2 px-3 py-2
                        rounded-lg bg-[#0a1628]/90 backdrop-blur-sm border border-amber-500/30
                        shadow-[0_0_20px_rgba(245,158,11,0.15)] animate-fade-in">
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400">
                            {t('guestWallRemaining', { count: remaining })}
                        </span>
                    </div>
                )}
                {children}
            </div>
        );
    }

    // ============================================================
    // BLOCKED STATE — 전체 블러 + FOMO 가입 CTA
    // ============================================================
    return (
        <div className="relative min-h-screen">
            {/* 블러된 콘텐츠 (실제 데이터가 "엿보이는" 효과) */}
            <div className="pointer-events-none select-none" style={{ filter: 'blur(12px)' }}>
                {children}
            </div>

            {/* FOMO 오버레이 */}
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-[4px]">
                <div className="w-full max-w-md mx-4">
                    {/* 카드 */}
                    <div className="relative overflow-hidden rounded-2xl bg-[#0a1628] border border-white/10
                        shadow-[0_25px_80px_rgba(0,0,0,0.6),0_0_40px_rgba(34,211,238,0.1)]">

                        {/* 상단 글로우 */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px]
                            bg-gradient-radial from-cyan-500/15 to-transparent blur-[80px] pointer-events-none" />

                        <div className="relative z-10 p-8 text-center">
                            {/* 아이콘 */}
                            <div className="flex justify-center mb-5">
                                <div className="rounded-2xl p-4 bg-cyan-500/10 border border-cyan-500/30
                                    shadow-[0_0_25px_rgba(34,211,238,0.15)]">
                                    <Shield className="w-8 h-8 text-cyan-400" />
                                </div>
                            </div>

                            {/* FOMO 헤드라인 */}
                            <h2 className="text-xl font-black text-white mb-2">
                                {t('guestWallTitle')}
                            </h2>
                            <p className="text-sm text-slate-400 mb-6">
                                {t('guestWallSubtitle')}
                            </p>

                            {/* 소셜 프루프 */}
                            <div className="flex items-center justify-center gap-2 mb-6 text-xs text-slate-300">
                                <Users className="w-3.5 h-3.5 text-emerald-400" />
                                <span>2,400+ traders already using SIGNUM HQ</span>
                            </div>

                            {/* 가입 CTA */}
                            <Link
                                href="/login"
                                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl
                                    bg-gradient-to-r from-cyan-500 to-cyan-600 text-black
                                    text-sm font-black uppercase tracking-wider
                                    hover:brightness-110 transition-all
                                    shadow-[0_0_30px_rgba(34,211,238,0.25)]"
                            >
                                {t('guestWallCta')} <ArrowRight className="w-4 h-4" />
                            </Link>

                            {/* 보장 */}
                            <p className="text-center text-[11px] text-slate-500 mt-3">
                                Google/GitHub 원클릭 · 10초 가입 · 카드 불필요
                            </p>

                            {/* Founding Member FOMO */}
                            <div className="mt-5 pt-4 border-t border-white/5">
                                <div className="flex items-center justify-center gap-2 text-xs">
                                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="text-amber-400 font-bold">{t('foundingBadge')}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    {t('foundingDesc')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
