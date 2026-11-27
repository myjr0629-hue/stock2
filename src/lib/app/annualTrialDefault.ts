import type { PaywallPlan } from './proPlans';

export function hasAnnualTrial(plans: readonly PaywallPlan[]): boolean {
  return plans.some((p) => p.plan === 'annual' && p.trialDays === 7 && !!p.priceString);
}

// trialDays 는 스토어의 각 상품에서 확인한 값이다. 체험이 하나도 없으면 정가 선택 규칙에 맡긴다.
export function trialDefaultPlan(plans: readonly PaywallPlan[], annualOn: boolean) {
  if (annualOn && hasAnnualTrial(plans)) return 'annual';
  const trial = plans.find((p) => p.plan !== 'lifetime' && p.trialDays);
  if (!trial) return null;
  return plans.some((p) => p.plan === 'monthly') ? 'monthly' : trial.plan;
}

export async function readAnnualTrialSwitch(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('/api/app/annual-trial', { cache: 'no-store', signal: controller.signal });
    return response.ok && (await response.json())?.on === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
