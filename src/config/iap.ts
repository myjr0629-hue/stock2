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

// Store product identifier for the $9.99/mo subscription (App Store + Play mirror).
export const PRO_MONTHLY_PRODUCT_ID = 'com.signumhq.app.pro.monthly';
