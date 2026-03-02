"use client";

/**
 * FeatureGate — 등급별 기능 게이팅 + FOMO 자극 컴포넌트
 * 
 * 3가지 모드:
 * - blur: 전체 블러 + 🔒 아이콘 + FOMO 메시지
 * - peek: 부분 노출 (숫자는 보이지만 해석/차트는 블러)
 * - gradient: 상단만 노출, 아래로 갈수록 페이드 아웃
 * 
 * 기존 컴포넌트를 감싸기만 하면 됩니다:
 * <FeatureGate requiredTier="pro" mode="blur">
 *   <AIVerdict />
 * </FeatureGate>
 */

import React, { useState, useCallback } from 'react';
import { useTier, type UserTier } from '@/contexts/TierContext';
import { Lock, ArrowRight, Crown, Zap } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';

// ============================================================
// TYPES
// ============================================================
interface FeatureGateProps {
    /** 이 기능에 필요한 최소 등급 */
    requiredTier: 'free' | 'pro' | 'elite';
    /** 게이팅 시각 모드 */
    mode?: 'blur' | 'peek' | 'gradient';
    /** 잠금 카드에 항상 표시할 지표명 (e.g. "Net GEX", "Gamma Flip") */
    title?: string;
    /** FOMO 메시지 (블러 위에 표시, compact에서는 숨겨짐) */
    fomoMessage?: string;
    /** 피킹용 실제 값 (잠긴 상태에서 살짝 노출) */
    fomoValue?: string;
    /** 자식 컴포넌트 */
    children: React.ReactNode;
    /** 추가 CSS 클래스 */
    className?: string;
    /** 최소 높이 (블러 영역이 너무 작으면 FOMO 효과 감소) */
    minHeight?: string;
    /** compact 모드 (좁은 영역용 — 카드 내부 등) */
    compact?: boolean;
    /** 블러 강도 직접 지정 (px) — 설정 시 기본값 대신 사용 */
    blurPx?: number;
}

// ============================================================
// TIER LABELS
// ============================================================
const TIER_LABEL: Record<string, string> = {
    pro: 'PRO',
    elite: 'ELITE',
};

