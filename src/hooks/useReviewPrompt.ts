'use client';

// ============================================================================
// useReviewPrompt — 스토어 평점 요청 (OS 제공 시트만 사용)
// ----------------------------------------------------------------------------
// 왜 필요한가 (2026-08-18 실측):
//   애플 lookup API 로 3앱 × us/kr/jp 를 조회한 결과 userRatingCount 가 «전부 0».
//   애플은 「ratings and reviews influence how your app ranks in search」라고
//   자사 문서에 명시한다 → 평점 0 은 검색 랭킹 입력값이 0 이라는 뜻이고,
//   현재 스토어 노출 1,170회의 최대 병목이다.
//   UC·WIM 은 이미 이 플러그인을 부르고 있는데 SIGNUM 만 빠져 있었다.
//
// ⛔ 절대 하면 안 되는 것 (App Store Review Guideline 5.6.1):
//   · 자체 제작 «별점 물어보는» 팝업 금지 — «제공된 API»만 허용된다
//   · 리뷰 대가로 보상·혜택 제공 금지
//   · 낮은 별점을 걸러내려고 사전 질문으로 분기시키는 것 금지
//   위반 시 최대 «개발자 프로그램 제명»이라 3앱을 한 번에 잃는다.
//   그래서 이 훅은 OS 시트를 «요청»만 하고 결과를 읽지 않는다.
//
// 동작:
//   · 네이티브에서만 동작한다(웹은 완전 무동작).
//   · 실제 표시 여부는 OS 가 정한다. iOS 는 365일당 최대 3회로 제한하므로
//     더 자주 불러도 조용히 무시될 뿐 해가 없다 — 그래서 결과를 확인하지 않는다.
//   · 카운트는 localStorage 에 «누적»으로 남는다(세션 아님).
// ============================================================================

import { useCallback } from 'react';

type Options = {
  /** 누적 성공 횟수를 담는 localStorage 키 */
  storageKey: string;
  /**
   * 시트를 «요청»할 누적 횟수.
   * ⚠️ SIGNUM intel 은 3회마다 전면광고를 띄운다 — 3의 배수를 고르면 광고와
   *    시트가 겹친다. 기본값이 3의 배수를 피하는 이유다.
   */
  milestones?: number[];
  /** 성공 순간 직후 얼마나 기다렸다 물어볼지 (화면 전환이 끝난 뒤 뜨게) */
  delayMs?: number;
};

/**
 * 성공 순간에 호출할 함수를 돌려준다.
 * 「무엇이 성공인가」는 호출부가 정한다 — 그 순간이 앱 안에 실제로 없으면
 * 시트만 띄워봐야 낮은 별점을 받는다.
 */
export function useReviewPrompt({
  storageKey,
  milestones = [4, 11],
  delayMs = 1400,
}: Options) {
  return useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const cap = (window as { Capacitor?: any }).Capacitor;
      if (!cap?.isNativePlatform?.()) return;

      const n = (parseInt(localStorage.getItem(storageKey) || '0', 10) || 0) + 1;
      localStorage.setItem(storageKey, String(n));
      if (!milestones.includes(n)) return;

      window.setTimeout(() => {
        try {
          const p = (window as { Capacitor?: any }).Capacitor?.Plugins?.InAppReview;
          // 결과를 읽지 않는다 — 표시 여부는 OS 소관이고, 우리가 알 필요도 없다.
          p?.requestReview?.().catch(() => {});
        } catch { /* 플러그인 없음 — 조용히 넘어간다 */ }
      }, delayMs);
    } catch { /* localStorage 차단 등 — 평점 요청이 앱을 막으면 안 된다 */ }
  }, [storageKey, milestones, delayMs]);
}
