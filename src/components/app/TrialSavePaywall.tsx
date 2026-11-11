'use client';
// ============================================================================
// 체험 종료 안내 → 기존 ProPaywall (2026-11-11). 결제 로직은 그대로(useProStatus().purchase) — 바뀌는 것은 두 가지뿐:
//   ① 체험 중(이미 PRO)이어도 열린 채 둔다(keepOpenWhilePro) ② 제목·단추 말(«체험 뒤에도 PRO를 쓰려면»·«PRO 계속 쓰기»).
//   여러 플랜(NEXT_PUBLIC_PRO_PLANS)이 켜져 있고 스토어가 연간을 주면 페이월 기본 선택이 이미 연간이다. 월간 카드도 그대로 있다.
//   안드로이드 뒤로가기 = 닫기 · 배너 내리기 · 맨 위 층(Esc) — «내 종목» 호스트 페이월과 같은 감싸기.
//   약관·개인정보로 갈 때는 히스토리 칸을 걷은 뒤 이동한다(돌아올 때 뒤로가기 한 번).
// ============================================================================
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { afterSheetHistory, useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { ProPaywall, type PaywallPlan } from './ProPaywall';

export default function TrialSavePaywall({ locale, onClose, previewPlans }: { locale: string; onClose: () => void; previewPlans?: PaywallPlan[] }) {
  const router = useRouter();
  useBackToClose(true, onClose);
  useBannerSuppression(true);
  useLayer(true, onClose);
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const onNavigate = useCallback((path: 'terms' | 'privacy') => {
    onClose();
    void afterSheetHistory().then(() => router.push(`/${loc}/app-view/${path}`));
  }, [onClose, router, loc]);
  return <ProPaywall locale={locale} src="trial_off" onClose={onClose} onNavigate={onNavigate} keepOpenWhilePro previewPlans={previewPlans} />;
}
