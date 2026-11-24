// ============================================================================
// 안드로이드 블랙프라이데이 «진짜 할인» (2026-11-24 오후 — 대표 «된다고 판단되면 그냥 하도록») — 순수 모듈(화면·서비스·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜: iOS 는 11/22 블프 오퍼 코드(연간 첫 1년 50% · 월간 첫 3개월 50%)가 있는데 Play 에는 «할인 코드»가 없어 안드로이드 사용자는 블프 할인이 0 이었다.
// Play 설정(signum-work/2026-11-24/android-bf/RESULT.md):
//   · 연간 com.signumhq.app.pro.annual › 기본 요금제 annual › «개발자 결정» 오퍼 `bf-annual-50` — 단일 결제 1년 · 전 지역 50%(KRW 44,500 · USD 37.50 · JPY 6,550)
//     · 태그 rc-ignore-offer(RevenueCat 기본 옵션 자동 선택에서 빠짐 → 일반 purchasePackage 는 계속 정가/7일 체험) · 11/24 Active.
//   · 월간 com.signumhq.app.pro.monthly › monthly › 기존 `expired-50-1m`(11/12, 단일 결제 1개월 50% · KRW 5,950 · USD 5.00 · JPY 640) 재사용.
//   그 뒤는 기본 요금제 정가로 자동 갱신. 개발자 결정 오퍼는 앱 안에서만 팔 수 있고 Play 가 스스로 적용하지 않는다 → purchaseSubscriptionOption 으로만 산다.
// 누구에게(전부 참일 때만 — 하나라도 모르면 안 보인다):
//   · 안드로이드 네이티브 앱 · 블프 기간(lib/app/blackFriday bfLive — 12/2 07:00 UTC 전) · 끄기 스위치 /api/app/warm-bf 의 android=true
//   · 시트(1회): PRO 권한 없음 + 활성 구독 없음 → 연간(주)·월간(둘째)
//   · 웜(이틀에 한 번 — lib/app/warmBf 규칙 그대로): Play 7일 체험 중 자동 갱신 끔(warmBfTargetPlay) → «다른 상품»의 할인만.
//       Play 는 이미 가진 구독 상품(갱신만 꺼진 체험 포함)을 다시 사면 «이미 소유»로 거절한다 → 월간 체험 = 연간 50% · 연간 체험 = 월간 첫 달 50%.
//       새 구독은 오늘 시작·오늘 결제(지금 체험은 갱신이 꺼져 있어 따로 청구되지 않는다) — 고지에 그대로 쓴다.
//   · 돈 내는 구독자(NORMAL·INTRO)·갱신 켜진 체험·프로모션 권한·App Store = 안 보인다.
// 안전: 기기에서 그 오퍼(옵션 id·태그·단계·정가)가 정확히 안 보이면 그 단추는 없다. 둘 다 없으면 시트를 안 띄우고, 블프 줄에서 연 경우엔 예전 정가 페이월.
//   결제 오류(취소 아님)도 예전 정가 페이월로 — 죽은 단추를 남기지 않는다. 가격·기간·갱신가는 전부 «스토어가 준 단계 값»으로만 그린다.
// ============================================================================
import type { PurchasesPackage, SubscriptionOption } from '@revenuecat/purchases-capacitor';
import { PRO_ANNUAL_PRODUCT_ID, PRO_ENTITLEMENT_ID, PRO_MONTHLY_PRODUCT_ID } from '@/config/iap';
import { RC_IGNORE_OFFER_TAG, discountPct, pickExpiredOffer, type ExpiredOfferPick } from './expiredOffer';
import { readWarmLast, warmBfTargetPlay, warmDay, warmDue, type WarmTarget } from './warmBf';
import { bfLive, readBfSeen, type BfLang, type BfPlan, type MiniStore } from './blackFriday';

