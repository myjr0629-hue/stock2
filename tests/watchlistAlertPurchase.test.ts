/**
 * «내 종목» 잠긴 알림 벨 → 알림 안내 시트 → 페이월 → PRO 확인 → 그 종목의 알림 설정 (11/11).
 *   ProPaywall 은 실제 JSX·핸들러·effect 를 돌린다(React 훅만 흉내 · SDK·네트워크·실결제 없음).
 *   흐름 함수는 실제 wlUI 저장소로 돌린다. 연결(WatchlistHost·ProUpsellSheet)은 소스 대조.
 * 실행: npx tsx tests/watchlistAlertPurchase.test.ts
 *
 * 관문 11111857 재현·수리 대상:
 *   (높음) keepOpenWhilePro 를 알림 경로에 넘겨 무료 사용자에게 «체험 뒤에도 PRO를 쓰려면 / PRO 계속 쓰기»가 보였다
 *   (중간) 쿠폰으로 PRO 가 돼도 페이월이 안 닫히고 설정도 안 열렸다
 *   (중간) 구매·복원 성공인데 공용 PRO 상태(notifyProPurchased)를 안 알려 설정 토글이 'not_pro' 로 안내 시트로 튕길 수 있었다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

const ROOT = path.resolve(__dirname, '..');
function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

// ── React 훅 흉내: 슬롯 상태 + deps 비교 effect(렌더 뒤 commit() 에서 돈다) ──
const React = require('react');
(globalThis as any).React = React;   // tsconfig jsx=preserve → tsx 는 고전 변환(React.createElement)
let cursor = 0;
let slots: any[] = [];
let pendingEffects: (() => void)[] = [];
const depsChanged = (a: any[] | undefined, b: any[] | undefined) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
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
  useLayoutEffect: () => {},
  useEffect: (fn: () => void, deps?: any[]) => {
    const i = cursor++;
    const prev = slots[i] as { deps?: any[] } | undefined;
    if (!prev || depsChanged(prev.deps, deps)) {
      slots[i] = { deps };
      pendingEffects.push(fn);
    }
  },
});
require.extensions['.css'] = (mod) => { mod.exports = { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) }; };
(globalThis as any).window = { setTimeout: () => 0, clearTimeout: () => {} };
(globalThis as any).document = { activeElement: null, body: {}, contains: () => false };
(globalThis as any).HTMLElement = class {};

// ── 결제 훅 흉내 ──
type Outcome = { ok: boolean; isPro: boolean; cancelled?: boolean };
let isPro = false;
let purchaseOutcome: Outcome = { ok: false, isPro: false, cancelled: true };
let restoreOutcome: Outcome = { ok: true, isPro: false };
const bought: unknown[] = [];
const offers = [
  { plan: 'monthly', priceString: '₩11,900', pkg: { identifier: '$rc_monthly' } },
  { plan: 'annual', priceString: '₩89,000', pkg: { identifier: '$rc_annual' } },
  { plan: 'lifetime', priceString: '₩149,000', pkg: { identifier: '$rc_lifetime' } },
];
mock('../src/hooks/useProStatus', { useProStatus: () => ({
  isPro, ready: true, offers, purchasePending: false, iapAvailable: true,
  refreshOffers: async () => {},
  purchase: async (plan: string) => { bought.push(plan); if (purchaseOutcome.ok && purchaseOutcome.isPro) isPro = true; return purchaseOutcome; },
  restore: async () => { if (restoreOutcome.ok && restoreOutcome.isPro) isPro = true; return restoreOutcome; },
}) });
mock('next/navigation', { useRouter: () => ({ push: () => {} }) });
mock('../src/lib/app/funnel', { noteFunnelSrc: () => {}, trackFunnel: () => {}, trackFunnelOutcome: () => {} });
mock('../src/lib/app/ratingMoments', { markSessionError: () => {} });
mock('../src/components/app/RedeemCodeLink', { RedeemCodeLink: () => null });
mock('../src/lib/app/watchlist', { FREE_LIMIT: 5, MAX_ITEMS: 100 });
mock('../src/lib/app/watchlistFlags', { WATCHLIST_CHIP_TIERING: false });

const { ProPaywall } = require('../src/components/app/ProPaywall') as typeof import('../src/components/app/ProPaywall');
const { wlUI } = require('../src/lib/app/watchlistUI') as typeof import('../src/lib/app/watchlistUI');
const flow = require('../src/lib/app/watchlistAlertFlow') as typeof import('../src/lib/app/watchlistAlertFlow');
const { renderToStaticMarkup } = require('react-dom/server');

function elements(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(elements)];
}
const textOf = (el: any): string => typeof el === 'string' || typeof el === 'number' ? String(el)
  : !el || typeof el !== 'object' ? '' : React.Children.toArray(el.props?.children).map(textOf).join('');

// ── «내 종목» 호스트를 흉내: wlUI 실제 저장소 + HostPaywall 과 같은 연결(아래 소스 대조가 어긋남을 잡는다) ──
const ctx = { ticker: 'NVDA', levels: null, levelsOut: true, levelsDelayAsOf: '2026-11-10', meta: { name: 'NVIDIA' } };
let notified = 0;
let settingsOpened: any[] = [];
function setupHost() {
  wlUI.closePaywall(); wlUI.closeSheet();
  notified = 0; settingsOpened = [];
  wlUI.openSheet(flow.alertSheetForBell(false, ctx));          // 무료 사용자가 NVDA 잠긴 벨
  wlUI.openPaywall('alerts');                                    // 시트의 «PRO 시작하기» → 페이월
  const st = wlUI.getSnapshot();
  const paywallId = st.paywall!.id;
  const alertSheetId = flow.alertSheetIdFor('alerts', st);
  // WatchlistHost.onBecamePro 와 같은 일: 시트 닫고 그 종목 설정 열기(한 시트에 한 번)
  let becameProFor: number | null = null;
  const onBecamePro = () => {
    const cur = wlUI.getSnapshot().sheet;
    if (!cur || becameProFor === cur.id) return;
    becameProFor = cur.id;
    wlUI.closeSheet();
    if (cur.kind === 'alertUpsell' && cur.ticker) {
      const req = { kind: 'alertSettings' as const, ticker: cur.ticker, levels: cur.levels, levelsOut: cur.levelsOut, levelsDelayAsOf: cur.levelsDelayAsOf, meta: cur.meta };
      settingsOpened.push(req); wlUI.openSheet(req);
    }
  };
  const onProConfirmed = () => flow.finishAlertPaywall(wlUI.getSnapshot(), paywallId, alertSheetId, {
    close: wlUI.closePaywall, notifyPro: () => { notified++; }, becamePro: onBecamePro,
  });
  return { paywallId, alertSheetId, onProConfirmed };
}

let closedByX = 0;
function render(props: Record<string, unknown>) {
  cursor = 0;
  const tree = ProPaywall({ locale: 'ko', onClose: () => { closedByX++; wlUI.closePaywall(); }, lead: 'alerts', alerts: true, ...props } as any);
  const effects = pendingEffects; pendingEffects = [];
  effects.forEach((fn) => fn());
  return tree;
}
const button = (tree: any, re: RegExp) => elements(tree).find((el) => el.type === 'button' && re.test(textOf(el)));
function reset() {
  slots = []; pendingEffects = []; isPro = false; bought.length = 0; closedByX = 0;
  purchaseOutcome = { ok: false, isPro: false, cancelled: true };
  restoreOutcome = { ok: true, isPro: false };
}

let count = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  reset(); await fn(); count++; console.log(`  ✓ ${name}`);
}

(async () => {
  await test('이미 PRO 면 벨에서 바로 같은 종목의 설정 · 무료면 그 종목 맥락을 실은 알림 안내', () => {
    assert.deepEqual(flow.alertSheetForBell(true, ctx), { kind: 'alertSettings', ...ctx });
    assert.deepEqual(flow.alertSheetForBell(false, ctx), { kind: 'alertUpsell', src: 'bell', ...ctx });
  });

  await test('(관문 높음) 무료 사용자 알림 페이월 = 알림 제목·«PRO 시작하기» — 체험 종료 문구 0 (ko/en/ja)', () => {
    const want = { ko: ['레벨을 넘으면 푸시로', 'PRO 시작하기'], en: ['Pushed when a level breaks', 'Start PRO'], ja: ['レベルを抜けたらプッシュで', 'PROを始める'] } as const;
    const trial = { ko: ['체험 뒤에도 PRO를 쓰려면', 'PRO 계속 쓰기'], en: ['Keep PRO after your trial', 'Keep PRO'], ja: ['体験後もPROを使うには', 'PROを続ける'] } as const;
    for (const locale of ['ko', 'en', 'ja'] as const) {
      reset(); const h = setupHost();
      const html = renderToStaticMarkup(render({ locale, subscriptionOnly: true, onProConfirmed: h.onProConfirmed }));
      for (const w of want[locale]) assert.ok(html.includes(w), `${locale}: «${w}» 보여야 함`);
      for (const w of trial[locale]) assert.ok(!html.includes(`>${w}<`) && !html.includes(`"${w}"`), `${locale}: 체험 종료 문구 «${w}» 노출 금지`);
    }
    // 대조군 — 예전 연결(keepOpenWhilePro)은 실제로 체험 종료 문구를 띄웠다(재현)
    reset();
    const old = renderToStaticMarkup(render({ locale: 'ko', keepOpenWhilePro: true }));
    assert.ok(old.includes('체험 뒤에도 PRO를 쓰려면'));
  });

  await test('알림 경로는 월·연만 — 평생 카드 0 · 다른 호출부(subscriptionOnly 없음)는 그대로', () => {
    reset(); const h = setupHost();
    const html = renderToStaticMarkup(render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed }));
    assert.ok(html.includes('₩89,000') && html.includes('₩11,900'));
    assert.ok(!html.includes('₩149,000'), '평생 가격 노출 금지');
    reset();
    assert.ok(renderToStaticMarkup(render({ lead: 'ads' })).includes('₩149,000'), '다른 호출부 동작 불변(스토어가 준 것 그대로)');
  });

  await test('구매 성공 → 페이월 닫힘 · 공용 PRO 알림 · 그 종목(NVDA) 설정 한 번 열림', async () => {
    const h = setupHost();
    purchaseOutcome = { ok: true, isPro: true };
    let tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
    await button(tree, /PRO 시작하기/).props.onClick();
    tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });   // isPro 반영 재렌더(effect 도 부른다)
    assert.deepEqual(bought, ['annual'], '기본 선택 연간');
    assert.equal(wlUI.getSnapshot().paywall, null);
    assert.equal(notified, 1, '공용 PRO 상태 알림 1회');
    assert.equal(settingsOpened.length, 1, '설정은 한 번만');
    assert.deepEqual(settingsOpened[0], { kind: 'alertSettings', ...ctx });
    assert.equal(wlUI.getSnapshot().sheet?.kind, 'alertSettings');
    assert.equal(closedByX, 0);
  });

  await test('구매 취소·실패 → 아무 것도 안 열림(페이월 그대로 · 알림 0)', async () => {
    for (const out of [{ ok: false, isPro: false, cancelled: true }, { ok: false, isPro: false }, { ok: true, isPro: false }]) {
      reset(); const h = setupHost();
      purchaseOutcome = out;
      let tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
      await button(tree, /PRO 시작하기/).props.onClick();
      tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
      assert.equal(wlUI.getSnapshot().paywall?.id, h.paywallId, JSON.stringify(out));
      assert.equal(wlUI.getSnapshot().sheet?.kind, 'alertUpsell');
      assert.equal(notified, 0); assert.equal(settingsOpened.length, 0);
    }
  });

  await test('복원 성공 → 설정 열림 · 복원할 것 없음/실패 → 안 열림', async () => {
    let h = setupHost();
    restoreOutcome = { ok: true, isPro: true };
    let tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
    await button(tree, /복원/).props.onClick();
    assert.equal(wlUI.getSnapshot().paywall, null);
    assert.equal(notified, 1); assert.deepEqual(settingsOpened, [{ kind: 'alertSettings', ...ctx }]);
    for (const out of [{ ok: true, isPro: false }, { ok: false, isPro: false }]) {
      reset(); h = setupHost(); restoreOutcome = out;
      tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
      await button(tree, /복원/).props.onClick();
      render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
      assert.equal(wlUI.getSnapshot().paywall?.id, h.paywallId); assert.equal(settingsOpened.length, 0); assert.equal(notified, 0);
    }
  });

  await test('(관문 중간) 공용 리스너가 늦어도 — 페이월 구매·복원 결과(res.isPro)만으로 공용 PRO 를 알리고 설정을 연다', async () => {
    const h = setupHost();
    purchaseOutcome = { ok: true, isPro: true };
    const tree = render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
    await button(tree, /PRO 시작하기/).props.onClick();      // 재렌더·effect 없이(리스너 미등록·미갱신 상황)
    assert.equal(notified, 1); assert.equal(settingsOpened.length, 1); assert.equal(wlUI.getSnapshot().paywall, null);
  });

  await test('(관문 중간) 쿠폰·다른 경로로 PRO 확인(isPro 가 밖에서 바뀜) → 페이월 자동으로 닫히고 그 종목 설정', () => {
    const h = setupHost();
    render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
    isPro = true;                                               // RevenueCat 리스너가 쿠폰 반영
    render({ subscriptionOnly: true, onProConfirmed: h.onProConfirmed });
    assert.equal(wlUI.getSnapshot().paywall, null);
    assert.equal(settingsOpened.length, 1); assert.equal(notified, 1);
    // 공용 상태(redeem → notifyProPurchased)로 먼저 오는 경우 — HostPaywall 의 공용 PRO effect 가 같은 함수를 부른다
    reset(); const h2 = setupHost();
    assert.equal(h2.onProConfirmed(), true);
    assert.equal(h2.onProConfirmed(), false, '두 번째(늦은) 확인은 무시');
    assert.equal(settingsOpened.length, 1);
  });

  await test('닫은 페이월·바뀐 시트의 늦은 성공은 무시 · 알림 안내가 아닌 시트의 페이월은 대상 아님', () => {
    let h = setupHost();
    wlUI.closePaywall();
    assert.equal(h.onProConfirmed(), false); assert.equal(settingsOpened.length, 0);
    h = setupHost();
    wlUI.openSheet({ kind: 'limit', ticker: 'AAPL', src: 'x' });
    assert.equal(h.onProConfirmed(), false);
    wlUI.closePaywall(); wlUI.closeSheet();
    wlUI.openSheet({ kind: 'limit', ticker: 'AAPL', src: 'x' }); wlUI.openPaywall('watchlist');
    assert.equal(flow.alertSheetIdFor('watchlist', wlUI.getSnapshot()), null);
    assert.equal(flow.upsellDefersToPaywall(wlUI.getSnapshot()), false);
    wlUI.closePaywall(); wlUI.closeSheet();
  });

  await test('다른 호출부(onProConfirmed 없음): PRO 면 예전처럼 즉시 닫힘 · 체험 종료(keepOpenWhilePro)는 열린 채', () => {
    reset();
    let closes = 0;
    isPro = true; cursor = 0;
    ProPaywall({ locale: 'ko', onClose: () => { closes++; }, lead: 'ads' } as any);
    pendingEffects.splice(0).forEach((fn) => fn());
    assert.equal(closes, 1);
    reset(); isPro = true; closes = 0; cursor = 0;
    ProPaywall({ locale: 'ko', onClose: () => { closes++; }, keepOpenWhilePro: true } as any);
    pendingEffects.splice(0).forEach((fn) => fn());
    assert.equal(closes, 0);
  });

  await test('알림 안내 시트는 알림 페이월이 떠 있는 동안 미루고, 닫히면 다시 본다', () => {
    wlUI.closePaywall(); wlUI.closeSheet();
    wlUI.openSheet(flow.alertSheetForBell(false, ctx));
    assert.equal(flow.upsellDefersToPaywall(wlUI.getSnapshot()), false);
    wlUI.openPaywall('alerts');
    assert.equal(flow.upsellDefersToPaywall(wlUI.getSnapshot()), true);
    wlUI.closePaywall();
    assert.equal(flow.upsellDefersToPaywall(wlUI.getSnapshot()), false);
    wlUI.closeSheet();
  });

  await test('연결 소스 대조 — 호스트는 keepOpenWhilePro 를 넘기지 않고, 공용 PRO·notifyProPurchased 로 마무리한다', () => {
    const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    const host = read('src/components/app/watchlist/WatchlistHost.tsx');
    const upsell = read('src/components/app/watchlist/ProUpsellSheet.tsx');
    const paywall = read('src/components/app/ProPaywall.tsx');
    const hostPaywall = host.slice(host.indexOf('function HostPaywall'));
    assert.ok(!/keepOpenWhilePro/.test(hostPaywall), '알림 경로에 체험 종료 전용 옵션 금지');
    assert.match(hostPaywall, /\{ subscriptionOnly: true, onProConfirmed \}/);
    assert.match(hostPaywall, /notifyPro: \(\) => notifyProPurchased\(true\)/);
    assert.match(hostPaywall, /alertSheetIdFor\(lead, wlUI\.getSnapshot\(\)\)/);
    assert.match(hostPaywall, /useWatchlistPro\(\)\.isPro/);
    assert.match(hostPaywall, /if \(alertSheetId != null && sharedPro\) onProConfirmed\(\)/);
    assert.match(upsell, /upsellDefersToPaywall\(useWatchlistUI\(\)\)/);
    assert.match(upsell, /mode === 'alerts' && wlUI\.getSnapshot\(\)\.sheet\?\.kind === 'alertUpsell'\) \|\| !monthly/);
    // 다른 ProPaywall 호출부는 새 옵션을 넘기지 않는다
    for (const f of ['src/components/app/TrialSavePaywall.tsx']) assert.ok(!/onProConfirmed|subscriptionOnly/.test(read(f)), f);
    assert.equal((paywall.match(/onProConfirmed\(\)|onProConfirmed\?\.\(\)/g) ?? []).length, 3, 'effect·구매·복원 세 곳');
    const settings = read('src/components/app/watchlist/AlertSettingsSheet.tsx');
    assert.match(settings, /syncAlertPrefs\(p, loc, \{ askPermission: firstOn \}\)/, '푸시 권한은 설정 시트의 사용자 동작에 남긴다');
  });

  console.log(`\nwatchlistAlertPurchase: ${count} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
