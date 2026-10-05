'use client';

// ============================================================================
// 앱 안 «🎟 쿠폰 코드 입력» — 아이폰은 애플 코드 사용 시트, 안드로이드는 «앱 안 구독 결제 창» 안내 (공용, 2026-10-05 · 안드 10-06 교체)
// ----------------------------------------------------------------------------
// 부르는 곳(PRO 를 만나는 모든 지점 + 설정): 설정 › SIGNUM Pro 카드 · ProPaywall · ValueWall · 대시보드 게이트 · «내 종목» PRO 시트.
//   대표 10/5: «시그넘앱 설정 부분에 리딤코드 입력 부분을 넣어야 하는 것 아니야?» · «프로 토글 누르면 리딤 입력하는 것 있는 것처럼 — 가장 최적으로».
//
// iOS  : RevenueCat presentCodeRedemptionSheet(앱 안 시스템 시트, 이미 바이너리에 있는 플러그인 13.2.1).
//        애플 창에서 코드를 넣고 «사용»을 누르면 그 자리에서 구독이 시작된다(첫 달 무료 오퍼).
//        맞춤 코드는 «사용 URL» 또는 «앱 안»에서만 쓸 수 있다(REDEEM-CODES F1) — 앱 안 시트가 가장 확실하다.
//        실패하면(옛 바이너리·SDK 미설정) 애플 사용 URL 로 넘어간다.
// Android(2026-10-06 교체): 안내 시트(lib/app/couponGuide.ts · components/app/CouponGuideSheet) → [계속] → RevenueCat 월간 패키지 구매
//        (기존 구매 경로 useProStatus().purchase → services/revenueCat.purchasePro) → 구글 결제 창에서 결제 수단 → «코드 사용» → 번호 → «구독».
//        예전엔 play.google.com/redeem 을 열었다 — 대표 실기기(10/6 00시대): «적용»만 되고 PRO 가 안 켜졌다(Play 콘솔 1/300 사용·주문 0건).
//        구글 공식: 코드를 쓴 «뒤에도» 구독을 구매해야 한다(«they still need to purchase the subscription with the code applied») ·
//        Play 맞춤 코드는 «앱 안에서만»(«Custom codes can be redeemed only from within your app») — developer.android.com/google/play/billing/promo.
//        Play 스토어에서 이미 «적용»해 둔 코드는 앱 안 구매 때 자동 적용된다(RevenueCat google-play-offers 문서 · 구글 도움말 15698521).
// 웹    : 버튼이 안 보인다(canRedeemHere). 프리뷰 확인용으로만 기기 종류에 맞는 주소를 새 탭에.
//        프리뷰 호스트에서 ?sgandroid=1 이면 안드로이드 안내 시트를 브라우저에서 그려 본다(구매는 결제 플러그인이 없어 «실패»로 끝난다).
//
// ★ 돌아오면 PRO 를 바로 보이게 (RevenueCat 문서 확인 2026-10-05):
//   · iOS 시트: SDK 가 거래 큐에서 자동으로 집어 CustomerInfo 를 갱신한다(«we'll automatically refresh CustomerInfo»).
//   · iOS «URL» 로 쓴 경우: 문서가 «앱으로 돌아오면 syncPurchases 를 부르라»고 한다(안 그러면 복원이 필요할 수 있다).
//   · Android: 구매는 앱 안에서 끝나고 결과(CustomerInfo)가 바로 온다. 앱 «밖»(Play 스토어)에서 끝난 구매는
//     lib/app/foregroundProSync.ts 가 복귀 때 syncPurchases 로 올린다(10분에 1번 · PRO 가 아닐 때만).
//   · restorePurchases 는 쓰지 않는다 — 사용자 별칭(다른 익명 ID 로 옮김) 문제가 있고, 문서도 «사용자 동작에서만» 부르라고 한다.
//   앱 복귀(@capacitor/app appStateChange · visibilitychange)에서 invalidateCustomerInfoCache → getCustomerInfo 로 새로 읽고,
//   PRO 면 공용 상태(proEntitlement.notifyProPurchased)에 바로 알린다. useProStatus 쓰는 화면은 SDK 리스너로 같이 바뀐다.
// ============================================================================

