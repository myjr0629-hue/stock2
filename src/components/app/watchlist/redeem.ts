'use client';

// ============================================================================
// «코드 입력» — 스토어의 오퍼 코드 사용 화면을 연다
// ----------------------------------------------------------------------------
// iOS  : RevenueCat SDK 의 presentCodeRedemptionSheet(앱 안 시스템 시트, 이미 바이너리에 있는 플러그인).
//        맞춤 코드는 «사용 URL» 또는 «앱 안»에서만 쓸 수 있다(REDEEM-CODES F1) — 앱 안 시트가 가장 확실하다.
//        실패하면(옛 바이너리·SDK 미설정) 애플 사용 URL 로 넘어간다.
// Android: play.google.com/redeem — 웹뷰를 그 주소로 보내면 Capacitor 가 허용 목록 밖 호스트를
//        시스템(Play 스토어 앱의 앱 링크)으로 넘긴다. 앱이 백그라운드로 가지 않으면 인앱 브라우저로 폴백.
// 웹    : 호출하지 않는다(버튼이 안 보인다). 프리뷰 확인용으로만 기기 종류에 맞는 주소를 새 탭에.
// ============================================================================

import { initRevenueCat } from '@/services/revenueCat';
import { openExternalUrl } from '@/lib/native/capacitorBridge';

export const APPLE_REDEEM_URL = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444';
export const PLAY_REDEEM_URL = 'https://play.google.com/redeem';

function platformOf(): 'ios' | 'android' | 'web' {
  try {
    const cap = require('@capacitor/core').Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform() === 'ios' ? 'ios' : 'android';
  } catch { /* web */ }
  return 'web';
}

/** 앱이 밖(스토어)으로 나갔는지 보고, 안 나갔으면 인앱 브라우저로 */
function openViaSystem(url: string) {
  let left = false;
  const onVis = () => { if (document.visibilityState === 'hidden') left = true; };
  document.addEventListener('visibilitychange', onVis);
  try {
    window.location.href = url;
  } catch {
    document.removeEventListener('visibilitychange', onVis);
    void openExternalUrl(url);
    return;
  }
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onVis);
    if (!left) void openExternalUrl(url);
  }, 1500);
}

export async function openRedeem(): Promise<void> {
  const p = platformOf();
  if (p === 'ios') {
    try {
      if (await initRevenueCat()) {
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        await Purchases.presentCodeRedemptionSheet();
        return;
      }
    } catch { /* 플러그인에 메서드가 없는 빌드 — URL 로 */ }
    void openExternalUrl(APPLE_REDEEM_URL);
    return;
  }
  if (p === 'android') {
    openViaSystem(PLAY_REDEEM_URL);
    return;
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  window.open(/iPhone|iPad|iPod/i.test(ua) ? APPLE_REDEEM_URL : PLAY_REDEEM_URL, '_blank', 'noopener');
}

/** 코드 입력 버튼을 보일 수 있는 곳인가(네이티브 — 웹에선 코드를 쓸 곳이 없다) */
export function canRedeemHere(): boolean {
  return platformOf() !== 'web';
}
