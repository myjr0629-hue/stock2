/**
 * 안드로이드 쿠폰 안내 시트 — «구매 단추 없음 · 등록 화면 열기 → 복귀 → RevenueCat 다시 읽기 → 적용됨/아직» (2026-10-23 결제 안전)
 * 실제 JSX·핸들러·URL 함수(openExternalUrl)를 연결하고, React 훅·Capacitor·SDK·PRO 판정은 대역이다(네트워크·구매 0).
 * 구매 대역(useProStatus().purchase)은 «불리면 실패»로 둔다 — 어떤 경로에서도 호출 0 을 확인한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

// ── 최소 React 훅(슬롯) — useEffect 는 deps 비교 뒤 commit() 에서 실행·정리 ──
const React = require('react');
let cursor = 0;
let slots: any[] = [];
let pendingEffects: Array<() => void> = [];
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
  useEffect: (fn: () => void | (() => void), deps?: unknown[]) => {
    const i = cursor++;
    const prev = slots[i];
    if (prev && deps && prev.deps && deps.length === prev.deps.length && deps.every((d, k) => Object.is(d, prev.deps[k]))) return;
    slots[i] = { deps, cleanup: prev?.cleanup };
    pendingEffects.push(() => {
      try { slots[i].cleanup?.(); } catch { /* noop */ }
      const c = fn();
      slots[i].cleanup = typeof c === 'function' ? c : undefined;
    });
  },
  useId: () => 'coupon-test',
});
require.extensions['.css'] = (mod) => { mod.exports = new Proxy({}, { get: (_, name) => String(name) }); };

// ── 대역 ──
let purchaseCalls = 0;
let isPro = false;
let offerAvailable = true, preview = false;
mock('../src/hooks/useProStatus', { useProStatus: () => ({
  isPro, ready: true, iapAvailable: !preview,
  offers: offerAvailable ? [{ plan: 'monthly', priceString: 'store-price' }] : [],
  refreshOffers: async () => {},
  purchase: async () => { purchaseCalls++; throw new Error('쿠폰 시트에서 구매를 불렀다'); },
}) });
mock('../src/hooks/useBannerSuppression', { useBannerSuppression: () => {} });
mock('../src/components/app/watchlist/BottomSheet', { useBackToClose: () => {}, useLayer: () => () => true });

const checks: string[] = [];
let checkResult: boolean | 'throw' = false;
let checkGate: Promise<void> | null = null;
mock('../src/lib/app/redeem', {
  PLAY_REDEEM_URL: 'https://play.google.com/redeem',
  refreshProAfterRedeem: async (p: string) => {
    checks.push(p);
    if (checkGate) await checkGate;
    if (checkResult === 'throw') throw new Error('net');
    return checkResult;
  },
});
let notified = 0;
mock('../src/lib/app/proEntitlement', { isPreviewHost: () => preview, notifyProPurchased: () => { notified++; } });
const tracked: string[] = [];
mock('../src/lib/app/funnel', { trackFunnel: (stage: string) => { tracked.push(stage); } });

// 브라우저·앱 대역: 실제 openExternalUrl 의 네이티브 → window.open 폴백까지 실행한다
const opened: string[] = [];
const fallbackOpened: string[] = [];
let openFails = false, fallbackResult: object | null = null, fallbackThrows = false;
let openGate: Promise<void> | null = null;
type Timer = { fn: () => void; ms: number; id: number };
let timers: Timer[] = [];
let timerSeq = 0;
const docListeners = new Map<string, Set<() => void>>();
const g = globalThis as any;
g.window = {
  location: { pathname: '/ko/app-view/settings' },
  open: (url: string) => {
    fallbackOpened.push(url);
    if (fallbackThrows) throw new Error('offline');
    return fallbackResult;
  },
  setTimeout: (fn: () => void, ms: number) => { const id = ++timerSeq; timers.push({ fn, ms, id }); return id; },
  clearTimeout: (id: number) => { timers = timers.filter((t) => t.id !== id); },
};
g.document = {
  visibilityState: 'visible',
  contains: () => false,
  addEventListener: (type: string, fn: () => void) => { if (!docListeners.has(type)) docListeners.set(type, new Set()); docListeners.get(type)!.add(fn); },
  removeEventListener: (type: string, fn: () => void) => { docListeners.get(type)?.delete(fn); },
};
const appListeners = new Set<(s: { isActive: boolean }) => void>();
let appRemoved = 0;
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } });
mock('@capacitor/app', { App: { addListener: async (evt: string, cb: (s: { isActive: boolean }) => void) => {
  assert.equal(evt, 'appStateChange');
  appListeners.add(cb);
  return { remove: async () => { appListeners.delete(cb); appRemoved++; } };
} } });
mock('@capacitor/browser', { Browser: {
  open: async ({ url }: { url: string }) => {
    opened.push(url);
    if (openGate) await openGate;
    if (openFails) throw new Error('offline');
  },
  addListener: async () => { throw new Error('browserFinished 는 쓰지 않는다'); },
} });

