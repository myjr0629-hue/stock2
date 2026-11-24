// ============================================================================
// «웜 사용자» 블랙프라이데이 카드 (2026-11-24 — 대표 «마케팅·매출로 이어지는 모든 기술을 총동원… 모두 매출로») — 순수 모듈(화면·시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 누구(전부 참일 때만 — 하나라도 모르면 안 보인다):
//   · iOS 네이티브 앱 · 이 실행이 시작될 때 첫 실행을 마친 기기 · 블프 기간 안(lib/app/blackFriday bfLive — 12/2 07:00 UTC 전)
//   · RevenueCat 새 고객 정보: PRO 권한 활성 · App Store · 무료 기간(TRIAL — 1개월 무료 오퍼 코드·7일 체험) · 자동 갱신 꺼짐(willRenew=false)
//     · 가족 공유 아님 · 끝나는 날이 40일 안 · 일회성 구매(평생 등) 기록 없음 · 상품이 월간/연간 중 하나.
//     → 돈 내는 구독자(NORMAL·INTRO)·프로모션 권한·안드로이드는 절대 안 보인다(Play 는 할인 코드가 없다).
//   · 이틀에 한 번(기기 현지 날짜) + 블프 마지막 24시간엔 그날 한 번 더 · 오늘 다른 페이월·안내(블프 1회 시트·하루 첫 페이월·체험 종료 안내·
//     게이트·선물 — lib/app/trialAnnounce otherSheetToday)를 봤으면 오늘은 쉰다 · 끄기 스위치(/api/app/warm-bf)가 켜짐일 때만.
// 무엇: PRO 가 끝나는 날짜 · 무료로 돌아가면 달라지는 것(체험 종료 안내와 같은 검증된 문구) · 블프 할인가(애플 값이 확인된 통화만) · 3.1.2 고지.
//   단추 = 블프 오퍼 코드가 채워진 애플 적용 창(lib/app/redeem openWarmBfRedeem). 결제 창·금액·시작일은 애플이 띄운다.
// 왜 상품별로 단추가 다른가(2026-11-24 ASC 실측 — 구독 그룹 22205273): 월간 groupLevel 1 · 연간 groupLevel 2.
//   1개월 무료 코드(오퍼 51bd34ef)는 «월간» 상품에 붙어 있어 코드 PRO 는 전부 월간 구독 중이다. 월간→연간 = 하위 단계(다운그레이드)이고
//   애플 오퍼 코드는 다운그레이드를 받지 않는다(«This offer can't be redeemed with your current subscription» — Apple Forums 712469, Apple 엔지니어 답).
//   그래서 월간 구독 중인 사람에게 연간 블프 코드를 주면 애플이 거절한다 → 스위치 annual(레디스 warm-bf:annual=1, ASC 에서 두 상품을 같은 단계로
//   옮긴 뒤에만 켠다)이 꺼져 있으면 월간 사람은 «월간 첫 3개월 50%»(같은 상품 = 다음 갱신일부터 적용)를 주 단추로 받는다.
//   연간 체험(7일 체험을 연간으로 시작) 사람은 같은 상품이라 연간 블프 코드가 다음 갱신일부터 적용된다.
// 성공 판정: 애플 창에서 돌아온 뒤 PRO 권한의 willRenew 가 true 가 됐을 때만 code_pro(코드 PRO 는 원래 PRO 라 «PRO 확인»만으론 성공이 아니다).
// ============================================================================

import { PRO_ANNUAL_PRODUCT_ID, PRO_ENTITLEMENT_ID, PRO_LIFETIME_PRODUCT_ID, PRO_MONTHLY_PRODUCT_ID } from '@/config/iap';
import { BF_SEEN_KEY, BF_VALID_UNTIL, bfLive, type BfPlan } from './blackFriday';

