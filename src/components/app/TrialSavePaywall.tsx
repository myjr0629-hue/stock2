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
import { ProPaywall, type PaywallContext, type PaywallPlan } from './ProPaywall';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

// ★11/11 체험 만료 뒤 1회(src 'trial_expired' · context): 이미 PRO 가 아니므로 keepOpenWhilePro 를 넘기지 않는다(구매·복원으로 PRO 가 되면 평소처럼 닫힘)
export default function TrialSavePaywall({ locale, onClose, previewPlans, src = 'trial_off', context }: { locale: string; onClose: () => void; previewPlans?: PaywallPlan[]; src?: Extract<FunnelSrc, 'trial_off' | 'trial_off_early' | 'trial_expired'>; context?: PaywallContext }) {
  const router = useRouter();
  useBackToClose(true, onClose);
  useBannerSuppression(true);
  useLayer(true, onClose);
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const onNavigate = useCallback((path: 'terms' | 'privacy') => {
    onClose();
    void afterSheetHistory().then(() => router.push(`/${loc}/app-view/${path}`));
  }, [onClose, router, loc]);
  if (context) return <ProPaywall locale={locale} src={src} onClose={onClose} onNavigate={onNavigate} context={context} previewPlans={previewPlans} />;
  return <ProPaywall locale={locale} src={src} onClose={onClose} onNavigate={onNavigate} keepOpenWhilePro previewPlans={previewPlans} />;
}
