// ============================================================================
// 안드로이드 «🎟 쿠폰 코드 입력» 안내 시트 — 상태 · 문구 · 구매 순서 (2026-10-06)
// ----------------------------------------------------------------------------
// 왜(운영 실측 10/6 00시대): 대표가 안드 1.3.2 에서 Play 스토어 «코드 사용»에 일회용 번호를 넣었다 → «적용»만 되고 PRO 는 안 켜졌다.
//   Play 콘솔 일회용 프로모션 1/300 사용 · 주문 0건 · RevenueCat 체험 0. 쿠폰 = «구독 첫 30일 무료»라서 코드 적용 «뒤에» 구독 구매까지 해야 한다.
//   · 구글 공식(developer.android.com/google/play/billing/promo): «After the user redeems the code, they still need to purchase the
//     subscription with the code applied. A valid form of payment is required» · «Custom codes can be redeemed only from within your app,
//     while one-time codes can be redeemed through both your app and the Play store.» · 앱 안 사용 = 구글 결제 창에서 결제 수단 → Redeem.
//   · 구글 도움말(support.google.com/googleplay/answer/15698521): «Before you pay, tap the payment method. Tap Redeem code. Enter your code.
//     Complete the purchase.» · 저장된 혜택은 «when you make an eligible purchase, it'll automatically apply».
//   · RevenueCat(revenuecat.com/docs/subscription-guidance/subscription-offers/google-play-offers): «Any codes that have been redeemed in
//     the Google Play Store, but not redeemed in the app will stay active until the promotion ends.» · «The code will then be applied when
//     the user selects the subscription or In-App product they want to purchase.»
//   · 해지: 구글 도움말(support.google.com/googleplay/answer/2476088) «To avoid charges, cancel the subscription before the trial period expires.»
//   그래서 안드로이드의 «쿠폰 코드 입력»은 Play 코드 사용 화면 대신 «앱 안 구독 결제 창»으로 간다:
//     안내 시트(이 파일의 문구) → [계속] → 기존 구매 경로(useProStatus().purchase → services/revenueCat.purchasePro, RevenueCat 월간 패키지)
//     → 구글 결제 창에서 결제 수단 → «코드 사용» → 번호 → «구독»(Play 에서 이미 적용한 코드는 자동 적용) → PRO.
// 그리는 곳: components/app/CouponGuideHost(앱 레이아웃 app-view/layout.tsx 에 하나) → 열릴 때만 CouponGuideSheet 를 불러온다.
// 아이폰은 바뀌지 않는다 — RevenueCat presentCodeRedemptionSheet(애플 창의 «사용» = 구독 시작, lib/app/redeem.ts).
// ============================================================================

import { useSyncExternalStore } from 'react';
import { PLAY_PROMO_END } from '@/lib/marketing/coupon';
import type { FunnelSrc } from '@/lib/app/funnelSchema';

export type CgLocale = 'ko' | 'en' | 'ja';
export const toCgLocale = (l: string | null | undefined): CgLocale => (l === 'ko' || l === 'ja' ? l : 'en');

/** Play 프로모션(맞춤 코드 · 일회용 300장)이 주는 무료 체험 일수 — Play 콘솔 설정(30일). 종료(PLAY_PROMO_END) 뒤엔 일수를 말하지 않는다. */
export const PLAY_FREE_DAYS = 30;
export function freeDaysNow(now = Date.now()): number | null {
  return now < PLAY_PROMO_END ? PLAY_FREE_DAYS : null;
}

// ── 문구(한·영·일) ────────────────────────────────────────────────────────────
//   단추 이름은 구글 결제 창·Play 스토어의 표기를 따른다: 결제 수단 → «코드 사용»(ja «コードを利用» · en «Redeem code») → «구독»(ja «定期購入» · en «Subscribe»).
//   가격은 스토어가 준 현지화 문자열(offers[].priceString)만 넣는다 — 여기서 만들지 않는다(ProPaywall 과 같은 규칙).
export interface CouponGuideCopy {
  eyebrow: string;
  title: string;
  lede: string;
  steps: [string, string, string];
  /** Play 스토어에서 이미 «적용»해 둔 코드 — 결제 창에서 자동 적용(RevenueCat·구글 도움말) */
  saved: string;
  /** 큰 줄 — «첫 30일 0원» */
  freeHead: string;
  /** 작은 줄 — «이후 월 ₩11,900 자동 갱신»(가격은 스토어 문자열) */
  after: (price: string) => string;
  /** 결제 전 필수 고지 — 결제 수단 필요(구글 «A valid form of payment is required») · 해지하면 0원 · 해지 위치 */
  fine: string;
  cta: string;
  busy: string;
  close: string;
  unavailable: string;
  failed: string;
  /** 결제는 됐는데 권한이 아직 안 보일 때(3초·8초 다시 읽은 뒤) */
  pending: string;
  /** 프리뷰(브라우저)에서 가격 자리 */
  pricePlaceholder: string;
  /** 설정 «🎟 쿠폰 코드 입력» 행 아래 한 줄(안드로이드만) */
  settingsSub: string;
}