const { CouponGuideSheet, COUPON_APPLIED_CLOSE_MS } = require('../src/components/app/CouponGuideSheet');
const { couponGuideCopy } = require('../src/lib/app/couponGuide');
const { renderToStaticMarkup } = require('react-dom/server');

let closed = 0;
function render(locale = 'ko') {
  cursor = 0;
  const tree = CouponGuideSheet({ req: { id: 1, locale, src: 'settings', trigger: null }, onClose: () => { closed++; } });
  const run = pendingEffects; pendingEffects = [];
  run.forEach((f) => f());
  return tree;
}
const tick = () => new Promise<void>((r) => setImmediate(r));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }
function elements(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)];
}
const buttons = (tree: any) => elements(tree).filter((el) => el.type === 'button');
const redeem = (tree: any) => elements(tree).find((el) => 'data-coupon-redeem' in (el.props || {}));
const statusText = (tree: any) => elements(tree).filter((el) => el.props?.role === 'status').map((el) => el.props.children);
function visibility(state: 'hidden' | 'visible') {
  g.document.visibilityState = state;
  docListeners.get('visibilitychange')?.forEach((fn) => fn());
}
function appState(isActive: boolean) { appListeners.forEach((cb) => cb({ isActive })); }
function runTimers(ms: number) {
  const due = timers.filter((t) => t.ms === ms); timers = timers.filter((t) => t.ms !== ms);
  due.forEach((t) => t.fn());
}
function reset() {
  slots = []; pendingEffects = []; purchaseCalls = 0; isPro = false; offerAvailable = true; preview = false;
  checks.length = 0; checkResult = false; checkGate = null; notified = 0; tracked.length = 0;
  opened.length = 0; fallbackOpened.length = 0; openFails = false; fallbackResult = null; fallbackThrows = false; openGate = null;
  timers = []; docListeners.clear(); appListeners.clear(); appRemoved = 0; closed = 0; g.document.visibilityState = 'visible';
}
let count = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  reset(); await fn();
  assert.equal(purchaseCalls, 0, '어떤 경로에서도 구매 호출 0');
  count++; console.log(`  ✓ ${name}`);
}
/** 열기 → 앱 가려짐 → 복귀 */
async function openAndReturn(via: 'visibility' | 'app' = 'visibility', locale = 'ko') {
  render(locale); await settle();
  const opening = redeem(render(locale)).props.onClick();
  await settle();
  if (via === 'visibility') visibility('hidden'); else appState(false);
  await opening; await settle();
  if (via === 'visibility') visibility('visible'); else appState(true);
  await settle();
  return render(locale);
}

