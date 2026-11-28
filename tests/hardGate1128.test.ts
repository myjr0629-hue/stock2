import assert from 'node:assert/strict';
import type Module from 'node:module';
import { test } from 'node:test';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HARD_GATE_KEY, hardGateCohort, hardGateDecision, hardGateSwitch, type HardGateFacts } from '../src/lib/app/hardGate';
import { FIRST_RUN_PAYWALL_KEY } from '../src/lib/app/firstRunPaywall';
import { LEGAL_SEEN_KEY } from '../src/lib/app/legalDiag';
import { ONBOARDED_KEY } from '../src/lib/app/trialAnnounce';

test('첫 실행 시작에만 기록 · 중단/완료 후 재실행 · 기존 기기/저장소 오류 보호', () => {
  const data = new Map<string, string>();
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  assert.equal(hardGateCohort(store, false), 'existing');
  for (const [key, value] of [[ONBOARDED_KEY, 'accepted'], [FIRST_RUN_PAYWALL_KEY, '100'], [LEGAL_SEEN_KEY, '1']]) {
    data.clear();
    store.setItem(key, value);
    assert.equal(hardGateCohort(store, true), 'existing');
    assert.equal(store.getItem(HARD_GATE_KEY), null);
  }
  data.clear();
  assert.equal(hardGateCohort(store, true), 'new');
  assert.equal(hardGateCohort(store, true), 'marked');
  store.setItem(ONBOARDED_KEY, 'accepted');
  assert.equal(hardGateCohort(store, false), 'marked');
  assert.equal(hardGateCohort(null, true), 'existing');
  assert.equal(hardGateCohort({ ...store, getItem() { throw Error(); } }, true), 'existing');
  assert.equal(hardGateCohort({ getItem: () => null, setItem() {} }, true), 'existing');
});

test('대상 판정 · 코드/체험/공유 PRO · 결제 중 · 실패 안전', () => {
  const free: HardGateFacts = { marked: true, on: true, platform: 'ios', iapAvailable: true, pro: false,
    sharedPro: false, pending: false, offers: 1, elapsed: 7999 };
  const check = (changes: Partial<HardGateFacts>, want: ReturnType<typeof hardGateDecision>) =>
    assert.equal(hardGateDecision({ ...free, ...changes }), want);
  check({}, 'gate'); check({ platform: 'android' }, 'gate');
  check({ marked: false }, 'off'); check({ on: false }, 'off'); check({ platform: 'web' }, 'off');
  check({ pro: true }, 'entitled'); check({ sharedPro: true }, 'entitled'); check({ pending: true }, 'entitled');
  check({ iapAvailable: false }, 'hg_noiap'); check({ offers: 0 }, 'hg_nooffer');
  check({ elapsed: 8001 }, 'hg_timeout'); check({ pro: null }, 'hg_status');
});

function mockModule(path: string, exports: unknown) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

test('GET 기본 off · Redis/환경 1만 on · 오류 off · 앱 실행당 GET 1회', async t => {
  let value: unknown = null;
  let ok = true;
  mockModule('../src/services/redisClient', { getAuthoritativeCache: async (key: string) => {
    assert.equal(key, 'hard-gate:on');
    if (value instanceof Error) throw value;
    return { ok, value };
  } });
  const previous = process.env.HARD_GATE_ON;
  delete process.env.HARD_GATE_ON;
  t.after(() => { if (previous === undefined) delete process.env.HARD_GATE_ON; else process.env.HARD_GATE_ON = previous; });
  const { GET } = require('../src/app/api/app/hard-gate/route');
  for (value of [null, 0, '0', true, new Error(), 1, '1']) {
    const r = await GET();
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await r.json(), { on: value === 1 || value === '1' });
  }
  ok = false;
  assert.deepEqual(await (await GET()).json(), { on: false });
  process.env.HARD_GATE_ON = '1';
  assert.deepEqual(await (await GET()).json(), { on: true });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/app/hard-gate');
    return GET();
  });
  assert.deepEqual(await Promise.all([hardGateSwitch(), hardGateSwitch()]), [true, true]);
  assert.equal(fetchMock.mock.callCount(), 1);
});

require.extensions['.css'] = mod => { mod.exports = {}; };
const visits: string[] = [];
mockModule('next/navigation', { useRouter: () => ({ push: (url: string) => visits.push(url) }) });
let restored = '';
mockModule('../src/hooks/useProStatus', { useProStatus: () => ({
  isPro: false, ready: true, offers: [],
  restore: async (src: string) => { restored = src; return { ok: true, isPro: false }; },
}) });
mockModule('../src/components/app/watchlist/BottomSheet', { afterSheetHistory() {} });
mockModule('../src/components/app/BlackFridayLine', { BlackFridayLine: () => null });