/** 이 기기에서 마지막으로 보인 현지 날짜(YYYY-MM-DD) */
export const WARM_BF_KEY = 'signumhq.warm_bf.v1';
/** 끄기 스위치 레디스 키(값이 있으면 전부 끔) · 연간 모드 키(값 '1' = 월간 구독자에게도 연간 블프 코드 — ASC 단계 조정 뒤에만) */
export const WARM_BF_OFF_KEY = 'warm-bf:off';
export const WARM_BF_ANNUAL_KEY = 'warm-bf:annual';
/** 며칠에 한 번 */
export const WARM_BF_EVERY_DAYS = 2;
/** 끝나는 날이 이보다 멀면 대상 아님(1년 이용권 등) */
export const WARM_BF_MAX_LEFT_MS = 40 * 86_400_000;
/** 블프 마지막 24시간 — 이 안에선 이틀 간격과 무관하게 그날 한 번 */
export const WARM_BF_LAST_DAY_MS = 24 * 3_600_000;
/** 포그라운드 뒤 기다렸다 판정 — 체험 종료 안내(즉시+조회)·블프 1회 시트(3초+3초)·하루 첫 페이월(7초)이 먼저 자리를 잡게 */
export const WARM_BF_DELAY_MS = 8_000;
/** 보이기 직전 고객 정보·가격·스위치 조회 상한 */
export const WARM_BF_VERIFY_MS = 3_000;
/** 체험 종료 안내 «PRO 요금제 보기»를 누른 뒤 카드 준비를 기다리는 최대 시간 — 넘으면 예전 정가 페이월 */
export const WARM_BF_OFFER_WAIT_MS = 3_500;
/** 돌아온 뒤 «갱신 켜짐» 재확인 간격(애플 → RC 반영 지연) */
export const WARM_BF_CONFIRM_WAITS = [0, 3_000, 8_000] as const;

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type WarmProduct = 'monthly' | 'annual';
export type WarmTarget = { expiresAt: number; product: WarmProduct };

/** 기기 현지 날짜(다른 시트들과 같은 형식) */
export function warmDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayNum(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : NaN;
}

// ── 대상 판정(고객 정보) ─────────────────────────────────────────────────────
type EntLike = {
  isActive?: unknown; periodType?: unknown; store?: unknown; willRenew?: unknown; ownershipType?: unknown;
  expirationDate?: unknown; productIdentifier?: unknown;
};
type InfoLike = {
  entitlements?: { active?: Record<string, EntLike | undefined> | null } | null;
  nonSubscriptionTransactions?: unknown;
  allPurchasedProductIdentifiers?: unknown;
} | null | undefined;

const baseId = (v: unknown) => String(v ?? '').split(':')[0];

/** 웜 대상이면 {끝나는 시각, 상품}, 아니면 null(모르면 null) */
export function warmBfTarget(info: InfoLike, platform: string, now: number): WarmTarget | null {
  return platform === 'ios' ? targetOn(info, 'APP_STORE', now) : null;
}

/**
 * ★11/24 오후 안드로이드 웜 대상(lib/app/androidBf) — 같은 규칙, 스토어만 Google Play(PLAY_STORE · 7일 무료 체험 중 자동 갱신 끔).
 *   Play 는 할인 코드 대신 «개발자 결정» 오퍼를 앱 안에서 직접 산다(purchaseSubscriptionOption).
 */
export function warmBfTargetPlay(info: InfoLike, platform: string, now: number): WarmTarget | null {
  return platform === 'android' ? targetOn(info, 'PLAY_STORE', now) : null;
}

