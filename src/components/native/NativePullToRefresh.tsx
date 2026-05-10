// ============================================================================
// NativePullToRefresh — 네이티브 앱 전용 당겨서 새로고침
// 터치 제스처 기반, 스프링 물리, 햅틱 피드백
// 웹에서는 렌더링하지 않음
// ============================================================================

'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  children: React.ReactNode;
  onRefresh?: () => Promise<void>;
  threshold?: number;
}

export function NativePullToRefresh({ children, onRefresh, threshold = 80 }: Props) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // 네이티브 앱 체크
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    try {
      const { Capacitor } = require('@capacitor/core');
      setIsNative(Capacitor.isNativePlatform());
    } catch { /* web */ }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    // 스크롤이 맨 위에 있을 때만 활성화
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      setIsActive(true);
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isActive || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    
    if (diff > 0) {
      // 저항 곡선 — 많이 당길수록 느려짐 (네이티브 느낌)
      const resistance = Math.min(diff * 0.5, threshold * 1.5);
      setPullDistance(resistance);

      // 임계값 도달 시 햅틱
      if (resistance >= threshold && pullDistance < threshold) {
        (async () => {
          try {
            const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
            await Haptics.impact({ style: ImpactStyle.Medium });
          } catch {}
        })();
      }
    }
  }, [isActive, isRefreshing, pullDistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isActive) return;
    setIsActive(false);

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      
      // 햅틱 피드백
      try {
        const { Haptics, NotificationType } = await import('@capacitor/haptics');
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}

      // 리프레시 실행
      if (onRefresh) {
        await onRefresh();
      } else {
        router.refresh();
        await new Promise(r => setTimeout(r, 800));
      }

      setIsRefreshing(false);
    }
    
    setPullDistance(0);
  }, [isActive, pullDistance, threshold, onRefresh, router]);

  // 웹에서는 그냥 children 렌더
  if (!isNative) {
    return <>{children}</>;
  }

  const progress = Math.min(pullDistance / threshold, 1);
  const spinnerOpacity = Math.max(0, progress - 0.3) / 0.7;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="native-pull-container"
    >
      {/* Pull Indicator */}
      <div
        className="native-pull-indicator"
        style={{
          height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 48 : 0) : 0,
          transition: !isActive ? 'height 0.3s cubic-bezier(0.2, 0, 0, 1)' : 'none',
        }}
      >
        <div
          className="native-pull-spinner"
          style={{
            opacity: isRefreshing ? 1 : spinnerOpacity,
            transform: `rotate(${pullDistance * 3}deg) scale(${0.5 + progress * 0.5})`,
          }}
        >
          {/* Circular spinner */}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12" cy="12" r="10"
              stroke="rgba(34,211,238,0.2)"
              strokeWidth="2.5"
              fill="none"
            />
            <circle
              cx="12" cy="12" r="10"
              stroke="rgba(34,211,238,0.9)"
              strokeWidth="2.5"
              fill="none"
              strokeDasharray={`${progress * 63} 63`}
              strokeLinecap="round"
              className={isRefreshing ? 'native-spin' : ''}
              style={{ transformOrigin: 'center' }}
            />
          </svg>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.15}px)` : undefined,
          transition: !isActive ? 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
