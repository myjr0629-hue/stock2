import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Module from 'node:module';
import type { ReactElement } from 'react';
import { readAnnualTrialSwitch, trialDefaultPlan } from '../src/lib/app/annualTrialDefault';
import { trialDaysFor } from '../src/lib/app/proPlans';

const monthly = { plan: 'monthly', priceString: 'CA$12.49', trialDays: 7, pkg: { identifier: 'monthly' } } as const;
const annual = { plan: 'annual', priceString: 'CA$99.49', trialDays: 7, pricePerMonthString: 'CA$8.29', pkg: { identifier: 'annual' } } as const;

test('연간 상품의 iOS 자격 또는 Play 기본 오퍼에서 확인된 7일만 연간 기본', () => {
  const intro = { introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1 } };
  const play = { defaultOption: { freePhase: { billingPeriod: { iso8601: 'P7D' } } } };
  for (const days of [trialDaysFor(intro, 'ios', true), trialDaysFor(play, 'android')]) {
    assert.equal(trialDefaultPlan([monthly, { ...annual, trialDays: days }], true), 'annual');
  }
  for (const days of [trialDaysFor(intro, 'ios'), trialDaysFor(intro, 'ios', false), trialDaysFor({}, 'android'), 14]) {
    assert.equal(trialDefaultPlan([monthly, { ...annual, trialDays: days }], true), 'monthly');
  }
  assert.equal(trialDefaultPlan([monthly, annual], false), 'monthly');
});

function mockModule(path: string, exports: unknown) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

test('스위치 GET은 권위 읽기 성공만 허용하고 HTTP·JSON 오류면 월간', async (t) => {
  let result = { ok: true, value: null as unknown };
  mockModule('../src/services/redisClient', { getAuthoritativeCache: async (key: string) => {
    assert.equal(key, 'annual-trial:off');
    return result;
  } });
  const { GET } = require('../src/app/api/app/annual-trial/route');
  const env = process.env.ANNUAL_TRIAL_OFF;
  t.after(() => { if (env === undefined) delete process.env.ANNUAL_TRIAL_OFF; else process.env.ANNUAL_TRIAL_OFF = env; });
  delete process.env.ANNUAL_TRIAL_OFF;
  const get = t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, '/api/app/annual-trial');
    return GET();
  });
  assert.equal(await readAnnualTrialSwitch(), true);
  result = { ok: true, value: '1' };
  assert.equal(await readAnnualTrialSwitch(), false);
  result = { ok: false, value: null };
  assert.equal(await readAnnualTrialSwitch(), false);
  result = { ok: true, value: null };
  process.env.ANNUAL_TRIAL_OFF = '1';
  assert.equal(await readAnnualTrialSwitch(), false);
  get.mock.mockImplementation(async () => Response.json({ on: true }, { status: 503 }));
  assert.equal(await readAnnualTrialSwitch(), false);
  get.mock.mockImplementation(async () => Response.json({ on: 'true' }));
  assert.equal(await readAnnualTrialSwitch(), false);
  get.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.equal(await readAnnualTrialSwitch(), false);
});

// 실제 JSX의 카드와 CTA 핸들러를 같은 마운트에서 누른다. 스토어·퍼널 전송만 대체한다.
const react = require('react');
let cursor = 0;
let slots: unknown[] = [];
const effects: Array<() => void> = [];
mockModule('react', {
  ...react,
  useState(initial: unknown) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], (value: unknown) => { slots[i] = value; }];
  },
  useRef(initial: unknown) {
    const i = cursor++;
    return slots[i] ??= { current: initial };
  },
  useEffect(effect: () => void, deps: unknown[]) {
    const i = cursor++;
    const prev = slots[i] as unknown[] | undefined;
    if (!prev || deps.some((value, index) => !Object.is(value, prev[index]))) effects.push(effect);
    slots[i] = deps;
  },
  useLayoutEffect() {},
  useCallback: (fn: unknown) => fn,
});
require.extensions['.css'] = mod => { mod.exports = { __esModule: true, default: new Proxy({}, { get: (_, name) => name }) }; };
const events: string[] = [];
const purchases: unknown[][] = [];
mockModule('../src/hooks/useProStatus', { useProStatus: () => ({
  offers: [], ready: true, isPro: false,
  purchase: async (...args: unknown[]) => { purchases.push(args); return { ok: false, cancelled: true }; },
}) });
mockModule('../src/lib/app/funnel', { noteFunnelSrc() {}, trackFunnel: (stage: string, { src }: { src: string }) => events.push(stage + '/' + src) });
mockModule('next/navigation', { useRouter: () => ({}) });
mockModule('../src/components/app/RedeemCodeLink', { RedeemCodeLink: () => null });
mockModule('../src/components/app/watchlist/BottomSheet', { afterSheetHistory() {} });
const { ProPaywall } = require('../src/components/app/ProPaywall');
const { renderToStaticMarkup } = require('react-dom/server');

