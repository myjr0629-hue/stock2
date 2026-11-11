/**
 * 연간·평생 플랜(2026-11-09 대표 «그래 그렇게해» — 연간 ₩89,000 · 평생 ₩149,000).
 *   ① 노출 스위치(NEXT_PUBLIC_PRO_PLANS) 꺼짐 = 오퍼링에 연간·평생 패키지가 있어도 월간 하나만(현 사용자 화면 무변경)
 *   ② 켜짐 = 스토어가 «실제로 내려준» 패키지만(없는 플랜은 지어내지 않는다)
 *   ③ 패키지 판정: packageType 먼저, 없으면 상품 ID 접두(Play 의 :annual 접미사)
 *   ④ 연간 할인율은 스토어 숫자 가격·같은 통화일 때만, 내림
 *   ⑤ 평생 구매 → 권한 'pro' 로 isPro · 복원도 권한으로
 *   ⑥ 페이월 소스: 가격 문자열 하드코딩 0 · multi 아닐 때 예전 가격 줄 경로 유지
 * 네트워크·실제 결제 없음.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

const pkgM = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'com.signumhq.app.pro.monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW', pricePerMonthString: '₩11,900' } };
const pkgA = { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'com.signumhq.app.pro.annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,416' } };
const pkgL = { identifier: '$rc_lifetime', packageType: 'LIFETIME', product: { identifier: 'com.signumhq.app.pro.lifetime', priceString: '₩149,000', price: 149000, currencyCode: 'KRW', pricePerMonthString: null } };
let available: unknown[] = [pkgL, pkgA, pkgM];
let bought: string[] = [];
const proInfo = { entitlements: { active: { pro: { isActive: true } } } };

(globalThis as any).window = { location: { hostname: 'www.signumhq.com', search: '' } };
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } });
mock('@revenuecat/purchases-capacitor', {
  LOG_LEVEL: { ERROR: 'ERROR' },
  Purchases: {
    setLogLevel: async () => {},
    configure: async () => {},
    getOfferings: async () => ({ current: { availablePackages: available } }),
    purchasePackage: async ({ aPackage }: any) => { bought.push(aPackage.identifier); return { customerInfo: proInfo }; },
    restorePurchases: async () => ({ customerInfo: proInfo }),
    getCustomerInfo: async () => ({ customerInfo: proInfo }),
  },
});

const ROOT = path.resolve(__dirname, '..');
const RC = path.join(ROOT, 'src/services/revenueCat.ts');
const IAP = path.join(ROOT, 'src/config/iap.ts');

/** 노출 스위치 값을 바꿔 서비스·설정 모듈을 새로 읽는다(NEXT_PUBLIC 은 빌드 시 박히는 값이라 모듈 평가 시점에 읽힌다) */
function load(env: string | undefined) {
  if (env === undefined) delete process.env.NEXT_PUBLIC_PRO_PLANS; else process.env.NEXT_PUBLIC_PRO_PLANS = env;
  process.env.NEXT_PUBLIC_RC_IOS_KEY = 'appl_test_public';
  for (const k of Object.keys(require.cache)) {
    if (/src[\\/](services[\\/]revenueCat|config[\\/]iap|lib[\\/]app[\\/]proEntitlement)\.ts$/.test(k)) delete require.cache[k];
  }
  return { rc: require(RC) as typeof import('../src/services/revenueCat'), iap: require(IAP) as typeof import('../src/config/iap') };
}

test('스위치 꺼짐(기본): 오퍼링에 연간·평생이 있어도 월간 하나만 — 현 사용자 화면 무변경', async () => {
  available = [pkgL, pkgA, pkgM];
  const { rc, iap } = load(undefined);
  assert.deepEqual(iap.LAUNCH_PLANS, ['monthly']);
  const offers = await rc.getProOffers();
  assert.deepEqual(offers.map((o) => o.plan), ['monthly']);
  assert.equal(offers[0].priceString, '₩11,900');
  // 운영 도메인에서는 ?sgplans=1 이 먹지 않는다
  (globalThis as any).window.location.search = '?sgplans=1';
  assert.deepEqual(rc.activePlans(), ['monthly']);
  (globalThis as any).window.location.search = '';
});

test('스위치 켜짐: 월간·연간 순서 · 스토어 값 그대로 · 평생은 오퍼링에 있어도 안 판다(11/11 평생 폐지)', async () => {
  available = [pkgL, pkgA, pkgM];
  const { rc } = load('1');
  const offers = await rc.getProOffers();
  assert.deepEqual(offers.map((o) => o.plan), ['monthly', 'annual']);
  const a = offers.find((o) => o.plan === 'annual')!;
  assert.equal(a.priceString, '₩89,000');
  assert.equal(a.price, 89000);
  assert.equal(a.currencyCode, 'KRW');
  assert.equal(a.pricePerMonthString, '₩7,416');
});

test('스위치 켜짐 + 스토어가 연간·평생을 안 내려줌(애플 미승인 등) → 월간 하나(카드 숨김)', async () => {
  available = [pkgM];
  const { rc } = load('1');
  assert.deepEqual((await rc.getProOffers()).map((o) => o.plan), ['monthly']);
  available = [pkgM, pkgL];
  assert.deepEqual((await rc.getProOffers()).map((o) => o.plan), ['monthly'], '평생 패키지가 와도 카드 없음');
});

