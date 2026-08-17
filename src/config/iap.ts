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

/** 구독 플랜 — 페이월이 두 개를 «나란히» 보여주고 사용자가 고른다 */
export type PlanId = 'monthly' | 'annual';
