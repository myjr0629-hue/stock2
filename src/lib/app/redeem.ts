'use client';

// ============================================================================
// 앱 안 «🎟 쿠폰 코드 입력» — 스토어의 코드 사용 화면을 연다 (공용, 2026-10-05 components/app/watchlist/redeem.ts 에서 옮김)
// ----------------------------------------------------------------------------
// 부르는 곳(PRO 를 만나는 모든 지점 + 설정): 설정 › SIGNUM Pro 카드 · ProPaywall · ValueWall · 대시보드 게이트 · «내 종목» PRO 시트.
//   대표 10/5: «시그넘앱 설정 부분에 리딤코드 입력 부분을 넣어야 하는 것 아니야?» · «프로 토글 누르면 리딤 입력하는 것 있는 것처럼 — 가장 최적으로».
//
// iOS  : RevenueCat presentCodeRedemptionSheet(앱 안 시스템 시트, 이미 바이너리에 있는 플러그인 13.2.1).
//        맞춤 코드는 «사용 URL» 또는 «앱 안»에서만 쓸 수 있다(REDEEM-CODES F1) — 앱 안 시트가 가장 확실하다.
//        실패하면(옛 바이너리·SDK 미설정) 애플 사용 URL 로 넘어간다.
// Android: play.google.com/redeem — 웹뷰를 그 주소로 보내면 Capacitor 가 허용 목록 밖 호스트를
//        시스템(Play 스토어 앱의 앱 링크)으로 넘긴다. 앱이 백그라운드로 가지 않으면 인앱 브라우저로 폴백.
// 웹    : 버튼이 안 보인다(canRedeemHere). 프리뷰 확인용으로만 기기 종류에 맞는 주소를 새 탭에.
//
// ★ 돌아오면 PRO 를 바로 보이게 (RevenueCat 문서 확인 2026-10-05):
//   · iOS 시트: SDK 가 거래 큐에서 자동으로 집어 CustomerInfo 를 갱신한다(«we'll automatically refresh CustomerInfo»).
//   · iOS «URL» 로 쓴 경우: 문서가 «앱으로 돌아오면 syncPurchases 를 부르라»고 한다(안 그러면 복원이 필요할 수 있다).
//   · Android: SDK 가 앱이 앞으로 올 때 Play 구매를 조회해 아직 안 보낸 구매를 올린다(purchases-android onAppForegrounded →
//     syncPendingPurchaseQueue). 그래도 몇 초 안에 PRO 가 아니면 «필요할 때만» syncPurchases 한 번.
//   · restorePurchases 는 쓰지 않는다 — 사용자 별칭(다른 익명 ID 로 옮김) 문제가 있고, 문서도 «사용자 동작에서만» 부르라고 한다.
//   앱 복귀(@capacitor/app appStateChange · visibilitychange)에서 invalidateCustomerInfoCache → getCustomerInfo 로 새로 읽고,
//   PRO 면 공용 상태(proEntitlement.notifyProPurchased)에 바로 알린다. useProStatus 쓰는 화면은 SDK 리스너로 같이 바뀐다.
// ============================================================================

import { initRevenueCat, isProFromCustomerInfo } from '@/services/revenueCat';
import { openExternalUrl } from '@/lib/native/capacitorBridge';
import { notifyProPurchased, isPreviewHost } from '@/lib/app/proEntitlement';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

export const APPLE_REDEEM_URL = 'https://apps.apple.com/redeem?ctx=offercodes&id=6783130444';
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

export type RedeemPath = 'sheet' | 'url' | 'play' | 'web';

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

// 퍼널 측정 모듈은 동적 import(첫 화면 번들에 싣지 않는다). 실패해도 코드 입력과 무관.
const funnel = () => import('@/lib/app/funnel');

// ── 돌아왔을 때 PRO 새로 읽기 ─────────────────────────────────────────────────
const RETURN_WINDOW_MS = 30 * 60_000;   // 코드 입력을 연 뒤 30분 안의 «앱 복귀»만 본다
let pending: { path: RedeemPath; at: number; src?: FunnelSrc } | null = null;
let listening = false;
let refreshing = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 코드 사용 뒤 PRO 확인 — 순서는 위 머리말 그대로(시험용으로 단계를 주입할 수 있게 deps 를 받는다).
 *   ① 캐시 무효화 → getCustomerInfo ② (iOS URL 경로) syncPurchases → 다시 ③ 3초·8초 뒤 다시 ④ (안드) 그래도 아니면 syncPurchases 한 번
 */
export async function refreshProAfterRedeem(path: RedeemPath, deps?: {
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
  if (path === 'play') {
    await d.sync();
    return d.check();
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

function armReturn(path: RedeemPath, src?: FunnelSrc) {
  pending = { path, at: Date.now(), src };
  if (listening || typeof window === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onAppActive(); });
  void import('@capacitor/app')
    .then(({ App }) => App.addListener('appStateChange', (s: { isActive: boolean }) => { if (s?.isActive) onAppActive(); }))
    .catch(() => { /* 웹·플러그인 없음 — visibilitychange 만 */ });
}

/** 코드 입력 열기. src = 누른 자리(퍼널 측정 — 설정·페이월·가치 벽·게이트·«내 종목» 시트). 어떤 경로로 열었는지 돌려준다. */
export async function openRedeem(src?: FunnelSrc): Promise<RedeemPath> {
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
    armReturn('play', src);
    openViaSystem(PLAY_REDEEM_URL);
    return 'play';
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