import { initRevenueCat, isProFromCustomerInfo } from '@/services/revenueCat';
import { openExternalUrl } from '@/lib/native/capacitorBridge';
import { notifyProPurchased, isPreviewHost, previewFlag } from '@/lib/app/proEntitlement';
import { couponGuide } from '@/lib/app/couponGuide';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

export const APPLE_REDEEM_URL = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444';
/** 프리뷰 웹(안드로이드 UA)이 새 탭으로 여는 주소 · 옛 import 경로(components/app/watchlist/redeem.ts) 호환 — 앱은 더 이상 열지 않는다 */
export const PLAY_REDEEM_URL = 'https://play.google.com/redeem';

/** 같은 문구를 모든 지점에서 — «코드가 있으신가요?» 결의 작은 링크 + 설정 행 이름 */
export const REDEEM_COPY = {
  ko: { label: '🎟 쿠폰 코드 입력', ask: '코드가 있으신가요?' },
  en: { label: '🎟 Redeem a code', ask: 'Have a code?' },
  ja: { label: '🎟 クーポンコードを使う', ask: 'コードをお持ちですか？' },
} as const;
export function redeemCopy(locale: string) {
  return REDEEM_COPY[locale === 'ko' || locale === 'ja' ? locale : 'en'];
}

/** sheet = iOS 애플 시트 · url = iOS 애플 사용 URL · guide = 안드로이드 안내 시트(→ 앱 안 구독 결제 창) · web = 프리뷰 새 탭 */
export type RedeemPath = 'sheet' | 'url' | 'guide' | 'web';

function platformOf(): 'ios' | 'android' | 'web' {
  try {
    const cap = require('@capacitor/core').Capacitor;
    if (cap?.isNativePlatform?.()) return cap.getPlatform() === 'ios' ? 'ios' : 'android';
  } catch { /* web */ }
  // 프리뷰 호스트(*.vercel.app·localhost)에서만 켜지는 확인용 — 운영 도메인에선 previewFlag 가 항상 false
  if (previewFlag('sgandroid')) return 'android';
  return 'web';
}

/** 지금 안드로이드 앱(또는 프리뷰의 안드로이드 확인 모드)인가 — 설정 행 아래 안내 줄(«결제 창에서 코드 입력 → 구독»)을 고른다 */
export function redeemIsAndroid(): boolean {
  return platformOf() === 'android';
}

// 퍼널 측정 모듈은 동적 import(첫 화면 번들에 싣지 않는다). 실패해도 코드 입력과 무관.
const funnel = () => import('@/lib/app/funnel');

// ── 돌아왔을 때 PRO 새로 읽기(iOS) ───────────────────────────────────────────
const RETURN_WINDOW_MS = 30 * 60_000;   // 코드 입력을 연 뒤 30분 안의 «앱 복귀»만 본다
let pending: { path: 'sheet' | 'url'; at: number; src?: FunnelSrc } | null = null;
let listening = false;
let refreshing = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 코드·구매 뒤 PRO 확인 — 순서는 위 머리말 그대로(시험용으로 단계를 주입할 수 있게 deps 를 받는다).
 *   ① 캐시 무효화 → getCustomerInfo ② (iOS URL 경로) syncPurchases → 다시 ③ 3초·8초 뒤 다시
 *   안드로이드 안내 시트도 «결제는 됐는데 권한이 아직»(noent)일 때 'sheet' 순서로 다시 읽는다(lib/app/couponGuide.ts).
 */