const TIER_COLOR: Record<string, { bg: string; text: string; border: string; glow: string }> = {
    pro: {
        bg: 'bg-amber-500/10',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    },
    elite: {
        bg: 'bg-cyan-500/10',
        text: 'text-cyan-400',
        border: 'border-cyan-500/30',
        glow: 'shadow-[0_0_20px_rgba(34,211,238,0.15)]',
    },
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export function FeatureGate({
    requiredTier,
    mode = 'blur',
    title,
    fomoMessage,
    fomoValue,
    children,
    className = '',
    minHeight,
    compact = false,
    blurPx,
}: FeatureGateProps) {
    const { hasAccess, loading, tier } = useTier();
    const gt = useTranslations('gate');
    const [showUpgrade, setShowUpgrade] = useState(false);

    // ⚠ Hooks must be called BEFORE any conditional returns (Rules of Hooks)
    const handleClick = useCallback(() => {
        setShowUpgrade(true);
    }, []);

    // ──────────────────────────────────────────────
    // 게스트 무료 미리보기 우회
    // GuestWall이 5회까지 페이지를 열어주므로,
    // 그 동안은 FeatureGate도 모든 콘텐츠를 열어야 함.
    // 가입 후 free 유저부터 등급별 게이트가 작동.
    // ──────────────────────────────────────────────
    const isGuestPreview = tier === 'guest' && (() => {
        if (typeof document === 'undefined') return true; // SSR에서는 안전하게 열기
        const match = document.cookie.match(/shq_gv=(\d+)/);
        const visits = match ? parseInt(match[1], 10) : 0;
        return visits <= 5;
    })();

    // 접근 권한이 있거나 게스트 미리보기 중이면 그대로 렌더링
    if (hasAccess(requiredTier as UserTier) || isGuestPreview) {
        return <>{children}</>;
    }

    // 로딩 중에는 children을 그대로 렌더링 (SSR↔Client 일치 = hydration mismatch 방지)
    // tier가 resolve된 후 자동으로 게이트 적용됨
    if (loading) {
        return <>{children}</>;
    }

    const colors = TIER_COLOR[requiredTier] || TIER_COLOR.pro;
    const tierLabel = TIER_LABEL[requiredTier] || 'PRO';

    // ============================================================
    // MODE: BLUR — 전체 블러 + 잠금 오버레이
    // ============================================================
    if (mode === 'blur') {
        return (
            <div className={`relative rounded-xl overflow-hidden ${!compact ? 'flex-1 flex flex-col' : ''} ${className}`}
                style={{ minHeight: minHeight || (compact ? '80px' : '120px') }}>
                {/* 실제 콘텐츠 (블러 처리 + overflow-hidden으로 블러 엣지 클리핑) */}
                <div className={`pointer-events-none select-none overflow-hidden ${!compact ? 'flex-1' : ''}`} style={{ filter: `blur(${blurPx ? blurPx + 'px' : (requiredTier === 'pro' ? (compact ? '4px' : '10px') : (compact ? '2.5px' : '4.5px'))})` }}>
                    {children}
                </div>

                {/* 잠금 오버레이 */}
                <div
                    className="absolute inset-0 flex items-center justify-center bg-slate-950/30 cursor-pointer"
                    onClick={handleClick}
                >
                    {compact ? (
                        /* compact: 가로 한 줄 레이아웃 — 좁은 카드에 맞게 */
                        <div className="flex items-center justify-center gap-2 flex-wrap px-3">
                            {/* 잠금 아이콘 */}
                            <div className={`rounded-full p-1 ${colors.bg} ${colors.border} border ${colors.glow}`}>
                                <Lock className={`w-3 h-3 ${colors.text}`} />
                            </div>
                            {/* 지표명 + FOMO 메시지 (한 줄) */}
                            <span className="text-white font-jakarta font-bold text-[12px] tracking-wide whitespace-nowrap">
                                {title}
                            </span>
                            {fomoMessage && (
                                <span className="text-slate-300 font-jakarta text-[12px] tracking-wide whitespace-nowrap">
                                    {fomoMessage}
                                </span>
                            )}
                            {/* CTA 버튼 */}
                            <Link
                                href="/pricing"
                                className={`inline-flex items-center gap-1 rounded-md font-bold uppercase tracking-wider
                                    transition-all hover:brightness-110 text-[12px] px-2.5 py-0.5
                                    ${requiredTier === 'elite'
                                        ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black'
                                        : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black'
                                    } ${colors.glow}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {gt('unlockWith', { tier: tierLabel })} <ArrowRight className="w-3 h-3" />
                            </Link>
                        </div>
                    ) : (
                        /* 일반: 세로 레이아웃 */
                        <div className="flex flex-col items-center gap-3">
                            {/* 잠금 아이콘 */}
                            <div className={`rounded-full p-2.5 ${colors.bg} ${colors.border} border ${colors.glow}`}>
                                <Lock className={`w-5 h-5 ${colors.text}`} />
                            </div>

                            {/* 지표명 */}
                            {title && (
                                <span className="text-white font-jakarta font-bold tracking-wide text-center text-sm">
                                    {title}
                                </span>
                            )}

                            {/* FOMO 메시지 */}
                            {fomoMessage && (
                                <p className="text-center font-medium tracking-wide font-jakarta text-[12px]
                                    text-slate-200 max-w-sm leading-relaxed">
                                    {fomoMessage}
                                </p>
                            )}

                            {/* CTA 버튼 */}
                            <Link
                                href="/pricing"
                                className={`inline-flex items-center gap-1.5 rounded-lg font-bold uppercase tracking-wider
                                    transition-all hover:brightness-110 text-xs px-4 py-2
                                    ${requiredTier === 'elite'
                                        ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black'
                                        : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black'
                                    } ${colors.glow}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {gt('unlockWith', { tier: tierLabel })} <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ============================================================
    // MODE: PEEK — 숫자는 보이지만 상세 잠금
    // ============================================================
    if (mode === 'peek') {
        return (
            <div className={`relative overflow-hidden rounded-xl ${className}`}
                style={{ minHeight: minHeight || (compact ? '60px' : '100px') }}>
                {/* 실제 콘텐츠 (약한 블러 — 숫자는 읽힘) */}
                <div className="pointer-events-none select-none" style={{ filter: `blur(${blurPx ? blurPx + 'px' : (requiredTier === 'pro' ? (compact ? '3px' : '5px') : '1.5px')})` }}>
                    {children}
                </div>

                {/* Peek 값 + 잠금 레이블 */}
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer gap-2"
                    onClick={handleClick}
                >
                    {/* 지표명 */}
                    {title && (
                        <span className={`text-white font-jakarta font-bold tracking-wide
                            ${compact ? 'text-[11px]' : 'text-sm'}`}>
                            {title}
                        </span>
                    )}
                    {/* 지표 설명 */}
                    {fomoMessage && (
                        <p className="text-slate-300 text-center text-[12px] font-medium tracking-wide font-jakarta max-w-sm leading-snug">
                            {fomoMessage}
                        </p>
                    )}
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80
                        backdrop-blur-sm border ${colors.border}`}>
                        <Lock className={`w-3 h-3 ${colors.text}`} />
                        {fomoValue && (
                            <span className="text-white font-mono font-bold text-sm">{fomoValue}</span>
                        )}
                        <span className={`text-[11px] font-bold ${colors.text}`}>
                            {gt('locked', { tier: tierLabel })}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================================
    // MODE: GRADIENT — 상단 30% 노출, 아래로 그라데이션 페이드
    // ============================================================
    if (mode === 'gradient') {
        return (
            <div className={`relative overflow-hidden rounded-xl ${className}`}
                style={{ minHeight: minHeight || '200px' }}>
                {/* 실제 콘텐츠 (전체 보임) */}
                <div className="pointer-events-none select-none">
                    {children}
                </div>

                {/* 그라데이션 페이드 오버레이 */}
                <div
                    className="absolute inset-0 cursor-pointer"
                    style={{
                        background: 'linear-gradient(to bottom, transparent 20%, rgba(5,10,20,0.7) 50%, rgba(5,10,20,0.95) 70%, rgba(5,10,20,1) 100%)',
                    }}
                    onClick={handleClick}
                >
                    {/* 하단 CTA */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col items-center gap-2">
                        {fomoMessage && (
                            <p className="text-slate-300 text-sm text-center">
                                {fomoMessage}
                            </p>
                        )}
                        <Link
                            href="/pricing"
                            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider
                                transition-all hover:brightness-110
                                ${requiredTier === 'elite'
                                    ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black'
                                    : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black'
                                } ${colors.glow}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Crown className="w-3.5 h-3.5" />
                            {gt('viewAll', { tier: tierLabel })}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Fallback (shouldn't reach here)
    return <>{children}</>;
}

// ============================================================
// CONVENIENCE WRAPPERS
// ============================================================

/** PRO 이상에서만 접근 가능 — blur 모드 */
export function ProGate({
    children,
    fomoMessage,
    ...props
}: Omit<FeatureGateProps, 'requiredTier'>) {
    return (
        <FeatureGate requiredTier="pro" fomoMessage={fomoMessage} {...props}>
            {children}
        </FeatureGate>
    );
}

/** ELITE에서만 접근 가능 — blur 모드 */
export function EliteGate({
    children,
    fomoMessage,
    ...props
}: Omit<FeatureGateProps, 'requiredTier'>) {
    return (
        <FeatureGate requiredTier="elite" fomoMessage={fomoMessage} {...props}>
            {children}
        </FeatureGate>
    );
}
