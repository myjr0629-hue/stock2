/**
 * 체험 만료자 «월간 첫 달 할인» (2026-11-12) — 대상 판정 · 스토어 오퍼 식별 · 고지 문구 · 할인 누출 0(소스 대조).
 *   대상: 만료 페이월 대상 + 과거 결제 0(1회 결제 0 · 산 상품 = 체험 상품 하나 · 첫 구매 = 체험 시작). 모르면 대상 아님.
 *   오퍼: iOS discounts 의 expired_50_1m(1개월·1회·정가보다 쌈) / 안드 monthly:expired-50-1m(rc-ignore-offer · 2단계 · 정가 = 기본 요금제)
 *   누출 0: 할인 결제 함수(purchaseDiscountedPackage·purchaseSubscriptionOption·getPromotionalOffer)는 서비스 한 곳 · 카드는 만료 페이월에서만.
 * 네트워크·실제 결제 없음. 실행: npx tsx --test tests/expiredOffer.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { EXPIRED_OFFER_IOS_ID, EXPIRED_OFFER_PLAY_OPTION_ID, RC_IGNORE_OFFER_TAG, discountPct, expiredOfferCopy, expiredOfferEligible, pickExpiredOffer } from '../src/lib/app/expiredOffer';
import { trialExpiredNotice } from '../src/lib/app/trialExpired';
import { isFunnelSrc } from '../src/lib/app/funnelSchema';

const ROOT = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const H = 3600_000, D = 86400_000;
const start = Date.parse('2026-10-13T01:00:00Z');
const expiresAt = start + 30 * D;
const now = expiresAt + 5 * H;
const MONTHLY = 'com.signumhq.app.pro.monthly', ANNUAL = 'com.signumhq.app.pro.annual', LIFETIME = 'com.signumhq.app.pro.lifetime';
const ent = { identifier: 'pro', productIdentifier: MONTHLY, isActive: false, willRenew: false, periodType: 'TRIAL', ownershipType: 'PURCHASED', store: 'APP_STORE', isSandbox: false, billingIssueDetectedAt: null, latestPurchaseDate: new Date(start).toISOString(), originalPurchaseDate: new Date(start).toISOString(), expirationDate: new Date(expiresAt).toISOString() };
type Opt = { c?: Record<string, unknown>; active?: Record<string, unknown>; subs?: string[]; bought?: unknown; nst?: unknown };
const info = ({ c = {}, active, subs = [], bought = [MONTHLY], nst = [] }: Opt = {}) =>
  ({ entitlements: { all: { pro: { ...ent, ...c } }, active: active ? { pro: { ...ent, isActive: true, ...active } } : {} }, activeSubscriptions: subs, allPurchasedProductIdentifiers: bought, nonSubscriptionTransactions: nst }) as never;

test('대상: 체험만 끝난 고객(결제 0) — iOS·안드(Play 상품 ID 접미사)·연간 체험', () => {
  assert.equal(expiredOfferEligible(info()), true);
  assert.ok(trialExpiredNotice(info(), 'ios', now, null, '2026-11-12'), '만료 페이월 대상과 같은 고객');
  assert.equal(expiredOfferEligible(info({ c: { store: 'PLAY_STORE', productIdentifier: `${MONTHLY}:monthly` }, bought: [`${MONTHLY}:monthly`] })), true);
  assert.equal(expiredOfferEligible(info({ c: { productIdentifier: ANNUAL }, bought: [ANNUAL] })), true, '연간 체험자도 월간 할인 대상(결제 0)');
  assert.equal(expiredOfferEligible(info({ c: { originalPurchaseDate: new Date(start - 60_000).toISOString() } })), true, '시각 반올림 차(1분)');
});

test('대상 아님: 결제 이력이 있거나 «모름»', () => {
  assert.equal(expiredOfferEligible(null), false);
  assert.equal(expiredOfferEligible(info({ nst: [{ productIdentifier: LIFETIME }] })), false, '평생(1회 결제) 구매 이력');
  assert.equal(expiredOfferEligible({ ...(info() as object), nonSubscriptionTransactions: undefined } as never), false, '1회 결제 목록 없음 = 모름');
  assert.equal(expiredOfferEligible(info({ bought: [MONTHLY, ANNUAL] })), false, '다른 구독 상품 이력');
  assert.equal(expiredOfferEligible(info({ bought: [MONTHLY, LIFETIME] })), false);
  assert.equal(expiredOfferEligible(info({ bought: [] })), false, '구매 상품 목록 비어 있음 = 모름');
  assert.equal(expiredOfferEligible({ ...(info() as object), allPurchasedProductIdentifiers: undefined } as never), false, '구매 상품 목록 없음 = 모름');
  assert.equal(expiredOfferEligible(info({ c: { originalPurchaseDate: new Date(start - 40 * D).toISOString() } })), false, '체험 앞에 유료 기간');
  assert.equal(expiredOfferEligible(info({ c: { originalPurchaseDate: new Date(start - 24 * H).toISOString() } })), false, '체험 하루 전 첫 구매(관문 11121040)');
  assert.equal(expiredOfferEligible(info({ c: { originalPurchaseDate: new Date(start - 6 * 60_000).toISOString() } })), false, '5분 넘게 어긋남');
  assert.equal(expiredOfferEligible(info({ c: { originalPurchaseDate: null } })), false, '첫 구매일 없음');
  assert.equal(expiredOfferEligible(info({ c: { periodType: 'NORMAL' } })), false, '유료였다가 만료');
  assert.equal(expiredOfferEligible(info({ c: { periodType: 'INTRO' } })), false);
  assert.equal(expiredOfferEligible(info({ active: { periodType: 'NORMAL', willRenew: true } })), false, '지금 PRO');
  assert.equal(expiredOfferEligible(info({ subs: [MONTHLY] })), false, '활성 구독');
  assert.equal(expiredOfferEligible({ ...(info() as object), activeSubscriptions: undefined } as never), false, '활성 구독 목록 없음 = 모름');
  assert.equal(expiredOfferEligible(info({ c: { isSandbox: true } })), false, '시험 고객');
  assert.equal(expiredOfferEligible(info({ c: { willRenew: true } })), false);
  assert.equal(expiredOfferEligible(info({ c: { productIdentifier: LIFETIME }, bought: [LIFETIME] })), false, '체험 상품이 구독이 아님');
  assert.equal(expiredOfferEligible({ entitlements: { all: {}, active: {} }, activeSubscriptions: [], allPurchasedProductIdentifiers: [], nonSubscriptionTransactions: [] } as never), false, '체험 이력 없음');
});

// ── 스토어 오퍼 식별 ──────────────────────────────────────────────────────────
const iosPkg = (discounts: unknown, product: Record<string, unknown> = {}) => ({ identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: MONTHLY, price: 11900, priceString: '₩11,900', currencyCode: 'KRW', discounts, ...product } }) as never;
const disc = (o: Record<string, unknown> = {}) => ({ identifier: EXPIRED_OFFER_IOS_ID, price: 5900, priceString: '₩5,900', cycles: 1, period: 'P1M', periodUnit: 'MONTH', periodNumberOfUnits: 1, ...o });

test('iOS: expired_50_1m 를 정확히 고른다(가격은 스토어 문자열 그대로)', () => {
  const p = pickExpiredOffer(iosPkg([disc({ identifier: 'other' }), disc()]), 'ios');
  assert.ok(p && p.platform === 'ios');
  assert.equal(p.priceString, '₩5,900');
  assert.equal(p.regularPriceString, '₩11,900');
  assert.equal(p.pct, 50);
  assert.equal(p.discount.identifier, EXPIRED_OFFER_IOS_ID);
});

test('iOS: 오퍼가 없거나 모양이 다르면 null(카드 없음 = 기존 페이월 그대로)', () => {
  assert.equal(pickExpiredOffer(iosPkg(null), 'ios'), null, 'discounts 없음(전파 전)');
  assert.equal(pickExpiredOffer(iosPkg([]), 'ios'), null);
  assert.equal(pickExpiredOffer(iosPkg([disc({ identifier: 'expired_50_1m_x' })]), 'ios'), null);
  assert.equal(pickExpiredOffer(iosPkg([disc({ cycles: 2 })]), 'ios'), null, '2개월');
  assert.equal(pickExpiredOffer(iosPkg([disc({ periodUnit: 'YEAR' })]), 'ios'), null);
  assert.equal(pickExpiredOffer(iosPkg([disc({ periodNumberOfUnits: 3 })]), 'ios'), null);
  assert.equal(pickExpiredOffer(iosPkg([disc({ price: 11900 })]), 'ios'), null, '정가와 같음');
  assert.equal(pickExpiredOffer(iosPkg([disc({ price: 0, priceString: '무료' })]), 'ios'), null, '무료 기간은 이 오퍼가 아니다');
  assert.equal(pickExpiredOffer(iosPkg([disc({ priceString: '' })]), 'ios'), null);
  assert.equal(pickExpiredOffer(iosPkg([disc()], { identifier: ANNUAL }), 'ios'), null, '연간 상품에는 붙이지 않는다');
  assert.equal(pickExpiredOffer(iosPkg([disc()]), 'android'), null, '플랫폼 불일치');
  assert.equal(pickExpiredOffer(iosPkg([disc()]), 'web'), null);
  assert.equal(pickExpiredOffer(null, 'ios'), null);
});

const phase = (micros: number, formatted: string, o: Record<string, unknown> = {}) => ({ billingPeriod: { unit: 'MONTH', value: 1, iso8601: 'P1M' }, recurrenceMode: 1, billingCycleCount: null, price: { formatted, amountMicros: micros, currencyCode: 'KRW' }, offerPaymentMode: null, ...o });
const baseOpt = { id: 'monthly', storeProductId: `${MONTHLY}:monthly`, productId: MONTHLY, isBasePlan: true, tags: [], pricingPhases: [phase(11_900_000_000, '₩11,900')] };
const offerOpt = (o: Record<string, unknown> = {}) => ({ id: EXPIRED_OFFER_PLAY_OPTION_ID, storeProductId: `${MONTHLY}:monthly`, productId: MONTHLY, isBasePlan: false, tags: [RC_IGNORE_OFFER_TAG], pricingPhases: [phase(5_950_000_000, '₩5,950', { recurrenceMode: 3, billingCycleCount: 1, offerPaymentMode: 'SINGLE_PAYMENT' }), phase(11_900_000_000, '₩11,900')], ...o });
const andPkg = (opts: unknown[], product: Record<string, unknown> = {}) => ({ identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: `${MONTHLY}:monthly`, price: 11900, priceString: '₩11,900', currencyCode: 'KRW', discounts: null, subscriptionOptions: opts, defaultOption: baseOpt, ...product } }) as never;

test('안드: monthly:expired-50-1m(rc-ignore-offer)를 고른다 — 첫 달·정가 문자열은 Play 값', () => {
  const p = pickExpiredOffer(andPkg([baseOpt, offerOpt()]), 'android');
  assert.ok(p && p.platform === 'android');
  assert.equal(p.priceString, '₩5,950');
  assert.equal(p.regularPriceString, '₩11,900');
  assert.equal(p.pct, 50);
  assert.equal(p.option.id, EXPIRED_OFFER_PLAY_OPTION_ID);
  assert.ok(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(5_950_000_000, '₩5,950', { recurrenceMode: 'NON_RECURRING', billingCycleCount: 0 }), phase(11_900_000_000, '₩11,900', { recurrenceMode: 'INFINITE_RECURRING' })] })]), 'android'), '브리지가 이름 문자열로 줘도');
  assert.ok(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(5_950_000_000, '₩5,950', { recurrenceMode: 2, billingCycleCount: 1 }), phase(11_900_000_000, '₩11,900')] })]), 'android'), '1회 할인 반복(FINITE 1)');
});

test('안드: 태그·단계·가격·통화가 어긋나면 null', () => {
  assert.equal(pickExpiredOffer(andPkg([baseOpt]), 'android'), null, '오퍼 없음');
  assert.equal(pickExpiredOffer(andPkg([]), 'android'), null);
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ tags: [] })]), 'android'), null, 'rc-ignore-offer 없으면 일반 결제 누출 위험 → 카드도 없음');
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ id: 'monthly:other' })]), 'android'), null);
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ isBasePlan: true })]), 'android'), null);
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(11_900_000_000, '₩11,900')] })]), 'android'), null, '1단계');
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(5_950_000_000, '₩5,950', { recurrenceMode: 2, billingCycleCount: 2 }), phase(11_900_000_000, '₩11,900')] })]), 'android'), null, '2개월 할인');
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(0, '무료', { recurrenceMode: 3 }), phase(11_900_000_000, '₩11,900')] })]), 'android'), null, '무료 기간');
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(5_950_000_000, '₩5,950', { recurrenceMode: 3, billingPeriod: { unit: 'WEEK', value: 1, iso8601: 'P1W' } }), phase(11_900_000_000, '₩11,900')] })]), 'android'), null, '1주');
  assert.equal(pickExpiredOffer(andPkg([offerOpt({ pricingPhases: [phase(5_950_000_000, '₩5,950', { recurrenceMode: 3, price: { formatted: '$5', amountMicros: 5_000_000, currencyCode: 'USD' } }), phase(11_900_000_000, '₩11,900')] })]), 'android'), null, '통화 불일치');
  assert.equal(pickExpiredOffer(andPkg([offerOpt()], { price: 13000 }), 'android'), null, '정가 단계 ≠ 페이월 월간 가격');
  assert.equal(pickExpiredOffer(andPkg([offerOpt()], { identifier: `${ANNUAL}:annual` }), 'android'), null);
});

test('할인율: 내림 · 정가 이상·0·범위 밖은 null', () => {
  assert.equal(discountPct(5900, 11900), 50);
  assert.equal(discountPct(4.99, 9.99), 50);
  assert.equal(discountPct(640, 1280), 50);
  assert.equal(discountPct(125, 249), 49, '49.8% 를 50% 로 올려 말하지 않는다');
  assert.equal(discountPct(11900, 11900), null);
  assert.equal(discountPct(0, 11900), null);
  assert.equal(discountPct(11800, 11900), null, '5% 미만');
});

test('고지(3.1.2): 첫 달 가격 · 이후 정가 · 자동 갱신 · 해지 — ko/en/ja · 긴급함·투자 권유 낱말 없음', () => {
  const want: Record<string, RegExp[]> = { ko: [/첫 1개월/, /자동 갱신/, /해지/], en: [/first month/, /Renews automatically/, /Cancel/], ja: [/最初の1か月/, /自動更新/, /解約/] };
  for (const loc of ['ko', 'en', 'ja'] as const) {
    const c = expiredOfferCopy(loc);
    const fine = c.fine('P1', 'R2');
    assert.ok(fine.includes('P1') && fine.includes('R2'), loc);
    for (const re of want[loc]) assert.match(fine, re, `${loc} ${re}`);
    assert.ok(c.then('R2').includes('R2'));
    const all = [c.name, c.badge(50), c.firstMonth, c.then('R2'), fine].join(' ');
    assert.doesNotMatch(all, /오늘만|마감|서두르|지금 바로|today only|hurry|last chance|limited time|今だけ|急いで|매수|매도|수익 보장|buy now|guarantee/i, loc);
  }
  assert.equal(expiredOfferCopy('fr').name, expiredOfferCopy('en').name, '그 밖의 언어 = 영어');
});

// ── 할인 누출 0 — 소스 대조 ───────────────────────────────────────────────────
const walk = (d: string, out: string[] = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e.name)) out.push(p); } return out; };
const SRC = walk(path.join(ROOT, 'src'));
const usersOf = (re: RegExp) => SRC.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f)).sort();

test('할인 결제 SDK 호출은 서비스 한 곳(src/services/revenueCat.ts)에만', () => {
  for (const fn of ['purchaseDiscountedPackage', 'purchaseSubscriptionOption', 'getPromotionalOffer']) {
    assert.deepEqual(usersOf(new RegExp(`\\b${fn}\\(`)), ['src/services/revenueCat.ts'], fn);
  }
  const rc = read('src/services/revenueCat.ts');
  // 일반 구매(purchasePro)는 예전 그대로 purchasePackage 하나 — 할인·옵션을 넘기지 않는다
  const pro = rc.slice(rc.indexOf('export async function purchasePro('), rc.indexOf('export async function restorePro('));
  assert.match(pro, /Purchases\.purchasePackage\(\{ aPackage: pkg \}\)/);
  assert.doesNotMatch(pro, /discount|subscriptionOption|Discounted/i);
  // 할인 결제는 실패해도 정가 결제로 넘어가지 않는다
  const buy = rc.slice(rc.indexOf('export async function purchaseExpiredOffer('));
  assert.doesNotMatch(buy, /purchasePackage\(/);
  assert.match(buy, /if \(!signed \|\| signed\.identifier !== offer\.discount\.identifier\) return \{ ok: false, isPro: false, error: 'offer_unavailable' \};/);
  // 오퍼 확인: iOS 는 애플 서명이 나와야만
  const load = rc.slice(rc.indexOf('export async function loadExpiredOffer('), rc.indexOf('export async function purchaseExpiredOffer('));
  assert.match(load, /if \(!signed \|\| signed\.identifier !== pick\.discount\.identifier\) return null;/);
  assert.match(load, /matchPlanPackage\(offerings\.current\?\.availablePackages \?\? \[\], 'monthly'\)/);
});

test('할인 카드는 만료 1회 페이월에서만 — discountOffer·purchaseOffer·loadExpiredOffer 호출부 고정', () => {
  assert.deepEqual(usersOf(/<ProPaywall\b[^>]*\bdiscountOffer=/), ['src/components/app/TrialSavePaywall.tsx']);
  assert.deepEqual(usersOf(/<TrialSavePaywall\b[^>]*\bdiscountOffer=/), ['src/components/app/TrialRenewalOffNotice.tsx']);
  assert.deepEqual(usersOf(/\bpurchaseOffer\(/), ['src/components/app/ProPaywall.tsx']);
  assert.deepEqual(usersOf(/\bloadExpiredOffer\(/), ['src/components/app/TrialRenewalOffNotice.tsx', 'src/services/revenueCat.ts']);
  const notice = read('src/components/app/TrialRenewalOffNotice.tsx');
  // TrialSavePaywall 에 discountOffer 를 넘기는 곳은 만료 페이월(src="trial_expired") 한 곳
  const sends = notice.match(/<TrialSavePaywall\b[^>]*\/>/g) || [];
  assert.deepEqual(sends.filter((x) => /discountOffer=/.test(x)).map((x) => /src="trial_expired"/.test(x)), [true]);
  // 대상 판정은 첫 읽기·새 읽기 모두
  assert.match(notice, /offerEligible = !!lapsed && !!fresh && expiredOfferEligible\(snapshot\.customerInfo\) && expiredOfferEligible\(fresh\.customerInfo\);/);
  // 대상이 아니면 오퍼를 읽지도 않는다(바로 null)
  assert.match(notice, /useState<ExpiredOffer \| ExpiredOfferView \| null \| undefined>\(\(\) => notice\.offerEligible \?/);
  const sheet = read('src/components/app/TrialSavePaywall.tsx');
  assert.match(sheet, /discountOffer=\{src === 'trial_expired' \? discountOffer : null\}/);
  assert.equal((sheet.match(/discountOffer=/g) || []).length, 1, '체험 중 시트 경로(keepOpenWhilePro)에는 없다');
  const pw = read('src/components/app/ProPaywall.tsx');
  assert.match(pw, /const offer = context && discountOffer && \(previewPlans \?\? offers\)\.some\(\(p\) => p\.plan === 'monthly'\) \? discountOffer : null;/, 'context 없는 화면에선 넘어와도 안 그린다 · 정가 월간 카드가 있을 때만(관문 11121047)');
  assert.match(pw, /if \(!offerReal\) return;/, '미리보기 값으로는 결제하지 않는다');
});

test('계측 출처 trial_expired_offer — 스키마·집계 스크립트 둘 다', () => {
  assert.ok(isFunnelSrc('trial_expired_offer'));
  assert.match(read('scripts/mkt-funnel.js'), /'trial_expired_offer'\]/);
});