export async function refreshProAfterRedeem(path: 'sheet' | 'url', deps?: {
  check: () => Promise<boolean>;
  sync: () => Promise<void>;
  wait?: (ms: number) => Promise<void>;
}): Promise<boolean> {
  let d = deps;
  if (!d) {
    if (!(await initRevenueCat())) return false;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    d = {
      check: async () => {
        try { await Purchases.invalidateCustomerInfoCache(); } catch { /* 없어도 다음 줄은 돈다 */ }
        try {
          const { customerInfo } = await Purchases.getCustomerInfo();
          return isProFromCustomerInfo(customerInfo);
        } catch { return false; }
      },
      sync: async () => { try { await Purchases.syncPurchases(); } catch { /* 무해 */ } },
    };
  }
  const wait = d.wait ?? sleep;
  if (await d.check()) return true;
  if (path === 'url') {
    await d.sync();
    if (await d.check()) return true;
  }
  for (const ms of [3000, 8000]) {
    await wait(ms);
    if (await d.check()) return true;
  }
  return false;
}

function onAppActive() {
  const p = pending;
  if (!p || refreshing) return;
  if (Date.now() - p.at > RETURN_WINDOW_MS) { pending = null; return; }
  pending = null;
  refreshing = true;
  void refreshProAfterRedeem(p.path)
    .then((pro) => {
      if (!pro) return;
      notifyProPurchased(true);
      void funnel().then((m) => m.trackFunnel('code_pro', { src: p.src })).catch(() => {});
    })
    .catch(() => {})
    .finally(() => { refreshing = false; });
}

function armReturn(path: 'sheet' | 'url', src?: FunnelSrc) {
  pending = { path, at: Date.now(), src };
  if (listening || typeof window === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onAppActive(); });
  void import('@capacitor/app')
    .then(({ App }) => App.addListener('appStateChange', (s: { isActive: boolean }) => { if (s?.isActive) onAppActive(); }))
    .catch(() => { /* 웹·플러그인 없음 — visibilitychange 만 */ });
}

/**
 * 코드 입력 열기. src = 누른 자리(퍼널 측정 — 설정·페이월·가치 벽·게이트·«내 종목» 시트), locale = 안내 시트 언어(없으면 화면 경로의 언어).
 * 어떤 경로로 열었는지 돌려준다.
 */
export async function openRedeem(src?: FunnelSrc, locale?: string): Promise<RedeemPath> {
  void funnel().then((m) => m.trackFunnel('code_open', { src })).catch(() => {});
  const p = platformOf();
  if (p === 'ios') {
    try {
      if (await initRevenueCat()) {
        const { Purchases } = await import('@revenuecat/purchases-capacitor');
        armReturn('sheet', src);
        await Purchases.presentCodeRedemptionSheet();
        return 'sheet';
      }
    } catch { /* 플러그인에 메서드가 없는 빌드 — URL 로 */ }
    armReturn('url', src);
    void openExternalUrl(APPLE_REDEEM_URL);
    return 'url';
  }
  if (p === 'android') {
    // 안내 시트 → [계속] → 앱 안 구독 결제 창(코드 사용 → 구독). 구매·계측·PRO 갱신은 시트가 맡는다(components/app/CouponGuideSheet).
    couponGuide.open({ src, locale });
    return 'guide';
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  window.open(/iPhone|iPad|iPod/i.test(ua) ? APPLE_REDEEM_URL : PLAY_REDEEM_URL, '_blank', 'noopener');
  return 'web';
}

/** 코드 입력 버튼을 보일 수 있는 곳인가(네이티브 — 웹에선 코드를 쓸 곳이 없다) */
export function canRedeemHere(): boolean {
  return platformOf() !== 'web';
}

/** 화면 확인용 — 네이티브이거나 프리뷰 호스트(*.vercel.app·localhost)면 보인다. 운영 웹(signumhq.com)에서는 절대 안 보인다. */
export function showRedeemEntry(): boolean {
  return canRedeemHere() || isPreviewHost();
}
