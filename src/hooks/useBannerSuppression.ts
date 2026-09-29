'use client';
/* useBannerSuppression — 이 팝업·시트가 열려 있는 동안 네이티브 하단 배너를 내린다.
 *
 * 왜(2026-09-29 대표 지적): 인텔 «M7 장마감 리포트» 같은 팝업을 열면 하단 배너 광고가 팝업 아래쪽을 가린다.
 *   네이티브 AdMob 배너는 OS 가 웹뷰 «위»에 그리므로 z-index·안쪽 여백으로는 못 이긴다(2026-09-12 시뮬 실측).
 *   정답은 설정 화면·첫 실행 안내가 이미 쓰는 방식 — 열린 동안 setBannerSuppressed(true), 닫히면 false.
 * 여러 팝업이 겹쳐 열려도 마지막 하나가 닫힐 때만 배너가 돌아오도록 «열린 개수»를 센다.
 * 웹(비네이티브)에서는 아무것도 하지 않는다. adManager 는 Pro 여부까지 함께 보고 배너를 정하므로
 * 닫힐 때는 «켠다»가 아니라 «억제를 푼다»가 맞다.
 */
import { useEffect } from 'react';

let openCount = 0;

async function applySuppression(suppressed: boolean): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { adManager } = await import('@/services/adManager');
    await adManager.setBannerSuppressed(suppressed);
  } catch { /* 웹 프리뷰 / 플러그인 없음 */ }
}

/** active 가 true 인 동안 배너를 내린다(겹쳐 열린 팝업 수를 센다). */
export function useBannerSuppression(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    openCount += 1;
    void applySuppression(true);
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) void applySuppression(false);
    };
  }, [active]);
}

/** 테스트용 — 열린 개수 확인 */
export function _bannerSuppressionOpenCountForTest(): number { return openCount; }