/** Play 개발자 결정 오퍼 — RevenueCat 옵션 id 는 «기본요금제:오퍼» */
export const ANDROID_BF_ANNUAL_OFFER_ID = 'bf-annual-50';
export const ANDROID_BF_ANNUAL_OPTION_ID = `annual:${ANDROID_BF_ANNUAL_OFFER_ID}`;
/** 프리뷰 확인 모드(로컬·*.vercel.app 만): ?sgbfa=1 = 안드로이드 시트 · ?sgbfaw=1 = 웜 카드(월간 체험 → 연간) · ?sgbfawp=annual = 연간 체험 → 월간 */
export const ANDROID_BF_PREVIEW_FLAG = 'sgbfa';
/** 블프 줄을 내리는 창 이벤트(줄에서 열었는데 활성 권한·구독이 있던 사람) */
export const ANDROID_BF_LINE_HIDE_EVENT = 'signum:bf-line-hide';

/** 화면·결제가 쓰는 한 단추 — 결제는 option 그대로(purchaseExpiredOffer 의 안드로이드 갈래 = purchaseSubscriptionOption) */
export type AndroidBfPick = Extract<ExpiredOfferPick, { platform: 'android' }> & {
  plan: BfPlan;
  /** 할인 단계 금액(통화 단위 — 월 환산용) · 통화 */
  offerAmount: number;
  currency: string;
};
export type AndroidBfPicks = { annual: AndroidBfPick | null; monthly: AndroidBfPick | null };

const baseProduct = (id: unknown) => (typeof id === 'string' ? id.split(':')[0] : '');
const mode = (m: unknown) => (m === 1 || m === 'INFINITE_RECURRING' ? 'inf' : m === 2 || m === 'FINITE_RECURRING' ? 'fin' : m === 3 || m === 'NON_RECURRING' ? 'once' : null);
/** 1년 — RevenueCat 은 P1Y 를 YEAR·1 로 준다(브리지·버전에 따라 MONTH·12 도 받는다) */
const isYear = (p: { unit?: unknown; value?: unknown } | null | undefined) => {
  const u = String(p?.unit ?? '').toUpperCase();
  return (u === 'YEAR' && p?.value === 1) || (u === 'MONTH' && p?.value === 12);
};

/**
 * 연간 패키지에서 `annual:bf-annual-50` 를 «정확히» 찾는다 — 없거나 모양이 다르면 null(그 단추 없음).
 *   태그 rc-ignore-offer 필수 · 가격 2단계(1년 1회 할인 → 1년 무한 정가) · 할인 < 정가 · 같은 통화 · 정가 단계 = 상품 정가(페이월 연간 카드 값)
 */
export function pickAndroidBfAnnual(pkg: PurchasesPackage | null | undefined): AndroidBfPick | null {
  const p = pkg?.product;
  if (!pkg || !p || baseProduct(p.identifier) !== PRO_ANNUAL_PRODUCT_ID) return null;
  const o = (p.subscriptionOptions ?? []).find((x) => x?.id === ANDROID_BF_ANNUAL_OPTION_ID);
  if (!o || o.isBasePlan || !Array.isArray(o.tags) || !o.tags.includes(RC_IGNORE_OFFER_TAG)) return null;
  const phases = o.pricingPhases ?? [];
  if (phases.length !== 2) return null;
  const [intro, full] = phases;
  const once = mode(intro.recurrenceMode) === 'once' || (mode(intro.recurrenceMode) === 'fin' && intro.billingCycleCount === 1);
  if (!once || !isYear(intro.billingPeriod)) return null;
  if (mode(full.recurrenceMode) !== 'inf' || !isYear(full.billingPeriod)) return null;
  const a = intro.price?.amountMicros, b = full.price?.amountMicros;
  if (typeof a !== 'number' || typeof b !== 'number' || !(a > 0) || !(a < b)) return null;
  if (!intro.price.formatted || !full.price.formatted || !intro.price.currencyCode || intro.price.currencyCode !== full.price.currencyCode) return null;
  if (typeof p.price === 'number' && Math.abs(b / 1e6 - p.price) > 0.005 * Math.max(1, p.price)) return null;
  return {
    platform: 'android', pkg, option: o as SubscriptionOption, priceString: intro.price.formatted, regularPriceString: full.price.formatted,
    pct: discountPct(a, b), plan: 'annual', offerAmount: a / 1e6, currency: intro.price.currencyCode,
  };
}