function targetOn(info: InfoLike, store: 'APP_STORE' | 'PLAY_STORE', now: number): WarmTarget | null {
  if (!Number.isFinite(now) || !info || !info.entitlements) return null;
  const ent = info.entitlements.active?.[PRO_ENTITLEMENT_ID];
  if (!ent || ent.isActive !== true) return null;
  if (String(ent.store ?? '').toUpperCase() !== store) return null;
  if (String(ent.periodType ?? '').toUpperCase() !== 'TRIAL') return null;
  if (ent.willRenew !== false) return null;
  if (String(ent.ownershipType ?? '').toUpperCase() === 'FAMILY_SHARED') return null;
  // 일회성 구매(평생 등) 기록이 있으면 돈 낸 사람 — 안 보인다
  if (Array.isArray(info.nonSubscriptionTransactions) && info.nonSubscriptionTransactions.length > 0) return null;
  if (Array.isArray(info.allPurchasedProductIdentifiers) && info.allPurchasedProductIdentifiers.some((p) => baseId(p) === PRO_LIFETIME_PRODUCT_ID)) return null;
  const expiresAt = Date.parse(String(ent.expirationDate ?? ''));
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt - now > WARM_BF_MAX_LEFT_MS) return null;
  const pid = baseId(ent.productIdentifier);
  const product: WarmProduct | null = pid === PRO_MONTHLY_PRODUCT_ID ? 'monthly' : pid === PRO_ANNUAL_PRODUCT_ID ? 'annual' : null;
  if (!product) return null;
  return { expiresAt, product };
}

/** 애플 창에서 돌아온 뒤 «전환됨» — PRO 활성 + 자동 갱신 켜짐(블프 코드 적용·구독 관리에서 다시 켬 모두) */
export function warmConverted(info: InfoLike): boolean {
  const ent = info?.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  return !!ent && ent.isActive === true && ent.willRenew === true;
}

/** 단추 배치 — 애플이 실제로 받아 주는 코드만 주 단추로(머리말 «왜 상품별로») */
export function warmPlans(product: WarmProduct, annualFromMonthly: boolean): { primary: BfPlan; secondary: BfPlan | null } {
  if (product === 'annual') return { primary: 'annual', secondary: null };
  return annualFromMonthly ? { primary: 'annual', secondary: 'monthly' } : { primary: 'monthly', secondary: null };
}

// ── 언제 ─────────────────────────────────────────────────────────────────────
/** 오늘 차례인가 — 기간 밖 = 아니오 · 처음 = 예 · 오늘 이미 = 아니오 · 마지막 24시간 = 예 · 그 밖엔 이틀 간격 */
export function warmDue(last: string | null, today: string, now: number): boolean {
  if (!bfLive(now)) return false;
  if (!last) return true;
  if (last === today) return false;
  if (now >= BF_VALID_UNTIL - WARM_BF_LAST_DAY_MS) return true;
  const gap = dayNum(today) - dayNum(last);
  return !Number.isFinite(gap) || gap >= WARM_BF_EVERY_DAYS || gap < 0;
}

/** 마지막으로 보인 날 — 저장소가 없거나 던지면 undefined(= 모름 → 안 보인다) */
export function readWarmLast(store: MiniStore | null): string | null | undefined {
  try { return store ? store.getItem(WARM_BF_KEY) : undefined; } catch { return undefined; }
}

/** 가벼운 문(SDK 를 싣기 전에) */
export function warmPreGate(s: { ios: boolean; onboardedAtStart: boolean; store: MiniStore | null; now: number }): boolean {
  if (!s.ios || !s.onboardedAtStart || !s.store) return false;
  const last = readWarmLast(s.store);
  return last !== undefined && warmDue(last, warmDay(s.now), s.now);
}

/** 오늘 보였나 — 다른 시트(체험 종료 안내)가 «오늘은 쉼»으로 읽는다. 모르면 false(그쪽은 예전 그대로) */
export function warmShownOn(store: MiniStore | null, now = Date.now()): boolean {
  try { return !!store && store.getItem(WARM_BF_KEY) === warmDay(now); } catch { return false; }
}

/** 보였다고 적는다(보이기 직전) — 다시 읽어 확인. 실패면 false(호출자는 보이지 않는다) */
export function markWarmShown(store: MiniStore | null, now = Date.now()): boolean {
  try {
    if (!store) return false;
    const v = warmDay(now);
    store.setItem(WARM_BF_KEY, v);
    return store.getItem(WARM_BF_KEY) === v;
  } catch { return false; }
}