export function couponGuideCopy(locale: string, now = Date.now()): CouponGuideCopy {
  const d = freeDaysNow(now);
  const loc = toCgLocale(locale);
  if (loc === 'ko') {
    return {
      eyebrow: 'SIGNUM PRO',
      title: '🎟 쿠폰 코드로 PRO 시작',
      lede: d ? `쿠폰은 구독 첫 ${d}일 무료입니다. «구독»까지 눌러야 PRO가 켜집니다.` : '쿠폰은 구독 무료 기간을 줍니다. «구독»까지 눌러야 PRO가 켜집니다.',
      steps: [
        '[계속]을 누르면 구글 결제 창이 열립니다',
        '결제 수단을 눌러 «코드 사용» → 쿠폰 번호 입력',
        d ? `${d}일 무료가 보이면 «구독»` : '무료 기간이 보이면 «구독»',
      ],
      saved: 'Play 스토어에서 이미 적용한 쿠폰은 2번 없이 결제 창에 바로 보입니다',
      freeHead: d ? `첫 ${d}일 0원` : '무료 기간 0원',
      after: (p) => `이후 월 ${p} 자동 갱신`,
      fine: d ? `구글 결제 수단이 필요합니다 · ${d}일 안에 해지하면 0원 · 해지는 Play 스토어 → 결제 및 정기 결제에서` : '구글 결제 수단이 필요합니다 · 무료 기간 안에 해지하면 0원 · 해지는 Play 스토어 → 결제 및 정기 결제에서',
      cta: '계속',
      busy: '처리 중…',
      close: '닫기',
      unavailable: '지금은 구매할 수 없습니다',
      failed: '실패했습니다. 잠시 후 다시 시도해 주세요',
      pending: '구매가 확인되면 PRO가 켜집니다 — 앱을 다시 열면 바로 반영됩니다',
      pricePlaceholder: '스토어 현지 가격',
      settingsSub: d ? `결제 창에서 코드 입력 → «구독» · 첫 ${d}일 0원` : '결제 창에서 코드 입력 → «구독»',
    };
  }
  if (loc === 'ja') {
    return {
      eyebrow: 'SIGNUM PRO',
      title: '🎟 クーポンコードでPROを始める',
      lede: d ? `クーポンは定期購入の最初の${d}日間が無料です。「定期購入」まで押すとPROが有効になります。` : 'クーポンで定期購入の無料期間が付きます。「定期購入」まで押すとPROが有効になります。',
      steps: [
        '「続ける」でGoogle Playの購入画面が開きます',
        'お支払い方法をタップ →「コードを利用」→ クーポンコードを入力',
        d ? `${d}日間無料と表示されたら「定期購入」` : '無料期間が表示されたら「定期購入」',
      ],
      saved: 'Playストアで適用済みのクーポンは、2なしで購入画面に表示されます',
      freeHead: d ? `最初の${d}日間0円` : '無料期間は0円',
      after: (p) => `以降は月額${p}で自動更新`,
      fine: d ? `Googleのお支払い方法が必要です・${d}日以内に解約すれば0円・解約はPlayストア → お支払いと定期購入から` : 'Googleのお支払い方法が必要です・無料期間内に解約すれば0円・解約はPlayストア → お支払いと定期購入から',
      cta: '続ける',
      busy: '処理中…',
      close: '閉じる',
      unavailable: '現在購入できません',
      failed: '失敗しました。しばらくしてからお試しください',
      pending: '購入が確認されるとPROが有効になります — アプリを開き直すとすぐ反映されます',
      pricePlaceholder: 'ストア価格',
      settingsSub: d ? `購入画面でコード入力 →「定期購入」・最初の${d}日間0円` : '購入画面でコード入力 →「定期購入」',
    };
  }
  return {
    eyebrow: 'SIGNUM PRO',
    title: '🎟 Start PRO with your code',
    lede: d ? `Your code gives you the first ${d} days of the subscription free. PRO starts only after you tap “Subscribe”.` : 'Your code gives you a free trial on the subscription. PRO starts only after you tap “Subscribe”.',
    steps: [
      'Tap Continue to open Google Play checkout',
      'Tap the payment method → “Redeem code” → enter your code',
      d ? `When ${d} days free shows, tap “Subscribe”` : 'When the free trial shows, tap “Subscribe”',
    ],
    saved: 'Already applied your code in the Play Store? It shows at checkout without step 2.',
    freeHead: d ? `First ${d} days free` : 'Free during the trial',
    after: (p) => `then ${p}/mo, auto-renews`,
    fine: d ? `A Google payment method is required · Cancel within ${d} days and pay nothing · Cancel in Play Store → Payments & subscriptions` : 'A Google payment method is required · Cancel during the trial and pay nothing · Cancel in Play Store → Payments & subscriptions',
    cta: 'Continue',
    busy: 'Working…',
    close: 'Close',
    unavailable: 'Not available right now',
    failed: 'Something went wrong. Please try again',
    pending: 'PRO turns on once Google confirms the purchase — reopening the app picks it up',
    pricePlaceholder: 'store price',
    settingsSub: d ? `Enter it at checkout → “Subscribe” · first ${d} days free` : 'Enter it at checkout → “Subscribe”',
  };
}

