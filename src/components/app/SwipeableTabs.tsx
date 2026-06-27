'use client';

import { useRef, useState, useEffect, ReactNode } from 'react';

interface SwipeableTabsProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function SwipeableTabs({ children, onSwipeLeft, onSwipeRight, threshold = 50 }: SwipeableTabsProps) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);

  // 네이티브 앱에서만 좌우 스와이프(탭 전환)를 끈다.
  // 웹(브라우저)은 isNative=false → 핸들러가 그대로 붙어 기존 동작 100% 유지(영향 0).
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    try {
      const { Capacitor } = require('@capacitor/core');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot platform detection on mount (SSR-safe)
      setIsNative(Capacitor.isNativePlatform());
    } catch { /* web */ }
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    const dt = Date.now() - startTime.current;

    // Must be more horizontal than vertical, fast enough, and past threshold
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > threshold && dt < 500) {
      if (dx < 0) {
        onSwipeLeft?.();
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
      } else {
        onSwipeRight?.();
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
      }
    }
  };

  return (
    <div
      onTouchStart={isNative ? undefined : handleTouchStart}
      onTouchEnd={isNative ? undefined : handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}