/** 오늘 블프 1회 시트를 봤나(그 시트는 본 시각을 적는다) — 모르면 true(오늘은 쉰다) */
export function bfSheetSeenToday(store: MiniStore | null, now = Date.now()): boolean {
  try {
    const v = store ? store.getItem(BF_SEEN_KEY) : null;
    if (v === null) return false;
    const t = Number(v);
    return !Number.isFinite(t) || warmDay(t) === warmDay(now);
  } catch { return true; }
}

export type WarmState = {
  due: boolean; routeOk: boolean; otherToday: boolean; bfToday: boolean; dailyToday: boolean;
  dialogOpen: boolean; visible: boolean; gateFlow: boolean; pending: boolean; redeemBusy: boolean;
};
/** 'stop' = 이번 실행 끝 · 'later' = 다음 포그라운드에 · 'check' = 스위치·고객 정보 확인 뒤 보인다 */
export function warmStep(s: WarmState): 'stop' | 'later' | 'check' {
  if (!s.due) return 'stop';
  if (s.pending || !s.visible || !s.routeOk || s.otherToday || s.bfToday || s.dailyToday || s.dialogOpen || s.gateFlow || s.redeemBusy) return 'later';
  return 'check';
}

// ── 끄기 스위치 ───────────────────────────────────────────────────────────
const truthy = (v: unknown) => !(v == null || v === '' || v === 0 || v === false || v === '0' || v === 'false');
/** ★11/24 오후 값 'android' = 안드로이드 블프(lib/app/androidBf)만 끔 — iOS 웜 카드는 그대로 */
const androidOnly = (v: unknown) => String(v ?? '').trim().toLowerCase() === 'android';
const offAll = (v: unknown) => truthy(v) && !androidOnly(v);
/** 서버: 환경변수·레디스 값 → 응답(iOS 웜 카드) */
export function warmSwitchValue(input: { env?: string; off: unknown; annual: unknown }): { on: boolean; annual: boolean } {
  if (offAll(input.env) || offAll(input.off)) return { on: false, annual: false };
  return { on: true, annual: String(input.annual ?? '').trim() === '1' };
}
/** 서버: 안드로이드 블프(1회 시트·웜 카드·블프 줄) 켜짐 — warm-bf:off 가 'android' 이거나 그 밖의 참 값('1' 등)이면 꺼짐 */
export function warmSwitchAndroid(input: { env?: string; off: unknown }): boolean {
  return !truthy(input.env) && !truthy(input.off);
}
/** 클라이언트: 응답의 android 가 정확히 true 일 때만 켜짐(옛 응답·모양 다름·못 읽음 = 꺼짐) */
export function warmAndroidFrom(j: unknown): boolean {
  return !!j && typeof j === 'object' && (j as { on?: unknown }).on === true && (j as { android?: unknown }).android === true;
}
/** 클라이언트: 응답 → 켜짐·연간 모드(모양이 다르면 꺼짐) */
export function warmSwitchFrom(j: unknown): { on: boolean; annual: boolean } {
  if (!j || typeof j !== 'object') return { on: false, annual: false };
  const { on, annual } = j as { on?: unknown; annual?: unknown };
  return on === true ? { on: true, annual: annual === true } : { on: false, annual: false };
}