// ── 시트 열림 상태(앱 전체에 하나) ─────────────────────────────────────────────
export interface CouponGuideRequest {
  id: number;
  src?: FunnelSrc;
  locale: CgLocale;
  /** 닫힐 때 초점을 돌려줄 요소(누른 단추) */
  trigger: HTMLElement | null;
}

let state: CouponGuideRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => { try { l(); } catch { /* noop */ } }); }

export const couponGuide = {
  open(opts: { src?: FunnelSrc; locale?: string | null; trigger?: HTMLElement | null } = {}): CouponGuideRequest {
    state = {
      id: ++seq,
      src: opts.src,
      locale: toCgLocale(opts.locale ?? pageLocale()),
      trigger: opts.trigger ?? focusedElement(),
    };
    emit();
    return state;
  },
  close(id?: number) {
    if (!state || (id != null && state.id !== id)) return;
    state = null;
    emit();
  },
  getSnapshot(): CouponGuideRequest | null { return state; },
  subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; },
};

export function useCouponGuide(): CouponGuideRequest | null {
  return useSyncExternalStore(couponGuide.subscribe, couponGuide.getSnapshot, () => null);
}

/** 누른 단추(닫힌 뒤 초점을 돌려줄 곳) — 문서가 없거나(서버·시험) body 면 없음 */
function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return null;
  const a = document.activeElement;
  return a instanceof HTMLElement && a !== document.body ? a : null;
}

/** 지금 화면의 언어(/ko/app-view/… 의 첫 칸) — 부르는 쪽이 언어를 안 넘겼을 때만 */
function pageLocale(): CgLocale {
  try {
    const seg = (window.location.pathname.split('/')[1] || '').toLowerCase();
    return toCgLocale(seg);
  } catch { return 'en'; }
}

// ── [계속] 뒤의 순서(순수 — 시험은 단계를 주입한다) ─────────────────────────────
export type CouponBuyResult = 'pro' | 'pending' | 'cancelled' | 'error';
export type BuyOutcome = { ok: boolean; isPro: boolean; cancelled?: boolean; error?: string };

/**
 * ① code_cta 계측 ② 구매(기존 경로 — 결과 buy_* 는 useProStatus 가 센다) ③ PRO 면 공용 상태에 바로 알리고 code_pro
 * ④ 결제는 됐는데 권한이 아직이면(noent) 다시 읽기(lib/app/redeem.ts refreshProAfterRedeem('sheet') — 3초·8초) ⑤ 취소는 조용히 · 실패는 실패.
 */
export async function runCouponPurchase(deps: {
  purchase: () => Promise<BuyOutcome>;
  recheck: () => Promise<boolean>;
  notifyPro: () => void;
  track: (stage: 'code_cta' | 'code_pro') => void;
}): Promise<CouponBuyResult> {
  deps.track('code_cta');
  let r: BuyOutcome;
  try { r = await deps.purchase(); } catch { return 'error'; }
  if (r.ok && r.isPro) { deps.notifyPro(); deps.track('code_pro'); return 'pro'; }
  if (r.ok) {
    let pro = false;
    try { pro = await deps.recheck(); } catch { pro = false; }
    if (pro) { deps.notifyPro(); deps.track('code_pro'); return 'pro'; }
    return 'pending';
  }
  if (r.cancelled) return 'cancelled';
  return 'error';
}
