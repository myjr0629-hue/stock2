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

// ★ 2026-09-08 켜짐 — 스토어 쪽이 전부 승인된 뒤(구독 APPROVED · 앱 1.6 READY_FOR_SALE),
//   RevenueCat 오퍼링이 iOS·Android 양쪽에서 실제로 내려오는 것을 REST 로 확인하고 켰다.
//   ⚠️ 이 플래그만으로는 «웹 방문자»에게도 버튼이 뜬다(앱과 웹이 같은 URL).
//      실제 노출 조건은 useProStatus().iapAvailable = IAP_LIVE && 네이티브 다.
export const IAP_LIVE = true;

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
/** ★ 2026-11-09 신설 — 평생(비소모성 1회 결제). 같은 RevenueCat 권한 'pro' 를 준다(갱신 없음). */
export const PRO_LIFETIME_PRODUCT_ID = 'com.signumhq.app.pro.lifetime';

/** 플랜 식별자 — 월간·연간은 자동 갱신 구독(같은 구독 그룹), 평생은 1회 결제 */
export type PlanId = 'monthly' | 'annual' | 'lifetime';

/**
 * ★ 출시 시점에 페이월이 «실제로 그리는» 플랜. 2026-08-18 대표 결정: **월간만**. (→ 2026-11-09 연간·평생 추가, 아래 «노출 스위치»)
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
// ★ 2026-11-09 대표 결정(«이젠 수익이나야 이 프로젝트를 이어갈수있다» → 연간 ₩89,000 · 평생 ₩149,000 «그래 그렇게해»).
//   스토어 상품(11/9 생성): ASC 연간 6832451434(구독 그룹 22205273, 월간과 같은 그룹) · ASC 평생 6832451861(NON_CONSUMABLE)
//   · Play com.signumhq.app.pro.annual(기본 요금제 annual, 연간) · Play 1회 상품 com.signumhq.app.pro.lifetime(구매 옵션 lifetime)
//   · RevenueCat 오퍼링 default 에 $rc_annual · $rc_lifetime 추가, 둘 다 권한 'pro'.
//   가격(KR/US): 연간 ₩89,000 / $74.99 · 평생 ₩149,000 / $124.99 — 화면은 스토어가 준 현지 문자열만 쓴다(여기 값은 기록일 뿐).
//
// 노출 스위치 — NEXT_PUBLIC_PRO_PLANS === '1' 일 때만 연간·평생 카드를 그린다(값 없으면 예전 그대로 월간 하나).
//   웹 레이어가 앱에 원격으로 실리므로(capacitor server.url) main 병합 = 사용자 반영이다. 스토어 쪽 상태와 무관하게
//   «꺼진 채» 병합할 수 있게 둔 스위치다. 켜기 = Vercel Production 환경변수 추가 + 재배포(NEXT_PUBLIC 은 빌드 시 박힌다).
//   켜져 있어도 스토어가 그 패키지를 안 내려주면(애플 미승인 등) 그 카드만 안 뜬다 — getProOffers 가 걸러낸다.
//   프리뷰(*.vercel.app·localhost)에서는 `?sgplans=1` 로 켜 볼 수 있다(proEntitlement.previewFlag — 운영 도메인 불가).
export const PRO_MULTI_PLAN_ENV = process.env.NEXT_PUBLIC_PRO_PLANS === '1';
// ★ 2026-11-11 대표 «평생결제는 하지 않는 것으로» — 페이월이 파는 플랜은 월간·연간 둘뿐이다. RC 오퍼링에서도 $rc_lifetime 을 뺐지만
//   (lifetime-off/RESULT.md) 누가 오퍼링에 다시 넣어도 페이월에 평생 카드가 뜨지 않게 코드에서도 막는다. 평생 상품 ID·패키지 매칭·권한은
//   남긴다(혹시 있을 평생 구매자의 PRO·구매 복원은 권한 'pro' 로 그대로 — 복원은 패키지 목록과 무관).
export const MULTI_PLANS: readonly PlanId[] = ['monthly', 'annual'];
export const LAUNCH_PLANS: readonly PlanId[] = PRO_MULTI_PLAN_ENV ? MULTI_PLANS : ['monthly'];