/** 월간 첫 달 50% — 11/12 만료 오퍼(expired-50-1m)와 같은 검증(lib/app/expiredOffer pickExpiredOffer) 그대로 */
export function pickAndroidBfMonthly(pkg: PurchasesPackage | null | undefined): AndroidBfPick | null {
  const e = pickExpiredOffer(pkg, 'android');
  if (!e || e.platform !== 'android') return null;
  const intro = e.option.pricingPhases?.[0];
  const micros = intro?.price?.amountMicros;
  if (typeof micros !== 'number' || !intro?.price?.currencyCode) return null;
  return { ...e, plan: 'monthly', offerAmount: micros / 1e6, currency: intro.price.currencyCode };
}

// ── 누구에게 ────────────────────────────────────────────────────────────────
type InfoLike = Parameters<typeof warmBfTargetPlay>[0] & { activeSubscriptions?: unknown };
export type AndroidBfAudience =
  | { kind: 'sheet'; plans: BfPlan[] }
  | { kind: 'warm'; target: WarmTarget; plans: BfPlan[] }
  | null;

/**
 * 고객 정보 → 보여 줄 모양과 살 수 있는 상품. 모르면 null.
 *   PRO 없음 + 활성 구독 0 = 시트(연간·월간) · Play 체험 갱신 끔 = 웜(다른 상품만) · 그 밖 = null
 */
export function androidBfAudience(info: InfoLike | null | undefined, platform: string, now: number): AndroidBfAudience {
  if (platform !== 'android' || !info || !info.entitlements) return null;
  const active = info.entitlements.active;
  if (!active || typeof active !== 'object') return null;
  if (!active[PRO_ENTITLEMENT_ID] && Object.keys(active).length === 0) {
    const subs = info.activeSubscriptions;
    return Array.isArray(subs) && subs.length === 0 ? { kind: 'sheet', plans: ['annual', 'monthly'] } : null;
  }
  const target = warmBfTargetPlay(info, platform, now);
  if (!target) return null;
  // 활성 구독이 «지금 체험 상품 하나뿐»일 때만 — 다른 유료 구독이 함께 살아 있으면(대표 권한이 체험으로 보여도) 안 보인다(관문 11241331 ①)
  const subs = info.activeSubscriptions;
  const want = target.product === 'monthly' ? PRO_MONTHLY_PRODUCT_ID : PRO_ANNUAL_PRODUCT_ID;
  if (!Array.isArray(subs) || subs.length !== 1 || baseProduct(subs[0]) !== want) return null;
  return { kind: 'warm', target, plans: [target.product === 'monthly' ? 'annual' : 'monthly'] };
}

/** 활성 권한이나 활성 구독이 하나라도 있나 — 블프 줄에서 할인을 못 보일 때 정가 페이월로 보내면 안 되는 사람(같은 상품 재구매 = Play «이미 소유», 관문 11241331 ②) */
export function androidBfOwnsSub(info: InfoLike | null | undefined): boolean {
  if (!info || !info.entitlements) return false;
  const active = info.entitlements.active;
  if (active && typeof active === 'object' && Object.keys(active).length > 0) return true;
  return Array.isArray(info.activeSubscriptions) && info.activeSubscriptions.length > 0;
}

/** 살 수 있는 단추(상품이 허락되고 기기에 오퍼가 정확히 있는 것) — 앞이 주 단추. 비면 안 보인다(줄에서 열었으면 정가 페이월) */
export function androidBfButtons(plans: readonly BfPlan[], picks: AndroidBfPicks): AndroidBfPick[] {
  const out: AndroidBfPick[] = [];
  for (const plan of plans) {
    const p = picks[plan];
    if (p && p.plan === plan) out.push(p);
  }
  return out;
}

