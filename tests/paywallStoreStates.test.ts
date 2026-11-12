/**
 * 페이월 스토어 상태별 선택·구매 가능 여부 (2026-11-11 페이월 수리 반영 관문).
 *   스토어 패키지 → plansFromPackages(스위치 켜짐 = 월간·연간·평생) → paywallSelection → 화면과 같은 selectedOffer·버튼 잠금 식.
 *   ① 월간만 ② 월간+연간+평생 ③ 연간+평생(월간 없음 — 수리 대상) ④ 체험 종료 시트에서 연 페이월 = 연간 기본 ⑤ 빈 오퍼링
 *   ⑥ 월간+연간(평생 중단 — 대표 11/11) ⑦ 연간만
 * 네트워크·실제 결제 없음. 실행: npx tsx --test tests/paywallStoreStates.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = path.resolve(__dirname, '..');
process.env.NEXT_PUBLIC_PRO_PLANS = '1';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rc = require(path.join(ROOT, 'src/services/revenueCat.ts')) as typeof import('../src/services/revenueCat');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const iap = require(path.join(ROOT, 'src/config/iap.ts')) as typeof import('../src/config/iap');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { paywallSelection } = require(path.join(ROOT, 'src/lib/app/proPlans.ts')) as typeof import('../src/lib/app/proPlans');

type Plan = 'monthly' | 'annual' | 'lifetime';
const pkgM = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'com.signumhq.app.pro.monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW', pricePerMonthString: '₩11,900' } } as any;
const pkgA = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'com.signumhq.app.pro.annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,416' } } as any;
const pkgL = { identifier: '$rc_lifetime', packageType: 'LIFETIME', product: { identifier: 'com.signumhq.app.pro.lifetime', priceString: '₩149,000', price: 149000, currencyCode: 'KRW', pricePerMonthString: null } } as any;

/** ProPaywall 과 같은 식(아래 소스 대조 시험이 어긋남을 잡는다) — 무엇을 그리고, 무엇을 사고, 버튼이 열리는가 */
function paywall(pkgs: any[], picked: Plan | null, active: readonly Plan[] = iap.MULTI_PLANS) {
  const offers = rc.paywallOffers(pkgs, active);
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;
  const { multi, selected } = paywallSelection(offers, picked);
  const selectedOffer = multi ? (offers.find((o) => o.plan === selected) ?? null) : monthly;
  const disabled = multi ? !selectedOffer : !monthly;
  return { cards: multi ? offers.map((o) => o.plan) : null, multi, selected, buys: selectedOffer?.pkg.identifier ?? null, disabled };
}

test('스위치 켜짐 확인 — 이 시험은 여러 플랜 경로를 본다', () => {
  // ★11/11 평생 폐지(대표) — 파는 플랜은 월간·연간 둘뿐
  assert.deepEqual(iap.LAUNCH_PLANS, ['monthly', 'annual']);
});

test('① 월간만: 예전 화면(가격 한 줄·카드 없음) · 월간 결제 · 버튼 열림', () => {
  const r = paywall([pkgM], null);
  assert.equal(r.multi, false);
  assert.equal(r.cards, null);
  assert.equal(r.selected, 'monthly');
  assert.equal(r.buys, '$rc_monthly');
  assert.equal(r.disabled, false);
  // 골라 둔 값이 있어도(이전 열림 등) 월간 하나면 월간
  assert.equal(paywall([pkgM], 'annual').buys, '$rc_monthly');
});

test('② 스토어가 월간+연간+평생을 줘도(오퍼링에 평생이 다시 들어가도): 카드 2장(월간·연간) · 기본 연간 · 평생은 안 보이고 못 산다', () => {
  const r = paywall([pkgL, pkgA, pkgM], null);
  assert.deepEqual(r.cards, ['monthly', 'annual']);
  assert.equal(r.selected, 'annual');
  assert.equal(r.buys, '$rc_annual');
  assert.equal(r.disabled, false);
  for (const [p, id] of [['monthly', '$rc_monthly'], ['annual', '$rc_annual']] as const) {
    const x = paywall([pkgL, pkgA, pkgM], p);
    assert.equal(x.selected, p);
    assert.equal(x.buys, id);
    assert.equal(x.disabled, false);
  }
  // 평생을 골라 둔 값이 남아도 → 연간(평생 결제 경로 없음)
  assert.equal(paywall([pkgL, pkgA, pkgM], 'lifetime').buys, '$rc_annual');
});

test('③ 연간+평생(월간 없음) — 수리 대상: 연간 카드로 산다 · 평생은 안 보인다 · 버튼 열림', () => {
  const r = paywall([pkgL, pkgA], null);
  assert.equal(r.multi, true, '예전엔 multi=false → 월간 null → 버튼 잠김(아무것도 못 삼)');
  assert.deepEqual(r.cards, ['annual']);
  assert.equal(r.selected, 'annual');
  assert.equal(r.buys, '$rc_annual');
  assert.equal(r.disabled, false);
  assert.equal(paywall([pkgL, pkgA], 'lifetime').buys, '$rc_annual');
  // 없는 월간을 골라 둔 값 → 연간으로(엉뚱한 상품·잠김 없음)
  assert.equal(paywall([pkgL, pkgA], 'monthly').buys, '$rc_annual');
  assert.equal(paywall([pkgA], null).buys, '$rc_annual');
  // 평생 하나만 오면 → 팔 것 없음(가격을 지어내지 않고 잠김 — 평생 결제 경로 없음)
  assert.equal(paywall([pkgL], null).buys, null);
  assert.equal(paywall([pkgL], null).disabled, true);
});

