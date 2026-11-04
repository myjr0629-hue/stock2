'use client';

import { useEffect } from 'react';
import { markSessionError } from '@/lib/app/ratingMoments';

/**
 * 처리된 오류 화면(불러오기 실패·재시도·오프라인·구매 실패 문구) 옆에 함께 그린다 — 화면에는 아무것도 그리지 않는다.
 * 그린 세션은 새 평점 «좋은 순간»을 건너뛴다(관문 11050112 ② · 11050220). 문구·배치는 바꾸지 않는다.
 */
export function SessionErrorMark() {
  useEffect(() => { markSessionError(); }, []);
  return null;
}
