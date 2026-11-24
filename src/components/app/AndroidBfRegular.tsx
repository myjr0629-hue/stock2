'use client';
// ============================================================================
// 안드로이드 블프 → 정가 페이월 (2026-11-24 오후 · 출처 bf_and_reg) — 블프 줄에서 열었는데 할인을 못 보일 때(스위치 꺼짐·오퍼 없음·대상 아님)·
//   무료 사람의 할인 결제가 오류로 끝났을 때. 결제는 일반 경로 그대로(useProStatus().purchase = purchasePackage · 7일 체험 기본 옵션).
//   체험 종료 안내용 TrialSavePaywall 과 달리 «체험 뒤에도…» 문구가 없는 설정과 같은 ProPaywall(관문 11241325 ③). 감싸기(뒤로가기·배너·맨 위 층·약관 이동)는 같다.
// ============================================================================
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { afterSheetHistory, useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { ProPaywall, type PaywallPlan } from './ProPaywall';

export default function AndroidBfRegular({ locale, onClose, previewPlans }: { locale: string; onClose: () => void; previewPlans?: PaywallPlan[] }) {
  const router = useRouter();
  useBackToClose(true, onClose);
  useBannerSuppression(true);
  useLayer(true, onClose);
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const onNavigate = useCallback((path: 'terms' | 'privacy') => {
    onClose();
    void afterSheetHistory().then(() => router.push(`/${loc}/app-view/${path}`));
  }, [onClose, router, loc]);
  return <ProPaywall locale={locale} src="bf_and_reg" onClose={onClose} onNavigate={onNavigate} previewPlans={previewPlans} />;
}
