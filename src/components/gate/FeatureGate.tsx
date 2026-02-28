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

// ============================================================
// TYPES
// ============================================================
interface FeatureGateProps {
    /** 이 기능에 필요한 최소 등급 */
    requiredTier: 'free' | 'pro' | 'elite';
    /** 게이팅 시각 모드 */
    mode?: 'blur' | 'peek' | 'gradient';
    /** FOMO 메시지 (블러 위에 표시) */
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
    fomoMessage,
    fomoValue,
    children,
    className = '',
    minHeight,
    compact = false,
}: FeatureGateProps) {
    const { hasAccess, loading } = useTier();
    const [showUpgrade, setShowUpgrade] = useState(false);

    // 접근 권한이 있으면 그대로 렌더링 (게이팅 없음)
    if (hasAccess(requiredTier as UserTier)) {
        return <>{children}</>;
    }

    // 로딩 중에는 스켈레톤 (기존 UI 깨지지 않도록)
    if (loading) {
        return (
            <div className={`animate-pulse rounded-xl bg-slate-800/30 ${className}`}
                style={{ minHeight: minHeight || (compact ? '60px' : '120px') }} />
        );
    }

    const colors = TIER_COLOR[requiredTier] || TIER_COLOR.pro;
    const tierLabel = TIER_LABEL[requiredTier] || 'PRO';

    const handleClick = useCallback(() => {
        setShowUpgrade(true);
    }, []);

    // ============================================================
    // MODE: BLUR — 전체 블러 + 잠금 오버레이
    // ============================================================
    if (mode === 'blur') {
        return (
            <div className={`relative overflow-hidden rounded-xl ${className}`}
                style={{ minHeight: minHeight || (compact ? '60px' : '120px') }}>
                {/* 실제 콘텐츠 (블러 처리) */}
                <div className="pointer-events-none select-none" style={{ filter: 'blur(8px)' }}>
                    {children}
                </div>

                {/* 잠금 오버레이 */}
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px] cursor-pointer"
                    onClick={handleClick}
                >
                    <div className={`flex flex-col items-center gap-2 ${compact ? 'gap-1.5' : 'gap-3'}`}>
                        {/* 잠금 아이콘 */}
                        <div className={`rounded-full p-2.5 ${colors.bg} ${colors.border} border ${colors.glow}`}>
                            <Lock className={`${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} ${colors.text}`} />
                        </div>

                        {/* FOMO 메시지 */}
                        {fomoMessage && (
                            <p className={`text-slate-300 text-center max-w-xs leading-relaxed
                                ${compact ? 'text-xs' : 'text-sm'}`}>
                                {fomoMessage}
                            </p>
                        )}

                        {/* CTA 버튼 */}
                        <Link
                            href="/pricing"
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold uppercase tracking-wider
                                transition-all hover:brightness-110
                                ${compact ? 'text-xs px-3 py-1.5' : 'text-xs'}
                                ${requiredTier === 'elite'
                                    ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-black'
                                    : 'bg-gradient-to-r from-amber-500 to-amber-600 text-black'
                                } ${colors.glow}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {tierLabel}로 잠금 해제 <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>
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
                <div className="pointer-events-none select-none" style={{ filter: 'blur(3px)' }}>
                    {children}
                </div>

                {/* Peek 값 + 잠금 레이블 */}
                <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                    onClick={handleClick}
                >
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-lg bg-slate-900/80
                        backdrop-blur-sm border ${colors.border}`}>
                        <Lock className={`w-3.5 h-3.5 ${colors.text}`} />
                        {fomoValue && (
                            <span className="text-white font-mono font-bold text-sm">{fomoValue}</span>
                        )}
                        <span className={`text-xs font-bold ${colors.text}`}>
                            {tierLabel} 잠금
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
                            {tierLabel}에서 전체 보기
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