test('⑥ 월간+연간(평생 없음 — 11/11 대표 «평생결제는 하지 않는 것으로»): 카드 2장 · 기본 연간 · 평생 카드·요구 없음', () => {
  const r = paywall([pkgA, pkgM], null);
  assert.equal(r.multi, true);
  assert.deepEqual(r.cards, ['monthly', 'annual']);
  assert.equal(r.selected, 'annual');
  assert.equal(r.buys, '$rc_annual');
  assert.equal(r.disabled, false);
  assert.equal(paywall([pkgA, pkgM], 'monthly').buys, '$rc_monthly');
  // 예전에 평생을 골라 둔 값이 남아도 → 연간(없는 상품을 사려 하거나 버튼이 잠기지 않는다)
  const l = paywall([pkgA, pkgM], 'lifetime');
  assert.equal(l.selected, 'annual');
  assert.equal(l.buys, '$rc_annual');
  assert.equal(l.disabled, false);
});

test('⑦ 연간만(월간·평생 없음): 카드 1장 · 연간 결제 · 버튼 열림', () => {
  const r = paywall([pkgA], null);
  assert.equal(r.multi, true);
  assert.deepEqual(r.cards, ['annual']);
  assert.equal(r.selected, 'annual');
  assert.equal(r.buys, '$rc_annual');
  assert.equal(r.disabled, false);
  assert.equal(paywall([pkgA], 'lifetime').buys, '$rc_annual');
  assert.equal(paywall([pkgA], 'monthly').buys, '$rc_annual');
});

test('④ 체험 종료 시트 → 페이월: 고른 값 없이 열려 연간이 기본 선택(월간 있을 때·없을 때 모두)', () => {
  const sheet = fs.readFileSync(path.join(ROOT, 'src/components/app/TrialSavePaywall.tsx'), 'utf8');
  // 시트는 ProPaywall 을 그대로 쓰고 선택값을 따로 넘기지 않는다 → 페이월 기본 규칙(연간 먼저)을 탄다
  // ★11/11 조기 안내(갱신 끈 직후 1회)는 출처만 trial_off_early 로 넘긴다 — 기본값은 trial_off 그대로
  assert.match(sheet, /<ProPaywall locale=\{locale\} src=\{src\}[^>]*keepOpenWhilePro/);
  assert.match(sheet, /src = 'trial_off'/);
  assert.doesNotMatch(sheet, /picked|initialPlan|defaultPlan|selected=/);
  const pw = fs.readFileSync(path.join(ROOT, 'src/components/app/ProPaywall.tsx'), 'utf8');
  assert.match(pw, /const \[picked, setPicked\] = useState<PlanId \| null>\(null\);/);
  assert.equal(paywall([pkgM, pkgA, pkgL], null).selected, 'annual');
  assert.equal(paywall([pkgA, pkgL], null).selected, 'annual');
  assert.equal(paywall([pkgM, pkgA, pkgL], null).buys, '$rc_annual');
});

test('⑤ 빈 오퍼링: 카드 없음 · 고를 것 없음 · 버튼 잠김(가격을 지어내지 않는다)', () => {
  const r = paywall([], null);
  assert.equal(r.multi, false);
  assert.equal(r.cards, null);
  assert.equal(r.buys, null);
  assert.equal(r.disabled, true);
  assert.equal(paywall([], 'annual').disabled, true);
});

test('화면 식 대조: ProPaywall 의 선택·결제·잠금 식이 위 시험과 같다', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/app/ProPaywall.tsx'), 'utf8');
  assert.match(src, /const \{ multi, selected: pickedPlan \} = paywallSelection\(plans, picked\);/);
  assert.match(src, /const selectedOffer = multi \? \(offers\.find\(\(o\) => o\.plan === selected\) \?\? null\) : monthly;/);
  assert.match(src, /disabled=\{busy \|\| purchasePending \|\| \(multi \? \(!selectedOffer && !previewPlans\) : \(!monthly && !previewPrice\)\)\}/);
  // ★11/12 결제는 공용 흐름(lib/app/trialStartWatchlist.purchaseWithTrialStart)을 거쳐 «선택한 플랜»을 산다
  assert.match(src, /purchase: \(\) => purchase\(selectedOffer\.plan, funnelSrc\),/);
});

test('⑧ 노출 스위치 꺼진 빌드(월간만 노출): 월간이 있으면 예전 그대로 월간 하나 · 월간이 없으면 스토어가 준 플랜으로(아무것도 못 사는 상태 금지)', () => {
  const OFF = ['monthly'] as const;
  // 월간 있음 → 스위치대로 월간 하나(연간·평생은 숨김 — 예전과 같음)
  for (const pkgs of [[pkgM], [pkgL, pkgA, pkgM], [pkgA, pkgM]]) {
    const r = paywall(pkgs, null, OFF);
    assert.equal(r.multi, false);
    assert.equal(r.buys, '$rc_monthly');
    assert.equal(r.disabled, false);
  }
  // 월간 없음(관문 11111109 지적) → 연간만이면 연간 · 연간+평생이면 카드·연간 기본
  assert.deepEqual(paywall([pkgA], null, OFF), { cards: ['annual'], multi: true, selected: 'annual', buys: '$rc_annual', disabled: false });
  assert.equal(paywall([pkgL, pkgA], null, OFF).buys, '$rc_annual');
  assert.deepEqual(paywall([pkgL, pkgA], null, OFF).cards, ['annual'], '스위치 꺼진 빌드의 대체 경로에서도 평생은 안 보인다');
  // 빈 오퍼링 → 여전히 잠김
  assert.equal(paywall([], null, OFF).disabled, true);
});

test('getProOffers 는 paywallOffers(pkgs, activePlans()) 를 쓴다(위 시험이 실제 경로를 본다)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/services/revenueCat.ts'), 'utf8');
  assert.match(src, /return paywallOffers\(pkgs, activePlans\(\)\);/);
});
