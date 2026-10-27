'use client';

// ============================================================================
// useGiftMoment — 선물 안내의 «좋은 순간» 입구 (2026-10-27, 대표 «안내 노출 늘려서 선물 더 퍼지게 해»)
// ----------------------------------------------------------------------------
// 실적 캘린더·장마감 리포트 탭처럼 «읽을거리를 다 본» 화면에서 GIFT_MOMENT_DWELL_MS 머물면 이벤트 하나를 쏜다.
// 띄울지·언제까지·몇 번인지는 GiftAnnounceHost 가 정한다(lib/gift/giftAnnounce.ts — 한 실행 최대 1회·48시간·최대 3회).
// 화면에는 아무것도 그리지 않는다(배치·문구 변경 0).
//   · active 가 꺼지면(다른 탭·리포트 전체 화면·광고 창) 타이머를 지우고, 다시 켜지면 처음부터 잰다.
//   · 이 방문 중 «내 종목 담기»·«✦AI 한 줄» 이 일어나면 이번 방문은 포기한다 — 그 순간엔 OS 평점 시트가 뜰 수 있다(lib/app/reviewMoments).
//   · 앱이 배경에 있으면 쏘지 않는다(돌아와도 다시 잰다).
// ============================================================================

import { useEffect } from 'react';
import { AI_LINE_OPENED_EVENT, WATCHLIST_ADDED_EVENT } from '@/lib/app/reviewMoments';
import { GIFT_MOMENT_DWELL_MS, GIFT_MOMENT_EVENT, type GiftMomentWhere } from './giftAnnounce';

export function useGiftMoment(active: boolean, where: GiftMomentWhere): void {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    let t = 0;
    let gaveUp = false;
    const arm = () => {
      window.clearTimeout(t);
      if (gaveUp || document.visibilityState === 'hidden') return;
      t = window.setTimeout(() => {
        if (gaveUp || document.visibilityState === 'hidden') return;
        window.dispatchEvent(new CustomEvent(GIFT_MOMENT_EVENT, { detail: { where } }));
      }, GIFT_MOMENT_DWELL_MS);
    };
    const giveUp = () => { gaveUp = true; window.clearTimeout(t); };
    const onVis = () => { if (document.visibilityState === 'hidden') window.clearTimeout(t); else arm(); };
    arm();
    window.addEventListener(WATCHLIST_ADDED_EVENT, giveUp);
    window.addEventListener(AI_LINE_OPENED_EVENT, giveUp);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(WATCHLIST_ADDED_EVENT, giveUp);
      window.removeEventListener(AI_LINE_OPENED_EVENT, giveUp);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, where]);
}
