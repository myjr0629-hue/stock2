/** Offline component exercise: real JSX/handlers, stubbed React hooks, SDK and native navigation. */
import assert from 'node:assert/strict';
import Module from 'node:module';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
const React = require('react');
let cursor = 0;
let slots: any[] = [];
mock('react', {
  ...React,
  useState: (initial: any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
  },
  useRef: (initial: any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: initial };
    return slots[i];
  },
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useId: () => 'coupon-test',
});
require.extensions['.css'] = (mod) => { mod.exports = new Proxy({}, { get: (_, name) => String(name) }); };

const purchases: unknown[] = [];
const opened: string[] = [];
let openFails = false, offerAvailable = true, preview = false;
let purchaseOutcome = { ok: false, isPro: false, cancelled: true };
let closed = 0;
mock('../src/hooks/useProStatus', { useProStatus: () => ({
  isPro: false, ready: true, iapAvailable: !preview,
  offers: offerAvailable ? [{ plan: 'monthly', priceString: 'store-price' }] : [],
  refreshOffers: async () => {},
  purchase: async (...args: unknown[]) => { purchases.push(args); return purchaseOutcome; },
}) });
mock('../src/hooks/useBannerSuppression', { useBannerSuppression: () => {} });
mock('../src/components/app/watchlist/BottomSheet', { useBackToClose: () => {}, useLayer: () => () => true });
mock('../src/lib/app/redeem', { PLAY_REDEEM_URL: 'https://play.google.com/redeem', refreshProAfterRedeem: async () => false });
mock('../src/lib/native/capacitorBridge', { openExternalUrl: async (url: string) => {
  opened.push(url);
  if (openFails) throw new Error('offline');
} });
mock('../src/lib/app/proEntitlement', { isPreviewHost: () => preview, notifyProPurchased: () => {} });
mock('../src/lib/app/funnel', { trackFunnel: () => {} });

const { CouponGuideSheet } = require('../src/components/app/CouponGuideSheet');
const { couponGuideCopy } = require('../src/lib/app/couponGuide');
const { renderToStaticMarkup } = require('react-dom/server');
function render(locale = 'ko') {
  cursor = 0;
  return CouponGuideSheet({ req: { id: 1, locale, src: 'settings', trigger: null }, onClose: () => { closed++; } });
}
function elements(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)];
}
const redeem = (tree: any) => elements(tree).find((el) => 'data-coupon-redeem' in (el.props || {}));
const subscribe = (tree: any) => elements(tree).find((el) => 'data-coupon-subscribe' in (el.props || {}));
const checkbox = (tree: any) => elements(tree).find((el) => el.type === 'input' && el.props.type === 'checkbox');
function reset() {
  slots = []; purchases.length = 0; opened.length = 0; closed = 0;
  openFails = false; offerAvailable = true; preview = false;
}
let count = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  reset(); await fn(); count++; console.log(`  ✓ ${name}`);
}

(async () => {
  await test('ko/en/ja: 미적용 상태에도 두 단추는 보임 · 구매 비활성 · 경고 · 조건부 무료 요약', async () => {
    for (const locale of ['ko', 'en', 'ja']) {
      slots = [];
      const tree = render(locale), copy = couponGuideCopy(locale);
      const html = renderToStaticMarkup(tree);
      assert.equal(redeem(tree).props.disabled, false);
      assert.equal(subscribe(tree).props.disabled, true);
      assert.equal(checkbox(tree).props.checked, false);
      assert.equal(checkbox(tree).props.disabled, true);
      assert.ok(html.includes(copy.warning));
      assert.equal(copy.freeHead, copy.steps[2]);
      assert.ok(html.indexOf('data-coupon-redeem') < html.indexOf('data-coupon-subscribe'));
      await subscribe(tree).props.onClick();
      assert.equal(purchases.length, 0, '비활성 단추 핸들러 직접 호출도 차단');
    }
  });
  await test('등록 화면만 열거나 복귀해도 체크·구매·PRO 완료 없음', async () => {
    await redeem(render()).props.onClick();
    const tree = render();
    assert.deepEqual(opened, ['https://play.google.com/redeem']);
    assert.equal(checkbox(tree).props.checked, false);
    assert.equal(checkbox(tree).props.disabled, false);
    assert.equal(subscribe(tree).props.disabled, true);
    await subscribe(tree).props.onClick();
    assert.equal(purchases.length, 0); assert.equal(closed, 0);
  });
  await test('코드 등록 후 사용자 확인 → 기존 월간 구매 · 취소 시 다시 확인 필요', async () => {
    await redeem(render()).props.onClick();
    checkbox(render()).props.onChange({ target: { checked: true } });
    const tree = render();
    assert.equal(subscribe(tree).props.disabled, false);
    await subscribe(tree).props.onClick();
    assert.deepEqual(purchases, [['monthly', 'settings']]);
    assert.equal(subscribe(render()).props.disabled, true);
    assert.equal(closed, 0);
  });
  await test('등록 URL 실패: 오류 표시 · 체크와 구독 비활성 · 구매 0', async () => {
    openFails = true;
    await redeem(render()).props.onClick();
    const tree = render();
    assert.equal(checkbox(tree).props.disabled, true);
    assert.equal(subscribe(tree).props.disabled, true);
    assert.ok(renderToStaticMarkup(tree).includes(couponGuideCopy('ko').failed));
    assert.equal(purchases.length, 0);
  });
  await test('다시 등록을 열면 이전 사용자 확인 초기화', async () => {
    await redeem(render()).props.onClick();
    checkbox(render()).props.onChange({ target: { checked: true } });
    await redeem(render()).props.onClick();
    assert.equal(checkbox(render()).props.checked, false);
    assert.equal(subscribe(render()).props.disabled, true);
  });
  await test('상품 없음: 등록과 사용자 확인 후에도 구매 비활성', async () => {
    offerAvailable = false;
    await redeem(render()).props.onClick();
    checkbox(render()).props.onChange({ target: { checked: true } });
    assert.equal(subscribe(render()).props.disabled, true);
  });
  await test('프리뷰도 미확인 구매 차단', async () => {
    offerAvailable = false; preview = true;
    assert.equal(subscribe(render()).props.disabled, true);
    await subscribe(render()).props.onClick();
    assert.equal(purchases.length, 0);
  });
  await test('시트를 다시 열면 등록·사용자 확인 초기화', async () => {
    await redeem(render()).props.onClick();
    checkbox(render()).props.onChange({ target: { checked: true } });
    assert.equal(subscribe(render()).props.disabled, false);
    slots = [];
    assert.equal(checkbox(render()).props.disabled, true);
    assert.equal(subscribe(render()).props.disabled, true);
  });
  console.log(`\n✅ couponGuideSheet: ${count}건 통과`);
})().catch((error) => { console.error(error); process.exit(1); });
