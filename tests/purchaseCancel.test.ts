/**
 * 결제 창 «사용자 취소»를 오류가 아닌 취소로 센다(2026-10-24 · 10/24 실측: 페이월 오류 28 중 안드 rc1 26).
 *   캡시터 플러그인 오류 모양 그대로(안드: code "1" + data.userCancelled · iOS: code "1" 만) 넣어
 *   purchasePro → { cancelled: true } · 퍼널 buy_cancel · 쿠폰 시트 'cancelled' 를 확인하고,
 *   진짜 오류(rc11·rc20 등)·성공·권한 미반영은 예전과 똑같이 나오는지 본다. 네트워크·실제 결제 없음.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}

let platform: 'android' | 'ios' = 'android';
let next: { throws?: unknown; info?: unknown } = {};
let purchases = 0;
const pkg = { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'x', priceString: '₩13,000' } };
(globalThis as any).window = {};
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => true, getPlatform: () => platform } });
mock('@revenuecat/purchases-capacitor', {
  LOG_LEVEL: { ERROR: 'ERROR' },
  Purchases: {
    setLogLevel: async () => {},
    configure: async () => {},
    getOfferings: async () => ({ current: { availablePackages: [pkg] } }),
    purchasePackage: async () => {
      purchases += 1;
      if (next.throws) throw next.throws;
      return { customerInfo: next.info };
    },
  },
});
process.env.NEXT_PUBLIC_RC_IOS_KEY = 'appl_test';
process.env.NEXT_PUBLIC_RC_ANDROID_KEY = 'goog_test';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rc = require('../src/services/revenueCat') as typeof import('../src/services/revenueCat');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { outcomeStage } = require('../src/lib/app/funnelSchema') as typeof import('../src/lib/app/funnelSchema');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runCouponPurchase } = require('../src/lib/app/couponGuide') as typeof import('../src/lib/app/couponGuide');

/** 캡시터 브리지가 만드는 오류(native-bridge: cap.Exception 에 message·code·data 를 복사) */
function capError(fields: Record<string, unknown>) {
  return Object.assign(new Error(String(fields.message ?? '')), fields);
}
const ANDROID_CANCEL = capError({ message: 'Purchase was cancelled.', code: '1', data: { userCancelled: true, readableErrorCode: 'PURCHASE_CANCELLED', code: 1 } });
const IOS_CANCEL = capError({ message: 'Purchase was cancelled.', errorMessage: 'Purchase was cancelled.', code: '1' });
const PRO = { entitlements: { active: { pro: { isActive: true } } } };

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) { await fn(); n += 1; console.log(`ok ${n} ${name}`); }

(async () => {
  await t('판정 함수 — 안드·iOS·옛 모양 취소는 true, 다른 코드는 false', () => {
    assert.equal(rc.isPurchaseCancelled(ANDROID_CANCEL), true);
    assert.equal(rc.isPurchaseCancelled(IOS_CANCEL), true);
    assert.equal(rc.isPurchaseCancelled({ userCancelled: true }), true);
    assert.equal(rc.isPurchaseCancelled({ code: 1 }), true);
    for (const code of ['0', '10', '11', '12', '15', '20', '23', 'NOT_SUPPORTED', undefined]) {
      assert.equal(rc.isPurchaseCancelled(capError({ message: 'm', code, data: { userCancelled: false } })), false, String(code));
    }
    assert.equal(rc.isPurchaseCancelled(null), false);
    assert.equal(rc.isPurchaseCancelled(undefined), false);
    assert.equal(rc.isPurchaseCancelled(new Error('boom')), false);
  });

  for (const [os, err] of [['android', ANDROID_CANCEL], ['ios', IOS_CANCEL]] as const) {
    await t(`${os} 결제 창 닫기 → cancelled(오류·코드 없음) · buy_cancel · 결제 창 표시 해제`, async () => {
      platform = os; next = { throws: err };
      const r = await rc.purchasePro('monthly');
      assert.deepEqual(r, { ok: false, isPro: false, cancelled: true });
      assert.deepEqual(outcomeStage('buy', r), { stage: 'buy_cancel' });
      assert.equal(rc.isStoreFlowActive(), false);
    });
  }

  await t('진짜 오류는 예전과 같다 — rc11·rc20·숫자 없는 오류', async () => {
    next = { throws: capError({ message: 'Invalid credentials', code: '11', data: { userCancelled: false } }) };
    let r = await rc.purchasePro('monthly');
    assert.deepEqual(r, { ok: false, isPro: false, error: 'Invalid credentials', code: 'rc11' });
    assert.deepEqual(outcomeStage('buy', r), { stage: 'buy_err', code: 'rc11' });
    next = { throws: capError({ message: 'Payment pending', code: '20' }) };
    r = await rc.purchasePro('monthly');
    assert.deepEqual(r, { ok: false, isPro: false, error: 'Payment pending', code: 'rc20' });
    next = { throws: {} };
    r = await rc.purchasePro('monthly');
    assert.deepEqual(r, { ok: false, isPro: false, error: 'purchase_failed', code: undefined });
    assert.deepEqual(outcomeStage('buy', r), { stage: 'buy_err', code: 'x' });
    assert.equal(rc.isStoreFlowActive(), false);
  });

  await t('성공·권한 미반영 경로 불변', async () => {
    next = { info: PRO };
    let r = await rc.purchasePro('monthly');
    assert.deepEqual(r, { ok: true, isPro: true });
    assert.deepEqual(outcomeStage('buy', r), { stage: 'buy_ok' });
    next = { info: { entitlements: { active: {} } } };
    r = await rc.purchasePro('monthly');
    assert.deepEqual(r, { ok: true, isPro: false });
    assert.deepEqual(outcomeStage('buy', r), { stage: 'buy_ok', code: 'noent' });
  });

  await t('안드 쿠폰 시트 — 취소는 «실패» 아닌 cancelled · PRO 알림·code_pro 없음', async () => {
    platform = 'android'; next = { throws: ANDROID_CANCEL };
    const tracked: string[] = []; let notified = 0;
    const res = await runCouponPurchase({
      redeemOpened: true, codeAppliedConfirmed: true,
      purchase: () => rc.purchasePro('monthly'),
      recheck: async () => { throw new Error('취소 뒤 재조회 금지'); },
      notifyPro: () => { notified += 1; },
      track: (s) => { tracked.push(s); },
    });
    assert.equal(res, 'cancelled');
    assert.deepEqual(tracked, ['code_cta']);
    assert.equal(notified, 0);
    next = { throws: capError({ message: 'x', code: '11' }) };
    const err = await runCouponPurchase({
      redeemOpened: true, codeAppliedConfirmed: true,
      purchase: () => rc.purchasePro('monthly'), recheck: async () => false, notifyPro: () => {}, track: () => {},
    });
    assert.equal(err, 'error');
  });

  assert.ok(purchases >= 9);
  console.log(`purchaseCancel: ${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
