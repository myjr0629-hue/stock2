// ============================================================================
// ValueWall — 프리미엄 지표 블러 오버레이 + 보상형 비디오 언락
// 웹에서는 구독 필요 → 앱에서는 30초 광고 시청으로 1시간 무료 언락
// ============================================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { adManager, useAdUnlockStatus } from '@/services/adManager';

interface ValueWallProps {
  children: React.ReactNode;
  /** 언락이 필요한 프리미엄 기능 이름 */
  featureName: string;
  /** 언락 티어: 'basic' = 전면 광고, 'premium' = 보상형 비디오 */
  tier?: 'basic' | 'premium';
  /** 블러 강도 (px) */
  blurIntensity?: number;
  /** 비활성화 (이미 구독자이거나 웹인 경우) */
  disabled?: boolean;
  /** 커스텀 오버레이 메시지 */
  message?: string;
}

export function ValueWall({
  children,
  featureName,
  tier = 'premium',
  blurIntensity = 12,
  disabled = false,
  message,
}: ValueWallProps) {
  const { unlocked, remaining } = useAdUnlockStatus();
  const [isNative, setIsNative] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // Native 환경 감지
  useEffect(() => {
    try {
      const { Capacitor } = require('@capacitor/core');
      setIsNative(Capacitor.isNativePlatform());
    } catch {
      setIsNative(false);
    }
  }, []);

  // 남은 시간 업데이트
  useEffect(() => {
    if (!unlocked || remaining <= 0) return;
    const interval = setInterval(() => {
      const r = adManager.getRemainingUnlockTime();
      if (r <= 0) {
        setTimeLeft('');
        return;
      }
      const mins = Math.floor(r / 60000);
      const secs = Math.floor((r % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [unlocked, remaining]);

  // 보상형 비디오 시청
  const handleWatchAd = useCallback(async () => {
    setLoading(true);
    try {
      if (tier === 'premium') {
        const reward = await adManager.showRewarded();
        if (reward) {
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        }
      } else {
        await adManager.showInterstitial();
      }
    } finally {
      setLoading(false);
    }
  }, [tier]);

  // 비활성화 상태이거나 웹 환경이면 children 그대로 렌더
  if (disabled || !isNative) {
    return <>{children}</>;
  }

  // 이미 언락된 상태
  if (unlocked) {
    return (
      <div className="relative">
        {children}
        {/* 언락 타이머 배지 */}
        {timeLeft && (
          <div className="absolute top-1 right-1 z-50">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold
              bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-400 border border-emerald-500/30
              backdrop-blur-sm font-jakarta">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              UNLOCKED {timeLeft}
            </span>
          </div>
        )}
      </div>
    );
  }

  // 잠금 상태 — 블러 오버레이 표시
  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* 블러 처리된 콘텐츠 */}
      <div
        style={{
          filter: `blur(${blurIntensity}px)`,
          WebkitFilter: `blur(${blurIntensity}px)`,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {children}
      </div>

      {/* 오버레이 */}
      <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm">
        {/* 성공 애니메이션 */}
        {showSuccess ? (
          <div className="flex flex-col items-center gap-3 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-3xl">✅</span>
            </div>
            <span className="text-emerald-400 font-bold font-jakarta text-lg">
              1시간 언락 완료!
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            {/* 아이콘 */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
              <span className="text-2xl">{tier === 'premium' ? '🔒' : '📊'}</span>
            </div>

            {/* 기능 이름 */}
            <h3 className="text-white font-black text-base font-jakarta">
              {featureName}
            </h3>

            {/* 설명 */}
            <p className="text-slate-300 text-xs font-jakarta leading-relaxed max-w-[240px]">
              {message || (tier === 'premium'
                ? '30초 영상 시청으로 1시간 무료 이용'
                : '광고를 보고 이 지표를 확인하세요'
              )}
            </p>

            {/* CTA 버튼 */}
            <button
              onClick={handleWatchAd}
              disabled={loading || (tier === 'premium' && !adManager.isRewardedReady())}
              className={`
                mt-1 px-6 py-2.5 rounded-xl font-bold text-sm font-jakarta
                transition-all duration-300 active:scale-95
                ${loading
                  ? 'bg-slate-700 text-slate-400 cursor-wait'
                  : tier === 'premium'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/25'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/25'
                }
              `}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  로딩 중...
                </span>
              ) : tier === 'premium' ? (
                <span className="flex items-center gap-2">
                  <span>▶</span> 영상 보고 언락
                </span>
              ) : (
                '무료로 보기'
              )}
            </button>

            {/* 구독 유도 */}
            <p className="text-slate-500 text-[10px] font-jakarta mt-1">
              광고 없이 사용하려면 Premium 구독
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// AdBanner — 하단 배너 광고 자리 표시 (네이티브에서만 활성)
// ============================================================================
export function AdBannerSpacer() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    try {
      const { Capacitor } = require('@capacitor/core');
      setIsNative(Capacitor.isNativePlatform());
    } catch {}
  }, []);

  // 네이티브 앱에서만 배너 광고 높이만큼 하단 여백 추가
  if (!isNative) return null;

  return <div className="h-[50px] w-full shrink-0" aria-hidden />;
}

// ============================================================================
// useInterstitialOnNavigate — 페이지 전환 시 전면 광고 (5회 전환마다)
// ============================================================================
export function useInterstitialOnNavigate(pathname: string) {
  const [navCount, setNavCount] = useState(0);
  const SHOW_EVERY = 5; // 5회 전환마다 전면 광고

  useEffect(() => {
    const count = navCount + 1;
    setNavCount(count);

    if (count % SHOW_EVERY === 0 && count > 0) {
      adManager.showInterstitial().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}