function draw(props: Record<string, unknown>) {
  cursor = 0;
  effects.length = 0;
  return ProPaywall({ locale: 'ko', src: 'daily_open', onClose() {}, offers: [monthly, annual], ...props });
}
type Element = ReactElement<{ children?: unknown; className?: string; 'data-plan'?: string; onClick?: () => void | Promise<void> }>;
function buttons(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!react.isValidElement(node)) return [];
  const el = node as Element;
  return el.type === 'button' ? [el] : buttons(el.props.children);
}

test('체험 기본과 바꿔 누른 상품의 일정·고지·패키지·퍼널', async (t) => {
  const win = { setTimeout: () => 0, clearTimeout() {} };
  Object.assign(globalThis, { window: win, document: { activeElement: null, body: {} }, HTMLElement: class {} });
  t.after(() => { for (const k of ['window', 'document', 'HTMLElement']) Reflect.deleteProperty(globalThis, k); });
  for (const annualOn of [true, false]) {
    slots = [];
    events.length = purchases.length = 0;
    const props = { trialHead: true, annualTrialDefault: annualOn };
    let tree = draw(props);
    for (const effect of effects) effect();
    for (const [index, p] of (annualOn ? [annual, monthly] : [monthly, annual]).entries()) {
      if (index) {
        buttons(tree).find(el => el.props['data-plan'] === p.plan)!.props.onClick!();
        tree = draw(props);
        for (const effect of effects) effect();
      }
      const html: string = renderToStaticMarkup(tree);
      assert.ok(html.includes(`aria-checked="true" data-plan="${p.plan}"`));
      assert.ok(html.includes('7일 무료 체험 · 월 CA$8.29') && html.includes('7일 무료로 시작'));
      const steps = html.split('data-trial-steps')[1].split('</ol>')[0];
      const fine = html.split('class="fine"')[1].split('</p>')[0];
      assert.ok(steps.includes(p.priceString) && fine.includes(p.priceString));
      const other = p === annual ? monthly : annual;
      assert.ok(!steps.includes(other.priceString) && !fine.includes(other.priceString));
      assert.ok(fine.includes(p === annual ? '1년마다' : '매월'));
      assert.ok(fine.includes('7일 무료 체험') && fine.includes('24시간 전까지 해지') && fine.includes('구독 관리'));
      await buttons(tree).find(el => el.props.className === 'cta')!.props.onClick!();
      assert.deepEqual(purchases.at(-1), [p.plan, 'daily_open', p.pkg]);
    }
    const first = annualOn ? 'annual' : 'monthly';
    const second = annualOn ? 'monthly' : 'annual';
    assert.equal(events.filter(e => e === 'open/daily_open').length, 1);
    assert.equal(events.filter(e => e === 'cta/daily_open').length, 2);
    assert.deepEqual(events.filter(e => e.startsWith('trial_')), [
      `trial_default_${first}/daily_open`, `trial_cta_${first}/daily_open`, `trial_cta_${second}/daily_open`,
    ]);
  }
});

test('연간 자격 모름은 월간, 체험 없는 정가 페이월은 스위치 양쪽 HTML 동일', () => {
  slots = [];
  const mixed = { trialHead: true, annualTrialDefault: true, offers: [monthly, { ...annual, trialDays: null }] };
  const monthlyTree = draw(mixed);
  assert.match(renderToStaticMarkup(monthlyTree), /aria-checked="true" data-plan="monthly"/);
  buttons(monthlyTree).find(el => el.props['data-plan'] === 'annual')!.props.onClick!();
  const paid = renderToStaticMarkup(draw(mixed));
  assert.ok(paid.indexOf('data-plan="annual"') < paid.indexOf('data-plan="monthly"'));
  assert.match(paid, /aria-checked="true" data-plan="annual"/);
  assert.ok(!paid.includes('7일 무료로 시작') && !paid.includes('data-trial-steps'));
  const offers = [monthly, annual].map(p => ({ ...p, trialDays: null }));
  for (const trialHead of [true, false]) {
    slots = [];
    const on = renderToStaticMarkup(draw({ trialHead, offers, annualTrialDefault: true }));
    slots = [];
    assert.equal(on, renderToStaticMarkup(draw({ trialHead, offers, annualTrialDefault: false })));
    assert.match(on, /aria-checked="true" data-plan="annual"/);
    assert.ok(!on.includes('data-trial-steps'));
  }
});
