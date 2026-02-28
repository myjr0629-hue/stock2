"use client";

/**
 * TierContext — 전역 유저 등급(tier) 제공
 * 
 * 작동 방식:
 * 1. Supabase Auth에서 현재 유저를 확인
 * 2. user_profiles 테이블에서 tier 컬럼 조회
 * 3. 비로그인 = 'guest', 로그인인데 tier 없으면 = 'free'
 * 
 * 기존 코드에 영향을 주지 않는 독립 Context입니다.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

// ============================================================
// TYPES
// ============================================================
export type UserTier = 'guest' | 'free' | 'pro' | 'elite';

interface TierContextValue {
    /** 현재 유저의 등급 */
    tier: UserTier;
    /** 데이터 로딩 중 여부 */
    loading: boolean;
    /** 유저가 로그인 상태인지 */
    isLoggedIn: boolean;
    /** 특정 등급 이상인지 확인 */
    hasAccess: (requiredTier: UserTier) => boolean;
    /** 등급을 수동으로 새로고침 (결제 후 등) */
    refreshTier: () => Promise<void>;
}

// ============================================================
// TIER HIERARCHY (높을수록 상위)
// ============================================================
const TIER_LEVEL: Record<UserTier, number> = {
    guest: 0,
    free: 1,
    pro: 2,
    elite: 3,
};

// ============================================================
// CONTEXT
// ============================================================
const TierContext = createContext<TierContextValue>({
    tier: 'guest',
    loading: true,
    isLoggedIn: false,
    hasAccess: () => false,
    refreshTier: async () => { },
});

// ============================================================
// PROVIDER
// ============================================================
export function TierProvider({ children }: { children: React.ReactNode }) {
    const [tier, setTier] = useState<UserTier>('guest');
    const [loading, setLoading] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const fetchTier = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                setTier('guest');
                setIsLoggedIn(false);
                setLoading(false);
                return;
            }

            setIsLoggedIn(true);

            // user_profiles 테이블에서 tier 조회
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('tier')
                .eq('user_id', user.id)
                .maybeSingle();

            const userTier = profile?.tier as UserTier | undefined;

            // tier 컬럼이 없거나 null이면 'free'
            if (userTier && ['free', 'pro', 'elite'].includes(userTier)) {
                setTier(userTier);
            } else {
                setTier('free');
            }
        } catch (err) {
            // Supabase 연결 실패 시 안전하게 guest로 설정
            console.warn('[TierContext] Failed to fetch tier:', err);
            setTier('guest');
            setIsLoggedIn(false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTier();

        // Auth 상태 변경 감지 (로그인/로그아웃 시 자동 갱신)
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchTier();
            } else {
                setTier('guest');
                setIsLoggedIn(false);
                setLoading(false);
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchTier]);

    const hasAccess = useCallback((requiredTier: UserTier): boolean => {
        return TIER_LEVEL[tier] >= TIER_LEVEL[requiredTier];
    }, [tier]);

    const refreshTier = useCallback(async () => {
        setLoading(true);
        await fetchTier();
    }, [fetchTier]);

    const value = useMemo<TierContextValue>(() => ({
        tier,
        loading,
        isLoggedIn,
        hasAccess,
        refreshTier,
    }), [tier, loading, isLoggedIn, hasAccess, refreshTier]);

    return (
        <TierContext.Provider value={value}>
            {children}
        </TierContext.Provider>
    );
}

// ============================================================
// HOOK
// ============================================================
export function useTier(): TierContextValue {
    const context = useContext(TierContext);
    if (!context) {
        throw new Error('useTier must be used within a TierProvider');
    }
    return context;
}
