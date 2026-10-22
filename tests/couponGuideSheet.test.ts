/** Offline component exercise: real JSX/handlers and URL bridge; stubbed React hooks, SDK and platform APIs. */
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
const fallbackOpened: string[] = [];
let openFails = false, offerAvailable = true, preview = false;
let fallbackResult: object | null = null, fallbackThrows = false;
let openGate: (() => Promise<void>) | null = null;
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
// 실제 openExternalUrl의 네이티브 실패 → window.open 폴백까지 실행한다.
(globalThis as any).window = {
  location: { pathname: '/ko/app-view/settings' },
  open: (url: string) => {
    fallbackOpened.push(url);
    if (fallbackThrows) throw new Error('offline');
    return fallbackResult;
  },
};
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } });
mock('@capacitor/browser', { Browser: { open: async ({ url }: { url: string }) => {
  opened.push(url);
  if (openGate) await openGate();
  if (openFails) throw new Error('offline');
} } });
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
  fallbackOpened.length = 0; fallbackResult = null; fallbackThrows = false; openGate = null;
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
  for (const locale of ['ko', 'en', 'ja']) {
    for (const fallback of ['null', 'object', 'throw'] as const) {
      await test(`${locale}: 실제 URL 함수의 네이티브 실패 + 폴백 ${fallback} → 지정 안내 · 구독 미노출 · 구매 0`, async () => {
        openFails = true;
        fallbackResult = fallback === 'object' ? {} : null;
        fallbackThrows = fallback === 'throw';
        const continueBeforeOpen = subscribe(render(locale)).props.onClick;
        await redeem(render(locale)).props.onClick();
        const tree = render(locale);
        assert.deepEqual(opened, ['https://play.google.com/redeem']);
        assert.deepEqual(fallbackOpened, opened);
        assert.equal(checkbox(tree).props.disabled, true);
        assert.equal(checkbox(tree).props.checked, false);
        assert.equal(subscribe(tree), undefined);
        assert.equal(redeem(tree).props.disabled, true);
        const statuses = elements(tree).filter((el) => el.props?.role === 'status');
        assert.deepEqual(statuses.map((el) => el.props.children), [couponGuideCopy(locale).redeemUnavailable]);
        checkbox(tree).props.onChange({ target: { checked: true } });
        await continueBeforeOpen();
        await redeem(render(locale)).props.onClick();
        assert.equal(opened.length, 1, '실패한 시트는 안내로 끝낸다');
        assert.equal(subscribe(render(locale)), undefined);
        assert.equal(purchases.length, 0); assert.equal(closed, 0);
      });
    }
  }
  await test('이전 등록·체크 성공 후 다시 열기 실패: 이전 활성 구매 핸들러도 차단', async () => {
    await redeem(render()).props.onClick();
    checkbox(render()).props.onChange({ target: { checked: true } });
    const continueBeforeFailure = subscribe(render()).props.onClick;
    openFails = true;
    await redeem(render()).props.onClick();
    await continueBeforeFailure();
    assert.equal(checkbox(render()).props.checked, false);
    assert.equal(subscribe(render()), undefined);
    assert.equal(purchases.length, 0);
  });
  await test('열기 응답 10초 확인 불가 → 안내 · 구독 미노출; 뒤늦은 성공도 구매 허용 안 함', async () => {
    let release!: () => void, expire!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    openGate = () => gate;
    const schedule = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      assert.equal(ms, 10_000); expire = fn; return 1;
    }) as any;
    try {
      const opening = redeem(render()).props.onClick();
      assert.equal(redeem(render()).props.disabled, true);
      await redeem(render()).props.onClick();
      expire(); await opening;
      assert.equal(subscribe(render()), undefined);
      assert.ok(renderToStaticMarkup(render()).includes(couponGuideCopy('ko').redeemUnavailable));
      release(); await gate; await Promise.resolve(); await Promise.resolve();
      assert.equal(subscribe(render()), undefined);
      assert.equal(checkbox(render()).props.disabled, true);
      assert.equal(opened.length, 1); assert.equal(purchases.length, 0);
    } finally { globalThis.setTimeout = schedule; release(); }
  });
  await test('새 안내 문구만 ko/en/ja에 추가', () => {
    assert.equal(couponGuideCopy('ko').redeemUnavailable, '코드 등록 화면을 열 수 없습니다 — Play 스토어 앱에서 직접 등록');
    assert.equal(couponGuideCopy('en').redeemUnavailable, 'Cannot open the code redemption screen — redeem directly in the Play Store app');
    assert.equal(couponGuideCopy('ja').redeemUnavailable, 'コード登録画面を開けません — Playストアアプリで直接登録してください');
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
