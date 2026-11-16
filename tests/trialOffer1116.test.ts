/**
 * ★11/16 스토어 무료 체험(소개 오퍼) 표시 + 첫 실행 체험 페이월 판정.
 *   ① trialDaysFor: iOS = 무료 introPrice + 자격 ELIGIBLE 일 때만 · 안드 = defaultOption.freePhase · 그 밖 null
 *   ② ProPaywall: 체험 없으면 예전 문구·버튼 그대로(바이트 비교) · 체험 있으면 «7일 무료로 시작» + 버튼 위 조건 한 줄 + 고지문(24시간)
 *   ③ firstRunPaywallStep: PRO·공유 PRO·결제 진행 중·이미 봄·체험 없음 = 건너뜀, 모르면 기다림
 * 실행: npx tsx --test tests/trialOffer1116.test.ts  (네트워크·실결제 없음)
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { test } from 'node:test';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

const plans = require('../src/lib/app/proPlans') as typeof import('../src/lib/app/proPlans');
const frp = require('../src/lib/app/firstRunPaywall') as typeof import('../src/lib/app/firstRunPaywall');

test('① trialDaysFor — iOS 는 무료 intro + ELIGIBLE 일 때만', () => {
  const week = { introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } };
  assert.equal(plans.trialDaysFor(week, 'ios', true), 7);
  assert.equal(plans.trialDaysFor(week, 'ios', false), null, '자격 없음');
  assert.equal(plans.trialDaysFor(week, 'ios', undefined), null, '모름/조회 실패');
  assert.equal(plans.trialDaysFor({ introPrice: { price: 2900, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 } }, 'ios', true), null, '유료 intro 는 체험 아님');
  assert.equal(plans.trialDaysFor({ introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 } }, 'ios', true), 7);
  assert.equal(plans.trialDaysFor({ introPrice: { price: 0, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 } }, 'ios', true), null, '월 단위는 일수로 말하지 않음');
  assert.equal(plans.trialDaysFor({ introPrice: null }, 'ios', true), null);
  assert.equal(plans.trialDaysFor(null, 'ios', true), null);
  assert.equal(plans.trialDaysFor(week, 'web', true), null);
});

test('① trialDaysFor — 안드는 defaultOption.freePhase(Play 가 자격 있는 오퍼만 준다)', () => {
  assert.equal(plans.trialDaysFor({ defaultOption: { freePhase: { billingPeriod: { unit: 'WEEK', value: 1, iso8601: 'P1W' } } } }, 'android'), 7);
  assert.equal(plans.trialDaysFor({ defaultOption: { freePhase: { billingPeriod: { iso8601: 'P7D' } } } }, 'android'), 7);
  assert.equal(plans.trialDaysFor({ defaultOption: { freePhase: null } }, 'android'), null);
  assert.equal(plans.trialDaysFor({ defaultOption: { freePhase: { billingPeriod: { unit: 'WEEK', value: 1 } }, introPhase: { price: 1 } } }, 'android'), null, '무료 뒤 유료 소개 단계 = 체험 말하지 않음');
  assert.equal(plans.trialDaysFor({ defaultOption: null }, 'android'), null);
  assert.equal(plans.isoPeriodDays('P1M'), null);
  assert.equal(plans.periodDays('DAY', 40), null);
});

test('③ firstRunPaywallStep', () => {
  const base = { iapAvailable: true, ready: true, isPro: false, pending: false, sharedPro: false, shown: false, offers: [{ plan: 'monthly', trialDays: 7 }, { plan: 'annual', trialDays: 7 }] };
  assert.equal(frp.firstRunPaywallStep(base), 'check');
  assert.equal(frp.firstRunPaywallStep({ ...base, isPro: true }), 'skip', 'PRO(코드 PRO 포함)');
  assert.equal(frp.firstRunPaywallStep({ ...base, sharedPro: true }), 'skip');
  assert.equal(frp.firstRunPaywallStep({ ...base, pending: true }), 'skip');
  assert.equal(frp.firstRunPaywallStep({ ...base, shown: true }), 'skip');
  assert.equal(frp.firstRunPaywallStep({ ...base, ready: false }), 'wait');
  assert.equal(frp.firstRunPaywallStep({ ...base, iapAvailable: false }), 'skip', '웹');
  assert.equal(frp.firstRunPaywallStep({ ...base, offers: [{ plan: 'monthly' }, { plan: 'annual', trialDays: null }] }), 'skip', '체험 자격 없음');
  assert.equal(frp.firstRunPaywallStep({ ...base, offers: [{ plan: 'lifetime', trialDays: 7 }] }), 'skip');
  const m = new Map<string, string>();
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
  assert.equal(frp.readFirstRunPaywallShown(st), false);
  assert.equal(frp.markFirstRunPaywallShown(st, 1), true);
  assert.equal(frp.readFirstRunPaywallShown(st), true);
  assert.equal(frp.readFirstRunPaywallShown(null), true, '저장소 없음 = 안 보임');
  assert.equal(frp.markFirstRunPaywallShown({ getItem: () => null, setItem: () => { throw new Error('quota'); } }), false);
});

// ── ② ProPaywall 렌더(훅 흉내 · 실제 JSX) ──
const React = require('react');
(globalThis as any).React = React;
let cursor = 0;
let slots: any[] = [];
mock('react', {
  ...React,
  useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], (n: any) => { slots[i] = typeof n === 'function' ? n(slots[i]) : n; }]; },
  useRef: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
  useCallback: (fn: any) => fn,
  useLayoutEffect: () => {},
  useEffect: () => { cursor++; },
});
require.extensions['.css'] = (mod) => { mod.exports = { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) }; };
(globalThis as any).window = { setTimeout: () => 0, clearTimeout: () => {} };
(globalThis as any).document = { activeElement: null, body: {}, contains: () => false };
(globalThis as any).HTMLElement = class {};
let offers: any[] = [];
mock('../src/hooks/useProStatus', { useProStatus: () => ({ isPro: false, ready: true, offers, purchasePending: false, iapAvailable: true, refreshOffers: async () => {}, purchase: async () => ({ ok: false, isPro: false, cancelled: true }), purchaseOffer: async () => ({ ok: false }), restore: async () => ({ ok: true, isPro: false }) }) });
mock('next/navigation', { useRouter: () => ({ push: () => {} }) });
mock('../src/lib/app/funnel', { noteFunnelSrc: () => {}, trackFunnel: () => {}, trackFunnelOutcome: () => {} });
mock('../src/lib/app/ratingMoments', { markSessionError: () => {} });
mock('../src/components/app/RedeemCodeLink', { RedeemCodeLink: () => null });
mock('../src/lib/app/watchlist', { FREE_LIMIT: 5, MAX_ITEMS: 100 });
mock('../src/lib/app/watchlistFlags', { WATCHLIST_CHIP_TIERING: false });
mock('../src/components/app/watchlist/BottomSheet', { afterSheetHistory: async () => {} });
const { ProPaywall } = require('../src/components/app/ProPaywall') as typeof import('../src/components/app/ProPaywall');
const { renderToStaticMarkup } = require('react-dom/server');
function html(props: Record<string, unknown> = {}) { cursor = 0; slots = []; return renderToStaticMarkup(ProPaywall({ locale: 'ko', onClose: () => {}, ...props } as any)); }

const M = { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW', pkg: { identifier: '$rc_monthly' } };
const A = { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417', pkg: { identifier: '$rc_annual' } };

test('② 체험 없음 = 예전 화면(체험 문구 0 · 버튼 «PRO로 바로 열기» · 연간 기본)', () => {
  offers = [M, A];
  const h = html();
  assert.ok(!/무료 체험|무료로 시작|trialTerms/.test(h));
  assert.ok(h.includes('PRO로 바로 열기'));
  assert.match(h, /aria-checked="true" data-plan="annual"/);
  assert.ok(h.includes('1년 뒤 자동 갱신됩니다'));
  offers = [M];
  const h1 = html();
  assert.ok(!/무료 체험|무료로 시작/.test(h1));
  assert.ok(h1.includes('매월 자동 갱신됩니다'));
});

test('② 체험 있음 = 명시 CTA · 버튼 위 조건 · 24시간 고지 · 카드 배지', () => {
  offers = [{ ...M, trialDays: 7 }, { ...A, trialDays: 7 }];
  const h = html();
  assert.ok(h.includes('7일 무료로 시작'), 'CTA');
  assert.ok(h.includes('7일 무료 체험 후 연 ₩89,000 자동\u00a0결제\u00a0·\u00a0언제든\u00a0해지'));
  assert.ok(h.indexOf('trialTerms') < h.indexOf('7일 무료로 시작'), '조건은 버튼 위');
  assert.ok(h.includes('오늘은 결제되지 않습니다') && h.includes('24시간 전까지 해지하면'));
  assert.ok(h.includes('월 ₩7,417 · 7일 무료 체험'), '연간 카드 월 환산 + 체험');
  // 첫 실행 머리 + 판정에 쓴 오퍼를 그대로(훅 오퍼가 비어도 체험 화면)
  const keep = offers; offers = [];
  const f = html({ trialHead: true, src: 'first_run', offers: keep });
  assert.ok(f.includes('PRO 7일 무료') && f.includes('7일 무료로 시작'));
  offers = keep;
  // 첫 실행: 월간만 체험이면 월간이 기본 선택(체험 없는 연간으로 열리지 않음)
  const monthOnly = [{ ...M, trialDays: 7 }, A];
  const fm = html({ trialHead: true, src: 'first_run', offers: monthOnly });
  assert.match(fm, /aria-checked="true" data-plan="monthly"/);
  assert.ok(fm.includes('7일 무료로 시작') && fm.includes('24시간 전까지 해지하면'));
  // 할인 카드(만료 페이월)를 고르면 체험 문구 없음
  const d = html({ context: { title: 't', lede: 'l', cta: 'c', sections: [] }, discountOffer: { priceString: '₩5,900', regularPriceString: '₩11,900', pct: 50 } });
  assert.ok(!d.includes('7일 무료로 시작'), '할인 카드 선택 시 체험 CTA 없음');
  // 월간만 체험(연간은 자격 없음) → 기본 선택 연간이면 체험 문구 없음
  offers = [{ ...M, trialDays: 7 }, A];
  const g = html();
  assert.ok(!g.includes('7일 무료로 시작') && g.includes('PRO로 바로 열기'));
  assert.ok(g.includes('7일 무료 체험'), '월간 카드에는 배지');
});

test('② en·ja 문구', () => {
  offers = [{ ...M, priceString: '$9.99', trialDays: 7 }, { ...A, priceString: '$74.99', pricePerMonthString: '$6.25', trialDays: 7 }];
  const e = html({ locale: 'en' });
  assert.ok(e.includes('Start 7-day free trial'));
  assert.ok(e.includes('Free for 7 days, then $74.99/year. Cancel anytime.'));
  const j = html({ locale: 'ja' });
  assert.ok(j.includes('7日間無料で始める'));
});