// ── 문구(예측·투자 권유 없음 · 3.1.2: 할인 범위·이후 정가 자동 갱신·해지 장소·결제는 애플 창에서 확인) ──
export type WarmLang = 'ko' | 'en' | 'ja';
export const WARM_COPY: Record<WarmLang, {
  title: (date: string) => string;
  lede: (plan: BfPlan) => string;
  perMonth: (v: string) => string;
  monthlySub: (regular: string | null, offer: string | null) => string;
  other: string;
  fine: (date: string, yr: string | null, mo: string | null) => string;
}> = {
  ko: {
    title: (d) => `PRO가 ${d}에 끝나요`,
    lede: (p) => (p === 'annual' ? '지금 이어가면 연간 첫 1년 50% — 블랙프라이데이 가격은 12/2까지예요.' : '지금 이어가면 월간 첫 3개월 50% — 블랙프라이데이 가격은 12/2까지예요.'),
    perMonth: (v) => `월 환산 ${v}`,
    monthlySub: (r, o) => (r && o ? `월 ${r} → ${o} (첫 3개월)` : '월간 첫 3개월 50% 할인'),
    other: '다른 요금제 보기',
    fine: (d, yr, mo) => `지금 PRO는 ${d}까지 그대로 쓸 수 있어요. 단추를 누르면 App Store 화면이 열리고, 결제 금액과 시작일을 확인한 뒤에만 결제됩니다. 할인은 연간 첫 1년 또는 월간 첫 3개월에만 적용되고, 이후 정가(${yr ? `연 ${yr}` : '연간 정가'} · ${mo ? `월 ${mo}` : '월간 정가'})로 자동 갱신돼요. App Store 설정에서 언제든 해지할 수 있어요.`,
  },
  en: {
    title: (d) => `Your PRO ends ${d}`,
    lede: (p) => (p === 'annual' ? 'Keep it now and get 50% off the first year. Black Friday pricing ends Dec 2.' : 'Keep it now and get 50% off monthly for 3 months. Black Friday pricing ends Dec 2.'),
    perMonth: (v) => `${v}/mo equivalent`,
    monthlySub: (r, o) => (r && o ? `${r} → ${o}/mo for the first 3 months` : '50% off the first 3 months'),
    other: 'See other plans',
    fine: (d, yr, mo) => `Your PRO stays open until ${d}. The button opens the App Store, which shows the amount and start date; you are charged only after you confirm there. The discount applies to the first year (annual) or the first 3 months (monthly) only, then renews automatically at the regular price (${yr ? `${yr}/year` : 'regular annual price'} · ${mo ? `${mo}/month` : 'regular monthly price'}). Cancel anytime in App Store settings.`,
  },
  ja: {
    title: (d) => `PROは${d}に終了します`,
    lede: (p) => (p === 'annual' ? '今続けると年額プランが初年度50%OFF。ブラックフライデー価格は12/2までです。' : '今続けると月額プランが最初の3か月50%OFF。ブラックフライデー価格は12/2までです。'),
    perMonth: (v) => `月あたり${v}`,
    monthlySub: (r, o) => (r && o ? `月 ${r} → ${o}（最初の3か月）` : '最初の3か月50%OFF'),
    other: 'ほかのプランを見る',
    fine: (d, yr, mo) => `今のPROは${d}までそのまま使えます。ボタンを押すとApp Storeの画面が開き、金額と開始日を確認してからのみ請求されます。割引は年額の初年度または月額の最初の3か月のみで、その後は通常価格（${yr ? `年 ${yr}` : '年額の通常価格'} · ${mo ? `月 ${mo}` : '月額の通常価格'}）で自動更新されます。App Storeの設定からいつでも解約できます。`,
  },
};
export function toWarmLang(locale: string | null | undefined): WarmLang {
  return locale === 'ko' || locale === 'ja' ? locale : 'en';
}

/** 연간 할인가의 월 환산(애플 할인가가 확인된 통화만 — KRW·JPY·USD) */
export function warmAnnualPerMonth(offer: number | null, currency: string | null, locale: string): string | null {
  if (offer == null || !Number.isFinite(offer) || offer <= 0 || !currency) return null;
  const cur = currency.toUpperCase();
  if (cur !== 'KRW' && cur !== 'JPY' && cur !== 'USD') return null;
  const v = offer / 12;
  try {
    const usd = cur === 'USD';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur, maximumFractionDigits: usd ? 2 : 0, minimumFractionDigits: usd ? 2 : 0 }).format(usd ? Math.floor(v * 100) / 100 : Math.floor(v));
  } catch { return null; }
}
