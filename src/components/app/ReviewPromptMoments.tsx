'use client';

// ============================================================================
// ReviewPromptMoments — 스토어 평점 요청 «순간» 두 곳을 앱 레이아웃에 «하나만» 건다
// ----------------------------------------------------------------------------
// 화면에 아무것도 그리지 않는다(null). 판단은 전부 lib/app/reviewMoments.ts — 이유·근거·광고 겹침 점검은 거기 있다.
//   ① 앱 세션 3·10번째 — 웹뷰 세션당 1회(sessionStorage 표식), 시작 2.5초 뒤
//   ② 내 종목 담기 2번째 — starActions.addStar 성공 끝의 'sg:watchlist-added' 를 받아서, 3초 뒤
// 요청은 기존 useReviewPrompt «그대로»(OS 제공 시트만 · 네이티브에서만). 웹에서는 아무 일도 하지 않는다.
// ============================================================================

import { useEffect } from 'react';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import {
  APP_SESSION_REVIEW, WATCH_ADD_REVIEW, runSessionMoment, subscribeWatchAddMoment,
} from '@/lib/app/reviewMoments';

export function ReviewPromptMoments() {
  const askOnSession = useReviewPrompt(APP_SESSION_REVIEW);
  const askOnWatchAdd = useReviewPrompt(WATCH_ADD_REVIEW);

  // ① 마운트마다 부르되 «세션당 1회»는 runSessionMoment 의 표식이 지킨다(언어 전환 재마운트·StrictMode 두 번 실행 포함)
  useEffect(() => {
    runSessionMoment(window, askOnSession);
  }, [askOnSession]);

  // ② 담기 성공 이벤트 구독 — 네이티브가 아니면 걸지 않는다
  useEffect(() => subscribeWatchAddMoment(window, askOnWatchAdd), [askOnWatchAdd]);

  return null;
}
