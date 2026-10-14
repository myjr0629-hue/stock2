/** Offline: ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}' tests/trialConsent.test.ts */
import assert from 'node:assert/strict';
import type { CustomerInfo, PurchasesEntitlementInfo, PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';
import { PRO_MONTHLY_PRODUCT_ID } from '../src/config/iap';
import {
  TRIAL_CONSENT_DAY_MS as DAY, TRIAL_CONSENT_SNOOZE_MS, emptyTrialConsentMemory, parseTrialConsentMemory,
  trialConsentNotice, trialConsentCopy, trialConsentPrice, trialConsentEnabled, type TrialConsentInput,
} from '../src/lib/app/trialConsent';
import { createTrialConsentController, type TrialConsentSnapshot, type TrialConsentStage, type TrialConsentView } from '../src/lib/app/trialConsentController';
import { funnelKeys, isFunnelStage, isFunnelSrc } from '../src/lib/app/funnelSchema';

const NOW = Date.parse('2026-10-14T00:00:00Z');
const iso = (n: number) => new Date(n).toISOString();
const pro: PurchasesEntitlementInfo = {
  identifier: 'pro', isActive: true, willRenew: true, periodType: 'TRIAL',
  latestPurchaseDate: iso(NOW - 23 * DAY), latestPurchaseDateMillis: NOW - 23 * DAY,
  originalPurchaseDate: iso(NOW - 23 * DAY), originalPurchaseDateMillis: NOW - 23 * DAY,
  expirationDate: iso(NOW + 7 * DAY), expirationDateMillis: NOW + 7 * DAY,
  store: 'APP_STORE', productIdentifier: PRO_MONTHLY_PRODUCT_ID, productPlanIdentifier: null,
  isSandbox: false, unsubscribeDetectedAt: null, unsubscribeDetectedAtMillis: null,
  billingIssueDetectedAt: null, billingIssueDetectedAtMillis: null,
  ownershipType: 'PURCHASED', verification: 'NOT_REQUESTED' as PurchasesEntitlementInfo['verification'],
};
function info(patch: Partial<PurchasesEntitlementInfo> = {}): Pick<CustomerInfo, 'entitlements'> {
  const entitlement = { ...pro, ...patch };
  return { entitlements: { active: { pro: entitlement }, all: { pro: entitlement }, verification: pro.verification } };
}
const input = (patch: Partial<TrialConsentInput> = {}): TrialConsentInput => ({
  customerInfo: info(), countryCode: 'KOR', platform: 'ios', locale: 'ko', enabled: true,
  now: NOW, memory: emptyTrialConsentMemory(), ...patch,
});
const product = (patch: Partial<PurchasesStoreProduct> = {}): PurchasesStoreProduct => ({
  identifier: PRO_MONTHLY_PRODUCT_ID, subscriptionPeriod: 'P1M', priceString: '₩13,000', ...patch,
} as PurchasesStoreProduct);
let count = 0;
async function test(name: string, fn: () => void | Promise<void>) { await fn(); count++; console.log(`✓ ${name}`); }

async function main() {
  await test('active Korean iOS free trial, exactly 7 days', () => {
    assert.equal(trialConsentNotice(input())?.reason, 'ending');
    assert.equal(trialConsentNotice(input({ countryCode: 'KR' }))?.store, 'APP_STORE');
  });
  await test('paid/discounted/unknown periods are not asserted free', () => {
    for (const periodType of ['NORMAL', 'INTRO', 'PREPAID', 'OFFER', '']) {
      assert.equal(trialConsentNotice(input({ customerInfo: info({ periodType }) })), null);
    }
    assert.ok(trialConsentNotice(input({ customerInfo: info({ periodType: 'trial' }) })));
  });
  await test('cancelled/inactive/family-shared/missing PRO never show', () => {
    for (const patch of [{ willRenew: false }, { isActive: false }, { ownershipType: 'FAMILY_SHARED' }] as Partial<PurchasesEntitlementInfo>[]) {
      assert.equal(trialConsentNotice(input({ customerInfo: info(patch) })), null);
    }
    assert.equal(trialConsentNotice(input({ customerInfo: null })), null);
    const absent = { entitlements: { active: {}, all: { pro }, verification: pro.verification } };
    assert.equal(trialConsentNotice(input({ customerInfo: absent })), null);
  });
  await test('unknown/foreign storefront is not inferred from Korean locale', () => {
    for (const countryCode of [null, '', 'US', 'USA', 'JP', 'Korea']) assert.equal(trialConsentNotice(input({ countryCode })), null);
  });
  await test('non-Korean locale, web, foreign-store entitlement, off switch', () => {
    for (const locale of ['en', 'ja', '']) assert.equal(trialConsentNotice(input({ locale })), null);
    assert.equal(trialConsentNotice(input({ platform: 'web' })), null);
    assert.equal(trialConsentNotice(input({ platform: 'android' })), null);
    assert.equal(trialConsentNotice(input({ enabled: false })), null);
    assert.equal(trialConsentNotice(input({ customerInfo: info({ store: 'PROMOTIONAL' }) })), null);
  });
  await test('Android ending window: 7 days +1ms excluded; exactly 7 days included', () => {
    const android = input({ platform: 'android', countryCode: 'KR', customerInfo: info({ store: 'PLAY_STORE' }) });
    assert.equal(trialConsentNotice({ ...android, now: NOW - 1 }), null);
    assert.equal(trialConsentNotice(android)?.reason, 'ending');
    assert.equal(trialConsentNotice({ ...android, now: NOW + 1 })?.store, 'PLAY_STORE');
  });
  await test('expiration: 1ms before included, at/after expiry excluded', () => {
    assert.ok(trialConsentNotice(input({ now: NOW + 7 * DAY - 1 })));
    assert.equal(trialConsentNotice(input({ now: NOW + 7 * DAY })), null);
    assert.equal(trialConsentNotice(input({ now: NOW + 7 * DAY + 1 })), null);
  });
  await test('invalid/lifetime dates, future purchase and invalid clock excluded', () => {
    for (const expirationDate of [null, 'bad', iso(NOW - DAY)]) assert.equal(trialConsentNotice(input({ customerInfo: info({ expirationDate }) })), null);
    for (const latestPurchaseDate of ['bad', iso(NOW + 1)]) assert.equal(trialConsentNotice(input({ customerInfo: info({ latestPurchaseDate }) })), null);
    assert.equal(trialConsentNotice(input({ now: NaN })), null);
  });
  const early = input({ customerInfo: info({ latestPurchaseDate: iso(NOW - DAY), expirationDate: iso(NOW + 29 * DAY) }) });
  await test('Apple 24-hour boundary and once per current free period', () => {
    assert.equal(trialConsentNotice({ ...early, now: NOW - 1 }), null);
    const notice = trialConsentNotice(early)!;
    assert.equal(notice.reason, 'early');
    const memory = { earlySeenPeriod: notice.period, snoozedUntil: 0 };
    assert.equal(trialConsentNotice({ ...early, memory }), null);
    assert.ok(trialConsentNotice({ ...early, memory, earlyVisiblePeriod: notice.period }));
    assert.ok(trialConsentNotice({ ...early, memory, now: NOW + 22 * DAY }));
    assert.ok(trialConsentNotice({ ...early, memory: { ...memory, earlySeenPeriod: '1:2' } }));
  });
  await test('Apple early schedule is not copied to Google', () => {
    assert.equal(trialConsentNotice({ ...early, platform: 'android', customerInfo: info({ store: 'PLAY_STORE', expirationDate: iso(NOW + 29 * DAY) }) }), null);
  });
  await test('snooze lasts exactly seven days, survives serialization', () => {
    const memory = parseTrialConsentMemory(JSON.stringify({ earlySeenPeriod: null, snoozedUntil: NOW }));
    assert.equal(trialConsentNotice(input({ memory, now: NOW - 1 })), null);
    assert.ok(trialConsentNotice(input({ memory })));
    assert.equal(TRIAL_CONSENT_SNOOZE_MS, 7 * DAY);
    for (const raw of [null, 'bad', 'null', '[]', '{"snoozedUntil":"tomorrow"}', '{"snoozedUntil":-1}']) {
      assert.deepEqual(parseTrialConsentMemory(raw), emptyTrialConsentMemory());
    }
  });
  await test('monthly price is exact store string from active product only', () => {
    assert.equal(trialConsentPrice(info(), [product()]), '₩13,000');
    assert.equal(trialConsentPrice(info(), [product({ priceString: 'US$9.99' })]), 'US$9.99');
    for (const products of [[], [product({ identifier: 'another.product' })], [product({ subscriptionPeriod: 'P1Y' })], [product({ priceString: '' })]]) {
      assert.equal(trialConsentPrice(info(), products), null);
    }
  });
  await test('Android price must match its base plan', () => {
    const android = info({ store: 'PLAY_STORE', productPlanIdentifier: 'monthly' });
    assert.equal(trialConsentPrice(android, [product({ identifier: `${PRO_MONTHLY_PRODUCT_ID}:monthly` })]), '₩13,000');
    assert.equal(trialConsentPrice(android, [product({ identifier: `${PRO_MONTHLY_PRODUCT_ID}:annual` })]), null);
    assert.equal(trialConsentPrice(android, [product()]), null);
  });
  await test('requested Korean copy, KST date, price omission, Google label', () => {
    const notice = trialConsentNotice(input())!;
    assert.equal(trialConsentCopy(notice, '₩13,000'), '무료 체험은 2026년 10월 21일까지입니다. 이후 월 ₩13,000으로 계속 이용하려면 App Store에서 유료 전환 동의 여부를 확인해 주세요. 동의하지 않으면 체험 종료 후 유료로 갱신되지 않습니다.');
    assert.ok(trialConsentCopy({ ...notice, store: 'PLAY_STORE' }, null).includes('이후 계속 이용하려면 Google Play에서'));
    assert.ok(trialConsentCopy(notice, '').includes('이후 계속 이용하려면'));
    assert.ok(trialConsentCopy({ ...notice, expiresAt: Date.parse('2026-10-20T15:00:00Z') }, null).includes('10월 21일'));
  });
  await test('closed funnel keys contain no identity/price/date payload', () => {
    for (const stage of ['trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze']) assert.ok(isFunnelStage(stage));
    assert.ok(isFunnelSrc('trial_notice'));
    assert.equal(funnelKeys('fx', '2026-10-14', 'trial_notice_show', 'trial_notice', 'ios').main, 'fx:trial_notice_show:trial_notice:ios:2026-10-14');
  });
  await test('switch convention', () => {
    for (const redis of [null, '', 0, false, '0', 'false']) assert.equal(trialConsentEnabled({ redis }), true);
    for (const redis of [1, '1', true, 'off', {}]) assert.equal(trialConsentEnabled({ redis }), false);
    assert.equal(trialConsentEnabled({ env: '1', redis: null }), false);
  });

  const snapshot = (customerInfo = info()): TrialConsentSnapshot => ({ customerInfo, products: [product()], countryCode: 'KR', platform: 'ios', enabled: true });
  function harness(initial = snapshot()) {
    let snap: TrialConsentSnapshot | null = initial;
    let state = emptyTrialConsentMemory();
    let view: TrialConsentView | null = null;
    let time = NOW;
    let loader = async () => snap;
    const events: TrialConsentStage[] = [];
    const deps = { locale: 'ko', load: () => loader(), readMemory: () => state, saveMemory: (m: typeof state) => { state = m; },
      publish: (v: TrialConsentView | null) => { view = v; }, track: (s: TrialConsentStage) => events.push(s), now: () => time };
    return { deps, events, get state() { return state; }, get view() { return view; },
      setSnapshot: (s: TrialConsentSnapshot | null) => { snap = s; }, setTime: (t: number) => { time = t; },
      setLoader: (l: typeof loader) => { loader = l; } };
  }
  await test('actual show dedupes refreshes; tap and snooze are distinct', async () => {
    const h = harness(), c = createTrialConsentController(h.deps);
    await c.refresh(); assert.ok(h.view); assert.deepEqual(h.events, []);
    c.shown(); c.shown(); await c.refresh(); c.shown();
    assert.equal(c.manage(), 'APP_STORE'); await c.resume(); c.snooze();
    assert.equal(h.view, null); assert.equal(h.state.snoozedUntil, NOW + 7 * DAY);
    assert.deepEqual(h.events, ['trial_notice_show', 'trial_notice_manage', 'trial_notice_snooze']);
    await c.refresh(); assert.equal(h.view, null); assert.equal(c.manage(), null);
  });
  await test('early shown persists across dashboard remount, ending still appears', async () => {
    const h = harness(snapshot(early.customerInfo!)), c = createTrialConsentController(h.deps);
    await c.refresh(); c.shown(); await c.refresh(); assert.ok(h.view);
    c.dispose(); const next = createTrialConsentController(h.deps);
    await next.refresh(); assert.equal(h.view, null);
    h.setTime(NOW + 22 * DAY); await next.refresh(); assert.equal(h.view?.reason, 'ending');
  });
  await test('not-yet-visible early notice is not consumed', async () => {
    const h = harness(snapshot(early.customerInfo!)), c = createTrialConsentController(h.deps);
    await c.refresh(); c.dispose();
    assert.equal(h.state.earlySeenPeriod, null);
    const next = createTrialConsentController(h.deps); await next.refresh(); assert.ok(h.view);
  });
  await test('off/unknown/cancelled/paid refresh clears existing notice', async () => {
    for (const invalid of [null, { ...snapshot(), enabled: false }, { ...snapshot(), countryCode: null }, snapshot(info({ willRenew: false })), snapshot(info({ periodType: 'NORMAL' }))]) {
      const h = harness(), c = createTrialConsentController(h.deps);
      await c.refresh(); assert.ok(h.view); h.setSnapshot(invalid); await c.refresh(); assert.equal(h.view, null);
    }
  });
  await test('failed read hides; recovery re-evaluates', async () => {
    const h = harness(), c = createTrialConsentController(h.deps);
    await c.refresh(); h.setLoader(async () => { throw new Error('offline'); });
    await c.refresh(); assert.equal(h.view, null);
    h.setLoader(async () => snapshot()); await c.refresh(); assert.ok(h.view);
  });
  await test('late old response cannot overwrite kill switch', async () => {
    const h = harness(), c = createTrialConsentController(h.deps);
    await c.refresh();
    let resolve!: (value: TrialConsentSnapshot) => void;
    h.setLoader(() => new Promise((r) => { resolve = r; })); const old = c.refresh();
    h.setLoader(async () => null); await c.refresh(); resolve(snapshot()); await old;
    assert.equal(h.view, null);
  });
  await test('late response cannot undo snooze or unmount', async () => {
    for (const action of ['snooze', 'dispose'] as const) {
      const h = harness(), c = createTrialConsentController(h.deps); await c.refresh();
      let resolve!: (value: TrialConsentSnapshot) => void;
      h.setLoader(() => new Promise((r) => { resolve = r; })); const old = c.refresh();
      c[action](); const before = h.view; resolve(snapshot()); await old; assert.equal(h.view, before);
    }
  });
  await test('late listener after unmount cannot start another read or publish', async () => {
    const h = harness(), c = createTrialConsentController(h.deps);
    await c.refresh(); const before = h.view; c.dispose();
    h.setLoader(async () => { assert.fail('disposed controller must not load'); });
    await c.refresh(true); assert.equal(h.view, before);
  });
  await test('snoozed ending notice returns after exactly seven days if still active', async () => {
    const h = harness(snapshot(early.customerInfo!)), c = createTrialConsentController(h.deps);
    h.setTime(NOW + 22 * DAY); await c.refresh(); c.snooze();
    // Trial extends to just after the suppression boundary in this new snapshot.
    h.setSnapshot(snapshot(info({ expirationDate: iso(NOW + 29 * DAY + 1) })));
    h.setTime(NOW + 29 * DAY - 1); await c.refresh(); assert.equal(h.view, null);
    h.setTime(NOW + 29 * DAY); await c.refresh(); assert.ok(h.view);
  });
  console.log(`trialConsent: ${count} passed`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