test('실제 관문 HTML · 연간 체험/정가 · 복원/쿠폰/약관/개인정보 · 기존 닫기 유지', () => {
  const { ProPaywall } = require('../src/components/app/ProPaywall');
  for (const trialDays of [7, null]) {
    const offers = [
      { plan: 'monthly', priceString: '₩11,900', trialDays },
      { plan: 'annual', priceString: '₩89,000', trialDays },
    ];
    const props = { locale: 'ko', offers, annualTrialDefault: true, trialHead: true, onClose() {} };
    const html = renderToStaticMarkup(createElement(ProPaywall, { ...props, src: 'hard_gate', hardGate: true }));
    assert.doesNotMatch(html, /aria-label="닫기"/);
    for (const label of ['쿠폰 코드 입력', '구매 복원', '이용약관', '개인정보처리방침', '₩89,000', '자동 갱신', '해지']) assert.ok(html.includes(label), label);
    assert.match(html, /aria-checked="true" data-plan="annual"/);
    assert.equal(html.includes('7일 무료로 시작'), trialDays === 7);
    const normal = renderToStaticMarkup(createElement(ProPaywall, { ...props, src: 'first_run' }));
    assert.match(normal, /aria-label="닫기"/);
    assert.equal(normal, renderToStaticMarkup(createElement(ProPaywall, { ...props, src: 'first_run', hardGate: false })));
  }
});

test('관문 입력 · ESC/바깥 탭 유지 · 두 법적 문서 이동 · 복원 출처', async () => {
  const { ProPaywall } = require('../src/components/app/ProPaywall');
  let closed = 0;
  type Node = ReactElement<{ children?: ReactNode; onClick?: () => void | Promise<void>; onKeyDown?: (e: unknown) => void }>;
  let dialog!: Node;
  renderToStaticMarkup(createElement(function Probe() {
    dialog = ProPaywall({ locale: 'ko', hardGate: true, src: 'hard_gate', onClose: () => { closed++; } });
    return dialog;
  }));
  let stopped = false;
  let prevented = false;
  dialog.props.onKeyDown?.({ key: 'Escape', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.ok(stopped && prevented);
  assert.equal(dialog.props.onClick, undefined);
  function controls(root: Node): Node[] {
    return Children.toArray(root.props.children).filter((el): el is Node => isValidElement(el))
      .flatMap(node => node.type === 'button' ? [node] : controls(node));
  }
  const buttons = controls(dialog);
  for (const label of ['구매 복원', '이용약관', '개인정보처리방침']) {
    const click = buttons.find(button => button.props.children === label)?.props.onClick;
    assert.ok(click, label);
    await click();
  }
  assert.equal(closed, 0);
  assert.equal(restored, 'hard_gate');
  assert.deepEqual(visits, ['/ko/app-view/terms', '/ko/app-view/privacy']);
});

test('스토어 판정 연결 · 체험 없는 구매 상품 · 코드 PRO · 응답 도중 결제/공유 PRO · 가격 없는 상품', async t => {
  let active: Record<string, object> | null = {};
  let connected = true;
  let busy = false;
  let shared = false;
  let afterOffers = () => {};
  const priced = { plan: 'monthly', priceString: '₩11,900', pkg: { product: { identifier: 'monthly' } } };
  let plans = [priced];
  const cap = { isNativePlatform: () => true, getPlatform: () => 'android' };
  Object.assign(globalThis, { window: { Capacitor: cap } });
  t.after(() => { Reflect.deleteProperty(globalThis, 'window'); });
  mockModule('@revenuecat/purchases-capacitor', { Purchases: { getCustomerInfo: async () => ({ customerInfo: { entitlements: { active } } }) } });
  mockModule('../src/services/revenueCat', {
    initRevenueCat: async () => connected, isStoreFlowActive: () => busy,
    isProFromCustomerInfo: (info: { entitlements: { active: Record<string, object> } }) => !!info.entitlements.active.pro,
    getProOffers: async () => { afterOffers(); return plans; },
  });
  mockModule('../src/lib/app/gatePaywall', { storeProSignal: { active: () => shared } });
  mockModule('../src/lib/app/proEntitlement', { getProSnapshot: () => ({ isPro: false }) });
  mockModule('../src/lib/app/annualTrialDefault', { readAnnualTrialSwitch: async () => true });
  const { prepareHardGate } = require('../src/components/app/HardGatePaywall');
  const check = () => prepareHardGate(performance.now());
  const gate = await check();
  assert.equal(gate.decision, 'gate');
  assert.equal(gate.offers[0].pkg, priced.pkg);
  assert.equal(gate.annualOn, true);
  active = { pro: {} };
  assert.equal((await check()).decision, 'entitled');
  active = null;
  assert.equal((await check()).decision, 'hg_status');
  active = {};
  afterOffers = () => { shared = true; };
  assert.equal((await check()).decision, 'entitled');
  shared = false;
  afterOffers = () => { busy = true; };
  assert.equal((await check()).decision, 'entitled');
  busy = false;
  afterOffers = () => {};
  plans = [{ ...priced, priceString: '' }];
  assert.equal((await check()).decision, 'hg_nooffer');
  plans = [];
  assert.equal((await check()).decision, 'hg_nooffer');
  connected = false;
  assert.equal((await check()).decision, 'hg_noiap');
});
