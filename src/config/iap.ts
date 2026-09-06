// ============================================================================
// IAP / Pro subscription config — SINGLE SOURCE OF TRUTH
// ----------------------------------------------------------------------------
// The paid ad-removal / Pro subscription ($9.99/mo) is prepared but NOT shipped.
// Everything IAP is gated behind IAP_LIVE. While false:
//   - no RevenueCat SDK init, no purchase UI, no ad-suppression — zero behavior change.
// Flip to true ONLY when ALL of these are done AND verified on a real device build:
//   1. RevenueCat public SDK keys set in Vercel env (below).
//   2. Store products live: App Store `com.signumhq.app.pro.monthly` + Play mirror.
//   3. RevenueCat App Store + Play apps linked, offering with the monthly package.
//   4. Purchase + restore tested end-to-end on a real iPhone AND Android device.
// Showing a non-purchasable price fails App Store 3.1.1 / Play review, so keep this
// false until all of the above is true.
// ============================================================================

export const IAP_LIVE = false;

// Public RevenueCat SDK keys (per-platform, safe to expose — NOT secrets).
// Set these in Vercel env when going live; empty here so nothing runs by default.
export const RC_API_KEY_IOS = process.env.NEXT_PUBLIC_RC_IOS_KEY ?? '';
export const RC_API_KEY_ANDROID = process.env.NEXT_PUBLIC_RC_ANDROID_KEY ?? '';

// RevenueCat entitlement that unlocks Pro / ad-free. Must match the RevenueCat
// dashboard entitlement identifier exactly (Product catalog → Entitlements).
export const PRO_ENTITLEMENT_ID = 'pro';

// ── 상품 식별자 (App Store + Play 미러) ─────────────────────────────────────
// 월간은 ASC 에 이미 생성돼 있다(132개국·3개국어). 연간은 신설 예정.
//
// 가격 정본 (2026-08-18 확정 · 심층조사로 연간가 상향):
//   월간 $9.99  — 내리지 않는다. $4.99 로 내리면 손익분기가 51명 → 101명이 된다.
//   연간 $49.99 — 월간의 5.0배("58% 할인"). 실측 중앙값 밴드는 3~5배다:
//                 RevenueCat 2025(Airbridge 경유) 4.49배 · Business 카테고리 4.95배 ·
//                 Adapty SOIS 2026 2.96배. 시장데이터 앱은 리텐션이 중앙값보다 높아
//                 밴드 상단이 방어된다. 10배($99.99)는 «연간이 17% 할인»이 되어
//                 모바일에서 아무도 안 하는 구성이다.
//                 ※ 8/17 판(3.5배 → $34.99)은 이 값으로 대체됨.
//                 근거 정본: .agent/GROWTH_EXECUTION_PLAN_2026-08-18.md §5
export const PRO_MONTHLY_PRODUCT_ID = 'com.signumhq.app.pro.monthly';
export const PRO_ANNUAL_PRODUCT_ID = 'com.signumhq.app.pro.annual';

/** 구독 플랜 식별자 */
export type PlanId = 'monthly' | 'annual';

/**
 * ★ 출시 시점에 페이월이 «실제로 그리는» 플랜. 2026-08-18 대표 결정: **월간만**.
 *
 * 왜 연간을 뺐나 — 두 가지가 아직 사실이 아니기 때문이다:
 *   1. 연간의 판매 논리는 «광고 제거»인데 **광고가 아직 안 나간다**(애드몹 개인 계정
 *      본인확인 심사 중, 유닛 12개 전부 null → 테스트 폴백). 존재하지 않는 혜택을
 *      1년치로 파는 건 애플 3.1.2 / Play 기만행위에 그대로 걸린다.
 *   2. 카드가 하나면 페이월이 단순해지고 심사 표면적이 줄어든다. MAU 15에서
 *      연간/월간 믹스를 «측정»할 수도 없다 — 지금 넣어도 읽을 데이터가 안 나온다.
 *
 * 연간을 켜는 조건(순서대로):
 *   애드몹 승인 → 실유닛 12개 배선 → 광고가 실제로 노출됨을 실화면으로 확인
 *   → 그때 'annual' 을 이 배열에 추가하고 ASC/Play 에 상품 생성.
 *   가격 근거는 .agent/GROWTH_EXECUTION_PLAN_2026-08-18.md §5 ($49.99 = 월간의 5.0배).
 *
 * ⚠️ 배열만 고치면 된다. 연간 배선(상품ID·패키지 매칭·구매 경로)은 이미 다 있고,
 *    여기 없으면 getProOffers 가 걸러내므로 페이월에 안 뜬다.
 */
export const LAUNCH_PLANS: readonly PlanId[] = ['monthly'];
