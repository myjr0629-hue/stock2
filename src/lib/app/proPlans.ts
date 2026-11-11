// ============================================================================
// 페이월 플랜 카드(월간·연간·평생)의 «순수 계산» — 2026-11-09 연간·평생 추가.
// 화면(ProPaywall)과 시험이 같은 함수를 쓴다. 가격은 전부 스토어가 준 값(PlanOffer)이다 — 여기서 만들지 않는다.
// ============================================================================
import type { PlanId } from '@/config/iap';
import type { PlanOffer } from '@/services/revenueCat';

/** 페이월이 그리는 플랜 한 줄(스토어 값만) — 디자인 미리보기(previewPlans)도 같은 모양 */
export type PaywallPlan = Pick<PlanOffer, 'plan' | 'priceString' | 'price' | 'currencyCode' | 'pricePerMonthString'>;

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