(async () => {
  await test('ko/en/ja: 단추는 닫기와 «① Play 스토어에서 적용» 둘뿐 · 구독 단추·체크 없음 · 경고·가격·고지 유지', async () => {
    for (const locale of ['ko', 'en', 'ja']) {
      slots = [];
      const tree = render(locale), copy = couponGuideCopy(locale);
      const html = renderToStaticMarkup(tree);
      const bs = buttons(tree);
      assert.equal(bs.length, 2);
      assert.equal(redeem(tree).props.children, copy.redeemCta);
      assert.equal(redeem(tree).props.disabled, false);
      assert.ok(!elements(tree).some((el) => el.type === 'input'), '체크박스 없음');
      assert.ok(!html.includes('data-coupon-subscribe'));
      for (const s of [copy.warning, copy.freeHead, copy.fine, copy.saved, copy.after('store-price'), ...copy.steps]) assert.ok(html.includes(s.replace(/&/g, '&amp;')), s);
      assert.ok(html.indexOf(copy.warning) < html.indexOf('data-coupon-redeem'), '경고가 단추 앞');
      assert.deepEqual(statusText(tree), []);
    }
  });
  await test('열기 성공 → 가려짐 → 복귀 → PRO 활성: «적용됨» · 공용 상태 알림 1 · RevenueCat «url» 순서 1회 · 잠시 뒤 닫힘', async () => {
    checkResult = true;
    const tree = await openAndReturn();
    assert.deepEqual(opened, ['https://play.google.com/redeem']);
    assert.deepEqual(fallbackOpened, []);
    assert.deepEqual(checks, ['url']);
    assert.equal(notified, 1);
    assert.deepEqual(statusText(tree), [couponGuideCopy('ko').applied]);
    assert.equal(redeem(tree).props.disabled, true);
    assert.deepEqual(tracked, ['code_cta', 'code_pro']);
    assert.equal(closed, 0);
    runTimers(COUPON_APPLIED_CLOSE_MS);
    assert.equal(closed, 1);
  });
  for (const locale of ['ko', 'en', 'ja']) {
    await test(`${locale}: 복귀 → PRO 아님: «아직 적용되지 않았습니다» · 결제로 넘기지 않음 · 닫힘 0 · 단추 다시 누를 수 있음`, async () => {
      checkResult = false;
      const tree = await openAndReturn('visibility', locale);
      assert.deepEqual(checks, ['url']);
      assert.equal(notified, 0);
      assert.deepEqual(statusText(tree), [couponGuideCopy(locale).notApplied]);
      assert.equal(redeem(tree).props.disabled, false);
      assert.equal(redeem(tree).props.children, couponGuideCopy(locale).redeemCta);
      runTimers(COUPON_APPLIED_CLOSE_MS);
      assert.equal(closed, 0);
    });
  }
  await test('앱 상태(appStateChange) 경로도 같다 — 비활성 → 활성 뒤에만 확인', async () => {
    checkResult = false;
    const tree = await openAndReturn('app');
    assert.deepEqual(checks, ['url']);
    assert.deepEqual(statusText(tree), [couponGuideCopy('ko').notApplied]);
  });
  await test('가려진 적 없는 «보임»·«활성» 신호만으로는 확인하지 않음(등록 전 판정 방지)', async () => {
    render(); await settle();
    await redeem(render()).props.onClick(); await settle();
    visibility('visible'); appState(true); await settle();
    assert.deepEqual(checks, []);
    assert.deepEqual(statusText(render()), []);
  });
  await test('확인 중에는 단추가 «처리 중…»·비활성 · 두 번째 복귀 신호는 무시(확인 1회)', async () => {
    let release!: () => void; checkGate = new Promise<void>((r) => { release = r; });
    render(); await settle();
    const opening = redeem(render()).props.onClick(); await settle();
    visibility('hidden'); appState(false); await opening; await settle();
    visibility('visible'); appState(true); await settle();
    const mid = render();
    assert.equal(redeem(mid).props.disabled, true);
    assert.equal(redeem(mid).props.children, couponGuideCopy('ko').busy);
    await redeem(mid).props.onClick(); await settle();
    assert.equal(opened.length, 1, '확인 중 다시 누름 무시');
    release(); await settle();
    assert.deepEqual(checks, ['url']);
  });
  await test('«아직» 뒤 다시 Play 스토어에 다녀오면 한 번 더 읽음 → 적용됨', async () => {
    checkResult = false;
    await openAndReturn();
    checkResult = true;
    visibility('hidden'); await settle(); visibility('visible'); await settle();
    assert.deepEqual(checks, ['url', 'url']);
    assert.deepEqual(statusText(render()), [couponGuideCopy('ko').applied]);
    assert.equal(notified, 1);
  });
  await test('확인이 예외 → «아직» (적용됨 표시·알림 0)', async () => {
    checkResult = 'throw';
    const tree = await openAndReturn();
    assert.deepEqual(statusText(tree), [couponGuideCopy('ko').notApplied]);
    assert.equal(notified, 0);
  });
  for (const locale of ['ko', 'en', 'ja']) {
    for (const fallback of ['null', 'throw'] as const) {
      await test(`${locale}: 네이티브 열기 실패 + 폴백 ${fallback} → 지정 안내 · 복귀 신호가 와도 확인·적용 0`, async () => {
        openFails = true; fallbackResult = null; fallbackThrows = fallback === 'throw';
        render(locale); await settle();
        await redeem(render(locale)).props.onClick(); await settle();
        const tree = render(locale);
        assert.deepEqual(opened, ['https://play.google.com/redeem']);
        assert.deepEqual(fallbackOpened, opened);
        assert.deepEqual(statusText(tree), [couponGuideCopy(locale).redeemUnavailable]);
        assert.equal(redeem(tree).props.disabled, false, '다시 시도 가능(결제 경로 없음)');
        visibility('hidden'); visibility('visible'); appState(false); appState(true); await settle();
        assert.deepEqual(checks, []); assert.equal(notified, 0);
      });
    }
  }
  await test('열기 확인 불가(웹뷰 폴백이 창 객체만 반환) → 대기 → 복귀 때 확인', async () => {
    openFails = true; fallbackResult = {};
    const tree = await openAndReturn();
    assert.deepEqual(fallbackOpened, ['https://play.google.com/redeem']);
    assert.deepEqual(checks, ['url']);
    assert.deepEqual(statusText(tree), [couponGuideCopy('ko').notApplied]);
  });
  await test('열기 응답이 오지 않아도(Browser.open 대기) 가려짐 → 복귀면 확인 · 뒤늦은 응답은 결과를 덮지 않음', async () => {
    let release!: () => void; openGate = new Promise<void>((r) => { release = r; });
    render(); await settle();
    const opening = redeem(render()).props.onClick(); await settle();
    visibility('hidden'); await settle(); visibility('visible'); await settle();
    assert.deepEqual(checks, ['url']);
    assert.deepEqual(statusText(render()), [couponGuideCopy('ko').notApplied]);
    release(); await opening; await settle();
    assert.deepEqual(statusText(render()), [couponGuideCopy('ko').notApplied]);
  });
  await test('이미 PRO 인 채로 열림(등록 전) → 바로 닫힘 · 등록 뒤 SDK 리스너로 PRO 가 되면 «적용됨» 뒤 닫힘', async () => {
    isPro = true; render();
    assert.equal(closed, 1);
    reset();
    render(); await settle();
    const opening = redeem(render()).props.onClick(); await settle(); await opening;
    isPro = true;
    const tree = render();
    assert.deepEqual(statusText(tree), [couponGuideCopy('ko').applied]);
    assert.equal(closed, 0);
    runTimers(COUPON_APPLIED_CLOSE_MS);
    assert.equal(closed, 1);
  });
  await test('시트가 닫히면(정리) 복귀 리스너 해제 — 닫힌 뒤 신호로 확인 0', async () => {
    render(); await settle();
    await redeem(render()).props.onClick(); await settle();
    // 정리 실행
    slots.forEach((sl) => { try { sl?.cleanup?.(); } catch { /* noop */ } });
    await settle();
    assert.equal(appRemoved, 1);
    visibility('hidden'); visibility('visible'); appState(false); appState(true); await settle();
    assert.deepEqual(checks, []);
  });
  await test('상품 없음·프리뷰에서도 단추는 등록 열기뿐(구매 0)', async () => {
    offerAvailable = false; preview = true;
    const tree = render();
    assert.ok(renderToStaticMarkup(tree).includes(couponGuideCopy('ko').pricePlaceholder));
    await redeem(tree).props.onClick(); await settle();
    assert.deepEqual(opened, ['https://play.google.com/redeem']);
  });
  await test('소스: 시트·안내 모듈에 구매 호출 경로 0(purchase(·purchasePackage·purchasePro·runCouponPurchase)', () => {
    const strip = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const f of ['src/components/app/CouponGuideSheet.tsx', 'src/lib/app/couponGuide.ts']) {
      const s = strip(f);
      assert.ok(!/\bpurchase\s*\(/.test(s) && !/purchasePackage|purchasePro|runCouponPurchase/.test(s), f);
      assert.ok(!/\bpurchase\b\s*[,}]/.test(s), `${f}: useProStatus().purchase 를 꺼내지 않는다`);
    }
  });
  console.log(`\n✅ couponGuideSheet: ${count}건 통과`);
})().catch((error) => { console.error(error); process.exit(1); });
