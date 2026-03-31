'use client';

import { useState, useEffect } from 'react';

/**
 * useIsMobile — 모바일 뷰포트 감지 Hook
 * SSR에서는 false(데스크탑) 기본값 → hydration 불일치 방지
 * 768px 기준 (md: breakpoint)
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