// ── 언제(자동) ──────────────────────────────────────────────────────────────
export type AndroidBfState = {
  live: boolean; sheetSeen: boolean; warmDue: boolean;
  /** 오늘 블프 시트(자동·줄)를 봤나 — 같은 날 웜 카드를 잇따라 띄우지 않는다(lib/app/warmBf bfSheetSeenToday) */
  bfToday: boolean;
  routeOk: boolean; otherToday: boolean; dailyToday: boolean; dialogOpen: boolean; visible: boolean; gateFlow: boolean; pending: boolean; redeemBusy: boolean;
  /** OS 평점 시트 요청 직후·전면 광고 중(하루 첫 페이월과 같은 대기 — lib/app/dailyPaywall reviewBusyAt · useReviewPrompt reviewBlockReason) */
  osBusy: boolean;
};
/** 'stop' = 이번 실행 끝(기간 밖·시트 봄+웜 차례 아님) · 'later' = 다음 포그라운드 · 'check' = 스위치·고객 정보·오퍼 확인 뒤 보인다 */
export function androidBfStep(s: AndroidBfState): 'stop' | 'later' | 'check' {
  if (!s.live || (s.sheetSeen && !s.warmDue)) return 'stop';
  if (s.pending || !s.visible || !s.routeOk || s.otherToday || s.dailyToday || s.dialogOpen || s.gateFlow || s.redeemBusy || s.osBusy) return 'later';
  return 'check';
}
/** 가벼운 문(SDK 를 싣기 전에) — 안드로이드 앱·첫 실행 마친 기기·기간 안 · 시트를 아직 안 봤거나 웜 차례인 날만 */
export function androidBfPreGate(s: { android: boolean; onboardedAtStart: boolean; store: MiniStore | null; now: number }): boolean {
  if (!s.android || !s.onboardedAtStart || !s.store || !bfLive(s.now)) return false;
  if (!readBfSeen(s.store)) return true;
  const last = readWarmLast(s.store);
  return last !== undefined && warmDue(last, warmDay(s.now), s.now);
}
/** 자동 안내에서 이 모양을 지금 보여도 되나 — 시트는 기기당 1회(BF_SEEN_KEY) · 웜은 이틀에 한 번(WARM_BF_KEY)이고 오늘 블프 시트를 안 봤을 때(관문 11241346 ②)
 *  (자동 안내는 오퍼가 없으면 아무것도 띄우지 않는다 — 정가 페이월을 대신 들이밀지 않는다. 무료 사용자의 하루 첫 페이월은 lib/app/dailyPaywall 이 따로 맡는다) */
export function androidBfAutoOk(kind: 'sheet' | 'warm', s: Pick<AndroidBfState, 'sheetSeen' | 'warmDue' | 'bfToday'>): boolean {
  return kind === 'sheet' ? !s.sheetSeen : s.warmDue && !s.bfToday;
}

// ── 문구(Play 정책: 할인 기간·할인가·이후 정가 자동 갱신·Google Play 에서 해지 — 단계 값만) ─────────────
export type AndroidBfCopy = {
  /** 연간 단추가 없을 때(월간만) 시트 제목 — 있으면 BF_COPY.title 그대로 */
  titleMonthly: string;
  monthlyCta: (offer: string) => string;
  monthlySub: (regular: string, offer: string) => string;
  monthlyLede: string;
  /** 시트 고지 — 있는 단추의 할인가·정가만 */
  fine: (a: AndroidBfPick | null, m: AndroidBfPick | null) => string;
  /** 블프 줄 — 연간 오퍼가 없고 월간만 있을 때(있으면 BF_COPY.line «연간 첫 1년 50%» 그대로) */
  lineMonthly: string;
  /** 결제가 오류로 끝났을 때(취소 아님) 웜 카드 한 줄 — 단추는 그대로 다시 누를 수 있다 */
  buyError: string;
  /** 웜 카드 고지 — 지금 체험·오늘 결제·할인 범위·정가 자동 갱신·해지 */
  warmFine: (date: string, pick: AndroidBfPick) => string;
};

