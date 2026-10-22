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
//   ★2026-10-23 결제 안전(10/19 뽐뿌 «쿠폰 쓰려다 결제됐다»): 이 시트에는 «구매 단추가 없다» — 구매(purchasePackage)를 부르는 길 0.
//     ① Play 코드 등록 화면을 연다 → 앱으로 돌아오면 RevenueCat 고객 정보를 새로 읽는다(syncPurchases 포함 — redeem.ts 'url' 순서)
//     → PRO 활성이면 «적용됨», 아니면 «아직 적용되지 않았습니다». 등록 화면 열기/복귀·프로모션 날짜는 적용 증거가 아니다.
//     구독 구매는 일반 페이월(ProPaywall)만 한다 — 쿠폰 흐름과 분리.
// 그리는 곳: components/app/CouponGuideHost(앱 레이아웃 app-view/layout.tsx 에 하나) → 열릴 때만 CouponGuideSheet 를 불러온다.
// 아이폰은 바뀌지 않는다 — RevenueCat presentCodeRedemptionSheet(애플 창의 «사용» = 구독 시작, lib/app/redeem.ts).
// ============================================================================

import { useSyncExternalStore } from 'react';
import { PLAY_PROMO_END } from '@/lib/marketing/coupon';
import { COUPON_CHECK_PRO, COUPON_SAFETY } from '@/lib/marketing/couponSafety';
import type { ExternalUrlOpenResult } from '@/lib/native/capacitorBridge';
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
  /** ① Play 코드 등록 → ② 등록 후 앱에서 PRO 확인(웹 쿠폰 화면 ② 와 같은 말 — COUPON_CHECK_PRO) */
  steps: [string, string];
  /** Play 스토어에서 이미 «적용»해 둔 코드 — 결제 창에서 자동 적용(RevenueCat·구글 도움말) */
  saved: string;
  /** 기존 웹 안내의 ① 등록 단추. 구매와 별도 동작. */
  redeemCta: string;
  redeemUnavailable: string;
  warning: string;
  /** 큰 줄 — 적용을 단정하지 않고 결제 창의 무료 표시를 조건으로 삼는다. */
  freeHead: string;
  /** 작은 줄 — «이후 월 ₩11,900 자동 갱신»(가격은 스토어 문자열) */
  after: (price: string) => string;
  /** 결제 전 필수 고지 — 결제 수단 필요(구글 «A valid form of payment is required») · 해지하면 0원 · 해지 위치 */
  fine: string;
  /** 복귀 뒤 RevenueCat 확인 중(등록 단추 자리) */
  busy: string;
  close: string;
  unavailable: string;
  /** 복귀 뒤 RevenueCat 고객 정보가 PRO 활성 */
  applied: string;
  /** 복귀 뒤 PRO 아님 — 결제로 넘기지 않고 등록 화면으로 되돌린다 */
  notApplied: string;
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
        'Play 스토어 → 결제 및 정기 결제 → 코드 사용',
        COUPON_CHECK_PRO.ko,
      ],
      saved: 'Play 스토어에서 이미 적용한 쿠폰은 결제 창에 바로 보입니다',
      redeemCta: '① Play 스토어에서 적용',
      redeemUnavailable: '코드 등록 화면을 열 수 없습니다 — Play 스토어 앱에서 직접 등록',
      warning: COUPON_SAFETY.ko,
      freeHead: d ? `${d}일 무료가 보이면 «구독»` : '무료 기간이 보이면 «구독»',
      after: (p) => `이후 월 ${p} 자동 갱신`,
      fine: d ? `구글 결제 수단이 필요합니다 · ${d}일 안에 해지하면 0원 · 해지는 Play 스토어 → 결제 및 정기 결제에서` : '구글 결제 수단이 필요합니다 · 무료 기간 안에 해지하면 0원 · 해지는 Play 스토어 → 결제 및 정기 결제에서',
      busy: '처리 중…',
      close: '닫기',
      unavailable: '지금은 구매할 수 없습니다',
      applied: '적용됨',
      notApplied: '아직 적용되지 않았습니다 — 등록 화면에서 코드를 입력해 주세요',
      pricePlaceholder: '스토어 현지 가격',
      settingsSub: 'Play 스토어 → 결제 및 정기 결제 → 코드 사용',
    };
  }
  if (loc === 'ja') {
    return {
      eyebrow: 'SIGNUM PRO',
      title: '🎟 クーポンコードでPROを始める',
      lede: d ? `クーポンは定期購入の最初の${d}日間が無料です。「定期購入」まで押すとPROが有効になります。` : 'クーポンで定期購入の無料期間が付きます。「定期購入」まで押すとPROが有効になります。',
      steps: [
        'Playストア → お支払いと定期購入 → コードを利用',
        COUPON_CHECK_PRO.ja,
      ],
      saved: 'Playストアで適用済みのクーポンは、購入画面に表示されます',
      redeemCta: '① Playストアで適用',
      redeemUnavailable: 'コード登録画面を開けません — Playストアアプリで直接登録してください',
      warning: COUPON_SAFETY.ja,
      freeHead: d ? `${d}日間無料と表示されたら「定期購入」` : '無料期間が表示されたら「定期購入」',
      after: (p) => `以降は月額${p}で自動更新`,
      fine: d ? `Googleのお支払い方法が必要です・${d}日以内に解約すれば0円・解約はPlayストア → お支払いと定期購入から` : 'Googleのお支払い方法が必要です・無料期間内に解約すれば0円・解約はPlayストア → お支払いと定期購入から',
      busy: '処理中…',
      close: '閉じる',
      unavailable: '現在購入できません',
      applied: '適用済み',
      notApplied: 'まだ適用されていません — 登録画面でコードを入力してください',
      pricePlaceholder: 'ストア価格',
      settingsSub: 'Playストア → お支払いと定期購入 → コードを利用',
    };
  }
  return {
    eyebrow: 'SIGNUM PRO',
    title: '🎟 Start PRO with your code',
    lede: d ? `Your code gives you the first ${d} days of the subscription free. PRO starts only after you tap “Subscribe”.` : 'Your code gives you a free trial on the subscription. PRO starts only after you tap “Subscribe”.',
    steps: [
      'Play Store → Payments & subscriptions → Redeem code',
      COUPON_CHECK_PRO.en,
    ],
    saved: 'Already applied your code in the Play Store? It shows at checkout.',
    redeemCta: '① Apply in Play Store',
    redeemUnavailable: 'Cannot open the code redemption screen — redeem directly in the Play Store app',
    warning: COUPON_SAFETY.en,
    freeHead: d ? `When ${d} days free shows, tap “Subscribe”` : 'When the free trial shows, tap “Subscribe”',
    after: (p) => `then ${p}/mo, auto-renews`,
    fine: d ? `A Google payment method is required · Cancel within ${d} days and pay nothing · Cancel in Play Store → Payments & subscriptions` : 'A Google payment method is required · Cancel during the trial and pay nothing · Cancel in Play Store → Payments & subscriptions',
    busy: 'Working…',
    close: 'Close',
    unavailable: 'Not available right now',
    applied: 'Applied',
    notApplied: 'Not applied yet — enter your code on the redemption screen',
    pricePlaceholder: 'store price',
    settingsSub: 'Play Store → Payments & subscriptions → Redeem code',
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

// ── ① 등록 화면 열기 → 복귀 → PRO 확인(순수 — 시험은 단계를 주입한다) ─────────────────
//   구매 함수를 받지 않는다 — 이 흐름에서 purchasePackage 로 가는 길은 구조적으로 없다.
//   idle → opening → waiting(등록 화면에 나가 있음) → checking(돌아옴 · RevenueCat 다시 읽기) → applied | not_applied
//   열기 실패(open_failed)는 지정 안내 한 줄. 다시 누르면 처음부터(이전 확인 결과는 재사용하지 않는다).
export type CouponRedeemPhase = 'idle' | 'opening' | 'waiting' | 'checking' | 'applied' | 'not_applied' | 'open_failed';

export interface CouponRedeemFlow {
  readonly phase: CouponRedeemPhase;
  /** ① 단추 — 등록 화면을 연다 */
  start(): Promise<void>;
  /** 앱이 가려짐(appStateChange 비활성·visibilitychange hidden) */
  away(): void;
  /** 앱으로 돌아옴(appStateChange 활성·visibilitychange visible) — 가려진 적이 있을 때만 PRO 를 다시 읽는다 */
  back(): Promise<void>;
}

export function couponRedeemFlow(deps: {
  open: () => Promise<ExternalUrlOpenResult>;
  /** 돌아온 뒤 PRO 활성인가 — RevenueCat 캐시 무효화 → syncPurchases → getCustomerInfo (redeem.ts refreshProAfterRedeem('url')) */
  checkPro: () => Promise<boolean>;
  notifyPro: () => void;
  onPhase: (phase: CouponRedeemPhase) => void;
  track?: (stage: 'code_cta' | 'code_pro') => void;
}): CouponRedeemFlow {
  let phase: CouponRedeemPhase = 'idle';
  let wentAway = false;
  let run = 0;
  const set = (p: CouponRedeemPhase) => { phase = p; try { deps.onPhase(p); } catch { /* 화면 갱신 실패는 흐름과 무관 */ } };
  const tr = (st: 'code_cta' | 'code_pro') => { try { deps.track?.(st); } catch { /* 계측 실패 무시 */ } };
  return {
    get phase() { return phase; },
    async start() {
      if (phase === 'opening' || phase === 'checking' || phase === 'applied') return;
      const my = ++run;
      wentAway = false;
      set('opening');
      tr('code_cta');
      let r: ExternalUrlOpenResult;
      try { r = await deps.open(); } catch { r = 'failed'; }
      if (my !== run) return;   // 열리는 사이 이미 돌아왔다(back — run 증가) — 그 결과를 따른다
      set(r === 'failed' ? 'open_failed' : 'waiting');
    },
    away() {
      // 확인 중·«아직» 상태에서도 센다 — 사용자가 다시 Play 스토어에 다녀오면 돌아올 때 한 번 더 읽는다
      if (phase === 'opening' || phase === 'waiting' || phase === 'checking' || phase === 'not_applied') wentAway = true;
    },
    async back() {
      if (phase !== 'opening' && phase !== 'waiting' && phase !== 'not_applied') return;
      if (!wentAway) return;   // 나간 적 없는 «보임» 신호는 복귀가 아니다
      wentAway = false;
      const my = ++run;
      set('checking');
      let pro = false;
      try { pro = (await deps.checkPro()) === true; } catch { pro = false; }
      if (my !== run) return;
      if (pro) { try { deps.notifyPro(); } catch { /* noop */ } tr('code_pro'); set('applied'); }
      else set('not_applied');
    },
  };
}
