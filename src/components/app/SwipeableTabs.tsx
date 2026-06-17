'use client';

import { useRef, ReactNode } from 'react';

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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
}
