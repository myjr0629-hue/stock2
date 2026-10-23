'use client';
import { useEffect } from 'react';
import { shareVia } from '@/lib/share/share';
import { giftPreparation } from './client';

let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const refresh = () => { if (document.visibilityState !== 'hidden') void giftPreparation.refresh(shareVia()); };

/** 여러 공유 단추가 한 준비 상태·타이머를 사용한다. DOM·라벨 변경 없음. */
export function usePreparedGift(active = true) {
  useEffect(() => {
    if (!active) return;
    if (users++ === 0) {
      refresh();
      timer = setInterval(refresh, 60_000);
      window.addEventListener('focus', refresh);
      document.addEventListener('visibilitychange', refresh);
    }
    return () => {
      if (--users === 0) {
        clearInterval(timer);
        window.removeEventListener('focus', refresh);
        document.removeEventListener('visibilitychange', refresh);
      }
    };
  }, [active]);
  return giftPreparation;
}