export const ANDROID_BF_COPY: Record<BfLang, AndroidBfCopy> = {
  ko: {
    titleMonthly: '미국 주식 앱 SIGNUM PRO\n월간 첫 달 50%',
    monthlyCta: (o) => `월간 첫 달 50% · ${o}`,
    monthlySub: (r, o) => `월 ${r} → ${o} (첫 달)`,
    monthlyLede: '지금 이어가면 월간 첫 달 50% — 블랙프라이데이 가격은 12/2까지예요.',
    buyError: '결제를 마치지 못했어요. 잠시 뒤 다시 눌러 주세요.',
    lineMonthly: 'PRO 월간 첫 달 50% 할인',
    fine: (a, m) => {
      const parts = [a && `연간 첫 1년 ${a.priceString}`, m && `월간 첫 달 ${m.priceString}`].filter(Boolean).join(' 또는 ');
      const after = [a && `연 ${a.regularPriceString}`, m && `월 ${m.regularPriceString}`].filter(Boolean).join(' · ');
      return `할인은 ${parts}에만 적용되고, 이후 정가(${after})로 자동 갱신됩니다. 결제는 Google Play 결제 창에서 확인한 뒤 진행되며, Google Play 정기 결제에서 언제든 해지할 수 있어요.`;
    },
    warmFine: (d, p) => `지금 PRO 체험은 ${d}까지 그대로이고, 자동 결제되지 않아요. 단추를 누르면 Google Play 결제 창이 열리고, 확인하면 오늘 결제(${p.priceString})되고 새 구독이 시작돼요. 할인은 ${p.plan === 'annual' ? '연간 첫 1년' : '월간 첫 달'}에만 적용되고, 이후 ${p.plan === 'annual' ? `연 ${p.regularPriceString}` : `월 ${p.regularPriceString}`}로 자동 갱신돼요. Google Play 정기 결제에서 언제든 해지할 수 있어요.`,
  },
  en: {
    titleMonthly: 'SIGNUM PRO, the US stock market app\n50% off your first month',
    monthlyCta: (o) => `Monthly: first month 50% off · ${o}`,
    monthlySub: (r, o) => `${r} → ${o} for the first month`,
    monthlyLede: 'Keep it now and get 50% off your first month. Black Friday pricing ends Dec 2.',
    buyError: 'The purchase didn’t go through. Please try again in a moment.',
    lineMonthly: 'PRO monthly: 50% off month one',
    fine: (a, m) => {
      const parts = [a && `the first year (annual, ${a.priceString})`, m && `the first month (monthly, ${m.priceString})`].filter(Boolean).join(' or ');
      const after = [a && `${a.regularPriceString}/year`, m && `${m.regularPriceString}/month`].filter(Boolean).join(' · ');
      return `The discount applies to ${parts} only, then renews automatically at the regular price (${after}). You confirm payment in the Google Play purchase sheet. Cancel anytime in Google Play subscriptions.`;
    },
    warmFine: (d, p) => `Your PRO trial stays open until ${d} and will not be charged. The button opens Google Play's purchase sheet; if you confirm, ${p.priceString} is charged today and a new subscription starts. The discount applies to ${p.plan === 'annual' ? 'the first year' : 'the first month'} only, then renews automatically at ${p.plan === 'annual' ? `${p.regularPriceString}/year` : `${p.regularPriceString}/month`}. Cancel anytime in Google Play subscriptions.`,
  },
  ja: {
    titleMonthly: '米国株アプリ SIGNUM PRO\n月額プラン 初月50%OFF',
    monthlyCta: (o) => `月額 初月50%OFF · ${o}`,
    monthlySub: (r, o) => `月 ${r} → ${o}（初月）`,
    monthlyLede: '今続けると月額プランが初月50%OFF。ブラックフライデー価格は12/2までです。',
    buyError: '購入を完了できませんでした。少し時間をおいてもう一度お試しください。',
    lineMonthly: 'PRO月額 初月50%OFF',
    fine: (a, m) => {
      const parts = [a && `年額の初年度（${a.priceString}）`, m && `月額の初月（${m.priceString}）`].filter(Boolean).join('または');
      const after = [a && `年 ${a.regularPriceString}`, m && `月 ${m.regularPriceString}`].filter(Boolean).join(' · ');
      return `割引は${parts}のみで、その後は通常価格（${after}）で自動更新されます。お支払いはGoogle Playの購入画面で確認してから行われ、Google Playの定期購入からいつでも解約できます。`;
    },
    warmFine: (d, p) => `今のPRO体験は${d}までそのまま使え、自動で請求されません。ボタンを押すとGoogle Playの購入画面が開き、確定すると本日${p.priceString}が請求され、新しい定期購入が始まります。割引は${p.plan === 'annual' ? '年額の初年度' : '月額の初月'}のみで、その後は${p.plan === 'annual' ? `年 ${p.regularPriceString}` : `月 ${p.regularPriceString}`}で自動更新されます。Google Playの定期購入からいつでも解約できます。`,
  },
};
