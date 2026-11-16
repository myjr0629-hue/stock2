// ============================================================================
// 페이월 플랜 카드(월간·연간·평생)의 «순수 계산» — 2026-11-09 연간·평생 추가.
// 화면(ProPaywall)과 시험이 같은 함수를 쓴다. 가격은 전부 스토어가 준 값(PlanOffer)이다 — 여기서 만들지 않는다.
// ============================================================================
import type { PlanId } from '@/config/iap';
import type { PlanOffer } from '@/services/revenueCat';

/** 페이월이 그리는 플랜 한 줄(스토어 값만) — 디자인 미리보기(previewPlans)도 같은 모양 */
export type PaywallPlan = Pick<PlanOffer, 'plan' | 'priceString' | 'price' | 'currencyCode' | 'pricePerMonthString' | 'trialDays'>;

/**
 * 연간 할인율(%) — 월간×12 대비. 둘 다 «스토어 숫자 가격»이고 «같은 통화»일 때만. 5% 미만·계산 불가면 null(배지 안 그림).
 * 내림한다 — 37.9% 를 38% 로 올려 말하지 않는다.
 */
export function annualSavePct(monthly?: PaywallPlan | null, annual?: PaywallPlan | null): number | null {
  const m = monthly?.price, a = annual?.price;
  if (typeof m !== 'number' || typeof a !== 'number' || !(m > 0) || !(a > 0)) return null;
  if (!monthly?.currencyCode || monthly.currencyCode !== annual?.currencyCode) return null;
  const pct = Math.floor((1 - a / (m * 12)) * 100);
  return pct >= 5 && pct < 100 ? pct : null;
}

/** 고른 플랜의 결제 전 안내 한 단락(자동 갱신·해지 / 평생은 갱신 없음·복원) */
export function planFineLine(loc: 'ko' | 'en' | 'ja', t: { renewNote: string; manageNote: string; renewAnnual: string; lifetimeNote: string; lifetimeManage: string }, plan: PlanId) {
  const sep = loc === 'ja' ? '' : ' ';
  if (plan === 'annual') return `${t.renewAnnual}${sep}${t.manageNote}`;
  if (plan === 'lifetime') return `${t.lifetimeNote}${sep}${t.lifetimeManage}`;
  return `${t.renewNote}${sep}${t.manageNote}`;
}

/**
 * 플랜 카드를 그릴지(multi)와 고른 플랜 — ★11/11 수리: 월간이 없고 연간·평생만 와도 카드로 그리고 살 수 있게.
 *   · 월간 하나뿐(또는 아무것도 없음) → multi=false · 'monthly'(예전 가격 한 줄 화면 그대로)
 *   · 그 밖(플랜 2개 이상, 또는 월간이 아닌 플랜 하나) → multi=true · 사용자가 고른 것 → 연간 → 월간 → 첫 플랜
 */
export function paywallSelection(plans: readonly Pick<PaywallPlan, 'plan'>[], picked: PlanId | null): { multi: boolean; selected: PlanId } {
  const multi = plans.length > 1 || (plans.length === 1 && plans[0].plan !== 'monthly');
  if (!multi) return { multi, selected: 'monthly' };
  const has = (id: PlanId) => plans.some((p) => p.plan === id);
  const selected: PlanId = picked && has(picked) ? picked : has('annual') ? 'annual' : has('monthly') ? 'monthly' : plans[0].plan;
  return { multi, selected };
}

// ============================================================================
// ★11/16 무료 체험(스토어 소개 오퍼) — 스토어가 «이 사람에게 지금 적용할 무료 기간»을 줄 때만 일수를 낸다.
//   iOS: product.introPrice(가격 0 = 무료 체험) + checkTrialOrIntroductoryPriceEligibility 가 «ELIGIBLE»일 때만.
//        모름(UNKNOWN)·자격 없음·조회 실패 = null — RevenueCat 권고대로 체험 없는 가격을 보여 준다(과장 금지).
//   Android: product.defaultOption.freePhase — Play 는 자격 있는 오퍼만 내려주고, 구매(purchasePackage)도 이 defaultOption 으로 한다.
//   null 이면 페이월은 예전과 똑같다(문구·버튼·고지).
// ============================================================================

/** 체험 판정에 쓰는 상품 모양(RevenueCat PurchasesStoreProduct 의 일부) — 시험이 손으로 만들 수 있게 좁힌다 */
export type TrialProductLike = {
  introPrice?: { price?: number; periodUnit?: string; periodNumberOfUnits?: number; cycles?: number } | null;
  defaultOption?: {
    freePhase?: { billingPeriod?: { unit?: string; value?: number; iso8601?: string } | null } | null;
    /** 무료 뒤 유료 소개 단계 — 있으면 «체험 뒤 정가»가 사실이 아니므로 체험을 말하지 않는다(관문 11161250 ①) */
    introPhase?: unknown;
  } | null;
} | null | undefined;

/** 기간 단위 × 수 → 일수. 일·주만(월·년 무료는 «N일»로 바꿔 말하지 않는다 → null). 1~31일 밖이면 null */
export function periodDays(unit?: string | null, value?: number | null, cycles = 1): number | null {
  const u = String(unit ?? '').toUpperCase();
  const n = typeof value === 'number' && value > 0 ? value : 0;
  const c = typeof cycles === 'number' && cycles > 0 ? cycles : 1;
  const per = u === 'DAY' ? 1 : u === 'WEEK' ? 7 : 0;
  const d = per * n * c;
  return d >= 1 && d <= 31 ? d : null;
}

/** ISO 8601 기간(P7D·P1W) → 일수 — billingPeriod 에 unit/value 가 없을 때의 대비 */
export function isoPeriodDays(iso?: string | null): number | null {
  const m = /^P(\d+)([DW])$/i.exec(String(iso ?? '').trim());
  if (!m) return null;
  return periodDays(m[2].toUpperCase() === 'W' ? 'WEEK' : 'DAY', Number(m[1]));
}

/**
 * 이 상품을 지금 사면 스토어가 적용할 «무료 체험 일수». 아니면 null.
 * @param iosEligible iOS 자격 조회 결과(true = ELIGIBLE). 안드는 무시(Play 가 자격 있는 오퍼만 준다).
 */
export function trialDaysFor(product: TrialProductLike, platform: string, iosEligible?: boolean): number | null {
  if (!product) return null;
  if (platform === 'ios') {
    const ip = product.introPrice;
    if (!ip || ip.price !== 0 || iosEligible !== true) return null;
    return periodDays(ip.periodUnit, ip.periodNumberOfUnits, ip.cycles ?? 1);
  }
  if (platform === 'android') {
    const opt = product.defaultOption;
    const bp = opt?.freePhase?.billingPeriod;
    if (!bp || opt?.introPhase) return null;
    return periodDays(bp.unit, bp.value) ?? isoPeriodDays(bp.iso8601);
  }
  return null;
}