test('패키지 판정: packageType 이 CUSTOM 이어도 상품 ID 접두로(Play :annual 접미사) — 엉뚱한 상품 결제 금지', () => {
  const { rc } = load('1');
  const playA = { identifier: 'x', packageType: 'CUSTOM', product: { identifier: 'com.signumhq.app.pro.annual:annual', priceString: '$74.99' } } as any;
  const playL = { identifier: 'y', packageType: 'CUSTOM', product: { identifier: 'com.signumhq.app.pro.lifetime', priceString: '$124.99' } } as any;
  assert.equal(rc.matchPlanPackage([playL, playA], 'annual'), playA);
  assert.equal(rc.matchPlanPackage([playL, playA], 'lifetime'), playL);
  assert.equal(rc.matchPlanPackage([playL, playA], 'monthly'), undefined);
});

test('평생 폐지: 오퍼링에 평생이 있어도 평생 결제 경로 없음(no_offering) · 연간은 결제 · 복원은 권한 pro 로(평생 구매자도)', async () => {
  available = [pkgL, pkgA, pkgM];
  const { rc } = load('1');
  bought = [];
  const r = await rc.purchasePro('lifetime');
  assert.deepEqual(bought, []);
  assert.equal(r.error, 'no_offering');
  const a = await rc.purchasePro('annual');
  assert.deepEqual(bought, ['$rc_annual']);
  assert.equal(a.isPro, true);
  assert.equal((await rc.restorePro()).isPro, true);
  // 스위치 꺼짐이면 연간·평생 구매 경로 자체가 없다(no_offering) — 월간만 결제된다
  const off = load(undefined).rc;
  bought = [];
  assert.equal((await off.purchasePro('lifetime')).error, 'no_offering');
  assert.deepEqual(bought, []);
});

test('연간 할인율: 같은 통화·스토어 숫자만 · 내림 · 5% 미만/통화 다름/값 없음 = 배지 없음', () => {
  const { annualSavePct, planFineLine } = require(path.join(ROOT, 'src/lib/app/proPlans.ts'));
  const m = { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' };
  assert.equal(annualSavePct(m, { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW' }), 37); // 1-89000/142800 = 37.67% → 37
  assert.equal(annualSavePct({ ...m, price: 9.99, currencyCode: 'USD' }, { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD' }), 37);
  assert.equal(annualSavePct(m, { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD' }), null);
  assert.equal(annualSavePct(m, { plan: 'annual', priceString: '₩140,000', price: 140000, currencyCode: 'KRW' }), null);
  assert.equal(annualSavePct(m, { plan: 'annual', priceString: '₩89,000', currencyCode: 'KRW' }), null);
  assert.equal(annualSavePct(null, null), null);
  const t = { renewNote: 'R', manageNote: 'M', renewAnnual: 'RA', lifetimeNote: 'LN', lifetimeManage: 'LM' };
  assert.equal(planFineLine('ko', t, 'monthly'), 'R M');
  assert.equal(planFineLine('ko', t, 'annual'), 'RA M');
  assert.equal(planFineLine('ja', t, 'lifetime'), 'LNLM');
});

test('페이월 소스: 가격 문자열 하드코딩 0 · 월간만이면 예전 가격 줄(.priceCard) 경로 · 기본 선택 연간', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/components/app/ProPaywall.tsx'), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.equal(/[₩$¥]\s?\d/.test(code), false, '가격 숫자 문자열이 코드에 있으면 안 된다(주석 제외)');
  // ★11/11 multi·기본 선택은 proPlans.paywallSelection 으로 옮겼다(연간·평생만 와도 살 수 있게) — 아래 별도 시험
  assert.match(src, /const \{ multi, selected: pickedPlan \} = paywallSelection\(plans, picked\)/);
  assert.match(src, /\{multi \? \(\s*<div className=\{s\.plans\}/);
  assert.match(src, /<div className=\{s\.priceCard\}>/);
  assert.match(src, /priceString/);
});

test('★11/11 월간 없이 연간·평생만 와도 고를 수 있고 살 수 있다(paywallSelection)', async () => {
  const { paywallSelection } = await import('../src/lib/app/proPlans');
  const P = (...ids: Array<'monthly' | 'annual' | 'lifetime'>) => ids.map((plan) => ({ plan }));
  // 예전 화면 그대로: 월간 하나·빈 목록
  assert.deepEqual(paywallSelection(P('monthly'), null), { multi: false, selected: 'monthly' });
  assert.deepEqual(paywallSelection([], null), { multi: false, selected: 'monthly' });
  // 세 개 → 기본 연간, 고르면 그것
  assert.deepEqual(paywallSelection(P('monthly', 'annual', 'lifetime'), null), { multi: true, selected: 'annual' });
  assert.deepEqual(paywallSelection(P('monthly', 'annual', 'lifetime'), 'lifetime'), { multi: true, selected: 'lifetime' });
  assert.deepEqual(paywallSelection(P('monthly', 'lifetime'), null), { multi: true, selected: 'monthly' });
  // 결함 재현: 월간 없이 연간·평생 → 예전엔 multi=false(구매 불가). 이제 카드·연간 기본·평생 선택 가능
  assert.deepEqual(paywallSelection(P('annual', 'lifetime'), null), { multi: true, selected: 'annual' });
  assert.deepEqual(paywallSelection(P('annual', 'lifetime'), 'lifetime'), { multi: true, selected: 'lifetime' });
  assert.deepEqual(paywallSelection(P('annual', 'lifetime'), 'monthly'), { multi: true, selected: 'annual' }, '없는 플랜을 골라 둔 값은 무시');
  assert.deepEqual(paywallSelection(P('lifetime'), null), { multi: true, selected: 'lifetime' });
  assert.deepEqual(paywallSelection(P('annual'), null), { multi: true, selected: 'annual' });
});
